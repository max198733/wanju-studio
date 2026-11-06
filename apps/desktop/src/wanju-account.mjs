import { existsSync, readFileSync, renameSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { keyAddress } from './agent-roster.mjs';

export function studentServiceUrl(value) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  if (!text) return '';
  const url = new URL(text);
  if (!keyAddress(text) || url.username || url.password || url.search || url.hash) throw new Error('玩剧账号服务地址无效，请联系管理员更新配置。');
  return text;
}

/** Sessions stay in the main process; shared chat keys never enter the desktop. */
export function createWanjuAccount({ dataDir, serviceUrl, seal, unseal, model, fetchImpl = fetch, onChange = () => {}, onState = () => {} }) {
  const origin = studentServiceUrl(serviceUrl);
  const file = join(dataDir, 'student-session');
  let session = null;
  if (origin && existsSync(file)) {
    try { const saved = JSON.parse(unseal(readFileSync(file))); if (saved.origin === origin && typeof saved.token === 'string') session = saved; }
    catch { /* A keychain or service change needs a fresh login. */ }
  }
  let sequence = 0;
  let cloudLifetime = new AbortController();
  const invalidateCloud = () => {
    cloudLifetime.abort();
    cloudLifetime = new AbortController();
  };
  const modeFile = join(dataDir, 'student-own-media.json');
  let ownMediaEnabled = false;
  let ownMediaOwner = '';
  try {
    const preference = JSON.parse(readFileSync(modeFile, 'utf8'));
    ownMediaEnabled = preference.enabled === true;
    ownMediaOwner = typeof preference.userId === 'string' ? preference.userId : '';
  } catch { /* Opt in separately from activation. */ }
  const publish = (state) => {
    const result = { ...state, ownMediaEnabled: state.authenticated === true && ownMediaOwner === state.user?.id && ownMediaEnabled };
    onState({ ...result, expiresAt: state.authenticated ? Date.now() + 120000 : 0 });
    return result;
  };
  const request = async (path, value, token = session?.token) => {
    if (!origin) throw new Error('玩剧云端账号服务尚未配置，本地创作可以继续。');
    let response;
    try {
      response = await fetchImpl(`${origin}${path}`, {
        method: value === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(value === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    } catch { throw new Error('暂时连接不上玩剧账号服务，请稍后重试。'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(data?.error?.message || '玩剧账号服务暂不可用。'), { status: response.status });
    if (!data || typeof data !== 'object') throw new Error('玩剧账号服务返回无效结果。');
    return data;
  };
  const forget = () => {
    session = null;
    rmSync(file, { force: true });
    model.remove();
  };
  const syncModel = (state) => {
    if (state.chat?.enabled && session) {
      const selected = state.chat.selectedTier;
      const version = state.chat.priceVersion;
      const pinned = ['base', 'claude', 'claude-max'].includes(selected) && /^[a-f0-9]{64}$/.test(version);
      model.install({ name: state.chat.displayName || '玩剧创作助手',
        baseUrl: pinned ? `${origin}/v1/tier/${selected}/${version}` : `${origin}/v1`,
        model: 'wanju-creative', key: session.token, format: state.chat.format ?? 'chat',
        context: state.chat.context, maxOutputTokens: state.chat.maxOutputTokens, billingMode: state.chat.billingMode ?? 'wallet' });
    } else model.remove();
  };
  const remember = (result) => {
    const value = { origin, token: result.token, expires: result.expires };
    mkdirSync(dataDir, { recursive: true });
    const bytes = seal(JSON.stringify(value));
    writeFileSync(`${file}.next`, bytes, { mode: 0o600 });
    renameSync(`${file}.next`, file);
    session = value;
  };
  const status = async () => {
    if (!origin) { model.remove(); return publish({ configured: false, authenticated: false }); }
    const revision = sequence;
    if (!session) {
      onState({ authenticated: false, ownMediaEnabled: false, expiresAt: 0 });
      const value = await request('/api/public', undefined, '');
      if (sequence !== revision) return { configured: true, authenticated: false, ownMediaEnabled: false };
      return publish({ ...value, configured: true, authenticated: false });
    }
    const token = session.token;
    try {
      const value = await request('/api/me', undefined, token);
      if (sequence !== revision || session?.token !== token) return { configured: true, authenticated: false, ownMediaEnabled: false };
      syncModel(value);
      return publish({ ...value, configured: true, authenticated: true });
    } catch (error) {
      const currentRequest = sequence === revision && session?.token === token;
      if (currentRequest) onState({ authenticated: false, ownMediaEnabled: false, expiresAt: 0 });
      if (currentRequest && [401, 403].includes(error.status)) {
        sequence++;
        invalidateCloud();
        forget();
        onChange();
        return publish({ configured: true, authenticated: false, warning: '登录已失效，请重新登录。' });
      }
      throw error;
    }
  };
  // Serialize account mutations so two tabs cannot overwrite each other's session file.
  let pending = Promise.resolve();
  const exclusive = (fn) => {
    const next = pending.then(fn);
    pending = next.catch(() => {});
    return next;
  };
  return {
    status,
    async refresh() {
      const revision = sequence;
      const result = await status();
      if (sequence === revision) onChange();
      return result;
    },
    async mediaConfiguration() {
      if (!session) throw new Error('请先登录玩剧账号，再同步默认服务。');
      const revision = sequence, token = session.token;
      const config = await request('/api/media/config', undefined, token);
      if (sequence !== revision || session?.token !== token) throw new Error('账号已切换，本次配置同步已停止。');
      return config;
    },
    async cloudSession() {
      const state = await status();
      if (!state.authenticated || !session) throw new Error('请先登录玩剧账号，再使用云项目。');
      const revision = sequence, token = session.token, lifetime = cloudLifetime.signal;
      return {
        origin, userId: state.user.id,
        async request(path, options = {}) {
          if (sequence !== revision || session?.token !== token) throw new Error('账号已切换，本次云同步已停止。');
          if (typeof path !== 'string' || !/^\/api\/cloud\/[\w/?=&.-]+$/.test(path) || path.includes('..')) throw new Error('云项目接口地址无效。');
          const response = await fetchImpl(`${origin}${path}`, { ...options, redirect: 'error',
            signal: AbortSignal.any([lifetime, AbortSignal.timeout(15 * 60000), ...(options.signal ? [options.signal] : [])]),
            headers: { ...options.headers, authorization: `Bearer ${token}` },
          });
          if (sequence !== revision || session?.token !== token) { await response.body?.cancel().catch(() => {}); throw new Error('账号已切换，本次云同步已停止。'); }
          return response;
        },
      };
    },
    setOwnMediaEnabled(enabled) {
      return exclusive(async () => {
        if (typeof enabled !== 'boolean') throw new Error('服务模式无效。');
        const state = await status();
        if (!state.authenticated) throw new Error('请先激活或登录，再配置自有服务。');
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(`${modeFile}.next`, JSON.stringify({ enabled, userId: state.user.id }), { mode: 0o600 });
        renameSync(`${modeFile}.next`, modeFile);
        ownMediaEnabled = enabled;
        ownMediaOwner = state.user.id;
        const result = publish(state);
        onChange();
        return result;
      });
    },
    authenticate(kind, input) {
      return exclusive(async () => {
        sequence++;
        invalidateCloud();
        const value = await request(kind === 'activate' ? '/api/activate' : kind === 'register' ? '/api/account/register' : '/api/login',
          { username: input.username, password: input.password, ...(kind === 'activate' ? { code: input.code } : {}) }, '');
        if (typeof value.token !== 'string' || !value.token.startsWith('wjs_')) throw new Error('登录凭证无效。');
        model.remove();
        remember(value);
        // Invalidate status calls that ran while the login request was in flight.
        sequence++;
        const result = await status();
        onChange();
        return result;
      });
    },
    redeem(code) {
      return exclusive(async () => {
        if (!session) throw new Error('请先登录。');
        await request('/api/redeem', { code });
        const result = await status();
        onChange();
        return result;
      });
    },
    consent(priceVersion) {
      return exclusive(async () => {
        if (!session) throw new Error('请先登录。');
        await request('/api/consent', { priceVersion });
        const result = await status();
        onChange();
        return result;
      });
    },
    selectTier(tier, priceVersion) {
      return exclusive(async () => {
        if (!session) throw new Error('请先登录。');
        await request('/api/chat/tier', { tier, priceVersion });
        sequence++;
        const result = await status();
        onChange();
        return result;
      });
    },
    logout() {
      return exclusive(async () => {
        sequence++;
        invalidateCloud();
        const token = session?.token;
        forget();
        onChange();
        publish({ configured: Boolean(origin), authenticated: false });
        let warning = '';
        try { if (token) await request('/api/logout', {}, token); }
        catch { warning = '本机已退出；服务端未能确认退出，需联系管理员撤销登录。'; }
        return publish({ configured: Boolean(origin), authenticated: false, warning });
      });
    },
  };
}
