import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShotQueue, classifyError, QUEUED, RUNNING, SUCCEEDED, FAILED, REJECTED, UNKNOWN, SUPERSEDED, CANCELLED } from './wanju-queue.mjs';

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-queue-'));
  await mkdir(join(root, '.film'), { recursive: true });
  return root;
};

const waitFor = async (queue, predicate, { timeout = 3000 } = {}) => {
  const started = Date.now();
  for (;;) {
    const tasks = await queue.snapshot();
    if (predicate(tasks)) return tasks;
    if (Date.now() - started > timeout) throw new Error(`等待超时，当前状态：${JSON.stringify(tasks.map((t) => t.status))}`);
    await new Promise((done) => setTimeout(done, 10));
  }
};

test('同一幂等键不会重复入队，避免二次扣费', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({ root, execute: async () => {} });
    const first = await queue.enqueue({ shotId: 's1', provider: 'image', idempotencyKey: 'k-1' });
    const second = await queue.enqueue({ shotId: 's1', provider: 'image', idempotencyKey: 'k-1' });
    assert.equal(first.accepted.length, 1);
    assert.equal(second.accepted.length, 0);
    assert.equal(second.skipped.length, 1);
    assert.equal((await queue.snapshot()).length, 1);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('同镜头更高版本入队时，旧版本排队任务作废且不执行', async () => {
  const root = await project();
  try {
    let executed = 0;
    const queue = createShotQueue({ root, execute: async () => { executed += 1; } });
    await queue.enqueue({ shotId: 's1', shotVersion: 1, provider: 'image' });
    const next = await queue.enqueue({ shotId: 's1', shotVersion: 2, provider: 'image' });
    assert.equal(next.superseded.length, 1);
    const tasks = await queue.snapshot();
    assert.equal(tasks.find((t) => t.shotVersion === 1).status, SUPERSEDED);
    assert.equal(tasks.find((t) => t.shotVersion === 2).status, QUEUED);
    assert.equal(executed, 0);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('并发上限生效，超出的任务继续排队', async () => {
  const root = await project();
  try {
    let active = 0;
    let peak = 0;
    const queue = createShotQueue({
      root, concurrency: 2,
      execute: async () => {
        active += 1; peak = Math.max(peak, active);
        await new Promise((done) => setTimeout(done, 60));
        active -= 1;
      },
    });
    await queue.enqueue([1, 2, 3, 4].map((n) => ({ shotId: `s${n}`, provider: 'image' })));
    await queue.run();
    const started = (await queue.snapshot()).filter((t) => t.status === RUNNING || t.status === SUCCEEDED);
    assert.ok(started.length <= 2, `首轮最多启动 2 个，实际 ${started.length}`);
    await waitFor(queue, (tasks) => tasks.filter((t) => t.status === SUCCEEDED).length === 2);
    assert.equal(peak, 2);
    const remaining = (await queue.snapshot()).filter((t) => t.status === QUEUED);
    assert.equal(remaining.length, 2);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('成功任务记录 remoteId 并落盘', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({ root, execute: async (task) => ({ remoteId: `remote-${task.shotId}` }) });
    await queue.enqueue({ shotId: 's1', provider: 'seedance' });
    await queue.run();
    const tasks = await waitFor(queue, (list) => list[0].status === SUCCEEDED);
    assert.equal(tasks[0].remoteId, 'remote-s1');
    const onDisk = JSON.parse(await readFile(join(root, '.film', 'wanju-queue.json'), 'utf8'));
    assert.equal(onDisk[0].status, SUCCEEDED);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('上游明确拒绝归为 rejected，不可重试', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({
      root,
      execute: async () => {
        const error = new Error('服务商返回 HTTP 401');
        error.providerStatus = 401;
        error.providerRejected = true;
        throw error;
      },
    });
    await queue.enqueue({ shotId: 's1', provider: 'image' });
    await queue.run();
    const tasks = await waitFor(queue, (list) => list[0].status === REJECTED);
    assert.equal(tasks[0].retryable, false);
    await assert.rejects(() => queue.retryFailed(tasks[0].id), /只有可重试的失败任务能重排/);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('连接中断归为 unknown，绝不自动重发', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({
      root,
      execute: async () => {
        const error = new Error('接口连接中断');
        error.code = 'ECONNRESET';
        throw error;
      },
    });
    await queue.enqueue({ shotId: 's1', provider: 'image' });
    await queue.run();
    const tasks = await waitFor(queue, (list) => list[0].status === UNKNOWN);
    assert.equal(tasks[0].retryable, false);
    assert.match(tasks[0].error, /不要重发/);
    await assert.rejects(() => queue.retryFailed(tasks[0].id), /结果未知的任务须先人工核对/);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('普通失败可重排，重排后再次入队执行', async () => {
  const root = await project();
  try {
    let attempts = 0;
    const queue = createShotQueue({
      root,
      execute: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('临时失败');
        return { remoteId: 'ok' };
      },
    });
    await queue.enqueue({ shotId: 's1', provider: 'image' });
    await queue.run();
    const [failed] = await waitFor(queue, (list) => list[0].status === FAILED);
    assert.equal(failed.retryable, true);
    await queue.retryFailed(failed.id);
    await queue.run();
    const [done] = await waitFor(queue, (list) => list[0].status === SUCCEEDED);
    assert.equal(done.remoteId, 'ok');
    assert.equal(done.attempts, 2);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('冷启动把 running 降级为 unknown 并附核对提示', async () => {
  const root = await project();
  try {
    await writeFile(join(root, '.film', 'wanju-queue.json'), JSON.stringify([{
      id: '11111111-1111-1111-1111-111111111111', shotId: 's1', shotVersion: 1,
      idempotencyKey: 'k', provider: 'image', status: RUNNING, attempts: 1,
    }], null, 2));
    const queue = createShotQueue({ root, execute: async () => {} });
    const { recovered } = await queue.recover();
    assert.deepEqual(recovered, ['11111111-1111-1111-1111-111111111111']);
    const [task] = await queue.snapshot();
    assert.equal(task.status, UNKNOWN);
    assert.match(task.error, /不要直接重发/);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('等待超时按未知处理，不判失败', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({
      root, taskTimeoutMs: 40,
      execute: () => new Promise(() => {}),
    });
    await queue.enqueue({ shotId: 's1', provider: 'image' });
    await queue.run();
    const [task] = await waitFor(queue, (list) => list[0].status === UNKNOWN);
    assert.match(task.error, /上游是否完成未知/);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('取消排队任务直接生效，取消在跑任务则降为 unknown', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({ root, concurrency: 1, execute: () => new Promise(() => {}) });
    await queue.enqueue([{ shotId: 'a', provider: 'image' }, { shotId: 'b', provider: 'image' }]);
    await queue.run();
    const tasks = await queue.snapshot();
    const queued = tasks.find((t) => t.status === QUEUED);
    const running = tasks.find((t) => t.status === RUNNING);
    assert.ok(queued && running, '应有一个排队一个在跑');
    assert.deepEqual(await queue.cancel(queued.id), { ok: true, status: CANCELLED });
    const second = await queue.cancel(running.id);
    assert.equal(second.status, UNKNOWN, '在跑任务取消后必须按未知处理，因为可能已计费');
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('人工处置未知任务需要核对依据', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({
      root,
      execute: async () => { const e = new Error('断网'); e.code = 'ETIMEDOUT'; throw e; },
    });
    await queue.enqueue({ shotId: 's1', provider: 'image' });
    await queue.run();
    const [task] = await waitFor(queue, (list) => list[0].status === UNKNOWN);
    await assert.rejects(() => queue.resolveUnknown(task.id, { outcome: 'succeeded', note: '好' }), /至少 4 个字/);
    await assert.rejects(() => queue.resolveUnknown(task.id, { outcome: 'unknown', note: '供应商后台已扣费' }), /须为 succeeded 或 failed/);
    const result = await queue.resolveUnknown(task.id, { outcome: 'succeeded', note: '供应商后台已见成功记录' });
    assert.equal(result.task.status, SUCCEEDED);
    assert.equal(result.task.resolution.note, '供应商后台已见成功记录');
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test('错误归类：明确拒绝 / 结果未知 / 可重试失败', () => {
  assert.equal(classifyError({ providerStatus: 403 }).status, REJECTED);
  assert.equal(classifyError({ providerRejected: true }).status, REJECTED);
  assert.equal(classifyError({ code: 'EPIPE' }).status, UNKNOWN);
  assert.equal(classifyError({ ambiguous: true }).status, UNKNOWN);
  assert.equal(classifyError({ code: 'EFAIL' }).status, FAILED);
  assert.equal(classifyError({ code: 'EFAIL' }).retryable, true);
});

test('统计只给状态计数，不泄露提示词', async () => {
  const root = await project();
  try {
    const queue = createShotQueue({ root, execute: async () => {} });
    await queue.enqueue({ shotId: 's1', provider: 'image', prompt: '机密画面描述' });
    const stats = await queue.summary();
    assert.equal(stats.total, 1);
    assert.equal(stats.counts[QUEUED], 1);
    assert.equal(JSON.stringify(stats).includes('机密画面描述'), false);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
