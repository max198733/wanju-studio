import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wanjuCloudOwner, wanjuConfigDirectory } from './wanju-access.mjs';

// Wanju's packaged resources and the standalone cloud service use the same schema.
export const MEDIA_CATEGORIES = ['image', 'video', 'audio'];
let schemaPromise;
const schema = () => schemaPromise ??= import(process.env.WANJU_ROOT && existsSync(join(process.env.WANJU_ROOT, 'cloud/media-profiles.mjs'))
  ? pathToFileURL(join(process.env.WANJU_ROOT, 'cloud/media-profiles.mjs')).href
  : new URL('../../../../apps/wanju-service/media-profiles.mjs', import.meta.url).href);
const empty = () => ({ version: 1, profiles: [], defaults: { image: null, video: null, audio: null } });
const fileName = 'media-profiles.json';
let pending = Promise.resolve();
async function read(directory) {
  if (!directory) return { ...empty(), selection: {}, cloud: null };
  const { mediaProfile } = await schema();
  try { return JSON.parse(await readFile(join(directory, fileName), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('媒体配置无法读取，请检查配置文件。'); }
  const profiles = [];
  for (const [name, id, category, adapter, title, url, model] of [
    ['xem8k5_gpt_image_config.json', 'legacy-image', 'image', 'openai-image', '原有图片服务', 'https://image.xem8k5.top', 'gpt-image-2.5-flare'],
    ['seedance_video_config.json', 'legacy-seedance', 'video', 'seedance', 'Seedance 2.0', 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks', 'doubao-seedance-2-0-260128'],
    ['minimax_h3_config.json', 'legacy-h3', 'video', 'h3-single', 'H3 首帧视频', 'https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_zm_nono', 'minimax_h3_zm_nono'],
  ]) {
    let old;
    try { old = JSON.parse((await readFile(join(directory, name), 'utf8')).replace(/^\uFEFF/, '')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw new Error('历史媒体配置无法读取，未覆盖原配置。'); }
    if (!old.api_key) continue;
    profiles.push(mediaProfile({ id, category, adapter, name: title, baseUrl: id === 'legacy-image' ? old.base_url || url : url,
      model: old.model || model, key: old.api_key,
      responseFormat: category === 'image' && /^url(?:$|[（( \t])/.test(old.response_format || '') ? 'url' : 'b64_json' }, { allowKey: true }));
  }
  const selection = Object.fromEntries(MEDIA_CATEGORIES.flatMap((category) => {
    const profile = profiles.find((p) => p.category === category);
    return profile ? [[category, profile.id]] : [];
  }));
  return { ...empty(), profiles, selection, cloud: null };
}
async function write(directory, value) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, fileName), temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temp, file);
}
function exclusive(fn) {
  const next = pending.then(fn); pending = next.catch(() => {}); return next;
}
function cloudFor(value, owner) {
  return owner && value.cloud?.owner === owner ? value.cloud : { ...empty(), owner: '', revision: '' };
}
export async function mediaSettings(directory = wanjuConfigDirectory(), owner = wanjuCloudOwner()) {
  const value = await read(directory), cloud = cloudFor(value, owner);
  if (!directory) return { profiles: [], cloud, selection: Object.fromEntries(MEDIA_CATEGORIES.map((category) => [category, 'cloud'])) };
  const { shownMediaProfile } = await schema();
  return {
    profiles: value.profiles.map((p) => ({ ...shownMediaProfile(p), source: 'custom' })),
    cloud: { owner: cloud.owner, revision: cloud.revision, defaults: cloud.defaults,
      profiles: cloud.profiles.map((p) => ({ ...shownMediaProfile(p), source: 'cloud' })) },
    selection: Object.fromEntries(MEDIA_CATEGORIES.map((category) => [category, value.selection?.[category] || 'cloud'])),
  };
}
export async function saveMediaProfile(directory, input) {
  return exclusive(async () => {
    const { mediaProfile, shownMediaProfile } = await schema();
    const value = await read(directory);
    const id = input?.id || randomUUID(), previous = value.profiles.find((p) => p.id === id);
    if (id === 'cloud') throw new Error('供应商编号不能使用保留名称 cloud。');
    const profile = mediaProfile({ ...input, id,
      key: input?.key || (previous?.baseUrl === input?.baseUrl && previous?.adapter === input?.adapter
        && previous?.auth === (input?.auth ?? 'Authorization: Bearer {key}') && previous?.category === input?.category ? previous?.key : undefined) }, { allowKey: true });
    if (value.profiles.length >= 60 && !previous) throw new Error('最多保存 60 个自定义供应商。');
    value.profiles = [...value.profiles.filter((p) => p.id !== id), profile];
    await write(directory, value);
    return shownMediaProfile(profile);
  });
}
export async function selectMediaProfile(directory, input) {
  return exclusive(async () => {
    const value = await read(directory);
    if (!MEDIA_CATEGORIES.includes(input?.category) || input.id !== 'cloud' && !value.profiles.some((p) => p.id === input.id && p.category === input.category)) throw new Error('请选择对应类别的供应商。');
    value.selection = { ...value.selection, [input.category]: input.id };
    await write(directory, value);
    return { ok: true };
  });
}
export async function removeMediaProfile(directory, id) {
  return exclusive(async () => {
    const value = await read(directory);
    value.profiles = value.profiles.filter((p) => p.id !== id);
    for (const category of MEDIA_CATEGORIES) if (value.selection?.[category] === id) value.selection[category] = 'cloud';
    await write(directory, value);
    return { ok: true };
  });
}
export async function cacheCloudMedia(directory, owner, input) {
  return exclusive(async () => {
    const { mediaCatalog } = await schema();
    if (!owner || typeof input?.revision !== 'string') throw new Error('云端媒体配置无效。');
    const cloud = mediaCatalog(input, { allowKey: true }), value = await read(directory);
    value.cloud = { ...cloud, owner, revision: input.revision };
    await write(directory, value);
    return { ok: true };
  });
}
export async function clearCloudMedia(directory) {
  return exclusive(async () => {
    const value = await read(directory);
    if (!value.cloud) return { ok: true };
    value.cloud = null;
    await write(directory, value);
    return { ok: true };
  });
}
const providerFor = { 'openai-image': 'image', seedance: 'seedance', 'h3-single': 'h3_zm_nono' };
export async function resolveMediaProfile(category, { directory = wanjuConfigDirectory(), owner = wanjuCloudOwner(), id } = {}) {
  const value = await read(directory), cloud = cloudFor(value, owner);
  const selected = id || value.selection?.[category] || 'cloud';
  const profile = selected === 'cloud' ? cloud.profiles.find((p) => p.id === cloud.defaults?.[category])
    : value.profiles.find((p) => p.id === selected && p.category === category);
  if (!profile) {
    // Before the first explicit configuration, keep existing installations working.
    if (!id && !value.selection?.[category] && !value.cloud && !cloud.profiles.length) return null;
    throw new Error('此类别尚无可用的默认服务，请登录同步云端配置或选择自定义供应商。');
  }
  if (profile.category !== category) throw new Error('所选服务类别不匹配，请重新选择供应商。');
  if (!profile.key) {
    // 云端下发了这一类的通道，却没给这个学员分配密钥——等同于没配。
    // 回落到本机原有配置，别让一次同步把原本能用的通道弄坏。
    if (!id) return null;
    throw new Error('所选服务尚未分配密钥，请配置自定义密钥或联系管理员。');
  }
  const { mediaProfile } = await schema();
  const normalized = mediaProfile(profile, { allowKey: true });
  if (normalized.adapter === 'custom-http') throw new Error('此服务使用原生自定义 HTTP 调用，请按供应商调用说明使用 openfilm get call。');
  return { ...normalized, provider: providerFor[normalized.adapter], source: selected === 'cloud' ? 'cloud' : 'custom', owner: selected === 'cloud' ? owner : '' };
}
export function profileFingerprint(profile) {
  return createHash('sha256').update(JSON.stringify([profile.id, profile.source, profile.owner, profile.baseUrl, profile.model, profile.key])).digest('hex');
}
export async function pinMediaProfile(directory, taskId, profile) {
  const file = join(directory, 'media-task-profiles', `${taskId}.json`);
  await mkdir(join(directory, 'media-task-profiles'), { recursive: true });
  await writeFile(file, JSON.stringify(profile), { mode: 0o600 });
}
export async function taskMediaProfile(directory, task, owner = wanjuCloudOwner()) {
  if (!task.profileFingerprint) return null;
  if (!/^[\w-]{1,80}$/.test(task.id)) throw new Error('任务配置编号无效。');
  let profile;
  try { profile = JSON.parse(await readFile(join(directory, 'media-task-profiles', `${task.id}.json`), 'utf8')); }
  catch { throw new Error('此设备缺少原任务的供应商凭证；请在原设备查询，勿重复生成。'); }
  if (profileFingerprint(profile) !== task.profileFingerprint || profile.source === 'cloud' && (!owner || profile.owner !== owner)) throw new Error('原任务属于其他账号或配置已损坏，请登录原账号查询。');
  const { mediaProfile } = await schema();
  mediaProfile(profile, { allowKey: true });
  return profile;
}
export async function nativeMediaServices(directory = wanjuConfigDirectory(), owner = wanjuCloudOwner()) {
  if (!directory) return [];
  const value = await read(directory), cloud = cloudFor(value, owner);
  return [...value.profiles.map((p) => ({ ...p, source: 'custom' })), ...cloud.profiles.map((p) => ({ ...p, source: 'cloud' }))]
    .filter((p) => p.adapter === 'custom-http' && p.key)
    .map((p) => {
      const selected = value.selection?.[p.category] || 'cloud';
      const active = selected === 'cloud' ? p.source === 'cloud' && cloud.defaults[p.category] === p.id : p.source === 'custom' && selected === p.id;
      return { id: `wanju-${p.source}-${p.id}`, name: p.name, url: p.baseUrl, key: p.key, auth: p.auth,
        note: `[${p.category}${active ? ' / DEFAULT' : ''}] Model: ${p.model || '按调用说明'}\n${p.note}\nUse openfilm get call; follow this provider's documented request schema. No automatic paid retries.` };
    });
}
