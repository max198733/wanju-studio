import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { writeAtomic } from './atomic.mjs';
import { inside } from './files.mjs';
import { assetPath, shotImage, shotVideo, shotPlanRev, stateRev, validateState, WanjuError } from './wanju-model.mjs';

const catalogFile = '.film/wanju-assets.json';
const categories = { character: ['characters', '02-角色/01-定妆照'], scene: ['scenes', '03-场景/01-场景图'], prop: ['props', '04-参考素材/01-道具'] };
const imagePath = (path) => !path || /\.(png|jpe?g|webp)$/i.test(assetPath(path));
const text = (value, max = 12000) => {
  if (typeof value !== 'string' || value.length > max) throw new WanjuError('资产文本格式或长度无效。');
  return value;
};
const id = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new WanjuError('资产或镜头 ID 无效。');
  return value;
};

export async function readAssetCatalog(root) {
  try {
    const catalog = JSON.parse(await readFile(join(root, catalogFile), 'utf8'));
    if (catalog?.version !== 1 || catalog.enabled !== true || !Array.isArray(catalog.assets) || catalog.assets.length > 100
      || !Array.isArray(catalog.bindings) || catalog.bindings.length > 200) throw new Error('invalid catalog');
    const ids = new Set();
    for (const asset of catalog.assets) {
      if (!asset || ids.has(id(asset.id)) || !Object.hasOwn(categories, asset.kind) || typeof asset.path !== 'string' || !imagePath(asset.path)
        || !Array.isArray(asset.references) || asset.references.length > 8) throw new Error('invalid asset');
      text(asset.name, 200); text(asset.prompt);
      ids.add(asset.id);
    }
    for (const asset of catalog.assets) if (asset.references.some((ref) => !ids.has(ref) || ref === asset.id)) throw new Error('invalid reference');
    const shots = new Set();
    for (const binding of catalog.bindings) {
      if (!binding || shots.has(id(binding.shot)) || !Array.isArray(binding.assetIds) || binding.assetIds.length > 8
        || binding.assetIds.some((ref) => !ids.has(ref))) throw new Error('invalid binding');
      shots.add(binding.shot);
    }
    return { catalog, revision: stateRev(catalog) };
  } catch (error) {
    if (error.code === 'ENOENT') return { catalog: null, revision: null };
    throw new WanjuError('资产清单无法读取，请保留 .film/wanju-assets.json 并检查格式。', 422);
  }
}
async function putCatalog(root, catalog) {
  await mkdir(join(root, '.film'), { recursive: true });
  await writeAtomic(join(root, catalogFile), JSON.stringify(catalog, null, 2) + '\n');
  return { catalog, revision: stateRev(catalog) };
}
async function fileStamp(root, path, legacy = false) {
  if (!path) return null;
  try {
    if (!imagePath(path)) return null;
    const target = inside(root, assetPath(path));
    const file = await stat(target);
    if (!file.isFile() || file.size < 12) return null;
    const handle = await open(target, 'r');
    const header = Buffer.alloc(12);
    try { await handle.read(header, 0, 12, 0); } finally { await handle.close(); }
    if (!header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && !(header[0] === 255 && header[1] === 216)
      && !(header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP')) return null;
    if (legacy) return stateRev({ path, size: file.size, modified: file.mtimeMs });
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(target)) hash.update(bytes);
    const after = await stat(target);
    if (file.size !== after.size || file.mtimeMs !== after.mtimeMs) return null;
    return `sha256:${hash.digest('hex')}`;
  } catch { return null; }
}
async function workflowRequired(root, catalog) {
  if (catalog) return true;
  if (process.env.WANJU_DESKTOP === '1') {
    try {
      const mode = JSON.parse(await readFile(join(root, '.film/wanju-workflow.json'), 'utf8'));
      if (mode?.version !== 1 || !['native', 'hedao'].includes(mode.mode)) throw new Error('invalid workflow');
      return mode.mode !== 'native';
    } catch (error) {
      if (error.code !== 'ENOENT') throw new WanjuError('项目流程设置无法读取，请保留原文件并检查格式。', 422);
      // Older Wanju projects did not store a mode: absence must not bypass continuity gates.
      return true;
    }
  }
  for (const path of ['02-角色', '13-工作流文档']) {
    try { if ((await stat(inside(root, path))).isDirectory()) return true; } catch { /* optional legacy directory */ }
  }
  return false;
}
const assetDefinition = ({ id, kind, name, prompt, references, path }) => ({ id, kind, name, prompt, references, path });
function storyboardSnapshot(state, images, assets, bindings) {
  return stateRev({
    script: state.script, ratio: state.ratio,
    shots: state.shots.map(({ id, title, description, dialogue, duration }) => ({ id, title, description, dialogue, duration })),
    images, assets: assets.map((asset) => ({ ...assetDefinition(asset), approval: asset.approval, approved: asset.approved })),
    bindings,
  });
}

export async function assetAudit(root, state, tasks = []) {
  const { catalog, revision } = await readAssetCatalog(root);
  const enabled = await workflowRequired(root, catalog);
  const assets = await Promise.all((catalog?.assets ?? []).map(async (asset) => {
    const stamp = await fileStamp(root, asset.path, Boolean(asset.approval && !asset.approval.startsWith('sha256:')));
    return { ...asset, exists: !!stamp, approved: !!stamp && asset.approval === stamp };
  }));
  const missing = [];
  if (enabled && !catalog) missing.push('尚未登记人物、场景和道具资产清单，不能跳过何导资产阶段。');
  if (catalog && !assets.some((asset) => asset.kind === 'character')) missing.push('人物资产清单为空。');
  if (catalog && !assets.some((asset) => asset.kind === 'scene')) missing.push('场景资产清单为空。');
  for (const asset of assets) {
    if (!asset.exists) missing.push(`${asset.id} ${asset.name} 尚无本地资产图片。`);
    else if (!asset.approved) missing.push(`${asset.id} ${asset.name} 尚未确认或文件已改变。`);
  }
  const referencesReady = !!catalog && !missing.length;
  const shotImages = [];
  const recoverable = [];
  for (const shot of state.shots) {
    const binding = catalog?.bindings.find((entry) => entry.shot === shot.id);
    if (catalog && (!binding || !binding.assetIds.length)) missing.push(`${shot.id} 尚未绑定人物、场景或必要道具。`);
    const stamp = await fileStamp(root, shotImage(shot), Boolean(catalog?.storyboardReview && catalog.storyboardReview.algorithm !== 'sha256'));
    shotImages.push({ shot: shot.id, path: shotImage(shot), stamp });
    if (enabled && !stamp) missing.push(`${shot.id} 尚无可读取的分镜图。`);
    if (!shotImage(shot)) {
      for (const task of [...tasks].reverse()) {
        if (task.shot === shot.id && (!task.shotPlan || task.shotPlan === shotPlanRev(state, shot)) && task.provider === 'image' && !task.assetId && task.status === 'done' && await fileStamp(root, task.path)) {
          recoverable.push({ shot: shot.id, path: task.path }); break;
        }
      }
    }
  }
  const snapshot = storyboardSnapshot(state, shotImages, assets, catalog?.bindings ?? []);
  const storyboardApproved = !!catalog?.storyboardReview && catalog.storyboardReview.snapshot === snapshot;
  if (enabled && !storyboardApproved) missing.push('分镜图册尚未审核，或剧本、资产、镜头已改变，需要重新审核。');
  return { enabled, revision, catalogPresent: !!catalog, assets, bindings: catalog?.bindings ?? [], referencesReady,
    storyboardApproved, snapshot, readyForVideo: enabled && state.shots.length > 0 && !missing.length,
    issues: missing, recoverable, shotImages: shotImages.map(({ stamp, ...item }) => ({ ...item, exists: !!stamp })),
    counts: { characters: assets.filter((a) => a.kind === 'character' && a.exists).length, scenes: assets.filter((a) => a.kind === 'scene' && a.exists).length,
      props: assets.filter((a) => a.kind === 'prop' && a.exists).length, storyboardImages: shotImages.filter((a) => a.stamp).length, videos: state.shots.filter(shotVideo).length } };
}

export async function saveAssetCatalog(root, state, input) {
  const current = await readAssetCatalog(root);
  if (input.assetBase !== current.revision) throw new WanjuError('资产清单已更新，请重新读取后保存。', 409);
  const raw = input.catalog ?? current.catalog;
  if (!raw || raw.enabled !== true || !Array.isArray(raw.assets) || raw.assets.length > 100 || !Array.isArray(raw.bindings) || raw.bindings.length > 200) throw new WanjuError('资产清单格式无效。');
  const ids = new Set();
  const assets = [];
  for (const entry of raw.assets) {
    if (!entry || ids.has(id(entry.id)) || !Object.hasOwn(categories, entry.kind)) throw new WanjuError('资产 ID 重复或类型无效。');
    ids.add(entry.id);
    const path = entry.path || '';
    if (!imagePath(path)) throw new WanjuError('资产须为项目内的 PNG、JPG 或 WebP 图片。');
    if (!Array.isArray(entry.references ?? []) || (entry.references ?? []).length > 8) throw new WanjuError('资产参考清单无效。');
    const asset = { id: entry.id, kind: entry.kind, name: text(entry.name, 200), prompt: text(entry.prompt ?? ''), path,
      references: [...new Set((entry.references ?? []).map(id))] };
    const stamp = await fileStamp(root, path);
    if (entry.approved === true) {
      if (!stamp || typeof entry.reviewNote !== 'string' || !entry.reviewNote.trim()) throw new WanjuError(`${entry.id} 审核需要真实图片和检查记录。`);
      asset.approval = stamp; asset.reviewNote = text(entry.reviewNote, 2000);
    } else if (entry.approved !== false) {
      const previous = current.catalog?.assets.find((item) => item.id === entry.id);
      const previousStamp = previous?.approval?.startsWith('sha256:') ? stamp : await fileStamp(root, path, true);
      if (stamp && previous?.approval === previousStamp && stateRev(assetDefinition(previous)) === stateRev(assetDefinition(asset))) {
        asset.approval = stamp; asset.reviewNote = previous.reviewNote;
      }
    }
    assets.push(asset);
  }
  for (const asset of assets) if (asset.references.some((ref) => !ids.has(ref) || ref === asset.id)) throw new WanjuError('资产引用不存在或引用自身。');
  const bound = new Set();
  const bindings = raw.bindings.map((entry) => {
    if (!entry || bound.has(id(entry.shot)) || !state.shots.some((shot) => shot.id === entry.shot) || !Array.isArray(entry.assetIds) || entry.assetIds.length > 8) throw new WanjuError('逐镜资产绑定无效。');
    bound.add(entry.shot);
    const assetIds = [...new Set(entry.assetIds.map(id))];
    if (assetIds.some((ref) => !ids.has(ref))) throw new WanjuError('镜头引用了未登记的资产。');
    if (assetIds.length && !assetIds.some((ref) => assets.find((asset) => asset.id === ref)?.kind === 'scene')) throw new WanjuError(`${entry.shot} 需要绑定场景资产。`);
    return { shot: entry.shot, assetIds };
  });
  const catalog = { version: 1, enabled: true, assets, bindings, ...(current.catalog?.storyboardReview ? { storyboardReview: current.catalog.storyboardReview } : {}) };
  if (input.approveStoryboard === true) {
    // Validate a prospective catalog without ever writing a partially approved catalog.
    if (typeof input.reviewNote !== 'string' || !input.reviewNote.trim()) throw new WanjuError('分镜图册审核需要填写实际检查记录。');
    if (!assets.length || assets.some((asset) => !asset.approval) || !assets.some((asset) => asset.kind === 'character') || !assets.some((asset) => asset.kind === 'scene')
      || !state.script.trim() || !state.shots.length || state.shots.some((shot) => !bindings.find((binding) => binding.shot === shot.id)?.assetIds.length || !shot.description.trim())) throw new WanjuError('资产、剧本或逐镜绑定尚未齐全，不能通过图册审核。');
    const shotImages = await Promise.all(state.shots.map(async (shot) => ({ shot: shot.id, path: shotImage(shot), stamp: await fileStamp(root, shotImage(shot)) })));
    if (shotImages.some((image) => !image.stamp)) throw new WanjuError('分镜图尚未齐全，不能通过图册审核。');
    const snapshot = storyboardSnapshot(state, shotImages, assets.map((asset) => ({ ...asset, approved: true })), bindings);
    catalog.storyboardReview = { snapshot, algorithm: 'sha256', note: text(input.reviewNote, 4000) };
  }
  for (const asset of assets) {
    if (!await fileStamp(root, asset.path)) continue;
    const workflowPath = `${categories[asset.kind][1]}/${basename(asset.path)}`;
    await mkdir(dirname(inside(root, workflowPath)), { recursive: true });
    await writeAtomic(inside(root, workflowPath), await readFile(inside(root, asset.path)));
    asset.workflowPath = workflowPath;
  }
  return putCatalog(root, catalog);
}

/** Upgrade only approvals still valid on this device before a portable cloud snapshot. */
export async function prepareAssetReviewsForSync(root) {
  const { catalog, revision } = await readAssetCatalog(root);
  if (!catalog || (!catalog.assets.some((asset) => asset.approval && !asset.approval.startsWith('sha256:'))
    && (!catalog.storyboardReview || catalog.storyboardReview.algorithm === 'sha256'))) return;
  const state = validateState(JSON.parse(await readFile(join(root, 'wanju.json'), 'utf8')));
  const report = await assetAudit(root, state);
  await saveAssetCatalog(root, state, {
    assetBase: revision,
    catalog: { ...catalog, assets: catalog.assets.map((asset) => ({ ...asset,
      approved: report.assets.find((item) => item.id === asset.id)?.approved === true })) },
    ...(report.storyboardApproved ? { approveStoryboard: true, reviewNote: catalog.storyboardReview.note } : {}),
  });
}

export async function generationAssetContext(root, state, body) {
  const { catalog } = await readAssetCatalog(root);
  if (body.assetId) {
    if (body.provider !== 'image') throw new WanjuError('独立资产只使用图片生成服务。');
    const asset = catalog?.assets.find((entry) => entry.id === body.assetId);
    if (!asset || !asset.prompt.trim()) throw new WanjuError('请先登记该资产和实际生图提示词。');
    const report = await assetAudit(root, state);
    const references = asset.references.map((ref) => report.assets.find((entry) => entry.id === ref));
    if (references.some((ref) => !ref?.approved)) throw new WanjuError('资产使用的参考图尚未生成或确认，未提交。');
    return { workflow: true, asset, shot: { id: `ASSET_${asset.id}`, title: asset.name, description: asset.prompt, dialogue: '', duration: 5, media: '' }, referencePaths: references.map((ref) => ref.path) };
  }
  const shot = state.shots.find((entry) => entry.id === body.shot);
  if (!shot) throw new WanjuError('镜头不存在。');
  if (body.provider === 'h3_zm_nono') {
    const image = shotImage(shot);
    if (!await fileStamp(root, image)) throw new WanjuError('单图视频需要本镜真实可读取的分镜图片，请先生成或导入首帧图；未提交。', 422);
    const options = body.videoOptions ?? {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new WanjuError('视频参数必须是对象。');
    if (options.imageUrls !== undefined && JSON.stringify(options.imageUrls) !== JSON.stringify([image])) throw new WanjuError('单图线路使用当前镜头的首帧图片；更换图片请先更新镜头。');
    return { shot, referencePaths: null, videoOptions: { ...options, imageUrls: [image] } };
  }
  if (!await workflowRequired(root, catalog)) return { shot, referencePaths: null };
  const report = await assetAudit(root, state);
  const binding = catalog?.bindings.find((entry) => entry.shot === shot.id);
  if (!report.referencesReady || !binding?.assetIds.length) throw new WanjuError(`何导资产关卡未通过：${report.issues[0] ?? `${shot.id} 未绑定资产`} 请先完成角色、场景和关键道具，未调用付费接口。`, 422);
  const references = binding.assetIds.map((ref) => report.assets.find((asset) => asset.id === ref));
  if (references.some((asset) => !asset?.approved)) throw new WanjuError('镜头引用了未审核或不存在的资产，未提交。', 422);
  const referencePaths = references.map((asset) => asset.path);
  const mapping = references.map((asset, i) => `图片${i + 1}：${asset.id} ${asset.name}`).join('；');
  if (body.provider === 'image') return { workflow: true, shot, referencePaths, promptPrefix: `严格使用已审核资产：${mapping}。保持对应人物身份、妆造、场景与道具，不重新设计。\n` };
  if (!report.readyForVideo) throw new WanjuError(`何导分镜关卡未通过：${report.issues[0]} 未提交视频任务。`, 422);
  if (body.provider !== 'seedance') throw new WanjuError('本资产闭环使用默认视频线路；如需改线路，请先调整制作方案。');
  const images = [...new Set([shotImage(shot), ...referencePaths])];
  const options = body.videoOptions ?? {};
  if (options.imageUrls?.length && JSON.stringify(options.imageUrls) !== JSON.stringify(images)) throw new WanjuError('何导流程的图片参考由分镜与资产绑定生成，请先更新资产绑定，不要临时更换人物。');
  const prompt = `图片1为本镜已审核分镜图；${references.map((asset) => `图片${images.indexOf(asset.path) + 1}：${asset.id} ${asset.name}`).join('；')}。保持同一人物、妆造、道具与空间关系。\n${options.prompt ?? shot.description}${shot.dialogue ? `\n台词：${shot.dialogue}` : ''}`;
  return { workflow: true, shot, referencePaths, videoOptions: { ...options, imageUrls: images, prompt } };
}

export function assetOutputPaths(context, taskId, extension) {
  if (context.asset) {
    const [folder, workflowFolder] = categories[context.asset.kind];
    const name = `${context.asset.id}-${taskId.slice(0, 8)}${extension}`;
    return { path: `assets/${folder}/${name}`, workflowPath: `${workflowFolder}/${name}` };
  }
  const name = `AI-${context.shot.id}-${taskId.slice(0, 8)}${extension}`;
  return { path: `assets/${name}`, ...(context.workflow ? { workflowPath: `08-分镜静态图/${name}` } : {}) };
}
export async function archiveWorkflowImage(root, task, context) {
  if (!task.workflowPath) return;
  const bytes = await readFile(inside(root, task.path));
  const target = inside(root, task.workflowPath);
  await mkdir(dirname(target), { recursive: true });
  await writeAtomic(target, bytes);
  if (context.asset) {
    const { catalog } = await readAssetCatalog(root);
    const entry = catalog?.assets.find((asset) => asset.id === context.asset.id);
    if (!entry || stateRev(assetDefinition({ ...entry, path: context.asset.path })) !== stateRev(assetDefinition(context.asset))
      || entry.path !== context.asset.path && entry.path !== task.path) throw new WanjuError('资产定义或选用图片已改变，图片已保存，请重新核对绑定。');
    const alreadyBound = entry.path === task.path;
    if (alreadyBound && entry.workflowPath === task.workflowPath) return;
    entry.path = task.path; entry.workflowPath = task.workflowPath;
    if (!alreadyBound) {
      delete entry.approval; delete entry.reviewNote; delete catalog.storyboardReview;
    }
    await putCatalog(root, catalog);
  }
}

export async function recoverStoryboardImages(root, state, tasks) {
  const report = await assetAudit(root, state, tasks);
  const recovered = [];
  for (const item of report.recoverable) {
    const shot = state.shots.find((shot) => shot.id === item.shot);
    if (shotImage(shot)) continue;
    shot.image = item.path;
    if (!shotVideo(shot)) shot.media = item.path;
    const target = inside(root, `08-分镜静态图/${basename(item.path)}`);
    await mkdir(dirname(target), { recursive: true });
    await writeAtomic(target, await readFile(inside(root, item.path)));
    recovered.push(item);
  }
  return recovered;
}
