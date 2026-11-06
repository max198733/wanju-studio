import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { createProject, listProjects, projectById } from './projects.mjs';
import { readJson, json } from './http.mjs';
import { writeAtomic } from './atomic.mjs';
import { inside, importFile, kindOf, cleanName, listFiles } from './files.mjs';
import { probe } from './derived.mjs';
import { editProjectFilm, readProjectFilm, writeProjectFilm } from './film.mjs';
import { assetPath, blankState, isImagePath, isVideoPath, nextShotId, shotImage, shotVideo, shotPlanRev, stateRev, timelineOf, validateState, WanjuError } from './wanju-model.mjs';
import { generateOne, generationTasks, queryImage, queryH3, querySeedance, querySparkVideo, saveTaskBindingWarning, taskSummary } from './wanju-generation.mjs';
import { createTaskMonitor } from './wanju-task-monitor.mjs';
import { assetAudit, readAssetCatalog, recoverStoryboardImages, saveAssetCatalog } from './wanju-assets.mjs';
import { wanjuAccess, wanjuConfigDirectory } from './wanju-access.mjs';
import { productionDiagnostics } from './wanju-diagnostics.mjs';
import { readChatPerformance } from './wanju-chat-performance.mjs';
import { mediaSettings } from './wanju-media.mjs';
import { importStorySource, readStory, readStorySource, readStoryUpload, saveStory } from './wanju-story.mjs';

const turns = new Map();
const projectCreations = new Map();
export function projectTurn(id, fn) {
  const result = (turns.get(id) ?? Promise.resolve()).then(fn);
  const settled = result.catch(() => {});
  turns.set(id, settled);
  void settled.then(() => { if (turns.get(id) === settled) turns.delete(id); });
  return result;
}

export async function readWanju(root) {
  let state;
  try { state = validateState(JSON.parse(await readFile(join(root, 'wanju.json'), 'utf8'))); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new WanjuError('项目资料无法读取，请保留 wanju.json 并检查格式。', 422);
    state = blankState();
  }
  return { state, rev: stateRev(state) };
}
export async function saveWanju(root, state) {
  const checked = validateState(state);
  await writeAtomic(join(root, 'wanju.json'), JSON.stringify(checked, null, 2) + '\n');
  return { state: checked, rev: stateRev(checked) };
}

async function createWanjuProjectOnce(body = {}) {
  const workflow = body.workflow ?? 'hedao';
  if (!['hedao', 'native'].includes(workflow)) throw new WanjuError('工作流类型无效。');
  const state = validateState({ ...blankState(), title: body.name || '未命名短剧', ratio: body.ratio || '9:16' });
  if (body.reuseExisting !== false) {
    const existing = (await listProjects()).find((entry) => entry.name === state.title);
    if (existing) {
      try {
        const savedProject = JSON.parse(await readFile(join(existing.path, 'wanju.json'), 'utf8'));
        if (savedProject.title !== state.title) throw Object.assign(new Error('project title mismatch'), { code: 'ENOENT' });
        const saved = await readWanju(existing.path);
        const tasks = await generationTasks(existing.path);
        const audit = await assetAudit(existing.path, saved.state, tasks);
        if (audit.enabled !== (workflow === 'hedao')) throw Object.assign(new Error('workflow mismatch'), { code: 'ENOENT' });
        return { project: existing, ...saved, reused: true, tasks: tasks.map(taskSummary),
          workflow: audit };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const project = await createProject(state.title);
  if (workflow === 'hedao') await saveAssetCatalog(project.path, state, {
    assetBase: null, catalog: { enabled: true, assets: [], bindings: [] },
  });
  else await writeAtomic(join(project.path, '.film/wanju-workflow.json'), JSON.stringify({ version: 1, mode: 'native' }) + '\n');
  return { project, ...(await saveWanju(project.path, state)), reused: false, workflow: await assetAudit(project.path, state) };
}

export function createWanjuProject(body = {}) {
  const workflow = body.workflow ?? 'hedao';
  const name = String(body.name || '未命名短剧').trim();
  const key = `${workflow}:${name.toLocaleLowerCase()}`;
  const prior = projectCreations.get(key) ?? Promise.resolve();
  const pending = prior.then(() => createWanjuProjectOnce(body));
  const settled = pending.catch(() => {});
  projectCreations.set(key, settled);
  void settled.then(() => { if (projectCreations.get(key) === settled) projectCreations.delete(key); });
  return pending;
}

export async function enableProjectWorkflow(project, body) {
  return projectTurn(project.id, async () => {
    const saved = await readWanju(project.path);
    const current = await readAssetCatalog(project.path);
    if (body.base !== saved.rev || !Object.hasOwn(body, 'assetBase') || body.assetBase !== current.revision) {
      throw new WanjuError('项目或资产清单已更新，请刷新后启用流程。', 409);
    }
    if (current.catalog) return { ...saved, ...current, workflow: await assetAudit(project.path, saved.state) };
    const backup = `.film/wanju-before-workflow-${Date.now()}.json`;
    await mkdir(join(project.path, '.film'), { recursive: true });
    await writeAtomic(join(project.path, backup), JSON.stringify({
      version: 1, projectId: project.id, state: saved.state, catalog: null,
    }, null, 2) + '\n');
    const result = await saveAssetCatalog(project.path, saved.state, {
      assetBase: null, catalog: { enabled: true, assets: [], bindings: [] },
    });
    return { ...saved, ...result, backup, workflow: await assetAudit(project.path, saved.state) };
  });
}

export async function createStoryEpisodeProject(project, base, episodeNumber) {
  const current = await readStory(project.path);
  if (base !== current.revision) throw new WanjuError('分集策划已更新，请刷新后再继续。', 409);
  const episode = current.story.episodes.find((entry) => entry.number === episodeNumber);
  if (!episode || !episode.script.trim()) throw new WanjuError('请先保存本集剧本，再创建分集剪辑工程。');
  if (!current.story.plan) throw new WanjuError('请先保存全剧策划，再创建分集剪辑工程。');
  let seriesId = current.story.seriesId;
  let revision = base;
  if (!seriesId) {
    seriesId = randomUUID();
    const initialized = await saveStory(project.path, base, current.story.plan, current.story.episodes, { seriesId });
    current.story = initialized.story;
    revision = initialized.revision;
  }

  const suffix = project.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  const title = `${current.story.plan.title.slice(0, 120)} · 第${String(episode.number).padStart(2, '0')}集 · ${suffix}`;
  const projects = await listProjects();
  const markerPath = (entry) => join(entry.path, '.film/wanju-episode.json');
  const markerOf = async (entry) => {
    try {
      const value = JSON.parse(await readFile(markerPath(entry), 'utf8'));
      return value?.version === 1 && value.seriesId === seriesId
        && value.episodeNumber === episode.number
        && (!value.parentProjectId || value.parentProjectId === project.id);
    } catch { return false; }
  };
  let child = episode.projectId
    ? projects.find((entry) => entry.id === episode.projectId && entry.id !== project.id) ?? null
    : null;
  if (child && !await markerOf(child)) child = null;
  if (!child) {
    const owned = [];
    for (const entry of projects) {
      if (entry.id !== project.id && await markerOf(entry)) owned.push(entry);
    }
    if (owned.length > 1) throw new WanjuError('找到多个属于本集的剪辑工程，请先检查工程文件夹。', 409);
    [child] = owned;
  }
  if (!child) {
    child = (await createWanjuProject({
      name: title, ratio: current.story.plan.ratio, workflow: 'hedao', reuseExisting: false,
    })).project;
  }
  if (child) {
    const marker = await readFile(markerPath(child), 'utf8').then(JSON.parse).catch(() => null);
    if (!marker?.parentProjectId) {
      await writeAtomic(markerPath(child), JSON.stringify({
        version: 1, seriesId, episodeNumber: episode.number, parentProjectId: project.id,
      }, null, 2) + '\n');
    }
  }
  if (child.id === project.id) throw new WanjuError('本集工程不能指向系列总项目。', 409);

  let seeded = false;
  await projectTurn(child.id, async () => {
    const childState = await readWanju(child.path);
    const film = await readProjectFilm(child.path);
    if (!film.value && film.text.trim()) {
      throw new WanjuError('本集工程的时间轴文件无法读取；没有覆盖现有内容。', 422);
    }
    const hasTimelineClips = film.value?.tracks?.some((track) => track.clips.length) ?? false;
    if (!childState.state.script.trim() && childState.state.shots.length === 0 && !hasTimelineClips) {
      await saveWanju(child.path, {
        ...childState.state, title, ratio: current.story.plan.ratio, script: episode.script,
      });
      seeded = true;
    }
  });
  const saved = await saveStory(project.path, revision, current.story.plan, current.story.episodes, {
    projectLink: { number: episode.number, projectId: child.id }, seriesId,
  });
  return { project: child, story: saved.story, revision: saved.revision, seeded };
}

export async function readStorySeries(project) {
  const projects = await listProjects();
  const projectsById = new Map(projects.map((entry) => [entry.id, entry]));
  const markerAt = (entry) => join(entry.path, '.film/wanju-episode.json');
  const readMarker = async (entry) => {
    try {
      const marker = JSON.parse(await readFile(markerAt(entry), 'utf8'));
      return marker?.version === 1 && typeof marker.seriesId === 'string'
        && Number.isSafeInteger(marker.episodeNumber) && marker.episodeNumber > 0
        ? marker : null;
    } catch { return null; }
  };
  const currentMarker = await readMarker(project);
  const currentStory = await readStory(project.path);
  let parent = currentStory.story.seriesId && currentStory.story.plan ? project : null;

  if (!parent && currentMarker) {
    const preferred = projectsById.get(currentMarker.parentProjectId);
    const candidates = preferred ? [preferred, ...projects.filter((entry) => entry.id !== preferred.id)] : projects;
    const matches = [];
    for (const candidate of candidates) {
      if (candidate.id === project.id) continue;
      const story = await readStory(candidate.path);
      if (story.story.seriesId === currentMarker.seriesId && story.story.plan) matches.push(candidate);
    }
    parent = preferred && matches.some((entry) => entry.id === preferred.id)
      ? preferred : matches.length === 1 ? matches[0] : null;
  }

  if (!parent) return { series: null, currentEpisode: currentMarker?.episodeNumber ?? null };
  const parentStory = parent.id === project.id ? currentStory : await readStory(parent.path);
  const seriesId = parentStory.story.seriesId;
  if (!seriesId || !parentStory.story.plan) return { series: null, currentEpisode: currentMarker?.episodeNumber ?? null };

  const linked = new Map();
  for (const entry of projects) {
    if (entry.id === parent.id) continue;
    const marker = await readMarker(entry);
    if (!marker || marker.seriesId !== seriesId
      || (marker.parentProjectId && marker.parentProjectId !== parent.id)) continue;
    const group = linked.get(marker.episodeNumber) ?? [];
    group.push(entry);
    linked.set(marker.episodeNumber, group);
  }
  const episodes = parentStory.story.episodes.map((episode) => {
    const candidates = linked.get(episode.number) ?? [];
    const referenced = episode.projectId ? candidates.find((entry) => entry.id === episode.projectId) : null;
    const child = referenced ?? (candidates.length === 1 ? candidates[0] : null);
    return {
      number: episode.number,
      title: episode.title,
      projectId: child?.id ?? null,
      projectName: child?.name ?? null,
      ...(episode.archived ? { archived: true } : {}),
    };
  });
  return {
    series: {
      id: seriesId,
      title: parentStory.story.plan.title,
      projectId: parent.id,
      projectName: parent.name,
      episodes,
    },
    currentEpisode: currentMarker?.seriesId === seriesId ? currentMarker.episodeNumber : null,
  };
}

export async function syncReadyShots(project, state, dependencies = {}) {
  const checked = validateState(state);
  const current = await readProjectFilm(project.path);
  if (!current.value && current.text.trim()) throw new WanjuError('OpenFilm 时间轴文件无法读取，素材已保留在分镜中；请先检查 film.html。', 422);
  const value = current.value ?? { stage: { w: 1920, h: 1080 }, tracks: [] };
  const clipLocations = new Map();
  value.tracks.forEach((track, trackIndex) => track.clips.forEach((clip) => clipLocations.set(clip.id, { clip, trackIndex })));
  let managedTrack = [...clipLocations.entries()].find(([id]) => id.startsWith('wjshot-'))?.[1].trackIndex ?? -1;
  let laneCreated = false;
  const sizes = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };
  const ops = [];
  let plannedAt = 0;
  const markerOf = (clip) => {
    const value = clip?.attrs?.['data-wanju-auto'];
    if (typeof value !== 'string') return null;
    try { return JSON.parse(value); } catch { return null; }
  };

  for (const shot of checked.shots) {
    const video = shotVideo(shot);
    if (!video) {
      plannedAt = Math.round((plannedAt + shot.duration) * 1000000) / 1000000;
      continue;
    }
    const id = `wjshot-${shot.id}`;
    let clipId = id;
    let existing = clipLocations.get(id)?.clip;
    const facts = await (dependencies.probe ?? probe)(project.path, video);
    const duration = facts && Number.isFinite(facts.duration) ? Math.min(shot.duration, facts.duration) : shot.duration;
    if (!(duration > 0)) throw new WanjuError(`${shot.id} 的视频时长无效，未同步到时间轴。`, 422);
    const time = [0, duration];
    const native = clipLocations.get(shot.id)?.clip;
    if (!existing && markerOf(native)?.shot === shot.id) {
      clipId = shot.id;
      existing = native;
    }
    const samePlacement = (clip) => clip && clip.src === video
      && Number(clip.at ?? 0) === plannedAt && JSON.stringify(clip.time ?? null) === JSON.stringify(time);
    // Adopt an existing native clip; conflicting duplicate edits require a human review.
    if (samePlacement(native) && !existing) {
        clipId = shot.id;
        existing = native;
        const marker = JSON.stringify({ shot: shot.id, src: video, at: plannedAt, time });
        if (native.attrs?.['data-wanju-auto'] !== marker) {
          ops.push({ op: 'fields', clip: clipId, fields: { attrs: { ...(native.attrs ?? {}), 'data-wanju-auto': marker } } });
        }
    }
    let auto = null;
    const marker = existing?.attrs?.['data-wanju-auto'];
    if (typeof marker === 'string') {
      try { auto = JSON.parse(marker); } catch { /* preserve a clip with an invalid marker as a user edit */ }
    }
    const fields = {};
    let changed = false;

    if (existing) {
      if (auto && existing.src === auto.src) {
        const untouchedPosition = Number(existing.at ?? 0) === Number(auto.at ?? 0)
          && JSON.stringify(existing.time ?? null) === JSON.stringify(auto.time ?? null);
        if (existing.src !== video) { fields.src = video; changed = true; }
        // Keep the automation baseline so a later sync never claims manual edits.
        let nextAt = Number(auto.at ?? 0);
        let nextTime = auto.time;
        if (untouchedPosition) {
          if (nextAt !== plannedAt) { fields.at = plannedAt || null; changed = true; }
          if (JSON.stringify(nextTime ?? null) !== JSON.stringify(time)) { fields.time = time; changed = true; }
          nextAt = plannedAt;
          nextTime = time;
        }
        const nextMarker = JSON.stringify({ shot: shot.id, src: video, at: nextAt, time: nextTime });
        if (marker !== nextMarker && !ops.some((op) => op.op === 'fields' && op.clip === clipId)) {
          fields.attrs = { ...(existing.attrs ?? {}), 'data-wanju-auto': nextMarker };
          changed = true;
        }
      }
      if (changed) ops.push({ op: 'fields', clip: clipId, fields });
    } else {
      const clip = {
        id, src: video, at: plannedAt, time,
        attrs: { 'data-wanju-auto': JSON.stringify({ shot: shot.id, src: video, at: plannedAt, time }) },
      };
      if (managedTrack < 0) {
        managedTrack = value.tracks.length;
        laneCreated = true;
        ops.push({ op: 'insert', clip, track: { insert: managedTrack } });
      } else {
        ops.push({ op: 'insert', clip, track: managedTrack });
      }
    }
    plannedAt = Math.round((plannedAt + shot.duration) * 1000000) / 1000000;
  }

  const readyShotIds = new Set(checked.shots
    .filter((shot) => shotVideo(shot))
    .map((shot) => shot.id));
  for (const [id, { clip }] of clipLocations) {
    const auto = markerOf(clip);
    const untouchedAutomaticPlacement = auto
      && clip.src === auto.src
      && Number(clip.at ?? 0) === Number(auto.at ?? 0)
      && JSON.stringify(clip.time ?? null) === JSON.stringify(auto.time ?? null);
    if (auto?.shot && !readyShotIds.has(auto.shot) && untouchedAutomaticPlacement) ops.push({ op: 'remove', clip: id });
  }

  if (!ops.length) return current;
  const hasPicture = value.tracks.some((track) => track.clips.some((clip) => ['image', 'video', 'page'].includes(kindOf(clip.src))));
  if (laneCreated && !hasPicture) {
    const [w, h] = sizes[checked.ratio];
    ops.unshift({ op: 'stage', w, h });
  }
  return editProjectFilm(project.path, current.rev, ops);
}

async function syncProjectShots(project, state, dependencies) {
  await syncReadyShots(project, state, dependencies);
}

export function queryVideoTask(project, taskId, dependencies = {}) {
  return projectTurn(project.id, async () => {
    if (!wanjuAccess().localMediaAllowed) throw new WanjuError('请登录并启用自有媒体服务后查询该任务。', 403);
    let query = dependencies.query;
    if (!query) {
      const stored = (await generationTasks(project.path)).find((task) => task.id === taskId);
      query = stored?.provider === 'image' ? queryImage : stored?.provider === 'seedance' ? querySeedance : stored?.provider === 'sparkvideo' ? querySparkVideo : queryH3;
    }
    const task = await query(project, taskId, dependencies.generation);
    const current = await readWanju(project.path);
    const shot = current.state.shots.find((s) => s.id === task.shot);
    const imageBefore = task.imageBefore ?? (isImagePath(task.mediaBefore) ? task.mediaBefore : '');
    const videoBefore = task.videoBefore ?? (isVideoPath(task.mediaBefore) ? task.mediaBefore : '');
    const planMatches = shot && task.shotPlan === shotPlanRev(current.state, shot)
      && (!task.projectId || task.projectId === project.id);
    if (task.status === 'done' && shot && task.path && !planMatches && ![shotVideo(shot), shotImage(shot)].includes(task.path)) {
      task.bindingWarning = task.provider === 'image'
        ? '原任务图片已保留，但项目或分镜计划已改变，未自动替换分镜图；请核对后手动关联，不要重复生成。'
        : '原任务视频已保留，但项目或分镜计划已改变（或为无校验信息的旧任务），未自动放入时间轴。请核对后手动导入，不要重复生成。';
    }
    if (task.status === 'done' && shot && task.path && planMatches && shotImage(shot) === imageBefore && shotVideo(shot) === videoBefore) {
      bindGeneratedMedia(shot, task);
      await saveWanju(project.path, current.state);
    }
    if (task.status === 'done' && shot && task.path && planMatches
      && ![shotImage(shot), shotVideo(shot)].includes(task.path)) {
      task.bindingWarning = '原任务素材已保存，但当前镜头已手动更换素材，未覆盖人工选择；请核对后手动关联。';
    } else if (shot && [shotImage(shot), shotVideo(shot)].includes(task.path)) {
      delete task.bindingWarning;
    }
    await saveTaskBindingWarning(project.path, task);
    // Retry a failed timeline sync even when the completed video was already saved to the board.
    if (task.status === 'done' && shot && task.path && shotVideo(shot) === task.path) {
      await syncProjectShots(project, current.state, dependencies);
    }
    return task;
  });
}

const taskMonitor = createTaskMonitor(queryVideoTask);
const resumeVideoTasks = (project, tasks) => {
  if (wanjuAccess().localMediaAllowed) taskMonitor.resume(project, tasks);
};

const providers = [
  ['image', '分镜图 / Xem8k5', 'xem8k5_gpt_image_config.json', '单镜适配 · 未实测'],
  ['h3', '视频 / H3', 'minimax_h3_config.json', '标准档适配 · 未实测'],
  ['h3_zm_nono', '视频 / 单图线路', 'minimax_h3_config.json', '单图适配 · 待真实生成验证'],
  ['wan', '视频 / Wan', 'wan_video_config.json', '参数待核对'],
  ['grok', '视频 / Grok', 'duomi_grok_video_config.json', '查询接口待核对'],
  ['seedance', '视频 / Seedance 2.0', 'seedance_video_config.json', '多模态适配 · 待真实生成验证'],
  ['music', '音乐 / MXAPI', 'mxapi_music_config.json', '查询接口待核对'],
  ['cos', '素材托管 / COS', 'cos_config.json', 'SDK 接入 · 未实测'],
];

export async function providerStatus(configDir = wanjuConfigDirectory()) {
  return Promise.all(providers.map(async ([id, name, file, verification]) => {
    const supported = ['image', 'h3', 'h3_zm_nono', 'seedance', 'cos'].includes(id);
    const managed = !wanjuAccess().localMediaAllowed;
    if (managed) return { id, name, configured: false, supported, managed: true, verification: '学员云端媒体服务尚未开通' };
    if (!configDir) return { id, name, configured: false, supported, verification: supported ? '尚未配置' : '尚未接入' };
    try {
      const config = JSON.parse((await readFile(join(configDir ?? '', file), 'utf8')).replace(/^\uFEFF/, ''));
      const configured = id === 'cos'
        ? Boolean(config.secret_id && config.secret_key && (config.bucket || config.bucket_name))
        : Boolean(typeof config.api_key === 'string' && config.api_key.trim());
      return { id, name, configured, supported, verification: !supported ? '尚未接入，保存密钥不能启用' : configured ? verification : '缺少密钥' };
    } catch { return { id, name, configured: false, supported, verification: supported ? '未配置' : '尚未接入' }; }
  }));
}

export async function assembleProject(source, state) {
  if (!state.shots.length || state.shots.some((shot) => !shotVideo(shot))) {
    throw new WanjuError('生成独立初剪前，每个镜头都需要有视频素材。');
  }
  const durations = {};
  const paths = [...new Set([...state.shots.flatMap((shot) => [shotImage(shot), shotVideo(shot)]), state.music].filter(Boolean))];
  for (const path of paths) {
    assetPath(path);
    const facts = await probe(source.path, path);
    if (facts.duration) durations[path] = facts.duration;
  }
  const film = timelineOf(state, durations);
  // Every assembly is a separate project, so later editor work can never be overwritten by the board.
  const project = await createProject(`${state.title || source.name} 初剪`);
  for (const path of paths) {
    const target = inside(project.path, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(inside(source.path, path), target);
  }
  await saveWanju(project.path, state);
  await writeProjectFilm(project.path, film);
  await writeAtomic(join(project.path, '.film/wanju-workflow.json'), JSON.stringify({ version: 1, mode: 'native' }) + '\n');
  await writeAtomic(join(project.path, 'wanju-origin.json'), JSON.stringify({ sourceProject: source.id, assembledAt: new Date().toISOString() }, null, 2));
  return project;
}

/** Called after Studio's authentication and same-origin checks. */
export async function wanjuRoute(req, res, parts, { folderUrl }) {
  try {
    if (parts.length === 1 && parts[0] === 'status' && req.method === 'GET') {
      const media = await mediaSettings();
      const selected = (category) => {
        const id = media.selection[category];
        return id === 'cloud' ? media.cloud.profiles.find((p) => p.id === media.cloud.defaults[category]) || null
          : media.profiles.find((p) => p.id === id) || null;
      };
      const active = Object.fromEntries(['image', 'video', 'audio'].map((category) => {
        const profile = selected(category);
        return [category, profile ? { id: profile.id, name: profile.name, adapter: profile.adapter, configured: profile.configured === true } : null];
      }));
      const providers = (await providerStatus()).filter((p) => p.id !== 'image');
      providers.push({ id: 'image', name: active.image?.name || '图片生成', configured: active.image?.configured === true, supported: true,
        verification: active.image?.configured ? '账号供应商密钥已分配 · 未验证' : '未配置' });
      providers.push({ id: 'video', name: active.video?.name || '视频生成', configured: active.video?.configured === true, supported: true,
        verification: active.video?.configured ? '账号供应商密钥已分配 · 未验证' : '未配置' });
      return json(res, 200, {
        product: {
          name: 'wanju',
          version: process.env.WANJU_PRODUCT_VERSION || '0.1.13-dev',
          channel: process.env.WANJU_PRODUCT_CHANNEL || 'source',
        },
        productionMode: {
          scope: 'conversation',
          availableInStatus: false,
          source: 'desktop chat context',
        },
        legacyMediaWorkflow: {
          id: 'album_semiauto',
          generation: 'single-shot-unverified',
          scope: 'server media workflow only; not the desktop chat production mode',
        },
        capabilities: {
          boardRevisionChecks: true,
          persistedGenerationRecovery: true,
          manualTimelinePlacementProtection: true,
          paidGenerationIdempotency: false,
        },
        providers, activeMedia: active, access: wanjuAccess(), workflow: '何导工作流 · 资产闭环',
      });
    }
    if (parts[0] !== 'projects') throw new WanjuError('接口不存在。', 404);
    if (parts.length === 1 && req.method === 'POST') {
      const body = await readJson(req);
      const result = await createWanjuProject(body);
      return json(res, 201, { ...result, folder: folderUrl(result.project) });
    }
    const project = await projectById(parts[1]);
    if (parts.length === 2 && req.method === 'GET') {
      const saved = await readWanju(project.path);
      const tasks = await generationTasks(project.path);
      resumeVideoTasks(project, tasks);
      return json(res, 200, { project, ...saved, folder: folderUrl(project), ...(await listFiles(project.path)), tasks: tasks.map(taskSummary),
        workflow: await assetAudit(project.path, saved.state, tasks) });
    }
    if (parts[2] === 'story' && parts.length === 3 && req.method === 'GET') {
      return json(res, 200, await readStory(project.path));
    }
    if (parts[2] === 'story' && parts[3] === 'series' && parts.length === 4 && req.method === 'GET') {
      return json(res, 200, await readStorySeries(project));
    }
    if (parts[2] === 'story' && parts.length === 3 && req.method === 'PUT') {
      const body = await readJson(req, 8 << 20);
      return await projectTurn(project.id, async () => json(res, 200,
        await saveStory(project.path, body.base, body.plan, body.episodes)));
    }
    if (parts[2] === 'story' && parts[3] === 'episodes' && parts[4] && parts[5] === 'project'
      && parts.length === 6 && req.method === 'POST') {
      const body = await readJson(req);
      const episodeNumber = Number(parts[4]);
      if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1) throw new WanjuError('分集编号无效。');
      return await projectTurn(project.id, async () => json(res, 200,
        await createStoryEpisodeProject(project, body.base, episodeNumber)));
    }
    if (parts[2] === 'story' && parts[3] === 'sources' && parts.length === 4 && req.method === 'POST') {
      const url = new URL(req.url, 'http://localhost');
      const base = url.searchParams.get('base');
      if (!base) throw new WanjuError('请先读取小说工作区版本，再导入原文。');
      if (Number(req.headers['content-length']) > 20 * 1024 * 1024) throw new WanjuError('小说文件不能超过 20 MiB。', 413);
      return await projectTurn(project.id, async () => {
        const current = await readStory(project.path);
        if (base !== current.revision) throw new WanjuError('小说工作区已更新，请重新读取后再导入。', 409);
        const bytes = await readStoryUpload(req);
        return json(res, 200, await importStorySource(project.path, base, url.searchParams.get('name') || '', bytes));
      });
    }
    if (parts[2] === 'story' && parts[3] === 'sources' && parts[4] && parts.length === 5 && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const offset = url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0;
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
      return json(res, 200, await readStorySource(project.path, parts[4], offset, limit));
    }
    if (parts[2] === 'workflow' && parts.length === 3 && req.method === 'POST') {
      return json(res, 200, await enableProjectWorkflow(project, await readJson(req)));
    }
    if (parts.length === 2 && req.method === 'PUT') {
      const body = await readJson(req);
      return await projectTurn(project.id, async () => {
        const current = await readWanju(project.path);
        if (body.base !== current.rev) throw new WanjuError('另一窗口更新了分镜，请刷新后再保存。', 409);
        const saved = await saveWanju(project.path, body.state);
        await syncProjectShots(project, saved.state);
        return json(res, 200, saved);
      });
    }
    if (parts[2] === 'assets' && parts.length === 3 && req.method === 'GET') {
      // Atomic files provide a read snapshot without waiting for a slow image request's mutation lock.
      const saved = await readWanju(project.path);
      const tasks = await generationTasks(project.path);
      return json(res, 200, { project: { id: project.id, name: project.name }, ...saved,
        folder: folderUrl(project), ...(await readAssetCatalog(project.path)), tasks: tasks.map(taskSummary),
        workflow: await assetAudit(project.path, saved.state, tasks) });
    }
    if (parts[2] === 'diagnostics' && parts.length === 3 && req.method === 'GET') {
      const saved = await readWanju(project.path);
      const tasks = await generationTasks(project.path);
      return json(res, 200, productionDiagnostics(project, saved.state, tasks, await assetAudit(project.path, saved.state, tasks),
        await readChatPerformance(project.path)));
    }
    if (parts[2] === 'assets' && parts.length === 3 && req.method === 'PUT') {
      const body = await readJson(req);
      return await projectTurn(project.id, async () => {
        const saved = await readWanju(project.path);
        if (body.base !== saved.rev) throw new WanjuError('分镜已更新，请重新读取后登记资产。', 409);
        const result = await saveAssetCatalog(project.path, saved.state, body);
        return json(res, 200, { ...saved, ...result, workflow: await assetAudit(project.path, saved.state, await generationTasks(project.path)) });
      });
    }
    if (parts[2] === 'assets' && parts[3] === 'recover' && parts.length === 4 && req.method === 'POST') {
      const body = await readJson(req);
      return await projectTurn(project.id, async () => {
        const saved = await readWanju(project.path);
        if (body.base !== saved.rev) throw new WanjuError('分镜已更新，请刷新后恢复图片关联。', 409);
        const tasks = await generationTasks(project.path);
        const report = await assetAudit(project.path, saved.state, tasks);
        if (report.recoverable.length) {
          await mkdir(join(project.path, '.film'), { recursive: true });
          await copyFile(join(project.path, 'wanju.json'), join(project.path, '.film', `wanju-before-image-recovery-${Date.now()}.json`));
        }
        const recovered = await recoverStoryboardImages(project.path, saved.state, tasks);
        const current = recovered.length ? await saveWanju(project.path, saved.state) : saved;
        return json(res, 200, { ...current, recovered, workflow: await assetAudit(project.path, current.state, tasks) });
      });
    }
    if (parts[2] === 'import' && parts.length === 3 && req.method === 'POST') {
      const url = new URL(req.url, 'http://localhost');
      const name = cleanName(basename(url.searchParams.get('name') || '')).replace(/[#%]/g, '_');
      if (!['image', 'video', 'audio'].includes(kindOf(name))) throw new WanjuError('请选择图片、视频或音频文件。');
      const { path } = await importFile(project.path, `assets/${name}`, req);
      let facts;
      try { facts = await probe(project.path, path); }
      catch { throw new WanjuError('素材已保存，但无法读取，请检查文件是否损坏。', 422); }
      if (kindOf(path) === 'audio' ? !facts.audio : !(facts.width > 0 && facts.height > 0)) throw new WanjuError('文件缺少可读取的画面或声音。', 422);
      return await projectTurn(project.id, async () => {
        const current = await readWanju(project.path);
        if (url.searchParams.get('reference_only') === '1') return json(res, 200, { ...current, path, facts });
        const { state } = current;
        if (kindOf(path) === 'audio') state.music = path;
        else {
          if (state.shots.length >= 200) throw new WanjuError('单项目最多 200 个镜头。');
          state.shots.push({ id: nextShotId(state.shots), title: name, description: '', dialogue: '', duration: facts.duration ?? 4, media: path });
        }
        const saved = await saveWanju(project.path, state);
        await syncProjectShots(project, saved.state);
        return json(res, 200, { ...saved, path, facts });
      });
    }
    if (parts[2] === 'assemble' && parts.length === 3 && req.method === 'POST') {
      const body = await readJson(req);
      return await projectTurn(project.id, async () => {
        const current = await readWanju(project.path);
        if (body.base !== current.rev) throw new WanjuError('分镜已更新，请刷新后重试。', 409);
        return json(res, 201, { project: await assembleProject(project, current.state) });
      });
    }
    if (parts[2] === 'generations' && parts.length === 3 && req.method === 'POST') {
      const body = await readJson(req);
      return await projectTurn(project.id, async () => {
        const current = await readWanju(project.path);
        if (body.base !== current.rev) throw new WanjuError('分镜已更新，请保存后再提交。', 409);
        const task = await generateOne(project, current.state, body);
        resumeVideoTasks(project, [task]);
        const latest = await readWanju(project.path);
        const shot = latest.state.shots.find((s) => s.id === task.shot);
        if (latest.rev === current.rev && task.status === 'done' && task.path && shot) {
          bindGeneratedMedia(shot, task);
          const saved = await saveWanju(project.path, latest.state);
          await syncProjectShots(project, saved.state);
        }
        return json(res, 201, { task: taskSummary(task) });
      });
    }
    if (parts[2] === 'generations' && parts[3] && parts[4] === 'query' && parts.length === 5 && req.method === 'POST') {
      await readJson(req);
      const task = await queryVideoTask(project, parts[3]);
      if (wanjuAccess().localMediaAllowed) taskMonitor.watch(project, task, { restart: true });
      return json(res, 200, { task: taskSummary(task) });
    }
    throw new WanjuError('接口不存在。', 404);
  } catch (error) {
    if (error instanceof WanjuError) return json(res, error.status, { error: error.message });
    throw error;
  }
}

export function bindGeneratedMedia(shot, task) {
  if (task.shot && task.shot !== shot.id) throw new WanjuError('生成任务与镜号不一致，未绑定素材。', 409);
  if (task.provider === 'image') {
    shot.image = task.path;
    if (!shotVideo(shot)) shot.media = task.path;
    return;
  }
  if (['h3', 'h3_zm_nono', 'seedance', 'sparkvideo'].includes(task.provider)) {
    shot.video = task.path;
    shot.media = task.path;
  }
}
