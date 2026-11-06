import type { LocalAgentId, RosterAgent } from './desktop-bridge';

export const WANJU_ASSISTANT = 'wanjustudent';

export function wanjuDefaultAssistant() {
  return { picked: 'byok' as const, prefs: { byok: { model: WANJU_ASSISTANT } }, options: {} };
}

/** Configuration readiness only; reading the roster never probes a paid model. */
export function wanjuAssistantState(agent: LocalAgentId, roster: RosterAgent[] | null, model?: unknown) {
  const selected = roster?.find((item) => item.id === agent);
  const cloud = agent === 'byok' && model === WANJU_ASSISTANT;
  const name = agent === 'byok' ? '创作助手' : selected?.name || '创作助手';
  const unavailable = (label: string, checking = false) => ({ ready: false, checking, label, cloud, billing: '' });
  if (!roster || selected?.status === 'checking') return unavailable('正在检查创作助手', true);
  if (cloud && !selected?.byok?.models.some((item) => item.id === WANJU_ASSISTANT)) return unavailable('登录后即可使用玩剧积分助手');
  if (!selected?.shown) return unavailable(`${name}待连接`);
  if (selected.status === 'waiting') return unavailable(`${name}正在登录`, true);
  if (selected.status === 'missing') return unavailable(`${name}待安装`);
  if (selected.status === 'sign-in') return unavailable(`${name}待登录`);
  if (selected.status !== 'ready') return unavailable(`${name}待配置`);
  if (agent === 'byok') {
    const models = selected.byok?.models ?? [];
    const chosen = models.find((item) => item.id === model) ?? models.find((item) => item.model === model) ?? models[0];
    if (!chosen) return unavailable('创作助手待配置');
    const hosted = chosen.id === WANJU_ASSISTANT;
    return { ready: true, checking: false, cloud: hosted, label: `${chosen.name || chosen.model} 已配置`,
      billing: hosted ? chosen.billingMode === 'included' ? '平台承担费用' : '按玩剧积分结算' : '自有密钥 · 供应商计费' };
  }
  return { ready: true, checking: false, cloud: false, label: `${name} 已连接`, billing: '自有账号 · 供应商计费' };
}
