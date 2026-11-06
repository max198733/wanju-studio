import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const blocked = new Set([400, 401, 403, 404, 409, 410, 413, 422]);

/** Opt-in upload only. No remote downloads, generated media calls, or automatic conflict resolution. */
export function createWanjuAutoSync({ file, identity, projects, sample, upload, now = Date.now, onChange = () => {} }) {
  let rules = [], active = false;
  const states = new Map();
  if (existsSync(file)) {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(value) || value.some((r) => typeof r.owner !== 'string' || typeof r.projectId !== 'string'
      || typeof r.priceVersion !== 'string' || (r.paused !== undefined && typeof r.paused !== 'boolean')))
      throw new Error('自动保存设置损坏，已停止自动保存。');
    rules = value;
  }
  const key = (owner, id) => JSON.stringify([owner, id]);
  const stateFor = (rule) => {
    const id = key(rule.owner, rule.projectId);
    if (!states.has(id)) states.set(id, { phase: rule.paused ? 'paused' : 'waiting',
      message: rule.paused ? '自动保存已暂停，请核对后恢复。' : '等待项目稳定', failures: 0 });
    return states.get(id);
  };
  const list = () => rules.filter((rule) => rule.owner === identity()).map((rule) => {
    const state = stateFor(rule);
    return { projectId: rule.projectId, enabled: true, phase: state.phase, message: state.message,
      lastSyncedAt: state.lastSyncedAt, revision: state.revision, nextRetryAt: state.nextRetryAt };
  });
  const publish = () => onChange(list());
  const pause = (rule, state, message) => {
    state.phase = 'paused'; state.message = message;
    rule.paused = true;
    persist(rules);
  };
  const failed = (rule, state, error) => {
    state.failures++;
    if (blocked.has(error.status) || state.failures >= 5) {
      pause(rule, state, error.message || '自动保存已暂停，请手动核对。');
    } else {
      state.phase = 'retry'; state.message = '连接暂不可用，稍后重试；本地文件保留。';
      state.nextRetryAt = now() + Math.min(15 * 60000, 30000 * 2 ** (state.failures - 1));
    }
  };
  const persist = (next) => {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.next`;
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, file);
    rules = next;
  };
  return {
    list,
    configure({ owner, projectId, enabled, priceVersion }) {
      if (!owner || owner !== identity()) throw new Error('账号已切换，请重新打开云项目。');
      if (typeof enabled !== 'boolean' || typeof projectId !== 'string' || !projectId || projectId.length > 100)
        throw new Error('自动保存设置无效。');
      if (enabled && (typeof priceVersion !== 'string' || !priceVersion)) throw new Error('请先确认当前价格。');
      const next = rules.filter((rule) => rule.owner !== owner || rule.projectId !== projectId);
      if (enabled) next.push({ owner, projectId, priceVersion });
      persist(next);
      states.delete(key(owner, projectId));
      publish();
      return list();
    },
    async tick() {
      if (active || !identity()) return;
      const owner = identity(), selected = rules.filter((rule) => rule.owner === owner);
      if (!selected.length) return;
      active = true;
      try {
        let local;
        try { local = await projects(); }
        catch (error) {
          if (identity() === owner) for (const rule of selected) {
            const state = stateFor(rule);
            if (rules.includes(rule) && state.phase !== 'paused' && !(state.nextRetryAt > now())) failed(rule, state, error);
          }
          return;
        }
        for (const rule of selected) {
          if (identity() !== owner) break;
          if (!rules.includes(rule)) continue;
          const state = stateFor(rule);
          if (state.phase === 'paused' || state.nextRetryAt > now()) continue;
          try {
            const project = local.find((p) => p.id === rule.projectId && !p.missing);
            if (!project) throw Object.assign(new Error('本地项目不存在，自动保存已暂停。'), { status: 404 });
            const snapshot = await sample(project);
            if (identity() !== owner || !rules.includes(rule)) break;
            if (!snapshot) {
              state.signature = null; state.phase = 'waiting'; state.message = '创作中，等待本轮完成'; continue;
            }
            if (state.signature !== snapshot) {
              state.signature = snapshot; state.stableSince = now(); state.phase = 'waiting'; state.message = '等待项目稳定'; continue;
            }
            if (state.saved === snapshot) { state.phase = 'synced'; state.message = '已自动保存'; continue; }
            if (now() - state.stableSince < 30000) continue;
            state.phase = 'syncing'; state.message = '正在自动保存'; publish();
            const result = await upload(project, { owner, priceVersion: rule.priceVersion });
            if (identity() !== owner || !rules.includes(rule)) break;
            state.lastSyncedAt = result.syncedAt ?? now(); state.revision = result.revision;
            if (result.billingWarnings?.length) {
              pause(rule, state, '文件已保存，服务费待处理，请手动保存核对后重新开启。');
            } else {
              state.saved = snapshot; state.failures = 0; state.nextRetryAt = undefined;
              state.phase = 'synced'; state.message = '已自动保存';
            }
          } catch (error) {
            if (identity() !== owner || !rules.includes(rule)) break;
            failed(rule, state, error);
          }
        }
      } finally { active = false; publish(); }
    },
  };
}
