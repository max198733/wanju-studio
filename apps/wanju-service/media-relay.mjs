// @ts-check
/**
 * 媒体生成服务端代理。
 *
 * 为什么要有这一层：
 * 现在图片和视频由客户端直连供应商，密钥缓存在学员本机，服务端只收到"我成功了"的上报。
 * 客户端被改一行就能不报或少数，等于免费。对话早就走服务端代理了，媒体没有。
 *
 * 这一层的边界很明确——它不猜上游格式，只做四件事：
 *   1. 用服务端持有的密钥替换客户端请求里的鉴权
 *   2. 只允许打到已配置供应商的固定地址，客户端不能指定 URL
 *   3. 提交前预占点数，成功才结算，失败退回，不确定进待核对
 *   4. 把上游错误原样带回给客户端，绝不自动重发
 *
 * 客户端仍然自己构造请求体（它本来就会），这样服务端不必复制每个供应商的适配器。
 * 代价是客户端可以少要参数，但按次计费下它最多只值一次的钱。
 */
import { randomUUID } from 'node:crypto';

/**
 * 上游生成太慢时不能提前掐断：实测同一张图 96 秒和 243 秒都出现过。
 * 掐断的代价是把"其实成功了"的请求打进待核对，学员钱冻住、图也拿不到。
 */
export const MEDIA_TIMEOUT_MS = 300_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/**
 * 每类媒体允许的上游路径。客户端无法指定。
 * @param {string} [override] 兼容路由需要打到同类的另一个固定路径（如 /v1/images/edits），
 *   只接受服务端写死的白名单值，仍然不受客户端控制。
 */
const ALLOWED_PATHS = { image: ['/v1/images/generations', '/v1/images/edits'] };
function upstreamUrl(profile, category, taskId, override) {
  const base = profile.baseUrl.replace(/\/+$/, '');
  if (category === 'image') {
    const path = override && ALLOWED_PATHS.image.includes(override) ? override : '/v1/images/generations';
    return new URL(path, base).href;
  }
  // 视频供应商的 baseUrl 本身就是任务创建地址
  if (taskId) return `${base}/${encodeURIComponent(taskId)}`;
  return base;
}

function authHeader(profile) {
  const text = profile.auth || 'Authorization: Bearer {key}';
  const [name, ...rest] = text.split(':');
  return { [name.trim()]: rest.join(':').trim().replace('{key}', profile.key) };
}

/** 上游拒绝（参数/密钥/额度）与"结果未知"必须分开：前者可以退款，后者不能。 */
function rejected(status) {
  return [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(status);
}

/**
 * 连接阶段就失败（DNS 查不到、TCP 连不上、TLS 握手没成、连接超时）时，请求根本没送到上游，
 * 上游不可能受理，可以直接退回预留，不必进待核对去干扰老师。
 * 反过来，连接建立之后才断（socket 重置、读响应超时）不能判断，必须留核对。
 */
const BEFORE_CONNECT = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH',
  'EADDRNOTAVAIL', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_INVALID_URL',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_DNS_',
]);

/** 从 undici 的错误里挖出最内层的 code。AggregateError 要逐个看。 */
function connectionCode(error) {
  const seen = new Set();
  const stack = [error];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (typeof current.code === 'string') return current.code;
    if (Array.isArray(current.errors)) stack.push(...current.errors);
    if (current.cause) stack.push(current.cause);
  }
  return '';
}

/** 请求是否在"连接建立之前"就失败了——只有这时才能断定上游没收到。 */
function failedBeforeConnect(error) {
  const code = connectionCode(error);
  if (!code) return false;
  for (const known of BEFORE_CONNECT) {
    if (code === known || code.startsWith(known)) return true;
  }
  return false;
}

function trim(text, limit = 400) {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

async function readBody(response) {
  const length = Number(response.headers.get('content-length')) || 0;
  if (length > MAX_RESPONSE_BYTES) throw Object.assign(new Error('上游返回内容过大。'), { tooLarge: true });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_RESPONSE_BYTES) throw Object.assign(new Error('上游返回内容过大。'), { tooLarge: true });
  return bytes;
}

/**
 * @param {object} options
 * @param {any} options.store 账本
 * @param {(userId: string) => Promise<{ profiles: any[], defaults: Record<string, string|null> }>} options.profilesFor
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(message: string, status?: number) => never} options.fail
 */
export function createMediaRelay({ store, profilesFor, fetchImpl = fetch, fail }) {
  const pick = (catalog, category, requestedId) => {
    const id = requestedId || catalog.defaults?.[category];
    const profile = catalog.profiles?.find((candidate) => candidate.id === id && candidate.category === category);
    if (!profile) fail('该类型尚无可用的媒体服务，请联系老师配置。', 503);
    if (!profile.key) fail('该服务尚未分配密钥，请联系老师。', 503);
    return profile;
  };

  /**
   * 提交一次生成。
   * body: { category, payload, providerId?, raw?, upstreamPath? }
   * raw: { bytes: Buffer, contentType: string } —— 带参考图的出图是 multipart，原样转发不重新编码。
   */
  async function submit(userId, body, idempotencyKey) {
    const category = body?.category;
    if (!['image', 'video', 'audio'].includes(category)) fail('媒体类型无效。');
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('请求内容无效。');
    const raw = body?.raw && Buffer.isBuffer(body.raw.bytes) && typeof body.raw.contentType === 'string'
      ? body.raw : null;

    const catalog = await profilesFor(userId);
    const profile = pick(catalog, category, body?.providerId);

    const key = typeof idempotencyKey === 'string' && idempotencyKey.length <= 120 ? idempotencyKey : randomUUID();
    const fingerprint = JSON.stringify([category, profile.id, payload]).slice(0, 4000);
    const operation = store.reserveMedia(userId, key, fingerprint, category);

    const url = upstreamUrl(profile, category, undefined, body?.upstreamPath);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
        headers: { 'content-type': raw ? raw.contentType : 'application/json', ...authHeader(profile) },
        body: raw ? raw.bytes : JSON.stringify(payload),
      });
    } catch (error) {
      // 连接阶段就没打通 = 上游不可能收到，直接退回，别让老师去核一笔根本不存在的账
      if (failedBeforeConnect(error)) {
        store.settle(operation.id, 0, `未能连接到上游（${connectionCode(error)}），请求未送达，已退回预留。`);
        fail(`生成服务暂时连不上（${connectionCode(error)}），本次未扣点，请稍后重试。`, 502);
      }
      // 连上之后才断 = 不知道上游有没有受理，必须留预留等人工核对
      store.review(operation.id, '媒体请求连接中断，上游是否受理未知；请核对供应商账单，未自动重发。');
      fail(`生成服务连接中断，结果未知。请勿重复提交，联系老师核对请求编号：${operation.id}`, 502);
    }

    if (!response.ok) {
      const detail = trim(await response.text().catch(() => ''));
      if (rejected(response.status)) {
        store.settle(operation.id, 0, `上游拒绝（HTTP ${response.status}），已退回预留。`);
        fail(`生成服务拒绝了本次请求（HTTP ${response.status}）。${detail}`, 502);
      }
      store.review(operation.id, `上游返回 HTTP ${response.status}，需核对是否计费。`);
      fail(`生成服务暂不可用，请勿重复提交。请求编号：${operation.id}`, 502);
    }

    let data;
    try { data = JSON.parse(new TextDecoder().decode(await readBody(response))); }
    catch {
      store.review(operation.id, '上游返回内容无法解析，需核对是否计费。');
      fail(`生成服务返回内容异常，请勿重复提交。请求编号：${operation.id}`, 502);
    }

    // 异步任务（视频）：拿到上游任务号，等查询确认成功再结算
    const remoteId = data?.id || data?.task_id || data?.data?.[0]?.task_id;
    if (category !== 'image' && remoteId) {
      store.attachMediaTask?.(operation.id, String(remoteId), profile.id);
      return { operationId: operation.id, remoteId: String(remoteId), pending: true, provider: profile.id };
    }

    // 同步任务（图片）：返回即成功
    store.settle(operation.id, operation.reserved, '媒体生成成功，按次结算。', { category, provider: profile.id });
    return { operationId: operation.id, pending: false, provider: profile.id, result: data };
  }

  /** 查询异步任务；只有上游明确成功后结算。 */
  async function query(userId, operationId) {
    const operation = store.mediaOperation?.(userId, operationId);
    if (!operation) fail('任务不存在。', 404);
    if (operation.status === 'settled') return { operationId, status: 'succeeded', settled: true };
    if (operation.status === 'released') return { operationId, status: 'failed', settled: true };
    const remoteId = operation.mediaTaskId;
    if (!remoteId) {
      store.review(operation.id, '任务缺少上游编号，需人工核对。');
      fail('该任务没有可查询的上游编号，请联系老师核对。', 409);
    }
    const catalog = await profilesFor(userId);
    const profile = pick(catalog, operation.mediaCategory, operation.mediaProvider);
    const url = upstreamUrl(profile, operation.mediaCategory, remoteId);

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: authHeader(profile),
      });
    } catch {
      return { operationId, status: 'unknown', note: '查询中断，稍后再试；未重复提交。' };
    }
    if (!response.ok) {
      return { operationId, status: 'unknown', note: `查询失败（HTTP ${response.status}），稍后再试。` };
    }
    const data = JSON.parse(new TextDecoder().decode(await readBody(response)));
    const raw = String(data?.status || data?.state || '').toLowerCase();
    const done = ['succeeded', 'success', 'completed', 'done'].includes(raw);
    const dead = ['failed', 'error', 'cancelled', 'canceled'].includes(raw);
    if (done) {
      store.settle(operation.id, operation.reserved, '媒体生成成功，按次结算。', { category: operation.mediaCategory, provider: profile.id });
      return { operationId, status: 'succeeded', settled: true, result: data };
    }
    if (dead) {
      store.settle(operation.id, 0, `上游任务失败（${raw}），已退回预留。`);
      return { operationId, status: 'failed', settled: true, result: data };
    }
    return { operationId, status: 'running', note: '上游仍在处理，稍后再查询。' };
  }

  return { submit, query };
}
