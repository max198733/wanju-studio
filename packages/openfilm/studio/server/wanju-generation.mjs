import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { get } from 'node:https';
import { existsSync } from 'node:fs';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { writeAtomic } from './atomic.mjs';
import { inside } from './files.mjs';
import { probe } from './derived.mjs';
import { WanjuError, assetPath, shotImage, shotVideo, shotPlanRev } from './wanju-model.mjs';
import { archiveWorkflowImage, assetOutputPaths, generationAssetContext } from './wanju-assets.mjs';
import { H3_SINGLE_ENDPOINT, H3_SINGLE_MODEL, H3_SINGLE_PROVIDER, h3SingleRequest, h3ResultStatus, h3ResultVideo } from './wanju-h3-single.mjs';
import { wanjuAccess, wanjuConfigDirectory } from './wanju-access.mjs';
import { resolveMediaProfile, profileFingerprint, pinMediaProfile, taskMediaProfile } from './wanju-media.mjs';

const PRIVATE = new BlockList();
for (const [ip, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4]]) PRIVATE.addSubnet(ip, bits, 'ipv4');
for (const [ip, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) PRIVATE.addSubnet(ip, bits, 'ipv6');
export function publicIP(address) {
  if (address.startsWith('::ffff:')) address = address.slice(7);
  const family = isIP(address);
  return family > 0 && !PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6');
}
const safeLookup = (hostname, options, callback) => {
  lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    const safe = addresses.filter((entry) => publicIP(entry.address));
    if (!safe.length) return callback(new Error('public HTTPS required'));
    if (options?.all) callback(null, safe);
    else callback(null, safe[0].address, safe[0].family);
  });
};

export async function downloadPublic(value, maxBytes = 64 * 1024 * 1024, redirects = 0) {
  let url;
  try { url = new URL(value); } catch { throw new WanjuError('服务商返回的文件地址无效。', 502); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || redirects > 4) throw new WanjuError('服务商返回的文件地址不符合 HTTPS 要求。', 502);
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !publicIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new WanjuError('不允许访问本地文件地址。');
  return new Promise((resolve, reject) => {
    const request = get(url, { lookup: safeLookup, timeout: 120000 }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        return resolve(downloadPublic(new URL(response.headers.location, url).href, maxBytes, redirects + 1));
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new WanjuError(`素材下载失败 (HTTP ${response.statusCode})。`, 502)); }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) response.destroy(new WanjuError('素材超过下载大小限制。', 413));
        else chunks.push(chunk);
      });
      response.on('end', () => bytes ? resolve({ bytes: Buffer.concat(chunks), type: String(response.headers['content-type'] || '') }) : reject(new WanjuError('返回了空素材。', 502)));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('download timeout')));
    request.on('error', reject);
  });
}

export async function generationTasks(root) {
  try {
    const tasks = JSON.parse(await readFile(join(root, '.film/wanju-tasks.json'), 'utf8'));
    if (!Array.isArray(tasks)) throw new Error('invalid task index');
    // Older versions treated explicit authorization refusals as an ambiguous submission.
    return tasks.map((task) => {
      if (task.status === 'unknown' && !task.remoteId
        && /^服务商返回 HTTP (401|403)，请检查额度和后台记录。$/.test(task.error ?? '')) task = { ...task, status: 'rejected' };
      if (task.provider === 'image' && task.recoveryAvailable
        && (!/^[a-f0-9-]{36}$/i.test(task.id) || !existsSync(join(root, '.film/wanju-image-results', `${task.id}.json`)))) {
        return { ...task, recoveryAvailable: false,
          ...(task.status !== 'done' ? { error: '本机未找到原图片的恢复凭证，请在原电脑恢复，或从供应商后台取回原图后导入；不会重新付费生成。' } : {}) };
      }
      return task;
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new WanjuError('任务索引无法读取，请先检查 .film/wanju-tasks.json。', 422);
  }
}
async function putTasks(root, tasks) {
  await mkdir(join(root, '.film'), { recursive: true });
  await writeAtomic(join(root, '.film/wanju-tasks.json'), JSON.stringify(tasks, null, 2) + '\n');
}
export async function saveTaskBindingWarning(root, task) {
  const tasks = await generationTasks(root);
  const saved = tasks.find((entry) => entry.id === task.id);
  if (!saved || saved.bindingWarning === task.bindingWarning) return;
  if (task.bindingWarning) saved.bindingWarning = task.bindingWarning;
  else delete saved.bindingWarning;
  await putTasks(root, tasks);
}
export const taskSummary = (task) => {
  const { id, shot, assetId, workflowPath, provider, status, createdAt, path, remoteId, error, bindingWarning, providerErrorCode, queryError, imageTokens, timing, recoveryAvailable } = task;
  const safeTiming = timing ? Object.fromEntries(Object.entries(timing).filter(([key, value]) =>
    ['preparationMs', 'cosUploadMs', 'providerMs', 'submitMs', 'lastQueryMs', 'queryCount',
      'elapsedSinceSubmitMs', 'remoteWaitMs', 'downloadMs', 'localWriteMs', 'probeMs', 'totalMs', 'lastErrorMs'].includes(key)
      ? typeof value === 'number' && Number.isFinite(value) && value >= 0
      : ['submittedAt', 'remoteReadyAt', 'completedAt'].includes(key) && typeof value === 'string' && Number.isFinite(Date.parse(value)))) : undefined;
  if (safeTiming && ['queued', 'running'].includes(status)) {
    const submittedAt = Date.parse(safeTiming.submittedAt ?? '');
    if (Number.isFinite(submittedAt)) safeTiming.elapsedSinceSubmitMs = Math.max(0, Date.now() - submittedAt);
  }
  return { id, shot, assetId, workflowPath, provider, status, createdAt, path, remoteId, error, bindingWarning, providerErrorCode, queryError, imageTokens, timing: safeTiming, recoveryAvailable: recoveryAvailable === true };
};

function imageResultFile(project, task) {
  if (!/^[a-f0-9-]{36}$/i.test(task.id)) throw new WanjuError('图片任务编号无效。', 422);
  return join(project.path, '.film/wanju-image-results', `${task.id}.json`);
}

async function archiveImageResult(project, task, tasks, context) {
  if (task.error?.startsWith('图片已保存在 assets，但工作流归档')) delete task.error;
  try {
    if (task.status === 'done' && task.workflowPath) {
      if (task.projectId && task.projectId !== project.id) {
        task.bindingWarning = '图片已恢复，但项目身份已改变，未自动修改资产清单；请核对后手动关联。';
      } else {
        await archiveWorkflowImage(project.path, task, context);
      }
    }
    await rm(imageResultFile(project, task), { force: true });
    task.recoveryAvailable = false;
  } catch {
    task.error = '图片已保存在 assets，但工作流归档或资产绑定未完成；请恢复已有图片，不要重复付费生成。';
  }
  await putTasks(project.path, tasks);
  return task;
}

async function finishImage(project, task, tasks, receipt, dependencies) {
  const { item, context, usedReferences, reportedTokens } = receipt;
  const bytes = item?.b64_json ? Buffer.from(item.b64_json, 'base64')
    : (await timed(task, 'downloadMs', () => (dependencies.download ?? downloadPublic)(item?.url))).bytes;
  if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw new WanjuError('生成图片大小无效。', 502);
  const extension = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? '.png'
    : bytes[0] === 255 && bytes[1] === 216 ? '.jpg'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? '.webp' : null;
  if (!extension) throw new WanjuError('服务商返回了无法识别的图片。', 502);
  Object.assign(task, assetOutputPaths(context, task.id, extension));
  await timed(task, 'localWriteMs', async () => {
    await mkdir(dirname(inside(project.path, task.path)), { recursive: true });
    await writeAtomic(inside(project.path, task.path), bytes);
  });
  const facts = await timed(task, 'probeMs', () => (dependencies.probe ?? probe)(project.path, task.path));
  if (!(facts.width > 0 && facts.height > 0)) throw new WanjuError('生成图片已保存但无法读取。', 502);
  delete task.error;
  delete task.queryError;
  task.imageTokens = reportedTokens ?? null;
  if (usedReferences && reportedTokens !== undefined && task.imageTokens <= 0) {
    task.status = 'reference-rejected';
    task.error = '参考图未被消费；结果已保存但不替换原镜头。';
  } else {
    task.status = 'done';
    if (usedReferences && reportedTokens === undefined) task.error = '图片已保存；服务未返回参考图用量，须查看真实图片确认一致性，不能据此声称参考已生效。';
  }
  finishTiming(task, Date.parse(task.createdAt) || Date.now());
  await putTasks(project.path, tasks);
  return archiveImageResult(project, task, tasks, context);
}

export async function queryImage(project, taskId, dependencies = {}) {
  const tasks = await generationTasks(project.path);
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task || task.provider !== 'image') throw new WanjuError('图片任务不存在。', 404);
  if (task.status === 'done' && !task.recoveryAvailable) return task;
  if (!['submitting', 'received', 'download-failed', 'done'].includes(task.status)) throw new WanjuError('该图片任务没有可恢复的成功结果，请核查原任务；不会重新提交生成。', 409);
  let receipt;
  try {
    receipt = JSON.parse(await readFile(imageResultFile(project, task), 'utf8'));
    if (receipt.version !== 1 || !receipt.item || !receipt.context?.shot) throw new Error('invalid receipt');
  } catch {
    throw new WanjuError('未找到原图片的恢复凭证（旧版本可能没有保存），不会重新付费生成。请从供应商后台取回原图后导入。', 409);
  }
  if (task.status === 'done') return archiveImageResult(project, task, tasks, receipt.context);
  task.status = 'received';
  task.recoveryAvailable = true;
  try { return await finishImage(project, task, tasks, receipt, dependencies); }
  catch (error) {
    task.status = 'download-failed';
    task.error = error instanceof WanjuError ? error.message : '原图片下载或本地检查未完成，可以再次恢复原结果；没有重新提交生成。';
    await putTasks(project.path, tasks);
    throw new WanjuError(task.error, 502);
  }
}

function ensureTiming(task) {
  task.timing ??= {};
  return task.timing;
}

async function timed(task, key, operation) {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    ensureTiming(task)[key] = Date.now() - startedAt;
  }
}

function finishTiming(task, startedAt) {
  const timing = ensureTiming(task);
  timing.totalMs = Math.max(0, Date.now() - startedAt);
  timing.completedAt = new Date().toISOString();
}

function statusElapsed(task) {
  const submittedAt = Date.parse(task.timing?.submittedAt ?? '');
  return Number.isFinite(submittedAt) ? Math.max(0, Date.now() - submittedAt) : null;
}

async function config(name) {
  let value;
  try { value = JSON.parse((await readFile(join(wanjuConfigDirectory(), name), 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw new WanjuError('该服务尚未配置。'); }
  return value;
}

function safeProviderText(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) text = text.split(secret).join('[已隐藏]');
  }
  return text
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[已隐藏]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[链接已隐藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function providerSecrets(headers) {
  const authorization = headers?.Authorization ?? headers?.authorization;
  if (typeof authorization !== 'string') return [];
  return [authorization, authorization.replace(/^Bearer\s+/i, '')];
}

function providerErrorDetail(value, secrets = []) {
  if (!value || typeof value !== 'object') return { code: '', message: '' };
  const nested = value.error && typeof value.error === 'object' ? value.error : value;
  const code = nested.errorCode ?? nested.code ?? value.errorCode ?? value.code ?? '';
  const message = nested.errorMessage ?? nested.message ?? nested.msg ?? value.errorMessage ?? value.message ?? value.msg ?? '';
  return { code: safeProviderText(code, secrets), message: safeProviderText(message, secrets) };
}

function providerRejected(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.error && typeof value.error === 'object') return true;
  const status = String(value.status ?? value.data?.status ?? '').toUpperCase();
  if (['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'REJECTED'].includes(status)) return true;
  const { code, message } = providerErrorDetail(value);
  if (code && !['0', '200', '202', 'OK', 'SUCCESS'].includes(code.toUpperCase())) return true;
  return /\b(error|failed|failure|invalid|denied|not found|rejected)\b|错误|失败|拒绝|无效|不存在/i.test(message);
}

async function providerResponseBody(response) {
  try {
    const text = await response.text();
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch { return {}; }
  } catch {
    return {};
  }
}

const promptOf = (shot) => {
  const text = shot.description.trim();
  if (!text) throw new WanjuError('请先填写画面与动作。');
  return text + (shot.dialogue.trim() ? `\n台词：${shot.dialogue.trim()}` : '');
};

export function imageRequest({ model, prompt, references = [], responseFormat = 'b64_json' }) {
  if (!['b64_json', 'url'].includes(responseFormat)) throw new WanjuError('图片返回格式须为 b64_json 或 url；未提交付费请求。');
  const fields = { model, prompt, n: '1', size: '1024x1024', response_format: responseFormat };
  if (!references.length) return { endpoint: '/v1/images/generations', body: JSON.stringify({ ...fields, n: 1 }), headers: { 'content-type': 'application/json' } };
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  for (const reference of references) body.append('image', new Blob([reference.bytes], { type: reference.type }), reference.name);
  return { endpoint: '/v1/images/edits', body, headers: {} };
}
export function imageUrl(config, endpoint) {
  let url;
  try { url = new URL(config.base_url || 'https://image.xem8k5.top'); }
  catch { throw new WanjuError('图片接口地址格式不正确，请检查图片服务配置。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || (url.port && url.port !== '443') || !['', '/', '/v1', '/v1/'].includes(url.pathname)
    || ['localhost', 'localhost.localdomain'].includes(url.hostname)
    || url.hostname.endsWith('.localhost')
    || (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !publicIP(url.hostname.replace(/^\[|\]$/g, '')))) {
    throw new WanjuError('图片接口须为公网 HTTPS 基础地址，可包含 /v1，不可包含账号、查询参数或完整生成路径。');
  }
  if (!['/v1/images/generations', '/v1/images/edits'].includes(endpoint)) throw new WanjuError('图片接口路径无效。');
  return new URL(endpoint, url.origin).href;
}
export function h3Request(shot, ratio, publicImage) {
  const duration = Number(shot.duration);
  if (!Number.isInteger(duration) || duration < 4 || duration > 10) throw new WanjuError('H3 标准档仅支持 4–10 秒整数时长，请先调整计划时长。');
  if (!['9:16', '16:9'].includes(ratio)) throw new WanjuError('H3 当前只接入横屏和竖屏。');
  if (!/\.(png|jpg|jpeg|webp)$/i.test(shotImage(shot))) throw new WanjuError('H3 需要 PNG、JPG 或 WebP 分镜参考图。');
  return {
    prompt: `[${shot.id}] | 持续时长：${duration}秒 | resolution: ${ratio === '9:16' ? '768p竖' : '768p横'}\n${promptOf(shot)}`,
    resolution: ratio === '9:16' ? '768p竖' : '768p横', duration, ref_image_0: publicImage,
  };
}

export function sparkVideoRequest(shot, ratio, references = {}, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new WanjuError('多模态视频参数必须是对象。');
  const duration = Number(shot.duration);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new WanjuError('多模态视频仅支持 4–15 秒整数时长，请先调整计划时长。');
  if (options.duration !== undefined && Number(options.duration) !== duration) throw new WanjuError('视频时长须与镜头计划时长一致，请先保存镜头时长。');
  const lists = {};
  for (const [name, maximum, extension] of [
    ['imageUrls', 9, /\.(png|jpe?g|webp)$/i],
    ['videoUrls', 3, /\.(mp4|mov|webm)$/i],
    ['audioUrls', 3, /\.(mp3|wav|m4a|aac)$/i],
  ]) {
    const values = references[name] ?? [];
    if (!Array.isArray(values) || values.length > maximum) throw new WanjuError(`${name} 最多支持 ${maximum} 个参考素材。`);
    lists[name] = values.map((value) => {
      if (typeof value !== 'string' || !value || value.length > 8192) throw new WanjuError('参考素材地址无效。');
      if (value.startsWith('assets/')) {
        assetPath(value);
        if (!extension.test(value)) throw new WanjuError('参考素材类型与所选用途不一致。');
      } else {
        let url;
        try { url = new URL(value); } catch { throw new WanjuError('参考素材须为项目 assets 路径或公网 HTTPS 链接。'); }
        const hostname = url.hostname.replace(/^\[|\]$/g, '');
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
          || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
          || (isIP(hostname) && !publicIP(hostname))) throw new WanjuError('参考素材须使用公网 HTTPS 链接。');
      }
      return value;
    });
  }
  const { imageUrls, videoUrls, audioUrls } = lists;
  const refs = [
    ...imageUrls.map((_, index) => `@Image ${index + 1}`),
    ...videoUrls.map((_, index) => `@Video ${index + 1}`),
    ...audioUrls.map((_, index) => `@Audio ${index + 1}`),
  ].join('、');
  const prompt = options.prompt ?? `${refs ? `${refs} 作为参考素材。\n` : ''}${promptOf(shot)}`;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) throw new WanjuError('视频提示词须为 1–12000 个字符。');
  for (const [, kind, number] of prompt.matchAll(/@(Image|Video|Audio)\s+(\d+)/g)) {
    const count = { Image: imageUrls.length, Video: videoUrls.length, Audio: audioUrls.length }[kind];
    if (Number(number) < 1 || Number(number) > count) throw new WanjuError(`提示词引用的 @${kind} ${number} 没有对应素材。`);
  }
  const resolution = options.resolution ?? '720p';
  if (resolution !== '720p') throw new WanjuError('当前多模态线路仅开放已核对的 720p 参数。');
  const outputRatio = options.ratio ?? 'adaptive';
  if (!['adaptive', '9:16', '16:9', '1:1'].includes(outputRatio)) throw new WanjuError('视频画幅参数无效。');
  for (const field of ['generateAudio', 'realPersonMode', 'returnLastFrame']) {
    if (options[field] !== undefined && typeof options[field] !== 'boolean') throw new WanjuError(`${field} 须为布尔值。`);
  }
  const conversionSlots = options.conversionSlots ?? ['all'];
  if (!Array.isArray(conversionSlots) || conversionSlots.length !== 1 || conversionSlots[0] !== 'all') throw new WanjuError('当前已核对的 conversionSlots 为 ["all"]。');
  const seed = options.seed ?? -1;
  if (!Number.isSafeInteger(seed) || seed < -1) throw new WanjuError('随机种子须为 -1 或非负安全整数。');
  return {
    prompt, resolution, duration: String(duration), imageUrls, videoUrls, audioUrls,
    generateAudio: options.generateAudio ?? true, ratio: outputRatio,
    realPersonMode: options.realPersonMode ?? true, conversionSlots,
    returnLastFrame: options.returnLastFrame ?? false, seed,
  };
}

export const SEEDANCE_MODEL = 'doubao-seedance-2-0-260128';
const seedanceEndpoint = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

export function seedanceRequest(shot, ratio, references = {}, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new WanjuError('视频参数必须是对象。');
  const resolution = options.resolution ?? '720p';
  if (!['480p', '720p', '1080p'].includes(resolution)) throw new WanjuError('Seedance 2.0 分辨率须为 480p、720p 或 1080p。');
  for (const field of ['watermark', 'generateAudio', 'returnLastFrame']) {
    if (options[field] !== undefined && typeof options[field] !== 'boolean') throw new WanjuError(`${field} 须为布尔值。`);
  }
  const validated = sparkVideoRequest(shot, ratio, references, {
    ...options, resolution: '720p', ratio: options.ratio ?? ratio,
  });
  if (validated.audioUrls.length && !validated.imageUrls.length && !validated.videoUrls.length) {
    throw new WanjuError('使用参考音频时须至少提供一张参考图片或一段参考视频；未提交生成任务。');
  }
  const content = [{ type: 'text', text: validated.prompt }];
  for (const [field, type, role, extension] of [
    ['imageUrls', 'image_url', 'reference_image', /\.(png|jpe?g|webp)$/i],
    ['videoUrls', 'video_url', 'reference_video', /\.(mp4|mov)$/i],
    ['audioUrls', 'audio_url', 'reference_audio', /\.(mp3|wav)$/i],
  ]) {
    for (const url of validated[field]) {
      if (url.startsWith('assets/') && !extension.test(url)) throw new WanjuError('参考素材格式不受当前视频线路支持。');
      content.push({ type, [type]: { url }, role });
    }
  }
  return {
    model: SEEDANCE_MODEL, content, generate_audio: validated.generateAudio,
    ratio: validated.ratio, duration: Number(validated.duration), watermark: options.watermark ?? false,
    resolution, ...(options.seed !== undefined ? { seed: validated.seed } : {}),
    ...(options.returnLastFrame !== undefined ? { return_last_frame: validated.returnLastFrame } : {}),
  };
}

async function providerJson(url, init, request = fetch, timeoutMs = 180000) {
  let response;
  try { response = await request(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); }
  catch { throw new WanjuError('接口连接中断，任务结果未知；请先查服务商后台，不要重复提交。', 502); }
  if (!response.ok) {
    const detail = providerErrorDetail(await providerResponseBody(response), providerSecrets(init.headers));
    const reason = response.status === 401 ? '密钥未通过验证，请在设置 → 服务商 → 玩剧 · AI 制作中更新对应服务的密钥。'
      : response.status === 403 ? '请求被拒绝，请核对密钥权限、可用额度和模型分组。'
        : response.status === 400 ? '服务商不支持当前模型或该模型没有可用渠道，请在服务商后台核对模型与分组。'
          : '请检查额度和服务商后台记录。';
    const detailText = [detail.code && `错误码 ${detail.code}`, detail.message].filter(Boolean).join('：');
    const error = new WanjuError(`服务商返回 HTTP ${response.status}，${detailText || reason}`, 502);
    error.providerStatus = response.status;
    error.providerErrorCode = detail.code || undefined;
    error.providerRejected = [400, 401, 403, 404, 405, 413, 415, 422].includes(response.status);
    throw error;
  }
  try {
    const result = await response.json();
    return result;
  } catch { throw new WanjuError('服务商未返回有效 JSON，请检查后台记录。', 502); }
}

async function uploadCos(project, path) {
  const c = await config('cos_config.json');
  const bucket = c.bucket || c.bucket_name;
  if (!c.secret_id || !c.secret_key || !/^[a-z0-9-]+-\d+$/.test(bucket) || !/^ap-[a-z]+(?:-[a-z]+)?$/.test(c.region)) throw new WanjuError('COS 配置不完整。');
  const { default: COS } = await import('cos-nodejs-sdk-v5');
  const client = new COS({ SecretId: c.secret_id, SecretKey: c.secret_key });
  const bytes = await readFile(inside(project.path, assetPath(path)));
  const maxBytes = /\.(png|jpe?g|webp)$/i.test(path) ? 32 * 1024 * 1024 : 128 * 1024 * 1024;
  if (bytes.length > maxBytes) throw new WanjuError('参考素材超过上传大小限制（图片 32 MB，音视频 128 MB）。');
  const type = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp'
    : /\.mp4$/i.test(path) ? 'video/mp4' : /\.mov$/i.test(path) ? 'video/quicktime' : /\.webm$/i.test(path) ? 'video/webm'
      : /\.mp3$/i.test(path) ? 'audio/mpeg' : /\.wav$/i.test(path) ? 'audio/wav' : /\.m4a$/i.test(path) ? 'audio/mp4'
        : /\.aac$/i.test(path) ? 'audio/aac' : 'image/jpeg';
  const key = `wanju/${project.id}/storyboard/${randomUUID()}${extname(path).toLowerCase()}`;
  try { await client.putObject({ Bucket: bucket, Region: c.region, Key: key, Body: bytes, ContentType: type }); }
  catch { throw new WanjuError('素材上传未成功，请检查存储服务；未提交视频任务。', 502); }
  const url = `https://${bucket}.cos.${c.region}.myqcloud.com/${key}`;
  const checked = await downloadPublic(url, maxBytes);
  const expectedPrefix = type.split('/')[0] + '/';
  if (!checked.type.startsWith(expectedPrefix) || !checked.bytes.equals(bytes)) throw new WanjuError('COS 匿名读回验证失败；未提交任务，请检查对象读取权限。', 502);
  return url;
}

export async function generateOne(project, state, body, dependencies = {}) {
  if (!wanjuAccess().localMediaAllowed) throw new WanjuError('云端媒体扣费尚未开通；请先激活、登录并选择自有媒体服务，再配置自己的密钥。未调用供应商接口。', 403);
  if (body.confirm !== true) throw new WanjuError('需要先确认第三方计费。');
  const startedAt = Date.now();
  if (body.provider === 'sparkvideo') throw new WanjuError('该视频线路已停用，请选择 Seedance 2.0；旧任务不会转发到新服务。');
  let selected = null;
  if (!dependencies.config && wanjuConfigDirectory() && (body.provider === 'image' || body.provider === 'video' || body.profileId)) {
    try { selected = await resolveMediaProfile(body.provider === 'image' ? 'image' : 'video', { id: body.profileId }); }
    catch (error) { throw new WanjuError(error.message); }
    if (selected) body = { ...body, provider: selected.provider };
  }
  if (body.provider === 'video') body = { ...body, provider: 'seedance' };
  if (!['image', 'h3', H3_SINGLE_PROVIDER, 'seedance'].includes(body.provider)) throw new WanjuError('此引擎尚未接入。');
  const context = await generationAssetContext(project.path, state, body);
  const shot = context.shot;
  const prompt = (context.promptPrefix ?? '') + promptOf(shot);
  const tasks = await generationTasks(project.path);
  if (tasks.some((t) => t.shot === shot.id && ['submitting', 'received', 'unknown', 'queued', 'running', 'download-failed'].includes(t.status))) throw new WanjuError('该镜头有未结束或结果未知的任务，请先查询原任务。', 409);
  const request = dependencies.fetch ?? fetch;
  const upload = dependencies.uploadCos ?? uploadCos;
  const loadConfig = selected ? async () => ({ api_key: selected.key, model: selected.model,
    base_url: selected.baseUrl, response_format: selected.responseFormat }) : dependencies.config ?? config;
  let c, payload, image, endpoint, usedReferences = false;
  let cosUploadMs = 0;
  if (body.provider === 'image') {
    c = await loadConfig('xem8k5_gpt_image_config.json');
    if (!c.api_key || !c.model) throw new WanjuError('生图密钥或模型未配置。');
    const references = [];
    const referencePaths = [...new Set([...(context.referencePaths ?? []), ...(body.useReference ? [shotImage(shot)] : [])])];
    if (referencePaths.length > 8) throw new WanjuError('图片参考最多 8 张，请精简本镜资产绑定。');
    for (const image of referencePaths) {
      if (!/\.(png|jpe?g|webp)$/i.test(image)) throw new WanjuError('参考图仅支持 PNG、JPG、WebP。');
      const bytes = await readFile(inside(project.path, assetPath(image)));
      if (bytes.length > 32 * 1024 * 1024) throw new WanjuError('参考图大于 32 MB。');
      references.push({ bytes, name: basename(image), type: /\.png$/i.test(image) ? 'image/png' : /\.webp$/i.test(image) ? 'image/webp' : 'image/jpeg' });
    }
    usedReferences = references.length > 0;
    image = imageRequest({ model: c.model, prompt, references, responseFormat: c.response_format });
    endpoint = imageUrl(c, image.endpoint);
  } else if (body.provider === 'h3') {
    c = await loadConfig('minimax_h3_config.json');
    if (!c.api_key) throw new WanjuError('H3 密钥未配置。');
    // Validate locally before uploading anything or creating a billable video task.
    h3Request(shot, state.ratio, 'https://placeholder.invalid/reference.png');
    const uploadStartedAt = Date.now();
    try {
      payload = h3Request(shot, state.ratio, await upload(project, shotImage(shot)));
    } finally {
      cosUploadMs = Date.now() - uploadStartedAt;
    }
  } else if (body.provider === H3_SINGLE_PROVIDER) {
    const validated = h3SingleRequest(shot, state.ratio, context.videoOptions ?? body.videoOptions ?? {}, publicIP);
    c = await loadConfig('minimax_h3_config.json');
    if (typeof c.api_key !== 'string' || !c.api_key.trim() || /\s/.test(c.api_key.trim())) throw new WanjuError('H3 单图视频密钥未配置或格式无效，请在设置 → 服务商 → 玩剧 · AI 制作中配置。');
    const uploadStartedAt = Date.now();
    try {
      payload = { ...validated };
      const uploaded = new Map();
      for (const [field, reference] of Object.entries(validated)) {
        if (!/^ref_(image|audio)_\d+$/.test(field)) continue;
        if (reference.startsWith('assets/') && !uploaded.has(reference)) uploaded.set(reference, await upload(project, reference));
        const url = uploaded.get(reference) ?? reference;
        if (!String(url).startsWith('https://')) throw new WanjuError('素材存储未返回有效 HTTPS 地址；未提交视频任务。');
        payload[field] = url;
      }
    } finally { cosUploadMs = Date.now() - uploadStartedAt; }
    endpoint = selected?.baseUrl ?? H3_SINGLE_ENDPOINT;
  } else {
    c = await loadConfig('seedance_video_config.json');
    if (typeof c.api_key !== 'string' || !c.api_key.trim()) throw new WanjuError('Seedance 2.0 密钥未配置，请在设置 → 服务商 → 玩剧 · AI 制作中填写火山方舟 API Key。');
    if (/\s/.test(c.api_key.trim())) throw new WanjuError('火山方舟 API Key 格式无效，请只填写密钥本身。');
    const options = context.videoOptions ?? body.videoOptions ?? {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new WanjuError('视频参数必须是对象。');
    const validated = seedanceRequest(shot, state.ratio, {
      imageUrls: options.imageUrls,
      videoUrls: options.videoUrls, audioUrls: options.audioUrls,
    }, options);
    const uploadStartedAt = Date.now();
    try {
      payload = { ...validated, ...(selected ? { model: selected.model } : {}), content: [] };
      const uploaded = new Map();
      for (const item of validated.content) {
        if (item.type === 'text') { payload.content.push(item); continue; }
        const reference = item[item.type].url;
        if (reference.startsWith('assets/') && !uploaded.has(reference)) uploaded.set(reference, await upload(project, reference));
        const url = uploaded.get(reference) ?? reference;
        if (!String(url).startsWith('https://')) throw new WanjuError('素材存储未返回有效 HTTPS 地址；未提交视频任务。');
        payload.content.push({ ...item, [item.type]: { url } });
      }
    } finally {
      cosUploadMs = Date.now() - uploadStartedAt;
    }
    endpoint = selected?.baseUrl ?? seedanceEndpoint;
  }
  const task = {
    id: randomUUID(), shot: shot.id, provider: body.provider, status: 'submitting', createdAt: new Date(startedAt).toISOString(),
    ...(context.asset ? { assetId: context.asset.id } : {}),
    timing: { preparationMs: Math.max(0, Date.now() - startedAt - cosUploadMs), ...(['h3', H3_SINGLE_PROVIDER, 'seedance'].includes(body.provider) ? { cosUploadMs } : {}) },
    ...(body.provider === 'seedance' ? { model: SEEDANCE_MODEL } : {}),
    ...(body.provider === H3_SINGLE_PROVIDER ? { model: H3_SINGLE_MODEL } : {}),
    ...(selected ? { model: selected.model, profileName: selected.name, profileFingerprint: profileFingerprint(selected) } : {}),
    mediaBefore: shot.media, imageBefore: shotImage(shot), videoBefore: shotVideo(shot),
    projectId: project.id, shotPlan: context.asset ? undefined : shotPlanRev(state, shot),
  };
  if (selected) await pinMediaProfile(wanjuConfigDirectory(), task.id, selected);
  tasks.push(task);
  await putTasks(project.path, tasks);
  try {
    if (body.provider === 'image') {
      const result = await timed(task, 'providerMs', () => providerJson(endpoint, { method: 'POST', headers: { ...image.headers, Authorization: `Bearer ${c.api_key.trim()}` }, body: image.body }, request));
      task.status = 'received';
      const item = result.data?.[0];
      const inline = typeof item?.b64_json === 'string' && item.b64_json.length > 0;
      if (inline ? item.b64_json.length > 90 * 1024 * 1024
        : typeof item?.url !== 'string' || !item.url || item.url.length > 16384) {
        throw new WanjuError('服务商未返回可保存的图片结果，请检查原任务；不会自动重新生成。', 502);
      }
      const receipt = {
        version: 1,
        item: inline ? { b64_json: item.b64_json } : { url: item.url },
        usedReferences,
        ...(Number.isFinite(Number(result.usage?.input_tokens_details?.image_tokens))
          ? { reportedTokens: Number(result.usage.input_tokens_details.image_tokens) } : {}),
        context: { shot: { id: shot.id }, workflow: context.workflow === true, ...(context.asset ? { asset: context.asset } : {}) },
      };
      const file = imageResultFile(project, task);
      await mkdir(dirname(file), { recursive: true });
      // Keep signed result links out of public task summaries and cloud snapshots.
      await writeAtomic(file, JSON.stringify(receipt), { mode: 0o600 });
      task.recoveryAvailable = true;
      await putTasks(project.path, tasks);
      return await finishImage(project, task, tasks, receipt, dependencies);
    }
    const target = body.provider === 'h3'
      ? 'https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_image_audio_to_video_v2'
      : endpoint;
    const isH3 = ['h3', H3_SINGLE_PROVIDER].includes(body.provider);
    const providerName = body.provider === H3_SINGLE_PROVIDER ? 'H3 单图视频' : body.provider === 'h3' ? 'H3 标准视频' : 'Seedance 2.0';
    const headers = isH3
      ? { 'content-type': 'application/json', Authorization: c.api_key.trim() }
      : { 'content-type': 'application/json', Authorization: `Bearer ${c.api_key.trim()}` };
    const result = await timed(task, 'submitMs', () => providerJson(target, { method: 'POST', headers, body: JSON.stringify(payload) }, request));
    const remoteId = isH3 ? result.data?.task_id : result.id;
    if (!/^[\w-]{1,180}$/.test(String(remoteId ?? ''))) {
      const detail = providerErrorDetail(result, providerSecrets(headers));
      const detailText = [detail.code && `错误码 ${detail.code}`, detail.message].filter(Boolean).join('：');
      const rejected = providerRejected(result);
      const error = new WanjuError(
        rejected && detailText
          ? `${providerName} 未创建任务（${detailText}）。请先修正配置，不要重复提交。`
          : `${providerName} 响应${detailText ? `（${detailText}）` : ''}，但未包含有效任务 ID；结果未知，请先检查后台，勿重复提交。`,
        502,
      );
      error.providerErrorCode = detail.code || undefined;
      error.providerRejected = rejected;
      throw error;
    }
    task.remoteId = String(remoteId);
    task.status = 'queued';
    ensureTiming(task).submittedAt = new Date().toISOString();
    await putTasks(project.path, tasks);
    if (body.provider === H3_SINGLE_PROVIDER) {
      const status = h3ResultStatus(result);
      if (status === 'done') return await finishH3Video(project, task, tasks, h3ResultVideo(result), dependencies);
      if (['error', 'failed'].includes(status)) {
        const detail = providerErrorDetail(result, providerSecrets(headers));
        task.status = 'failed';
        task.error = `视频任务失败${detail.message ? `：${detail.message}` : '，请查看服务商后台。'}`;
        finishTiming(task, startedAt);
        await putTasks(project.path, tasks);
      } else if (status === 'running') {
        task.status = 'running';
        await putTasks(project.path, tasks);
      }
    }
    return task;
  } catch (error) {
    task.status = task.status === 'rejected' ? 'rejected' : task.recoveryAvailable || ['received', 'download-failed'].includes(task.status) ? 'download-failed'
      : error.providerRejected || [401, 403].includes(error.providerStatus) ? 'rejected' : 'unknown';
    task.error = error instanceof WanjuError ? error.message : '处理失败，请检查后台记录，勿重复提交。';
    if (error.providerErrorCode) task.providerErrorCode = error.providerErrorCode;
    ensureTiming(task).lastErrorMs = Math.max(0, Date.now() - startedAt);
    await putTasks(project.path, tasks);
    throw new WanjuError(task.error, 502);
  }
}

async function finishH3Video(project, task, tasks, result, dependencies) {
  const timing = ensureTiming(task);
  timing.remoteReadyAt ??= new Date().toISOString();
  timing.remoteWaitMs ??= statusElapsed(task);
  const videoUrl = typeof result === 'string' ? result : h3ResultVideo(result);
  task.status = 'download-failed';
  await putTasks(project.path, tasks);
  try {
    if (!videoUrl) throw new WanjuError('任务已完成，但没有返回可识别的视频文件；请查询原任务，不要重新付费生成。', 502);
    const { bytes } = await timed(task, 'downloadMs', () => (dependencies.download ?? downloadPublic)(videoUrl, 512 * 1024 * 1024));
    const path = `assets/AI-${task.shot}-${task.id.slice(0, 8)}.mp4`;
    await timed(task, 'localWriteMs', async () => {
      await mkdir(join(project.path, 'assets'), { recursive: true });
      await writeAtomic(inside(project.path, path), bytes);
    });
    const facts = await timed(task, 'probeMs', () => (dependencies.probe ?? probe)(project.path, path));
    if (!(facts.duration > 0 && facts.width > 0 && facts.height > 0)) throw new WanjuError('视频已保存但无法读取，尚未绑定镜头。', 502);
    task.path = path; task.status = 'done';
    delete task.error;
    finishTiming(task, Date.parse(task.createdAt) || Date.now());
    await putTasks(project.path, tasks);
    return task;
  } catch (error) {
    task.error = error instanceof WanjuError ? error.message : '视频下载或本地检查未完成，请查询原任务，勿重复生成。';
    await putTasks(project.path, tasks);
    throw new WanjuError(task.error, 502);
  }
}

export async function queryH3(project, taskId, dependencies = {}) {
  const tasks = await generationTasks(project.path);
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !['h3', H3_SINGLE_PROVIDER].includes(task.provider) || !/^[\w-]{1,180}$/.test(task.remoteId ?? '')) throw new WanjuError('没有可查询的 H3 任务。');
  if (['done', 'failed'].includes(task.status)) return task;
  const pinned = await taskMediaProfile(wanjuConfigDirectory(), task);
  const c = pinned ? { api_key: pinned.key } : await (dependencies.config ?? config)('minimax_h3_config.json');
  const queryBase = pinned ? pinned.baseUrl.replace(/\/minimax_h3_zm_nono$/, '/result') : 'https://autodl.art/api/v1/comfyui/comfyui_workflow/result';
  const timing = ensureTiming(task);
  timing.queryCount = Number(timing.queryCount ?? 0) + 1;
  let result;
  try {
    result = await timed(task, 'lastQueryMs', () => providerJson(`${queryBase}/${encodeURIComponent(task.remoteId)}`, { headers: { Authorization: c.api_key } }, dependencies.fetch ?? fetch, 15000));
  } catch (error) {
    task.queryError = error.providerStatus
      ? `视频进度查询失败（HTTP ${error.providerStatus}），请检查服务配置；原任务已保留。`
      : '暂时无法查询视频进度，原任务已保留，不会重新生成。';
    await putTasks(project.path, tasks);
    throw new WanjuError(task.queryError, 502);
  }
  const normalized = h3ResultStatus(result);
  const status = normalized === 'done' ? 'SUCCESS' : normalized === 'failed' ? 'FAILED' : normalized.toUpperCase();
  timing.elapsedSinceSubmitMs = statusElapsed(task);
  delete task.queryError;
  if (status === 'SUCCESS') {
    return finishH3Video(project, task, tasks, h3ResultVideo(result), dependencies);
  } else if (['FAILED', 'FAILURE', 'ERROR', 'CANCELLED'].includes(status)) {
    task.status = 'failed'; task.error = 'H3 任务失败，请查看服务商后台。';
    finishTiming(task, Date.parse(task.createdAt) || Date.now());
  } else if (['QUEUED', 'RUNNING'].includes(status)) task.status = status.toLowerCase();
  else {
    task.queryError = '查询返回了未识别状态，保留原任务，不会自动重新提交。';
    await putTasks(project.path, tasks);
    throw new WanjuError(task.queryError, 502);
  }
  await putTasks(project.path, tasks);
  return task;
}

export async function querySeedance(project, taskId, dependencies = {}) {
  return queryMultimodalVideo(project, taskId, dependencies, 'seedance');
}

export async function querySparkVideo(project, taskId, dependencies = {}) {
  return queryMultimodalVideo(project, taskId, dependencies, 'sparkvideo');
}

async function queryMultimodalVideo(project, taskId, dependencies, provider) {
  const tasks = await generationTasks(project.path);
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.provider !== provider || !/^[\w-]{1,180}$/.test(task.remoteId ?? '')) throw new WanjuError('没有可查询的视频任务。');
  if (['done', 'failed'].includes(task.status)) return task;
  const isSeedance = provider === 'seedance';
  const pinned = await taskMediaProfile(wanjuConfigDirectory(), task);
  const c = pinned ? { api_key: pinned.key } : await (dependencies.config ?? config)(isSeedance ? 'seedance_video_config.json' : 'runninghub_sparkvideo_config.json');
  if (typeof c.api_key !== 'string' || !c.api_key.trim()) throw new WanjuError('原任务的视频服务密钥未配置，不会改用其他线路。');
  const timing = ensureTiming(task);
  timing.queryCount = Number(timing.queryCount ?? 0) + 1;
  let result;
  try {
    result = await timed(task, 'lastQueryMs', () => providerJson(
      isSeedance ? `${pinned?.baseUrl ?? seedanceEndpoint}/${encodeURIComponent(task.remoteId)}` : 'https://www.runninghub.cn/openapi/v2/query',
      { method: isSeedance ? 'GET' : 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${c.api_key.trim()}` },
        ...(!isSeedance ? { body: JSON.stringify({ taskId: task.remoteId }) } : {}) },
      dependencies.fetch ?? fetch, 15000,
    ));
  } catch (error) {
    task.queryError = isSeedance && error instanceof WanjuError ? `${error.message} 原任务已保留，不会重新生成。` : error.providerStatus
      ? `视频进度查询失败（HTTP ${error.providerStatus}），请检查服务配置；原任务已保留。`
      : '暂时无法查询视频进度，原任务已保留，不会重新生成。';
    await putTasks(project.path, tasks);
    throw new WanjuError(task.queryError, 502);
  }
  const remoteStatus = String(result.status ?? result.data?.status ?? '').toUpperCase();
  const status = remoteStatus === 'SUCCEEDED' ? 'SUCCESS' : remoteStatus;
  timing.elapsedSinceSubmitMs = statusElapsed(task);
  delete task.queryError;
  if (status === 'SUCCESS') {
    timing.remoteReadyAt ??= new Date().toISOString();
    timing.remoteWaitMs ??= statusElapsed(task);
    const outputs = result.results ?? result.data?.results;
    const url = isSeedance ? result.content?.video_url : (Array.isArray(outputs) ? outputs : []).find((item) => item && typeof item.url === 'string'
      && (/^(video|(?:video\/)?(?:mp4|mov|webm))$/i.test(item.outputType ?? '') || /\.(mp4|mov|webm)(?:$|\?)/i.test(item.url)))?.url;
    task.status = 'download-failed';
    await putTasks(project.path, tasks);
    try {
      if (!url) throw new WanjuError('任务没有返回可识别的视频输出，请查询原任务或核对服务商后台。', 502);
      const { bytes } = await timed(task, 'downloadMs', () => (dependencies.download ?? downloadPublic)(url, 512 * 1024 * 1024));
      const path = `assets/AI-${task.shot}-${task.id.slice(0, 8)}.mp4`;
      await timed(task, 'localWriteMs', async () => {
        await mkdir(join(project.path, 'assets'), { recursive: true });
        await writeAtomic(inside(project.path, path), bytes);
      });
      const facts = await timed(task, 'probeMs', () => (dependencies.probe ?? probe)(project.path, path));
      if (!(facts.duration > 0 && facts.width > 0 && facts.height > 0)) throw new WanjuError('视频已保存但无法读取，尚未绑定镜头。', 502);
      task.path = path; task.status = 'done';
      delete task.error;
      finishTiming(task, Date.parse(task.createdAt) || Date.now());
    } catch (error) {
      task.error = error instanceof WanjuError ? error.message : '视频下载或本地检查未完成，请查询原任务，勿重复生成。';
      await putTasks(project.path, tasks);
      throw new WanjuError(task.error, 502);
    }
  } else if (['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'EXPIRED'].includes(status)) {
    task.status = 'failed';
    const detail = isSeedance ? providerErrorDetail(result, [c.api_key.trim()]) : {};
    const detailText = [detail.code, detail.message].filter(Boolean).join('：');
    task.error = `视频任务${status === 'EXPIRED' ? '已过期' : status === 'CANCELLED' ? '已取消' : '失败'}${detailText ? `（${detailText}）` : ''}，请查看服务商后台；不会自动重新生成。`;
    finishTiming(task, Date.parse(task.createdAt) || Date.now());
  } else if (['QUEUED', 'RUNNING', 'PENDING'].includes(status)) task.status = status.toLowerCase() === 'pending' ? 'queued' : status.toLowerCase();
  else {
    task.queryError = '查询返回了未识别状态，保留原任务，不会自动重新提交。';
    await putTasks(project.path, tasks);
    throw new WanjuError(task.queryError, 502);
  }
  await putTasks(project.path, tasks);
  return task;
}
