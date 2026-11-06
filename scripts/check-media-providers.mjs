#!/usr/bin/env node
/**
 * 玩剧 · 媒体供应商连通性体检
 *
 * 分层探测每个供应商，定位"到底卡在哪一层"：
 *   1. 配置校验   本地 schema 是否合法（不发网络请求）
 *   2. DNS 解析   域名能否解析
 *   3. 端口连通   TCP 443 是否可达
 *   4. TLS 握手   证书是否有效
 *   5. 鉴权       密钥是否被服务商接受
 *
 * 设计原则：绝不发起付费生成。
 *   - 图片   GET  /v1/models        标准 OpenAI 兼容接口，免费
 *   - 视频   取任务列表 / 探 405    只读
 *   - 任何 401=密钥无效  403=额度或权限  400=密钥有效但参数不被接受（说明已打通）
 *
 * 用法：
 *   node scripts/check-media-providers.mjs                 # 连通性全检（联网）
 *   node scripts/check-media-providers.mjs --offline       # 只做本地配置校验
 *   node scripts/check-media-providers.mjs --file <路径>    # 指定 media-profiles.json
 *   node scripts/check-media-providers.mjs --json          # 输出机器可读报告
 */

import { readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const profilesModule = join(here, '..', 'apps', 'wanju-service', 'media-profiles.mjs');

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const asJson = args.includes('--json');
const fileArg = args.indexOf('--file');
const defaultFile = join(here, '..', '..', 'DebugWorkspace', 'data', 'providers', 'media-profiles.json');
const targetFile = resolvePath(fileArg >= 0 ? args[fileArg + 1] : defaultFile);

const TIMEOUT = 15000;
const results = [];
let mediaProfile;

/* ---------- 探测原语 ---------- */

function tcpProbe(host, port = 443) {
  return new Promise((done) => {
    const started = Date.now();
    const socket = connect({ host, port, timeout: TIMEOUT });
    const finish = (ok, note) => { socket.destroy(); done({ ok, note, ms: Date.now() - started }); };
    socket.once('connect', () => finish(true, '可连接'));
    socket.once('timeout', () => finish(false, `超时 ${TIMEOUT}ms`));
    socket.once('error', (error) => finish(false, error.code || error.message));
  });
}

function httpsProbe(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((done) => {
    const started = Date.now();
    let target;
    try { target = new URL(url); } catch { return done({ ok: false, note: '地址无法解析' }); }
    const req = httpsRequest({
      hostname: target.hostname, port: target.port || 443, path: target.pathname + target.search,
      method, headers: { 'user-agent': 'wanju-provider-check/1', ...headers }, timeout: TIMEOUT,
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (text.length < 4000) text += chunk; });
      res.on('end', () => done({ ok: true, status: res.statusCode, headers: res.headers, text, ms: Date.now() - started }));
    });
    req.on('timeout', () => { req.destroy(); done({ ok: false, note: `超时 ${TIMEOUT}ms` }); });
    req.on('error', (error) => done({ ok: false, note: error.code || error.message }));
    if (body) req.write(body);
    req.end();
  });
}

/* ---------- 各适配器的只读探针 ---------- */

const authHeaders = (profile) => {
  const [name, ...rest] = profile.auth.split(':');
  return { [name.trim()]: rest.join(':').trim().replace('{key}', profile.key) };
};

// 从错误体里提取可读原因，但绝不回显密钥
function reasonOf(res, key) {
  let text = typeof res.text === 'string' ? res.text : '';
  if (key && key.length >= 8) text = text.split(key).join('[已隐藏]');
  try {
    const json = JSON.parse(text);
    const message = json?.error?.message || json?.message || json?.msg || json?.detail;
    const code = json?.error?.code || json?.code;
    if (message || code) return [code && `code=${code}`, message].filter(Boolean).join(' ');
  } catch { /* 非 JSON */ }
  return text.replace(/\s+/g, ' ').slice(0, 160);
}

/**
 * 判断鉴权是否通过。
 * 401 = 密钥无效；403 = 密钥有效但无权限/无额度；其他 4xx = 请求形态不被接受，但链路已通。
 * 5xx 视为服务商侧异常，链路本身是通的。
 */
function classify(status) {
  if (status === 401) return { pass: false, level: '鉴权失败', hint: '密钥未被接受，请核对是否复制完整、是否含多余空格' };
  if (status === 403) return { pass: false, level: '权限/额度', hint: '密钥有效但被拒，核对渠道分组、模型权限、账户余额' };
  if (status === 404) return { pass: true, level: '路径待核', hint: '服务可达但该路径不存在，基础地址或路径需修正' };
  if (status === 429) return { pass: true, level: '限流', hint: '密钥有效，当前被限流' };
  if (status >= 500) return { pass: true, level: '上游异常', hint: '服务商侧报错，稍后重试' };
  if (status >= 200 && status < 300) return { pass: true, level: '通过', hint: '' };
  return { pass: true, level: '已连通', hint: '返回 4xx 说明鉴权已过，仅参数被拒' };
}

const probes = {
  // OpenAI 兼容图片：/v1/models 是标准免费只读接口
  'openai-image': async (profile) => {
    const base = new URL(profile.baseUrl);
    const url = new URL('/v1/models', base.origin).href;
    const res = await httpsProbe(url, { headers: authHeaders(profile) });
    if (!res.ok) return { ...res, level: '不可达' };
    const verdict = classify(res.status);
    return { ...res, ...verdict, note: reasonOf(res, profile.key) || `${res.status}` };
  },
  // 方舟兼容视频：任务列表为只读接口
  seedance: async (profile) => {
    const base = profile.baseUrl.replace(/\/+$/, '');
    const url = `${base}?page_num=1&page_size=1`;
    const res = await httpsProbe(url, { headers: authHeaders(profile) });
    if (!res.ok) return { ...res, level: '不可达' };
    const verdict = classify(res.status);
    return { ...res, ...verdict, note: reasonOf(res, profile.key) || `${res.status}` };
  },
  // H3 首帧：只发 GET，绝不 POST（POST 会真的建任务）
  'h3-single': async (profile) => {
    const res = await httpsProbe(profile.baseUrl, { headers: authHeaders(profile) });
    if (!res.ok) return { ...res, level: '不可达' };
    const verdict = classify(res.status);
    const hint = res.status === 405 ? 'GET 被拒属正常（该接口只收 POST），链路与鉴权需实际生成才能确认'
      : verdict.hint;
    return { ...res, ...verdict, hint, note: reasonOf(res, profile.key) || `${res.status}` };
  },
  // 自定义 HTTP：只探根路径
  'custom-http': async (profile) => {
    const res = await httpsProbe(profile.baseUrl, { headers: authHeaders(profile) });
    if (!res.ok) return { ...res, level: '不可达' };
    const verdict = classify(res.status);
    return { ...res, ...verdict, note: reasonOf(res, profile.key) || `${res.status}` };
  },
};

/* ---------- 主流程 ---------- */

async function checkProfile(profile, index) {
  const record = {
    index, id: profile.id, name: profile.name, category: profile.category, adapter: profile.adapter,
    baseUrl: profile.baseUrl, model: profile.model,
    keyConfigured: Boolean(profile.key && profile.key.length >= 8), layers: [],
  };
  const failed = (level, note) => {
    record.verdict = '失败'; record.failedAt = level; record.note = note;
    results[index] = record; return record;
  };

  // 第 1 层：配置校验
  try {
    if (!mediaProfile) ({ mediaProfile } = await import(pathToFileURL(profilesModule).href));
    mediaProfile({ ...profile }, { allowKey: true });
    record.layers.push({ layer: '配置校验', ok: true, note: 'schema 合法' });
  } catch (error) {
    record.layers.push({ layer: '配置校验', ok: false, note: error.message });
    return failed('配置校验', error.message);
  }
  if (!record.keyConfigured) {
    record.layers.push({ layer: '密钥', ok: false, note: '未配置' });
    return failed('密钥', '该供应商没有密钥，无法调用');
  }

  const host = new URL(profile.baseUrl).hostname.replace(/^\[|\]$/g, '');

  // 第 2 层：DNS（走系统解析器，与 Electron 运行时一致；不直接查 53 端口）
  let addresses = [];
  try {
    const found = await lookup(host, { all: true, verbatim: true });
    addresses = found.map((entry) => `${entry.address}${entry.family === 6 ? ' (v6)' : ''}`);
    record.layers.push({ layer: 'DNS 解析', ok: addresses.length > 0, note: addresses.slice(0, 2).join(', ') || '无记录' });
    if (!addresses.length) return failed('DNS 解析', '域名无 A/AAAA 记录');
  } catch (error) {
    record.layers.push({ layer: 'DNS 解析', ok: false, note: error.code || error.message });
    return failed('DNS 解析', `${host} 无法解析`);
  }

  // 第 3 层：TCP 443
  const tcp = await tcpProbe(host, Number(new URL(profile.baseUrl).port) || 443);
  record.layers.push({ layer: 'TCP 443', ok: tcp.ok, note: `${tcp.note}（${tcp.ms}ms）` });
  if (!tcp.ok) return failed('TCP 443', `无法建立连接：${tcp.note}`);

  // 离线模式到此为止
  if (offline) {
    record.layers.push({ layer: '鉴权', ok: null, note: '离线模式跳过' });
    record.verdict = '待联网验证'; record.note = '配置与网络层正常，未做鉴权探测';
    results[index] = record; return record;
  }

  // 第 4 层：TLS + 鉴权（一次请求同时验证）
  const probe = probes[profile.adapter];
  if (!probe) {
    record.layers.push({ layer: '鉴权', ok: null, note: '未知适配器' });
    results[index] = record; return record;
  }
  const res = await probe(profile);
  if (res.note === '超时' || (res.level === '不可达')) {
    record.layers.push({ layer: 'TLS/鉴权', ok: false, note: res.note || '连接失败' });
    return failed('TLS/鉴权', res.note || 'HTTPS 握手或请求失败');
  }
  record.layers.push({ layer: 'TLS 握手', ok: true, note: '证书有效' });
  record.layers.push({ layer: '鉴权', ok: res.pass, note: `${res.level}｜HTTP ${res.status}｜${res.note}`.slice(0, 200) });
  record.verdict = res.pass ? '通' : '卡在鉴权';
  record.note = res.pass ? (res.level === '通过' ? '链路完整可用' : `${res.level}：${res.hint}`) : res.hint;
  record.statusCode = res.status;
  results[index] = record;
  return record;
}

async function main() {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(targetFile, 'utf8'));
  } catch (error) {
    console.error(`读取配置失败：${targetFile}\n${error.message}`);
    process.exit(1);
  }

  const profiles = Array.isArray(catalog.profiles) ? catalog.profiles : [];
  if (!profiles.length) {
    console.log('配置中没有自定义供应商。云端默认配置需在客户端登录后同步。');
    return;
  }

  if (!asJson) {
    console.log('');
    console.log('玩剧 · 媒体供应商连通性体检');
    console.log(`配置文件：${targetFile}`);
    console.log(`模式：${offline ? '离线（跳过鉴权）' : '联网探测（不发起付费生成）'}`);
    console.log(`供应商：${profiles.length} 个｜默认：图片=${catalog.selection?.image || 'cloud'} 视频=${catalog.selection?.video || 'cloud'} 音频=${catalog.selection?.audio || 'cloud'}`);
    console.log('');
  }

  const queue = profiles.map((profile, index) => () => checkProfile(profile, index));
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) await queue.shift()();
  });
  await Promise.all(workers);

  if (asJson) {
    console.log(JSON.stringify({ file: targetFile, offline, checkedAt: new Date().toISOString(), profiles: results }, null, 2));
    return;
  }

  let bad = 0;
  for (const record of results) {
    const mark = record.verdict === '通' ? '[通]' : record.verdict === '待联网验证' ? '[待验]' : '[卡]';
    if (record.verdict !== '通' && record.verdict !== '待联网验证') bad += 1;
    console.log(`${mark} ${record.name}  (${record.category} / ${record.adapter})`);
    console.log(`     ${record.model || '（无模型）'} @ ${record.baseUrl}`);
    for (const layer of record.layers) {
      const symbol = layer.ok === true ? 'ok  ' : layer.ok === false ? 'FAIL' : 'skip';
      console.log(`     ${symbol} ${layer.layer.padEnd(10)} ${layer.note}`);
    }
    if (record.note) console.log(`     → ${record.note}`);
    console.log('');
  }

  const passed = results.filter((r) => r.verdict === '通').length;
  const pending = results.filter((r) => r.verdict === '待联网验证').length;
  console.log('─'.repeat(60));
  console.log(`结果：${passed} 通 / ${pending} 待验 / ${bad} 卡住，共 ${results.length} 个`);
  if (bad) {
    console.log('');
    console.log('下一步：按上面 FAIL 的那一层处理。');
    console.log('  卡在 DNS/TCP → 地址写错或本机网络被拦，不是密钥问题');
    console.log('  卡在鉴权     → 登录服务商后台核对密钥、分组、余额');
    console.log('  显示"已连通" → 链路没问题，可以按最小链路试真实生成（需先定预算）');
  }
  console.log('');
}

main().catch((error) => {
  console.error('体检异常终止：', error.message);
  process.exit(1);
});
