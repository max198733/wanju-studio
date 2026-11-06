// @ts-check
/**
 * 持久多镜队列。
 *
 * 解决的问题：现在的任务只记在 `.film/wanju-tasks.json` 里，没有并发上限、没有版本保护、
 * 进程崩溃后分不清"没提交"和"提交了但不知道结果"。多镜一起跑时会出现重复扣费和串镜。
 *
 * 三条硬规则：
 *   1. 结果未知的任务绝不自作主张重发。上游可能已经扣费，重发就是二次收费。
 *   2. 同一镜头的旧版本排队任务，在更新版本入队时直接作废，不再执行。
 *   3. 进程重启时，所有 running 一律降级为 unknown——因为无法证明上游是否已受理。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeAtomic } from './atomic.mjs';
import { WanjuError } from './wanju-model.mjs';

/** 排队中，尚未提交上游。 */
export const QUEUED = 'queued';
/** 已提交上游，等待结果。 */
export const RUNNING = 'running';
/** 上游确认成功，素材已回收。 */
export const SUCCEEDED = 'succeeded';
/** 明确失败，可安全重试。 */
export const FAILED = 'failed';
/** 上游明确拒绝（参数、密钥、额度），重试无意义。 */
export const REJECTED = 'rejected';
/** 结果未知：可能已扣费。禁止自动重发，只能人工核对后处置。 */
export const UNKNOWN = 'unknown';
/** 被更新版本取代，未执行。 */
export const SUPERSEDED = 'superseded';
/** 用户主动取消。 */
export const CANCELLED = 'cancelled';

const TERMINAL = new Set([SUCCEEDED, FAILED, REJECTED, SUPERSEDED, CANCELLED]);

const MAX_TASKS = 500;
const MAX_RECORDS = 2000;

/**
 * @typedef {{ id: string, shotId: string, shotVersion: number, idempotencyKey: string,
 * provider: string, prompt: string, status: string, attempts: number, createdAt: string,
 * options?: unknown, error?: string, retryable?: boolean, remoteId?: string,
 * recoveredAt?: string, startedAt?: string, finishedAt?: string,
 * resolution?: { outcome: string, note: string, at: string } }} ShotTask
 * @typedef {{ shotId: string, shotVersion?: number, idempotencyKey?: string,
 * provider: string, prompt?: string, options?: unknown }} QueueInput
 */

/**
 * 把上游错误归类。
 * 401/403/400 这类是"上游明确表态"，重试没有意义；网络中断、超时是"不知道结果"，必须按未知处理。
 * @param {unknown} value
 */
export function classifyError(value) {
  const error = /** @type {{ providerStatus?: number, providerRejected?: boolean, ambiguous?: boolean,
    name?: string, code?: string, message?: string } | null} */ (value);
  const status = Number(error?.providerStatus) || 0;
  if (error?.providerRejected === true || [400, 401, 403, 404, 405, 413, 415, 422].includes(status)) {
    return { status: REJECTED, retryable: false, reason: error?.message || '上游拒绝' };
  }
  if (error?.ambiguous === true || error?.name === 'AbortError' || error?.name === 'TimeoutError'
    || ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_SOCKET'].includes(error?.code ?? '')) {
    return { status: UNKNOWN, retryable: false, reason: error?.message || '连接中断，结果未知' };
  }
  return { status: FAILED, retryable: true, reason: error?.message || '执行失败' };
}

/**
 * @param {object} options
 * @param {string} options.root 项目根目录，队列存于 `.film/wanju-queue.json`
 * @param {(task: ShotTask, context: { signal: AbortSignal }) => Promise<{ remoteId?: string } | void>} options.execute
 * @param {number} [options.concurrency] 同时在跑的上限
 * @param {() => number} [options.now]
 * @param {number} [options.taskTimeoutMs] 单任务超时，超时按未知处理
 */
export function createShotQueue({ root, execute, concurrency = 2, now = Date.now, taskTimeoutMs = 30 * 60 * 1000 }) {
  if (!root || typeof execute !== 'function') throw new WanjuError('队列需要项目目录与执行器。', 422);
  const file = join(root, '.film', 'wanju-queue.json');
  /** @type {ShotTask[]} */
  let tasks = [];
  let loaded = false;
  let pending = Promise.resolve();
  /** @type {Map<string, AbortController>} */
  const running = new Map();

  /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
  const exclusive = (fn) => {
    const next = pending.then(fn);
    pending = next.then(() => {}, () => {});
    return next;
  };

  async function flush() {
    await mkdir(join(root, '.film'), { recursive: true });
    await writeAtomic(file, JSON.stringify(tasks.slice(-MAX_RECORDS), null, 2) + '\n');
  }

  async function load() {
    if (loaded) return;
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      tasks = Array.isArray(value) ? value.filter((task) => task && typeof task.id === 'string') : [];
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw new WanjuError('队列索引无法读取，请检查 .film/wanju-queue.json。', 422);
      tasks = [];
    }
    loaded = true;
  }

  /** @param {string} id */
  const find = (id) => tasks.find((task) => task.id === id);

  /** 冷启动：running 一律降级为 unknown，并记录原因。 */
  async function recover() {
    return exclusive(async () => {
      await load();
      const stranded = tasks.filter((task) => task.status === RUNNING);
      for (const task of stranded) {
        task.status = UNKNOWN;
        task.error = '进程在等待结果时中断，上游是否已受理未知；请先在服务商后台核对，不要直接重发。';
        task.recoveredAt = new Date(now()).toISOString();
      }
      if (stranded.length) await flush();
      return { recovered: stranded.map((task) => task.id) };
    });
  }

  /**
   * 入队。返回 { accepted, skipped, superseded }。
   * 幂等键相同的任务不会重复入队；同镜头新版本会让旧版本排队任务作废。
   * @param {QueueInput | QueueInput[]} items
   */
  async function enqueue(items) {
    return exclusive(async () => {
      await load();
      const list = Array.isArray(items) ? items : [items];
      const accepted = [];
      const skipped = [];
      const superseded = [];
      for (const item of list) {
        const { shotId, shotVersion = 1, idempotencyKey, provider, prompt } = item ?? {};
        if (!shotId || !provider) throw new WanjuError('入队任务需要 shotId 与 provider。', 422);
        if (idempotencyKey && tasks.some((task) => task.idempotencyKey === idempotencyKey)) {
          skipped.push({ shotId, idempotencyKey, reason: '幂等键已存在，未重复入队' });
          continue;
        }
        // 同一镜头更高版本入队，旧的排队任务直接作废
        for (const old of tasks) {
          if (old.shotId === shotId && old.status === QUEUED && Number(old.shotVersion) < Number(shotVersion)) {
            old.status = SUPERSEDED;
            old.finishedAt = new Date(now()).toISOString();
            old.error = `已由镜头版本 ${shotVersion} 取代，未执行。`;
            superseded.push(old.id);
          }
        }
        const task = {
          id: randomUUID(), shotId, shotVersion: Number(shotVersion) || 1,
          idempotencyKey: idempotencyKey || `shot:${shotId}:${shotVersion}`,
          provider, prompt: typeof prompt === 'string' ? prompt.slice(0, 4000) : '',
          status: QUEUED, attempts: 0, createdAt: new Date(now()).toISOString(),
          ...(item.options ? { options: item.options } : {}),
        };
        tasks.push(task);
        accepted.push(task);
      }
      if (tasks.length > MAX_TASKS) {
        const finished = tasks.filter((task) => TERMINAL.has(task.status));
        const drop = new Set(finished.slice(0, Math.max(0, tasks.length - MAX_TASKS)).map((task) => task.id));
        tasks = tasks.filter((task) => !drop.has(task.id));
      }
      if (accepted.length || superseded.length) await flush();
      return { accepted, skipped, superseded };
    });
  }

  /** @param {string} id */
  async function cancel(id) {
    return exclusive(async () => {
      await load();
      const task = find(id);
      if (!task) throw new WanjuError('任务不存在。', 404);
      if (TERMINAL.has(task.status)) return { ok: false, reason: '任务已结束，无法取消' };
      if (task.status === RUNNING) {
        running.get(id)?.abort();
        task.status = UNKNOWN;
        task.error = '取消时已提交上游，上游是否计费未知；请在服务商后台核对。';
      } else {
        task.status = CANCELLED;
      }
      task.finishedAt = new Date(now()).toISOString();
      await flush();
      return { ok: true, status: task.status };
    });
  }

  /** 人工处置结果未知的任务。处置后才能重新入队，避免重复扣费。
   * @param {string} id @param {{ outcome: string, note: string }} result */
  async function resolveUnknown(id, { outcome, note }) {
    return exclusive(async () => {
      await load();
      const task = find(id);
      if (!task) throw new WanjuError('任务不存在。', 404);
      if (task.status !== UNKNOWN) throw new WanjuError('只有结果未知的任务需要人工处置。', 409);
      if (!['succeeded', 'failed'].includes(outcome)) throw new WanjuError('处置结果须为 succeeded 或 failed。', 422);
      if (typeof note !== 'string' || note.trim().length < 4) throw new WanjuError('请填写核对依据，至少 4 个字。', 422);
      task.status = outcome;
      task.resolution = { outcome, note: note.trim(), at: new Date(now()).toISOString() };
      task.finishedAt = new Date(now()).toISOString();
      await flush();
      return { ok: true, task };
    });
  }

  /** 调度一轮：把排队的任务按并发上限推上去。返回本轮完成的任务。 */
  async function run() {
    await recover();
    const ready = await exclusive(async () => {
      await load();
      const slots = Math.max(0, concurrency - running.size);
      return tasks.filter((task) => task.status === QUEUED).slice(0, slots);
    });
    const settled = [];
    for (const task of ready) {
      const controller = new AbortController();
      running.set(task.id, controller);
      timerLoop(task, controller);
      // 立刻落盘 running 状态：崩溃时才能被 recover 认出来
      await exclusive(async () => {
        const live = find(task.id);
        if (!live || live.status !== QUEUED) return;
        live.status = RUNNING;
        live.attempts += 1;
        live.startedAt = new Date(now()).toISOString();
        await flush();
      });
      execute(task, { signal: controller.signal })
        .then(async (result) => {
          await exclusive(async () => {
            const live = find(task.id);
            if (!live) return;
            live.status = SUCCEEDED;
            live.finishedAt = new Date(now()).toISOString();
            if (result?.remoteId) live.remoteId = String(result.remoteId);
            // 立即落盘：内存变了磁盘没变，崩溃后会误判成未完成
            await flush();
          });
        })
        .catch(async (error) => {
          const verdict = classifyError(error);
          await exclusive(async () => {
            const live = find(task.id);
            if (!live) return;
            live.status = verdict.status;
            live.error = verdict.status === UNKNOWN
              ? `${verdict.reason}；上游是否已完成未知，请先在服务商后台查询，不要重发。`
              : verdict.reason;
            live.retryable = verdict.retryable;
            live.finishedAt = new Date(now()).toISOString();
            await flush();
          });
        })
        .finally(async () => {
          running.delete(task.id);
          await exclusive(flush).catch(() => {});
          settled.push(task.id);
        });
    }
    return { started: ready.map((task) => task.id) };
  }

  /** @param {ShotTask} task @param {AbortController} controller */
  function timerLoop(task, controller) {
    const timer = setTimeout(() => {
      // 超时意味着"不知道上游算不算完"，按未知处理而不是失败
      exclusive(async () => {
        const live = find(task.id);
        if (!live || live.status !== RUNNING) return;
        live.status = UNKNOWN;
        live.error = '本地等待超时，上游是否完成未知；请先在服务商后台查询，不要重发。';
        await flush();
      });
    }, taskTimeoutMs);
    timer.unref?.();
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  }

  /** 可重试的失败重新排队；未知任务不在其中。 */
  /** @param {string} id */
  async function retryFailed(id) {
    return exclusive(async () => {
      await load();
      const task = find(id);
      if (!task) throw new WanjuError('任务不存在。', 404);
      if (task.status !== FAILED || task.retryable === false) {
        throw new WanjuError('只有可重试的失败任务能重排；结果未知的任务须先人工核对。', 409);
      }
      task.status = QUEUED;
      delete task.error;
      delete task.finishedAt;
      await flush();
      return { ok: true };
    });
  }

  /** 等待所有在跑任务结束（测试与收尾用）。 */
  async function drain() {
    while (running.size) await new Promise((done) => setTimeout(done, 10));
    await exclusive(flush).catch(() => {});
  }

  /** 读快照。走排他链，保证拿到的是落盘之后的状态。 */
  async function snapshot() {
    return exclusive(async () => {
      await load();
      return tasks.map((task) => ({ ...task }));
    });
  }

  /** 给界面看的统计，不暴露提示词全文。 */
  async function summary() {
    return exclusive(async () => {
      await load();
      /** @type {Record<string, number>} */
      const counts = {};
      for (const task of tasks) counts[task.status] = (counts[task.status] || 0) + 1;
      return {
        total: tasks.length, counts, running: running.size, concurrency,
        unknown: tasks.filter((task) => task.status === UNKNOWN).map((task) => task.id),
      };
    });
  }

  return { recover, enqueue, cancel, resolveUnknown, retryFailed, run, drain, snapshot, summary, classifyError };
}
