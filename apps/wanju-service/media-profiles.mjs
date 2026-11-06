import { isIP, BlockList } from 'node:net';

export const MEDIA_CATEGORIES = ['image', 'video', 'audio'];
export const MEDIA_ADAPTERS = {
  'openai-image': { category: 'image', label: 'OpenAI 兼容图片' },
  seedance: { category: 'video', label: 'Seedance / 方舟兼容视频' },
  'h3-single': { category: 'video', label: 'AutoDL H3 首帧视频' },
  'custom-http': { category: null, label: '原生自定义 HTTP 服务' },
};
const blocked = new BlockList();
for (const [address, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(address, bits, 'ipv4');
for (const [address, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) blocked.addSubnet(address, bits, 'ipv6');
const bad = (text) => Object.assign(new Error(text), { status: 400 });
export function mediaAddress(value) {
  if (typeof value !== 'string' || value.length > 1000) throw bad('请填写供应商 HTTPS 基础地址。');
  let url;
  try { url = new URL(value.trim()); } catch { throw bad('供应商地址格式无效。'); }
  let host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host.startsWith('::ffff:')) host = host.slice(7);
  const family = isIP(host);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.port && url.port !== '443' || /^(localhost|localhost\.localdomain)$/.test(host)
    || /\.(localhost|local|internal|test)$/.test(host)
    || family && blocked.check(host, family === 4 ? 'ipv4' : 'ipv6')) throw bad('供应商须使用公网 HTTPS 地址，不能在地址中填写密钥或参数。');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
function text(value, name, max, required = true, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value) || required && !value.trim()) throw bad(`${name}无效。`);
  return value.trim();
}
export function mediaKey(value) {
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 2000
    || /[\s\u0000-\u001f\u007f]/.test(value.trim())) throw bad('API 密钥无效，请只粘贴密钥，不要包含 Bearer 或空格。');
  return value.trim();
}
export function mediaProfile(raw, { allowKey = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('供应商配置格式无效。');
  const id = text(raw.id, '供应商编号', 80);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw bad('供应商编号只能包含字母、数字、短横线和下划线。');
  const category = raw.category, adapter = raw.adapter;
  if (!MEDIA_CATEGORIES.includes(category) || !Object.hasOwn(MEDIA_ADAPTERS, adapter)
    || MEDIA_ADAPTERS[adapter].category && MEDIA_ADAPTERS[adapter].category !== category) throw bad('供应商类别与接口协议不匹配。');
  const baseUrl = mediaAddress(raw.baseUrl);
  const profile = {
    id, category, adapter, name: text(raw.name, '供应商名称', 80), baseUrl,
    model: text(raw.model ?? '', '模型名称', 200, adapter !== 'custom-http'),
    note: text(raw.note ?? '', '调用说明', 1600, false, true),
    responseFormat: raw.responseFormat ?? 'b64_json',
    auth: text(raw.auth ?? 'Authorization: Bearer {key}', '认证请求头', 200),
  };
  if (!/^[A-Za-z0-9-]+: [^\r\n]*\{key\}[^\r\n]*$/.test(profile.auth)) throw bad('认证请求头须包含 {key}，例如 Authorization: Bearer {key}。');
  if (adapter !== 'custom-http' && profile.auth !== 'Authorization: Bearer {key}') throw bad('内置适配器使用 Authorization: Bearer {key}；其他认证方式请选择自定义 HTTP。');
  if (!['b64_json', 'url'].includes(profile.responseFormat)) throw bad('图片返回方式无效。');
  if (adapter === 'openai-image' && !['', '/', '/v1'].includes(new URL(baseUrl).pathname)) throw bad('图片基础地址应为站点地址或以 /v1 结尾。');
  if (adapter === 'seedance' && !new URL(baseUrl).pathname.endsWith('/contents/generations/tasks')) throw bad('方舟兼容视频地址需填写完整的 /contents/generations/tasks 路径。');
  if (adapter === 'h3-single' && !new URL(baseUrl).pathname.endsWith('/minimax_h3_zm_nono')) throw bad('H3 首帧地址需以 /minimax_h3_zm_nono 结尾。');
  if (Object.hasOwn(raw, 'key')) {
    if (!allowKey) throw bad('云端公共模板不能包含 API 密钥，请按账号分配独立密钥。');
    if (raw.key) profile.key = mediaKey(raw.key);
  }
  return profile;
}
export function mediaCatalog(input, options) {
  if (!input || !Array.isArray(input.profiles) || input.profiles.length > 60) throw bad('供应商清单无效，最多保存 60 个。');
  const profiles = input.profiles.map((raw) => mediaProfile(raw, options)), seen = new Set();
  for (const p of profiles) {
    if (seen.has(p.id)) throw bad('供应商编号重复。');
    seen.add(p.id);
  }
  const defaults = {};
  for (const category of MEDIA_CATEGORIES) {
    const id = input.defaults?.[category] || null;
    if (id !== null && !profiles.some((p) => p.id === id && p.category === category)) throw bad('默认供应商不存在或类别不匹配。');
    defaults[category] = id;
  }
  return { version: 1, profiles, defaults };
}
export function shownMediaProfile(profile) {
  const { key, ...safe } = profile;
  return { ...safe, configured: Boolean(key), verification: 'unverified' };
}
