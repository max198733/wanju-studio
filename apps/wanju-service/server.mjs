import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { isIP } from 'node:net';
import { openStore, ServiceError, fail, hash, usagePoints } from './store.mjs';
import { pricingQuote } from './pricing.mjs';
import { CLOUD_UPLOAD_CHUNK_BYTES, createCloudFiles } from './cloud.mjs';
import { createMediaRelay, MEDIA_TIMEOUT_MS } from './media-relay.mjs';
import { mediaAddress } from './media-profiles.mjs';
import { chatConnectionFailure, chatFailureMessage, chatHttpFailure, chatPublicError, readChatError } from './chat-diagnostics.mjs';

const PUBLIC = new URL('./public/', import.meta.url);
const SERVICE_RELEASE = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};
async function body(req, maximum = 65536) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) fail('请求格式需为JSON。', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) fail('请求内容过大。', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('请求格式无效。');
    return value;
  } catch (e) { if (e instanceof ServiceError) throw e; fail('请求格式无效。'); }
}
/**
 * 原样读字节。带参考图的出图是 multipart，服务端不解析、不重编码，
 * 只按内容摘要做幂等指纹，然后把原始字节连同原始 content-type 转发给上游。
 */
async function rawBody(req, maximum = 24 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) fail('请求内容过大。', 413);
    chunks.push(chunk);
  }
  if (!size) fail('请求内容无效。');
  return Buffer.concat(chunks);
}
const bearer = (req) => /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
/**
 * 图片改走本站代理时，客户端需要知道把 base_url 指向哪个公网地址、用哪把令牌。
 * 只在 HTTPS 公网访问下返回；本机调试、内网直连一律返回 null，保持原来的直连视图。
 */
function relayTarget(req, token) {
  if (!token) return null;
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  if (forwarded !== 'https' && !req.socket.encrypted) return null;
  try { return { origin: mediaAddress(`https://${req.headers.host ?? ''}`), token }; }
  catch { return null; }
}const equal = (a, b) => {
  const left = Buffer.from(hash(a));
  const right = Buffer.from(hash(b));
  return timingSafeEqual(left, right);
};
const staticFiles = {
  '/': ['download.html', 'text/html; charset=utf-8'],
  '/download': ['download.html', 'text/html; charset=utf-8'],
  '/download/': ['download.html', 'text/html; charset=utf-8'],
  '/download.css': ['download.css', 'text/css; charset=utf-8'],
  '/download.js': ['download.js', 'text/javascript; charset=utf-8'],
  '/downloads.json': ['downloads.json', 'application/json; charset=utf-8'],
  '/wanju.png': ['wanju.png', 'image/png'],
  '/student-guide': ['student-guide.html', 'text/html; charset=utf-8'],
  '/teacher-guide': ['teacher-guide.html', 'text/html; charset=utf-8'],
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/admin.js': ['admin.js', 'text/javascript; charset=utf-8'],
  // 2.0 本地预览测试台，仅本地启动脚本会用到
  '/preview': ['preview.html', 'text/html; charset=utf-8'],
  '/preview.js': ['preview.js', 'text/javascript; charset=utf-8'],
  '/media-admin.js': ['media-admin.js', 'text/javascript; charset=utf-8'],
  '/admin.css': ['admin.css', 'text/css; charset=utf-8'],
  '/register': ['account.html', 'text/html; charset=utf-8'],
  '/account': ['account.html', 'text/html; charset=utf-8'],
  '/account.js': ['account.js', 'text/javascript; charset=utf-8'],
  '/account.css': ['account.css', 'text/css; charset=utf-8'],
  '/enrollment.js': ['enrollment.js', 'text/javascript; charset=utf-8'],
};

export function createStudentService({ database = ':memory:', adminSecret, proxyToken = '', fetchImpl = fetch, cloudDirectory = '', enablePreview = false,
  chatIdleTimeoutMs = 180000, chatHeartbeatMs = 15000 } = {}) {
  if (typeof proxyToken !== 'string' || (proxyToken && proxyToken.length < 32)) throw new Error('The private proxy token must have at least 32 characters.');
  if (![chatIdleTimeoutMs, chatHeartbeatMs].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 900000)) throw new Error('Invalid chat timeout.');
  const store = openStore(database, adminSecret);
  const cloudFiles = cloudDirectory ? createCloudFiles(resolve(cloudDirectory), store.cloud, fail) : null;
  // 媒体代理：密钥只在这里出现，客户端永远拿不到。
  const mediaRelay = createMediaRelay({
    store,
    fail,
    fetchImpl,
    // 代理出图用运营方统一密钥兜底：新学员不必先被单独分配密钥就能出图。
    // 账号级分配的密钥仍然优先，个别学员可以用自己的供应商。
    profilesFor: async (id) => store.media.forUser(id, null, { operator: true }),
  });
  /**
   * 检查已保存的创作助手线路，但不发送提示词、不预留点数。
   * OpenAI 兼容供应商通常提供 GET /models；若供应商不返回模型目录，
   * 仍报告网络和鉴权结果，但不会把模型名称标记为已验证。
   */
  const checkChat = async (tier = 'base') => {
    if (!['base', 'claude', 'claude-max'].includes(tier)) fail('创作助手档位无效。');
    const config = store.chat(undefined, tier);
    const host = config.baseUrl ? (() => {
      try { return new URL(config.baseUrl).host; } catch { return ''; }
    })() : '';
    if (!config.baseUrl || !config.model || !config.key) {
      return { ok: false, verified: false, category: 'configuration', model: config.model || '',
        host, message: '该档位尚未填写完整的接口地址、模型名称或密钥，未发起网络请求。' };
    }
    const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/models`;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    timeout.unref?.();
    try {
      const response = await fetchImpl(endpoint, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { accept: 'application/json', authorization: `Bearer ${config.key}` },
      });
      const text = await readChatError(response, 64 * 1024);
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      if (!response.ok) {
        const failure = chatHttpFailure(response.status, text);
        return { ok: false, verified: false, category: failure.category, model: config.model, host,
          status: response.status, errorCode: failure.errorCode || '', message: chatFailureMessage(failure.category) };
      }
      if (parsed?.error) {
        return { ok: false, verified: false, category: 'upstream_protocol', model: config.model, host,
          status: response.status, message: '供应商返回了错误对象，未确认模型线路可用。' };
      }
      const ids = Array.isArray(parsed?.data)
        ? parsed.data.map((item) => typeof item?.id === 'string' ? item.id : '').filter(Boolean)
        : [];
      const modelMatched = ids.length ? ids.includes(config.model) : null;
      return {
        ok: modelMatched !== false, verified: modelMatched === true, category: 'ok',
        model: config.model, host, status: response.status, modelMatched, modelCount: ids.length,
        message: modelMatched === false
          ? `线路已响应，但模型目录中没有“${config.model}”，请核对模型名称或供应商分组。`
          : modelMatched === true
            ? `线路可用，模型“${config.model}”已在供应商目录中找到。`
            : '线路已响应，但供应商未返回可核对的模型目录；模型名称仍需按供应商文档确认。',
      };
    } catch (error) {
      const failure = timedOut ? { category: 'upstream_timeout' } : chatConnectionFailure(error);
      return { ok: false, verified: false, category: failure.category, model: config.model, host,
        errorCode: failure.errorCode || '', message: chatFailureMessage(failure.category) };
    } finally {
      clearTimeout(timeout);
    }
  };
  const attempts = new Map();
  const adminSessions = new Map();
  const adminFailures = new Map();
  const clientAddress = (req) => {
    const forwarded = req.headers['x-wanju-client-ip'];
    const proof = req.headers['x-wanju-proxy-token'];
    const trusted = proxyToken && typeof proof === 'string' && equal(proof, proxyToken)
      && typeof forwarded === 'string' && isIP(forwarded.trim());
    const address = trusted ? forwarded.trim() : req.socket.remoteAddress ?? 'unknown';
    return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address.toLowerCase();
  };
  const adminAuthorized = (token) => {
    if (equal(token, adminSecret)) return true;
    const expires = adminSessions.get(hash(token));
    if (expires && expires > Date.now()) return true;
    adminSessions.delete(hash(token));
    return false;
  };
  function limit(req, auth = false) {
    const address = clientAddress(req);
    const key = `${address}:${auth}`;
    const at = Date.now();
    if (attempts.size > 10000) {
      for (const [k, v] of attempts) if (v.expires < at) attempts.delete(k);
      if (attempts.size > 10000 && !attempts.has(key)) fail('请求过多，请稍后。', 429);
    }
    const record = attempts.get(key);
    const window = record && record.expires > at ? record : { count: 0, expires: at + (auth ? 900000 : 60000) };
    window.count++;
    attempts.set(key, window);
    if (window.count > (auth ? 200 : 600)) fail('操作过于频繁，请稍后。', 429);
  }
  async function completion(req, res, user, format = 'chat', selection) {
    const input = await body(req, 40 * 1024 * 1024);
    const responses = format === 'responses';
    if (input.model !== 'wanju-creative' || (responses
      ? !(typeof input.input === 'string' && input.input.length || Array.isArray(input.input) && input.input.length)
      : !Array.isArray(input.messages) || !input.messages.length)) fail('请使用已配置的创作助手。');
    if (input.n !== undefined && input.n !== 1) fail('每次只可生成一个回答。');
    if (input.modalities || input.audio || input.web_search_options || input.prediction) fail('该服务暂不支持此类附加收费功能。');
    if (selection) store.assertChatSelection(user.id, selection.tier, selection.version);
    else if (store.publicChat(user.id).selectedTier !== 'base') fail('请更新玩剧客户端后使用所选档位。', 409);
    const config = store.chat(user.id);
    if (!config.enabled) fail('老师尚未开通创作助手。', 503);
    if ((config.format ?? 'chat') !== format) fail('创作助手协议已变更，请刷新账号并新建对话后重试。', 409);
    if (responses) {
      if (input.previous_response_id || input.conversation || input.background) fail('默认助手仅支持独立请求，不可引用服务端其他会话。');
      if (input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.length > 128
        || input.tools.some((tool) => !tool || tool.type !== 'function'))) fail('默认助手仅允许本地函数工具，不允许额外付费的云端工具。');
      if (Array.isArray(input.input) && input.input.some((item) => !item
        || !['message', 'function_call', 'function_call_output', 'reasoning'].includes(item.type ?? 'message'))) fail('对话输入包含不支持的跨会话引用。');
    }
    const output = (responses ? input.max_output_tokens : input.max_completion_tokens ?? input.max_tokens) ?? config.maxOutputTokens;
    if (!Number.isSafeInteger(output) || output < 1 || output > config.maxOutputTokens) fail(`单次输出上限为${config.maxOutputTokens}个Token。`);
    const key = req.headers['idempotency-key'] || randomUUID();
    if (typeof key !== 'string' || key.length > 120) fail('请求编号无效。');
    const op = store.reserve(user.id, key, hash(JSON.stringify(input)));
    const stream = input.stream === true;
    const payload = responses ? { model: config.model, input: input.input, stream, store: false, max_output_tokens: output }
      : { model: config.model, messages: input.messages, stream, n: 1 };
    for (const name of responses ? ['instructions', 'tools', 'tool_choice', 'temperature', 'top_p', 'parallel_tool_calls', 'reasoning', 'text', 'include', 'truncation']
      : ['tools', 'tool_choice', 'temperature', 'top_p', 'parallel_tool_calls', 'reasoning_effort', 'response_format', 'stop']) {
      if (input[name] !== undefined) payload[name] = input[name];
    }
    if (!responses) {
      if (input.max_completion_tokens !== undefined) payload.max_completion_tokens = output;
      else payload.max_tokens = output;
      if (stream) payload.stream_options = { include_usage: true };
    }
    const billableUsage = (usage) => responses && usage
      ? { ...usage, prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens } : usage;
    const settle = (usage) => {
      const points = op.rates.billingMode === 'included' ? 0 : usagePoints(billableUsage(usage), op.rates);
      store.settle(op.id, Math.min(points, op.reserved), op.rates.billingMode === 'included'
        ? '内部默认助手，不扣用户钱包；上游费用由运营方承担。'
        : points > op.reserved ? '超出预留的费用由老师承担。' : '按本次请求时的售价结算。', usage);
    };
    const startedAt = Date.now();
    const controller = new AbortController();
    let timeout, heartbeat, timedOut = false, disconnected = false;
    let phase = 'connecting', upstreamStatus = null, bytes = 0;
    const resetIdle = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => { timedOut = true; controller.abort(); }, chatIdleTimeoutMs);
      timeout.unref?.();
    };
    resetIdle();
    const closed = () => {
      if (!res.writableEnded) { disconnected = true; controller.abort(); }
    };
    res.on('close', closed);
    res.setHeader('x-wanju-operation', op.id);
    let finished = false;
    const diagnostic = (failure) => store.recordChatDiagnostic(op.id, {
      ...failure, phase, model: config.model.split(config.key).join('[redacted]'),
      host: new URL(config.baseUrl).host, protocol: format, streamed: stream,
      elapsedMs: Date.now() - startedAt, upstreamStatus: failure.upstreamStatus ?? upstreamStatus, receivedBytes: bytes,
    });
    const recordFailure = (failure) => {
      diagnostic(failure);
      const note = `${chatFailureMessage(failure.category)}${failure.upstreamStatus ? ` HTTP ${failure.upstreamStatus}。` : ''}`;
      if (failure.released) store.settle(op.id, 0, `${note}已退回预留。`);
      else store.review(op.id, `${note}需核对上游账单，没有自动重发。`);
      finished = true;
      return chatPublicError(failure, op.id);
    };
    const throwFailure = (failure) => {
      const details = recordFailure(failure);
      const status = failure.upstreamStatus === 429 ? 429 : failure.category === 'upstream_timeout' ? 504 : 502;
      throw Object.assign(new ServiceError(details.message, status), { publicDetails: details });
    };
    const streamFailure = (error) => responses
      ? `event: response.failed\ndata: ${JSON.stringify({ type: 'response.failed',
        response: { status: 'failed', error: { ...error, code: 'upstream_error', failure_code: error.code } } })}\n\n`
      : `data: ${JSON.stringify({ error: { ...error, code: 'upstream_error', failure_code: error.code } })}\n\n`;
    try {
      const upstream = await fetchImpl(`${config.baseUrl}/${responses ? 'responses' : 'chat/completions'}`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${config.key}`,
          // Helps providers deduplicate a retry made by their edge without making Wanju retry paid requests itself.
          'idempotency-key': op.id,
          'x-wanju-operation': op.id,
        },
        body: JSON.stringify(payload),
      });
      phase = 'headers';
      upstreamStatus = upstream.status;
      resetIdle();
      if (!upstream.ok) {
        throwFailure(chatHttpFailure(upstream.status, await readChatError(upstream)));
      }
      if (!stream) {
        phase = 'json';
        const data = await upstream.json();
        if ((responses ? !Array.isArray(data.output) || data.status !== 'completed' : !Array.isArray(data.choices)) || data.error) throwFailure({ category: 'upstream_protocol' });
        phase = 'usage';
        try {
          settle(data.usage);
        } catch (e) {
          if (!(e instanceof ServiceError)) throw e;
          diagnostic({ category: 'usage_missing' });
          store.review(op.id, '结果已返回，但上游没有可靠用量；等待老师核对。');
        }
        finished = true;
        data.model = 'wanju-creative';
        return json(res, 200, data);
      }
      if (!upstream.body || !/text\/event-stream/i.test(upstream.headers.get('content-type') ?? '')) {
        void upstream.body?.cancel().catch(() => {});
        throwFailure({ category: 'upstream_protocol' });
      }
      phase = 'stream';
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
      res.flushHeaders();
      heartbeat = setInterval(() => {
        if (!res.destroyed && !res.writableEnded && !res.writableNeedDrain) res.write(': wanju-heartbeat\n\n');
      }, chatHeartbeatMs);
      heartbeat.unref?.();
      let usage = null;
      let done = false;
      let failed = false;
      let pending = '';
      const decoder = new TextDecoder();
      const failStream = (failure) => {
        if (failed) return null;
        failed = true;
        return streamFailure(recordFailure(failure)).trimEnd();
      };
      const inspect = (event) => {
        const text = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!text || failed) return null;
        if (text.trim() === '[DONE]') { if (!responses) done = true; return responses ? null : event; }
        let value;
        try { value = JSON.parse(text); } catch { return failStream({ category: 'upstream_protocol' }); }
        if (!value || typeof value !== 'object') return failStream({ category: 'upstream_protocol' });
        if (responses) {
          if (value.response?.usage) usage = value.response.usage;
          if (value.type === 'response.completed' && value.response?.status === 'completed') done = true;
          if (value.error || value.response?.error || ['error', 'response.failed', 'response.incomplete'].includes(value.type)) {
            return failStream({ category: value.type === 'response.incomplete' ? 'stream_incomplete' : 'stream_error' });
          }
          if (value.response) value.response.model = 'wanju-creative';
          if (typeof value.type !== 'string' || !/^[a-z0-9_.]+$/.test(value.type)) return failStream({ category: 'upstream_protocol' });
          return `event: ${value.type}\ndata: ${JSON.stringify(value)}`;
        }
        if (value.usage) usage = value.usage;
        if (value.error) return failStream({ category: 'stream_error' });
        if (value.model) value.model = 'wanju-creative';
        return `data: ${JSON.stringify(value)}`;
      };
      const sendEvent = async (event) => {
        const value = inspect(event);
        if (value && !res.write(`${value}\n\n`)) await once(res, 'drain', { signal: controller.signal });
      };
      for await (const chunk of upstream.body) {
        resetIdle();
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) {
          const error = failStream({ category: 'upstream_protocol' });
          if (error) res.write(`${error}\n\n`);
          controller.abort();
          break;
        }
        pending += decoder.decode(chunk, { stream: true });
        const events = pending.split(/\r?\n\r?\n/);
        pending = events.pop();
        for (const event of events) {
          await sendEvent(event);
          if (failed || done) break;
        }
        if (failed || done) break;
      }
      pending += decoder.decode();
      if (!failed && !done && pending.trim()) await sendEvent(pending);
      if (done && !failed) {
        phase = 'usage';
        try {
          settle(usage);
        } catch (e) {
          if (!(e instanceof ServiceError)) throw e;
          diagnostic({ category: 'usage_missing' });
          store.review(op.id, '流式回答已完成，但用量缺失，等待老师核对。');
        }
      } else if (!failed) {
        const error = failStream({ category: 'stream_incomplete' });
        if (error && !res.destroyed) res.write(`${error}\n\n`);
      }
      finished = true;
      res.end();
    } catch (error) {
      if (finished) {
        if (res.headersSent && !res.destroyed) return res.end();
        throw error;
      }
      const failure = disconnected ? { category: 'client_disconnected' }
        : timedOut ? { category: 'upstream_timeout' }
          : error instanceof SyntaxError || phase === 'json' ? { category: 'upstream_protocol' }
            : chatConnectionFailure(error);
      if (res.headersSent) {
        const details = recordFailure({ ...failure, released: false });
        if (!res.destroyed) res.end(streamFailure(details));
      } else throwFailure(failure);
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      controller.abort();
      res.removeListener('close', closed);
      if (!finished) store.review(op.id, '请求中断或结果不明，等待老师核对；没有自动重发。');
    }
  }
  const server = createServer(async (req, res) => {
    // 本地预览时打开访问日志，便于定位"点了没反应"这类问题
    if (process.env.WANJU_ACCESS_LOG === '1') {
      console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${req.method} ${req.url}`);
    }
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (path === '/health' && req.method === 'GET') return json(res, 200, { ok: true, service: 'wanju-students', version: 1, release: SERVICE_RELEASE });
      if (path === '/preview' || path === '/preview.js') {
        const address = req.socket.remoteAddress;
        const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
        if (!enablePreview || !loopback || req.headers['x-forwarded-for'] || req.headers['x-forwarded-proto'])
          fail('接口不存在。', 404);
      }
      if (['GET', 'HEAD'].includes(req.method) && staticFiles[path]) {
        const [file, type] = staticFiles[path];
        // 预览测试台要能在内置面板里以 iframe 打开、用它自己的内联样式、显示供应商返回的外链图片。
        // 这只放宽 /preview 一个页面，后台与其余页面仍保持严格策略。
        if (path === '/preview') {
          res.removeHeader('x-frame-options');
          res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; "
            + "style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; "
            + "frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
        }
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : readFileSync(new URL(file, PUBLIC)));
      }
      if (!path.startsWith('/api/') && !path.startsWith('/v1/')) fail('接口不存在。', 404);
      limit(req, ['/api/activate', '/api/register', '/api/account/register', '/api/login'].includes(path));
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { fail('请求来源无效。', 403); }
        if (origin.host !== req.headers.host) fail('不允许此来源的请求。', 403);
      }
      if (path === '/api/public' && req.method === 'GET') return json(res, 200, {
        pointsPerYuan: 100, chat: store.publicChat(),
        cloud: { available: Boolean(cloudFiles), prices: store.cloud.prices() },
        registration: { mode: cloudFiles ? 'unified_account' : 'teacher_manual', activationCodeRequired: !cloudFiles, thirdPartyAccountsAutomatic: false },
      });
      if (path === '/api/admin/login' && req.method === 'POST') {
        const address = clientAddress(req), at = Date.now();
        for (const [key, record] of adminFailures) if (record.expires <= at) adminFailures.delete(key);
        const record = adminFailures.get(address);
        if ((record?.count ?? 0) >= 10 || adminFailures.size >= 10000) fail('登录尝试过多，请15分钟后重试。', 429);
        const input = await body(req);
        if (!store.verifyAdminPassword(input.password)) {
          adminFailures.set(address, { count: (record?.count ?? 0) + 1, expires: record?.expires ?? at + 900000 });
          fail('后台登录密码不正确。', 401);
        }
        adminFailures.delete(address);
        for (const [key, expires] of adminSessions) if (expires <= at) adminSessions.delete(key);
        if (adminSessions.size >= 128) adminSessions.delete(adminSessions.keys().next().value);
        const token = `wja_${randomUUID()}${randomUUID()}`, expires = at + 8 * 3600000;
        adminSessions.set(hash(token), expires);
        return json(res, 200, { token, expires });
      }
      if (path.startsWith('/api/admin/')) {
        if (!adminAuthorized(bearer(req))) fail('后台登录已过期，请重新登录。', 401);
        const data = req.method === 'GET' ? null : await body(req);
        if (path === '/api/admin/logout' && req.method === 'POST') {
          adminSessions.delete(hash(bearer(req)));
          return json(res, 200, { ok: true });
        }
        if (path === '/api/admin/password' && req.method === 'PUT') {
          const result = store.setAdminPassword(data.password);
          adminSessions.clear();
          return json(res, 200, result);
        }
        if (path === '/api/admin/overview' && req.method === 'GET') return json(res, 200, store.overview());
        if (path === '/api/admin/operations/review' && req.method === 'GET') return json(res, 200, store.reviewOperations({
          page: url.searchParams.has('page') ? Number(url.searchParams.get('page')) : 1,
          pageSize: url.searchParams.has('pageSize') ? Number(url.searchParams.get('pageSize')) : 20,
        }));
        const diagnostic = /^\/api\/admin\/operations\/([a-f0-9-]{36})$/i.exec(path);
        if (diagnostic && req.method === 'GET') return json(res, 200, store.operationDiagnostic(diagnostic[1]));
        if (path === '/api/admin/settings' && req.method === 'GET') return json(res, 200, store.adminChat());
        if (path === '/api/admin/settings' && req.method === 'PUT') return json(res, 200, store.saveChat(data));
        if (path === '/api/admin/chat/check' && req.method === 'POST') {
          return json(res, 200, await checkChat(data?.tier ?? 'base'));
        }
        if (path === '/api/admin/cloud/prices' && req.method === 'GET') return json(res, 200, store.cloud.prices());
        if (path === '/api/admin/cloud/prices' && req.method === 'PUT') return json(res, 200, store.cloud.savePrices(data));
        if (path === '/api/admin/media/config' && req.method === 'GET') return json(res, 200, store.media.catalog());
        if (path === '/api/admin/media/config' && req.method === 'PUT') return json(res, 200, store.media.saveCatalog(data));
        // 运营方统一密钥：服务端代理出图用的就是它，学员端永远看不到。
        if (path === '/api/admin/media/operator' && req.method === 'GET') return json(res, 200, store.media.operatorStatus());
        if (path === '/api/admin/media/operator' && req.method === 'PUT') return json(res, 200, store.media.setOperatorKey(data));
        if (path === '/api/admin/media-prices' && req.method === 'GET') return json(res, 200, store.mediaPrices());
        if (path === '/api/admin/media-prices' && req.method === 'PUT') return json(res, 200, store.saveMediaPrices(data));
        const mediaUser = /^\/api\/admin\/users\/([\w-]+)\/media$/.exec(path);
        if (mediaUser && req.method === 'GET') return json(res, 200, store.media.adminAssignment(mediaUser[1]));
        if (mediaUser && req.method === 'PUT') return json(res, 200, store.media.saveAssignment(mediaUser[1], data));
        const quotaUser = /^\/api\/admin\/users\/([\w-]+)\/cloud-quota$/.exec(path);
        if (quotaUser && req.method === 'PUT') return json(res, 200, store.cloud.setQuota(quotaUser[1], data.bytes));
        if (path === '/api/admin/pricing/quote' && req.method === 'POST') return json(res, 200, pricingQuote(data));
        const enrollment = /^\/api\/admin\/users\/([\w-]+)\/enrollment$/.exec(path);
        if (enrollment && req.method === 'GET') return json(res, 200, store.adminEnrollment(enrollment[1]));
        if (enrollment && req.method === 'PUT') return json(res, 200, store.saveEnrollment(enrollment[1], data));
        if (path === '/api/admin/codes' && req.method === 'POST') return json(res, 201, { codes: store.createCodes(data) });
        const code = /^\/api\/admin\/codes\/([\w-]+)\/void$/.exec(path);
        if (code && req.method === 'POST') return json(res, 200, store.voidCode(code[1]));
        const user = /^\/api\/admin\/users\/([\w-]+)$/.exec(path);
        if (user && req.method === 'PATCH') return json(res, 200, store.changeUser(user[1], data));
        const operation = /^\/api\/admin\/operations\/([\w-]+)\/settle$/.exec(path);
        if (operation && req.method === 'POST') {
          if (typeof data.reason !== 'string' || data.reason.trim().length < 4) fail('请填写账单核对依据。');
          return json(res, 200, store.settle(operation[1], data.points, data.reason, null, true));
        }
        fail('管理接口不存在。', 404);
      }
      if (['/api/activate', '/api/register'].includes(path) && req.method === 'POST') return json(res, 201, store.activate(await body(req), { manual: true }));
      if (path === '/api/account/register' && req.method === 'POST') {
        if (!cloudFiles) fail('统一账号云项目服务尚未开通。', 503);
        return json(res, 201, store.register(await body(req)));
      }
      if (path === '/api/login' && req.method === 'POST') return json(res, 200, store.login(await body(req)));
      const token = bearer(req);
      const user = store.authenticate(token);
      /*
       * 供应商同形兼容路由。
       * 桌面端出图走 OpenFilm 的 imageUrl()，它把地址拼成 `${base_url}/v1/images/generations`，
       * 且只允许公网 HTTPS 基础地址。所以客户端只要把 base_url 指到本站、密钥填学员令牌，
       * 就能在完全不改 OpenFilm 与图片配置的前提下走服务端代理计费。
       * 请求体与返回体都和供应商保持一致，这样图片配置里原来的 response_format 仍然有效。
       */
      if (path === '/v1/images/generations' && req.method === 'POST') {
        const result = await mediaRelay.submit(user.id, {
          category: 'image', payload: await body(req, 512 * 1024),
        }, req.headers['idempotency-key']);
        return json(res, 200, result.result);
      }
      if (path === '/v1/images/edits' && req.method === 'POST') {
        const bytes = await rawBody(req);
        const result = await mediaRelay.submit(user.id, {
          category: 'image',
          // multipart 不解析也不重编码：用字节摘要做幂等指纹，避免同一编号提交不同参考图
          payload: { multipart: createHash('sha256').update(bytes).digest('hex') },
          raw: { bytes, contentType: String(req.headers['content-type'] ?? '') },
          upstreamPath: '/v1/images/edits',
        }, req.headers['idempotency-key']);
        return json(res, 200, result.result);
      }
      if (path === '/api/me' && req.method === 'GET') return json(res, 200, { ...store.wallet(user.id), chat: store.studentChat(user.id),
        cloud: { available: Boolean(cloudFiles), ...store.cloud.status(user.id) }, media: store.media.status(user.id) });
      if (path === '/api/media/config' && req.method === 'GET') {
        return json(res, 200, store.media.forUser(user.id, relayTarget(req, token)));
      }
      if (path.startsWith('/api/cloud/')) {
        if (!cloudFiles) fail('云项目存储尚未部署。', 503);
        if (path === '/api/cloud/status' && req.method === 'GET') return json(res, 200, {
          available: true, ...store.cloud.status(user.id),
          capabilities: { resumableUpload: { version: 1, chunkBytes: CLOUD_UPLOAD_CHUNK_BYTES } },
        });
        if (path === '/api/cloud/consent' && req.method === 'POST') return json(res, 200, store.cloud.consent(user.id, (await body(req)).priceVersion));
        if (path === '/api/cloud/projects' && req.method === 'GET') return json(res, 200, { projects: store.cloud.list(user.id) });
        if (path === '/api/cloud/trash' && req.method === 'GET') return json(res, 200, { projects: store.cloud.trashList(user.id) });
        if (path === '/api/cloud/storage/preview' && req.method === 'GET') return json(res, 200, store.cloud.cleanupPreview(user.id));
        if (path === '/api/cloud/storage/cleanup' && req.method === 'POST') return json(res, 200, cloudFiles.cleanup(user.id, await body(req)));
        const lifecycle = /^\/api\/cloud\/projects\/([\w-]+)\/(versions|trash|restore|purge)$/.exec(path);
        if (lifecycle && lifecycle[2] === 'versions' && req.method === 'GET') return json(res, 200, store.cloud.versions(user.id, lifecycle[1],
          url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined));
        if (lifecycle && ['trash', 'restore', 'purge'].includes(lifecycle[2]) && req.method === 'POST')
          return json(res, 200, store.cloud[lifecycle[2]](user.id, lifecycle[1], await body(req)));
        const project = /^\/api\/cloud\/projects\/([\w-]+)$/.exec(path);
        if (project && req.method === 'GET') return json(res, 200, store.cloud.version(user.id, project[1],
          url.searchParams.has('revision') ? Number(url.searchParams.get('revision')) : undefined));
        if (project && req.method === 'POST') return json(res, 200, store.cloud.commit(user.id, project[1], await body(req, 2 * 1024 * 1024)));
        if (path === '/api/cloud/objects/check' && req.method === 'POST') {
          const { hashes } = await body(req, 1024 * 1024);
          if (!Array.isArray(hashes) || hashes.length > 10000) fail('文件清单无效。');
          return json(res, 200, { present: hashes.filter((value) => store.cloud.blob(user.id, value)).map((hash) => hash) });
        }
        const upload = /^\/api\/cloud\/objects\/([a-f0-9]{64})\/upload$/.exec(path);
        if (upload && req.method === 'GET') return json(res, 200, await cloudFiles.uploadStatus(user.id, upload[1]));
        const blob = /^\/api\/cloud\/objects\/([a-f0-9]{64})$/.exec(path);
        if (blob && req.method === 'PUT') return json(res, 200, await cloudFiles.upload(user.id, blob[1], req));
        if (blob && req.method === 'GET') return await cloudFiles.download(user.id, blob[1], res, req.headers.range);
        if (path === '/api/cloud/generations/success' && req.method === 'POST') return json(res, 200, store.cloud.recordSuccess(user.id, await body(req)));
        fail('云项目接口不存在。', 404);
      }
      if (path === '/api/media/prices' && req.method === 'GET') return json(res, 200, {
        available: store.mediaRelayAvailable(), prices: store.mediaPrices(),
      });
      // 媒体生成走服务端：客户端提交意图，密钥由服务端注入，提交即预占、成功才结算。
      if (path === '/api/relay/media' && req.method === 'POST') {
        const result = await mediaRelay.submit(user.id, await body(req, 512 * 1024), req.headers['idempotency-key']);
        return json(res, result.pending ? 202 : 200, result);
      }
      const relayTask = /^\/api\/relay\/media\/([\w-]+)$/.exec(path);
      if (relayTask && req.method === 'GET') return json(res, 200, await mediaRelay.query(user.id, relayTask[1]));
      if (path === '/api/consent' && req.method === 'POST') return json(res, 200, store.consent(user.id, (await body(req)).priceVersion));
      if (path === '/api/chat/tier' && req.method === 'POST') {
        const input = await body(req);
        return json(res, 200, store.selectChatTier(user.id, input.tier, input.priceVersion));
      }
      if (path === '/api/logout' && req.method === 'POST') { store.logout(token); return json(res, 200, { ok: true }); }
      if (path === '/api/redeem' && req.method === 'POST') return json(res, 200, { ...store.redeem(user.id, (await body(req)).code), chat: store.studentChat(user.id) });
      if (path === '/v1/models' && req.method === 'GET') return json(res, 200, { object: 'list', data: store.studentChat(user.id).enabled ? [{ id: 'wanju-creative', object: 'model', owned_by: 'wanju' }] : [] });
      if (path === '/v1/chat/completions' && req.method === 'POST') return await completion(req, res, user);
      if (path === '/v1/responses' && req.method === 'POST') return await completion(req, res, user, 'responses');
      const tierCompletion = /^\/v1\/tier\/(base|claude|claude-max)\/([a-f0-9]{64})\/(chat\/completions|responses)$/.exec(path);
      if (tierCompletion && req.method === 'POST') return await completion(req, res, user,
        tierCompletion[3] === 'responses' ? 'responses' : 'chat',
        { tier: tierCompletion[1], version: tierCompletion[2] });
      fail('接口不存在。', 404);
    } catch (e) {
      if (res.headersSent) { if (!res.destroyed) res.destroy(); return; }
      json(res, e instanceof ServiceError ? e.status : 500, { error: {
        message: e instanceof ServiceError ? e.message : '服务暂不可用，请联系管理员。',
        ...(e instanceof ServiceError && e.publicDetails ? e.publicDetails : {}),
      } });
    }
  });
  // 整个请求的超时必须比上游生成更宽，否则代理还在等、连接已经被服务自己掐断
  server.requestTimeout = Math.max(cloudFiles ? 15 * 60 * 1000 : 0, MEDIA_TIMEOUT_MS + 60_000);
  server.headersTimeout = 30000;
  server.on('close', () => cloudFiles?.close());
  return { server, store, cloudFiles };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const secret = process.env.WANJU_ADMIN_SECRET;
  const database = resolve(process.env.WANJU_SERVICE_DB || '.local/student-service/wallet.sqlite');
  const { server, store } = createStudentService({ database, adminSecret: secret, proxyToken: process.env.WANJU_PROXY_TOKEN,
    cloudDirectory: process.env.WANJU_CLOUD_DIR || '' });
  const port = Number(process.env.PORT || 4890);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Wanju student service listening on ${host}:${port}`));
  const close = () => server.close(() => { store.close(); process.exit(0); });
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
