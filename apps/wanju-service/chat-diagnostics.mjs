const ERROR_CODES = new Set([
  'invalid_api_key', 'authentication_error', 'permission_denied', 'model_not_found',
  'model_not_available', 'context_length_exceeded', 'max_tokens_exceeded', 'invalid_request_error',
  'unsupported_parameter', 'unsupported_value', 'rate_limit_exceeded', 'rate_limit_error',
  'insufficient_quota', 'insufficient_balance', 'overloaded_error', 'server_error',
]);
const CONNECTION_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH',
  'EADDRNOTAVAIL', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_INVALID_URL', 'UND_ERR_CONNECT_TIMEOUT',
]);
const NETWORK_CODES = new Set([...CONNECTION_CODES, 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
const CATEGORIES = {
  upstream_http: '创作助手上游服务异常，请稍后继续；持续出现时请联系管理员检查模型线路。',
  upstream_auth: '创作助手线路鉴权或权限异常，请联系管理员检查服务配置。',
  upstream_model: '创作助手当前模型不可用，请联系管理员检查模型名称和可用通道。',
  upstream_context: '本次内容超过模型可处理的长度，请缩小本轮处理范围后继续。',
  upstream_parameters: '创作助手接口参数或协议不兼容，请联系管理员检查模型配置。',
  upstream_rate_limit: '创作助手线路当前请求较多，请稍后继续。',
  upstream_quota: '创作助手供应商额度不足，请联系管理员处理；这不代表你的玩剧余额不足。',
  upstream_timeout: '创作助手长时间未返回新数据，本次等待已停止。',
  upstream_connection: '玩剧云端暂时无法连接创作助手上游服务。',
  upstream_protocol: '创作助手返回格式异常，本次回答未完整完成，请联系管理员检查接口协议。',
  stream_incomplete: '创作助手回答中途断开，本轮未完整完成。',
  stream_error: '创作助手在回答过程中报告异常，本轮未完整完成。',
  usage_missing: '回答已返回，但供应商未提供可靠用量，费用等待核对。',
  client_disconnected: '客户端连接已断开，本次请求结果等待核对。',
};

// Read supplier errors only for classification. Never retain their messages: they may echo a key or prompt.
export async function readChatError(response, limit = 8192) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = value.subarray(0, limit - size);
      chunks.push(bytes);
      size += bytes.length;
      if (size >= limit) break;
    }
  } catch {
    // An HTTP status remains useful even when its diagnostic body is interrupted.
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function chatHttpFailure(status, detail = '') {
  let value;
  try { value = typeof detail === 'string' ? JSON.parse(detail) : detail; } catch {}
  const error = value?.error ?? value;
  const code = [error?.code, error?.type].find((entry) => ERROR_CODES.has(entry)) ?? '';
  const text = `${code} ${typeof detail === 'string' ? detail : error?.message ?? ''}`;
  let category = 'upstream_http';
  if ([401, 403].includes(status)) category = 'upstream_auth';
  else if (status === 402 || /insufficient[_ ](?:quota|balance)|credit balance.*low|额度不足|余额不足/i.test(text)) category = 'upstream_quota';
  else if (status === 429) category = 'upstream_rate_limit';
  else if (/context_length_exceeded|max_tokens_exceeded|context (?:length|window)|prompt (?:is )?too long|上下文.*(?:超|长)/i.test(text)) category = 'upstream_context';
  else if (status === 404 || /model_not_(?:found|available)|model.*(?:does not exist|not found)|模型.*(?:不存在|不可用)/i.test(text)) category = 'upstream_model';
  else if ([400, 405, 413, 415, 422].includes(status)) category = 'upstream_parameters';
  return { category, upstreamStatus: status, ...(code ? { errorCode: code } : {}),
    released: [400, 401, 402, 403, 404, 405, 413, 415, 422, 429].includes(status) };
}

export function chatConnectionFailure(error) {
  const seen = new Set(), codes = [];
  const stack = [error];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    if (typeof item.code === 'string') codes.push(item.code);
    if (item.cause) stack.push(item.cause);
    if (Array.isArray(item.errors)) stack.push(...item.errors);
  }
  const released = codes.length > 0 && codes.every((code) => CONNECTION_CODES.has(code));
  const errorCode = codes.find((code) => NETWORK_CODES.has(code));
  return { category: 'upstream_connection', released, ...(errorCode ? { errorCode } : {}) };
}

export const chatFailureMessage = (category) => CATEGORIES[category] ?? CATEGORIES.upstream_http;

export function chatPublicError(failure, operation) {
  const billing = failure.released ? 'released' : 'review';
  const note = failure.released ? '本次请求未计费，预留已退回。'
    : '没有自动重复提交，请先查看作品和任务状态；本次费用待核对。';
  return {
    code: failure.category, operation_id: operation,
    billing_status: billing,
    ...(failure.upstreamStatus ? { upstream_status: failure.upstreamStatus } : {}),
    message: `${chatFailureMessage(failure.category)}${note}请求编号：${operation}`,
  };
}

export function normalizeChatDiagnostic(value) {
  if (!value || typeof value !== 'object' || !Object.hasOwn(CATEGORIES, value.category)) return null;
  const bounded = (number, max) => Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null;
  const plain = (text, max) => typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
  return {
    version: 1, category: value.category, summary: chatFailureMessage(value.category),
    model: plain(value.model, 200), host: plain(value.host, 255),
    protocol: value.protocol === 'responses' ? 'responses' : 'chat',
    phase: ['connecting', 'headers', 'json', 'stream', 'usage'].includes(value.phase) ? value.phase : 'connecting',
    elapsedMs: bounded(value.elapsedMs, 86400000),
    upstreamStatus: bounded(value.upstreamStatus, 599),
    errorCode: ERROR_CODES.has(value.errorCode) || NETWORK_CODES.has(value.errorCode) ? value.errorCode : '',
    receivedBytes: bounded(value.receivedBytes, 32 * 1024 * 1024),
    streamed: value.streamed === true,
  };
}
