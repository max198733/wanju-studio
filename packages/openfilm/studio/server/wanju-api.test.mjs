import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startStudio } from './server.mjs';
import { projectTurn } from './wanju.mjs';
import { writeProjectFilm } from './film.mjs';

let studio, project, rev;
before(async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-http-'));
  process.env.OPENFILM_HOME = join(root, 'home');
  process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
  process.env.OPENFILM_LIBRARY = join(root, 'Projects');
  process.env.WANJU_CONFIG_DIR = join(root, 'empty-config');
  const ffmpeg = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.local/tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin');
  if (existsSync(join(ffmpeg, 'ffprobe.exe'))) process.env.PATH = `${ffmpeg};${process.env.PATH}`;
  studio = await startStudio({ port: 0, openBrowser: () => {} });
});
after(async () => { await studio?.close(); });
async function api(path, body, method = 'POST') {
  const response = await fetch(`${studio.origin}/api/wanju/${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: { 'x-studio-key': studio.key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}
async function rawApi(path, body, name, base) {
  const response = await fetch(`${studio.origin}/api/wanju/${path}?name=${encodeURIComponent(name)}&base=${encodeURIComponent(base)}`, {
    method: 'POST', headers: { 'x-studio-key': studio.key }, body,
  });
  return { response, body: await response.json() };
}
test('Wanju routes retain upstream authentication', async () => {
  const response = await fetch(`${studio.origin}/api/wanju/status`);
  assert.equal(response.status, 401);
  const { body } = await api('status');
  assert.equal(body.providers.length, 9);
  assert.ok(body.providers.some((p) => p.id === 'video'));
  assert.equal(body.providers.every((p) => !p.configured), true);
  assert.equal(body.product.name, 'wanju');
  assert.equal(body.product.version, process.env.WANJU_PRODUCT_VERSION || '0.1.13-dev');
  assert.equal(body.product.channel, process.env.WANJU_PRODUCT_CHANNEL || 'source');
  assert.equal(body.capabilities.boardRevisionChecks, true);
  assert.equal(body.capabilities.persistedGenerationRecovery, true);
  assert.equal(body.capabilities.manualTimelinePlacementProtection, true);
  assert.equal(body.capabilities.paidGenerationIdempotency, false);
  assert.deepEqual(body.productionMode, {
    scope: 'conversation', availableInStatus: false, source: 'desktop chat context',
  });
  assert.deepEqual(body.legacyMediaWorkflow, {
    id: 'album_semiauto',
    generation: 'single-shot-unverified',
    scope: 'server media workflow only; not the desktop chat production mode',
  });
  assert.equal(Object.hasOwn(body, 'mode'), false);
  assert.doesNotMatch(JSON.stringify(body), /api_key|secret_key|bucket_name/);
});
test('creates and reads a board with a signed media folder, without changing the original empty film', async () => {
  const created = await api('projects', { name: '接口验收', ratio: '9:16' });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.reused, false);
  project = created.body.project;
  rev = created.body.rev;
  assert.equal(created.body.state.title, '接口验收');
  assert.equal(created.body.workflow.enabled, true);
  assert.match(created.body.folder, /^http:\/\/localhost:\d+\/p\//);
  const repeated = await api('projects', { name: '接口验收', ratio: '9:16' });
  assert.equal(repeated.body.reused, true);
  assert.equal(repeated.body.project.id, project.id);
  const [concurrentA, concurrentB] = await Promise.all([
    api('projects', { name: '并发重复创建保护', ratio: '16:9' }),
    api('projects', { name: '并发重复创建保护', ratio: '16:9' }),
  ]);
  assert.equal(concurrentA.body.project.id, concurrentB.body.project.id);
  assert.equal([concurrentA.body.reused, concurrentB.body.reused].filter(Boolean).length, 1);
  const separate = await api('projects', { name: '接口验收', ratio: '9:16', reuseExisting: false });
  assert.notEqual(separate.body.project.id, project.id, 'an explicitly separate project remains possible');
  const read = await api(`projects/${project.id}`);
  assert.equal(read.body.rev, rev);
  assert.deepEqual(read.body.tasks, []);
  const diagnostics = await api(`projects/${project.id}/diagnostics`);
  assert.equal(diagnostics.response.status, 200);
  assert.deepEqual(diagnostics.body.chat.turns, []);
  const film = await fetch(`${studio.origin}/api/projects/${project.id}`, { headers: { 'x-studio-key': studio.key } }).then((r) => r.json());
  assert.deepEqual(film.value.tracks, []);
});
test('a stale board cannot overwrite current state', async () => {
  const current = (await api(`projects/${project.id}`)).body;
  const saved = await api(`projects/${project.id}`, { base: rev, state: { ...current.state, script: '新的剧本正文' } }, 'PUT');
  assert.equal(saved.response.status, 200);
  assert.notEqual(saved.body.rev, rev);
  const stale = await api(`projects/${project.id}`, { base: rev, state: current.state }, 'PUT');
  assert.equal(stale.response.status, 409);
  assert.equal((await api(`projects/${project.id}`)).body.state.script, '新的剧本正文');
  rev = saved.body.rev;
});
test('empty assembly is refused, and generation requires confirmation before any provider request', async () => {
  assert.equal((await api(`projects/${project.id}/assemble`, { base: rev })).response.status, 400);
  const { response } = await api(`projects/${project.id}/generations`, { base: rev, shot: 'S001', provider: 'image' });
  assert.equal(response.status, 400);
  assert.deepEqual((await api(`projects/${project.id}`)).body.tasks, []);
});
test('Hedao project creation, asset reads and saves enforce both revision checks', async () => {
  const created = await api('projects', { name: '资产接口验收', workflow: 'hedao' });
  const id = created.body.project.id;
  const saved = (await api(`projects/${id}/assets`)).body;
  assert.equal(saved.workflow.enabled, true);
  assert.equal(saved.catalog.assets.length, 0);
  assert.equal(typeof saved.folder, 'string');
  const patch = { base: saved.rev, assetBase: saved.revision, catalog: { enabled: true,
    assets: [{ id: 'C01', kind: 'character', name: '测试人物', path: '', prompt: '单人人脸特写', references: [] }], bindings: [] } };
  assert.equal((await api(`projects/${id}/assets`, { ...patch, base: 'stale' }, 'PUT')).response.status, 409);
  assert.equal((await api(`projects/${id}/assets`, patch, 'PUT')).response.status, 200);
  assert.equal((await api(`projects/${id}/assets`, patch, 'PUT')).response.status, 409);
  assert.equal((await api(`projects/${id}/assets`)).body.catalog.assets[0].id, 'C01');
});
test('board, asset and diagnostics snapshots remain readable while a generation holds the project mutation lock', async () => {
  let release;
  const blocker = new Promise((done) => { release = done; });
  const held = projectTurn(project.id, () => blocker);
  try {
    for (const suffix of ['', '/assets', '/diagnostics']) {
      const response = await fetch(`${studio.origin}/api/wanju/projects/${project.id}${suffix}`, {
        headers: { 'x-studio-key': studio.key }, signal: AbortSignal.timeout(3000),
      });
      assert.equal(response.status, 200);
      const value = await response.json();
      assert.equal(value.project.id, project.id);
      assert.equal(value.project.name, project.name);
      assert.deepEqual(value.tasks, []);
    }
  } finally { release(); await held; }
});
test('generic desktop project stays native while an explicit drama project enables Hedao', async () => {
  const before = process.env.WANJU_DESKTOP;
  try {
    process.env.WANJU_DESKTOP = '1';
    for (const workflow of [undefined, 'native', 'hedao']) {
      const response = await fetch(`${studio.origin}/api/projects`, {
        method: 'POST', headers: { 'x-studio-key': studio.key, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '原生新建入口', workflow }),
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.workflow.enabled, workflow === 'hedao');
      assert.equal(result.state.shots.length, 0);
      assert.equal((await api(`projects/${result.project.id}/assets`)).body.workflow.enabled, workflow === 'hedao');
    }
  } finally {
    if (before === undefined) delete process.env.WANJU_DESKTOP;
    else process.env.WANJU_DESKTOP = before;
  }
});
test('an independent cut is native without changing the source drama review gates', async () => {
  const before = process.env.WANJU_DESKTOP;
  try {
    process.env.WANJU_DESKTOP = '1';
    const created = await api('projects', { name: '独立初剪流程验收', workflow: 'hedao' });
    const source = created.body.project;
    await mkdir(join(source.path, 'assets'), { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=10',
      '-t', '0.2', '-c:v', 'mpeg4', join(source.path, 'assets/local.mp4')], { windowsHide: true, timeout: 10000 });
    const media = await readFile(join(source.path, 'assets/local.mp4'));
    const state = { ...created.body.state, shots: [
      { id: 'S001', title: '本地镜头', description: '', dialogue: '', duration: 5, media: 'assets/local.mp4' },
    ] };
    const saved = await api(`projects/${source.id}`, { base: created.body.rev, state }, 'PUT');
    assert.equal(saved.response.status, 200);
    const sourceCatalog = await readFile(join(source.path, '.film/wanju-assets.json'), 'utf8');
    const assembled = await api(`projects/${source.id}/assemble`, { base: saved.body.rev });
    assert.equal(assembled.response.status, 201, JSON.stringify(assembled.body));
    const cut = assembled.body.project;
    assert.equal((await api(`projects/${cut.id}/assets`)).body.workflow.enabled, false);
    assert.equal((await api(`projects/${source.id}/assets`)).body.workflow.enabled, true);
    assert.equal(await readFile(join(source.path, '.film/wanju-assets.json'), 'utf8'), sourceCatalog);
    assert.equal(JSON.parse(await readFile(join(cut.path, 'wanju-origin.json'), 'utf8')).sourceProject, source.id);
    assert.deepEqual(await readFile(join(cut.path, 'assets/local.mp4')), media);
    const film = await fetch(`${studio.origin}/api/projects/${cut.id}`, { headers: { 'x-studio-key': studio.key } }).then((response) => response.json());
    assert.equal(film.value.tracks.flatMap((track) => track.clips).length, 1);
  } finally {
    if (before === undefined) delete process.env.WANJU_DESKTOP;
    else process.env.WANJU_DESKTOP = before;
  }
});
test('existing project workflow enable is revision checked, backed up, idempotent and never changes film or media', async () => {
  const created = await api('projects', { name: '旧工程流程补接', workflow: 'native' });
  const p = created.body.project;
  const state = { ...created.body.state, script: '已保存的剧本', shots: [{ id: 'S001', title: '原镜头', description: '走廊有人', dialogue: '', duration: 5, media: 'assets/old.mp4' }] };
  // Existing native edits must not be synchronized or rewritten by enabling workflow.
  await writeFile(join(p.path, 'wanju.json'), JSON.stringify(state));
  const saved = (await api(`projects/${p.id}/assets`)).body;
  const filmBefore = await readFile(join(p.path, 'film.html'), 'utf8');
  const body = { base: saved.rev, assetBase: null };
  assert.equal((await api(`projects/${p.id}/workflow`, { ...body, base: 'stale' })).response.status, 409);
  assert.equal((await api(`projects/${p.id}/workflow`, { base: saved.rev })).response.status, 409);
  const enabled = await api(`projects/${p.id}/workflow`, body);
  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.body.workflow.enabled, true);
  assert.equal(enabled.body.workflow.readyForVideo, false);
  assert.deepEqual(enabled.body.state, saved.state);
  assert.deepEqual(enabled.body.catalog.assets, []);
  assert.equal(await readFile(join(p.path, 'film.html'), 'utf8'), filmBefore);
  assert.equal((await api(`projects/${p.id}/assets`)).body.rev, saved.rev);
  assert.deepEqual(JSON.parse(await readFile(join(p.path, enabled.body.backup), 'utf8')).state, saved.state);
  assert.deepEqual((await api(`projects/${p.id}`)).body.tasks, []);
  const repeated = await api(`projects/${p.id}/workflow`, { base: saved.rev, assetBase: enabled.body.revision });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.revision, enabled.body.revision);
  assert.equal((await readdir(join(p.path, '.film'))).filter((file) => file.startsWith('wanju-before-workflow-')).length, 1);
  const denied = await api(`projects/${p.id}/generations`, { base: saved.rev, shot: 'S001', provider: 'seedance', confirm: true });
  assert.equal(denied.response.status, 422);
  assert.deepEqual((await api(`projects/${p.id}`)).body.tasks, []);
});
test('recovery route backs up the board, restores existing images, leaves film and paid task count intact', async () => {
  const created = await api('projects', { name: '旧图恢复验收' });
  const p = created.body.project;
  const state = { ...created.body.state, shots: [{ id: 'S001', title: '旧镜头', description: '门口有人', dialogue: '', duration: 5, media: '' }] };
  const saved = (await api(`projects/${p.id}`, { base: created.body.rev, state }, 'PUT')).body;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKQAAAAASUVORK5CYII=', 'base64');
  await mkdir(join(p.path, 'assets'), { recursive: true });
  await mkdir(join(p.path, '.film'), { recursive: true });
  await writeFile(join(p.path, 'assets/existing.png'), png);
  const tasks = [{ id: 'old-success', provider: 'image', shot: 'S001', status: 'done', path: 'assets/existing.png' }];
  await writeFile(join(p.path, '.film/wanju-tasks.json'), JSON.stringify(tasks));
  const filmBefore = await readFile(join(p.path, 'film.html'), 'utf8');
  assert.equal((await api(`projects/${p.id}/assets`)).body.workflow.recoverable.length, 1);
  assert.equal((await api(`projects/${p.id}/assets/recover`, { base: 'stale' })).response.status, 409);
  const restored = await api(`projects/${p.id}/assets/recover`, { base: saved.rev });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.state.shots[0].image, 'assets/existing.png');
  assert.equal(restored.body.workflow.counts.storyboardImages, 1);
  assert.equal(await readFile(join(p.path, 'film.html'), 'utf8'), filmBefore);
  assert.deepEqual(JSON.parse(await readFile(join(p.path, '.film/wanju-tasks.json'), 'utf8')), tasks);
  assert.equal((await readdir(join(p.path, '.film'))).some((file) => file.startsWith('wanju-before-image-recovery-')), true);
  const repeated = await api(`projects/${p.id}/assets/recover`, { base: restored.body.rev });
  assert.deepEqual(repeated.body.recovered, []);
});
test('reference-only import keeps assets out of storyboard shots and timeline', async () => {
  const created = await api('projects', { name: '参考图导入验收', workflow: 'hedao' });
  const id = created.body.project.id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKQAAAAASUVORK5CYII=', 'base64');
  const response = await fetch(`${studio.origin}/api/wanju/projects/${id}/import?name=character.png&reference_only=1`, {
    method: 'POST', headers: { 'x-studio-key': studio.key }, body: png,
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body.state.shots, []);
  assert.equal(body.rev, created.body.rev);
  assert.match(body.path, /^assets\/character\.png$/);
});
test('novel intake preserves text as source material and never mutates the storyboard or film timeline', async () => {
  const created = await api('projects', { name: '小说直接导入验收', workflow: 'hedao' });
  const id = created.body.project.id;
  const before = (await api(`projects/${id}`)).body;
  const filmBefore = await fetch(`${studio.origin}/api/projects/${id}`, { headers: { 'x-studio-key': studio.key } }).then((r) => r.json());
  const original = Buffer.from('第一章 初见\n林夏收到一封信。\n第二章 回城\n她回到旧城。', 'utf8');

  const blank = await api(`projects/${id}/story`);
  assert.deepEqual(blank.body.story, { version: 1, sources: [], plan: null, episodes: [] });
  const imported = await rawApi(`projects/${id}/story/sources`, original, '原著.txt', blank.body.revision);
  assert.equal(imported.response.status, 200, JSON.stringify(imported.body));
  assert.equal(imported.body.source.chapterCount, 2);
  assert.equal(imported.body.source.encoding, 'utf-8');
  assert.match(imported.body.source.path, /^剧本资料\/原著\//);
  assert.equal(imported.body.preview, original.toString('utf8'));
  assert.deepEqual(await readFile(join(created.body.project.path, imported.body.source.path)), original);

  const page = await api(`projects/${id}/story/sources/${imported.body.source.id}?offset=0&limit=16`);
  assert.equal(page.body.offset, 0);
  assert.ok(page.body.nextOffset > 0);
  const remaining = await api(`projects/${id}/story/sources/${imported.body.source.id}?offset=${page.body.nextOffset}&limit=12000`);
  assert.equal(remaining.body.done, true);
  assert.match(page.body.content + remaining.body.content, /林夏收到一封信/);

  const plan = {
    format: 'series', title: '旧城来信', logline: '一封迟到的信改变了两个人的选择。',
    synopsis: '林夏在旧城寻找写信人。', adaptationNotes: '', style: '现实主义',
    ratio: '9:16', targetEpisodeSeconds: null, plannedEpisodes: null,
    characters: [], scenes: [], props: [],
    episodeOutlines: [{ number: 1, title: '迟到的信', summary: '林夏找到旧信。', hook: '信上有她的名字。' }],
  };
  const saved = await api(`projects/${id}/story`, {
    base: imported.body.revision, plan,
    episodes: [{ number: 1, title: '迟到的信', script: '内景，林夏拆开信封。' }],
  }, 'PUT');
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.story.episodes[0].script, '内景，林夏拆开信封。');
  const stale = await api(`projects/${id}/story`, {
    base: imported.body.revision, plan, episodes: [],
  }, 'PUT');
  assert.equal(stale.response.status, 409);

  const after = await api(`projects/${id}`);
  assert.equal(after.body.rev, before.rev);
  assert.deepEqual(after.body.state, before.state);
  const filmAfter = await fetch(`${studio.origin}/api/projects/${id}`, { headers: { 'x-studio-key': studio.key } }).then((r) => r.json());
  assert.deepEqual(filmAfter.value, filmBefore.value);
  assert.deepEqual(after.body.tasks, []);
});
test('episode projects are owned, repeatable, preserve edits and cannot be forged or detached by story saves', async () => {
  const created = await api('projects', { name: '分集工程关联验收', workflow: 'hedao' });
  const parent = created.body.project;
  const plan = {
    format: 'series', title: '回到旧城', logline: '一封信带来改变。',
    synopsis: '林夏回到旧城。', adaptationNotes: '', style: '现实主义',
    ratio: '9:16', targetEpisodeSeconds: 90, plannedEpisodes: 2,
    characters: [], scenes: [], props: [],
    episodeOutlines: [
      { number: 1, title: '迟到的信', summary: '收到一封信。', hook: '寄信人是故人。' },
      { number: 2, title: '旧街重逢', summary: '她找到旧街。', hook: '有人认出她。' },
    ],
  };
  const saved = await api(`projects/${parent.id}/story`, {
    base: (await api(`projects/${parent.id}/story`)).body.revision,
    plan,
    episodes: [
      { number: 1, title: '迟到的信', script: '内景，林夏拆开信封。' },
      { number: 2, title: '旧街重逢', script: '外景，林夏走进旧街。' },
    ],
  }, 'PUT');
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
  assert.ok(saved.body.story.seriesId);
  const originalFilm = (await fetch(`${studio.origin}/api/projects/${parent.id}`, {
    headers: { 'x-studio-key': studio.key },
  }).then((response) => response.json())).value;

  const opened = await api(`projects/${parent.id}/story/episodes/1/project`, { base: saved.body.revision });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.body));
  assert.notEqual(opened.body.project.id, parent.id);
  assert.equal(opened.body.seeded, true);
  assert.equal(opened.body.story.episodes[0].projectId, opened.body.project.id);
  assert.equal(await readFile(join(opened.body.project.path, '.film/wanju-episode.json'), 'utf8')
    .then(JSON.parse).then((marker) => marker.seriesId), saved.body.story.seriesId);
  assert.equal((await api(`projects/${opened.body.project.id}`)).body.state.script, '内景，林夏拆开信封。');

  const savedAgain = await api(`projects/${parent.id}/story`, {
    base: opened.body.revision, plan, episodes: [
      { number: 1, title: '迟到的信', script: '人工修改后的剧本。', projectId: 'forged-project' },
      { number: 2, title: '旧街重逢', script: '外景，林夏走进旧街。' },
    ],
  }, 'PUT');
  assert.equal(savedAgain.response.status, 200, JSON.stringify(savedAgain.body));
  assert.equal(savedAgain.body.story.episodes[0].projectId, opened.body.project.id);
  assert.equal(savedAgain.body.story.episodes[0].script, '人工修改后的剧本。');

  const reopened = await api(`projects/${parent.id}/story/episodes/1/project`, { base: savedAgain.body.revision });
  assert.equal(reopened.response.status, 200, JSON.stringify(reopened.body));
  assert.equal(reopened.body.project.id, opened.body.project.id);
  assert.equal(reopened.body.seeded, false);
  assert.equal((await api(`projects/${opened.body.project.id}`)).body.state.script, '内景，林夏拆开信封。');

  const cleared = await api(`projects/${parent.id}/story`, {
    base: reopened.body.revision, plan, episodes: [{ number: 1, title: '迟到的信', script: '' }],
  }, 'PUT');
  assert.equal(cleared.body.story.episodes[0].projectId, opened.body.project.id);
  assert.equal(cleared.body.story.seriesId, saved.body.story.seriesId);
  const parentFilm = await fetch(`${studio.origin}/api/projects/${parent.id}`, {
    headers: { 'x-studio-key': studio.key },
  }).then((response) => response.json());
  assert.deepEqual(parentFilm.value, originalFilm);
  assert.deepEqual((await api(`projects/${parent.id}`)).body.tasks, []);
});
test('series index resolves linked episodes from the series and episode projects', async () => {
  const parent = (await api('projects', { name: '系列导航验收', workflow: 'hedao', reuseExisting: false })).body.project;
  const plan = {
    format: 'series', title: '雨夜来信', logline: '一封信改变了两个人。',
    synopsis: '主角沿着线索寻找寄信人。', adaptationNotes: '', style: '悬疑现实主义',
    ratio: '9:16', targetEpisodeSeconds: 90, plannedEpisodes: 2,
    characters: [], scenes: [], props: [],
    episodeOutlines: [
      { number: 1, title: '第一封信', summary: '收到来信。', hook: '落款是失踪的人。' },
      { number: 2, title: '旧车站', summary: '寻找车站线索。', hook: '有人留下录音。' },
    ],
  };
  const saved = await api(`projects/${parent.id}/story`, {
    base: (await api(`projects/${parent.id}/story`)).body.revision,
    plan,
    episodes: [
      { number: 1, title: '第一封信', script: '林夏拆开信。' },
      { number: 2, title: '旧车站', script: '林夏走进车站。' },
    ],
  }, 'PUT');
  const first = await api(`projects/${parent.id}/story/episodes/1/project`, { base: saved.body.revision });
  const second = await api(`projects/${parent.id}/story/episodes/2/project`, { base: first.body.revision });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  for (const child of [first.body.project, second.body.project]) {
    const marker = JSON.parse(await readFile(join(child.path, '.film/wanju-episode.json'), 'utf8'));
    assert.equal(marker.parentProjectId, parent.id);
    assert.equal(marker.seriesId, saved.body.story.seriesId);
  }

  const archived = await api(`projects/${parent.id}/story`, {
    base: second.body.revision, plan,
    episodes: second.body.story.episodes.map((episode) => episode.number === 1 ? { ...episode, archived: true } : episode),
  }, 'PUT');
  assert.equal(archived.response.status, 200, JSON.stringify(archived.body));
  assert.equal(archived.body.story.episodes[0].projectId, first.body.project.id);
  assert.equal(archived.body.story.episodes[0].archived, true);

  const expectedEpisodes = [
    { number: 1, title: '第一封信', projectId: first.body.project.id, projectName: first.body.project.name, archived: true },
    { number: 2, title: '旧车站', projectId: second.body.project.id, projectName: second.body.project.name },
  ];
  const fromParent = await api(`projects/${parent.id}/story/series`);
  assert.equal(fromParent.response.status, 200);
  assert.equal(fromParent.body.currentEpisode, null);
  assert.deepEqual(fromParent.body.series.episodes, expectedEpisodes);

  const fromEpisode = await api(`projects/${second.body.project.id}/story/series`);
  assert.equal(fromEpisode.response.status, 200);
  assert.equal(fromEpisode.body.currentEpisode, 2);
  assert.equal(fromEpisode.body.series.projectId, parent.id);
  assert.deepEqual(fromEpisode.body.series.episodes, expectedEpisodes);

  const restored = await api(`projects/${parent.id}/story`, {
    base: archived.body.revision, plan,
    episodes: archived.body.story.episodes.map((episode) => episode.number === 1 ? { ...episode, archived: false } : episode),
  }, 'PUT');
  assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.story.episodes[0].archived, undefined);
  assert.equal(restored.body.story.episodes[0].projectId, first.body.project.id);
  assert.ok(await readFile(join(first.body.project.path, '.film/wanju-episode.json'), 'utf8'));
  const afterRestore = await api(`projects/${parent.id}/story/series`);
  assert.equal(afterRestore.body.series.episodes[0].archived, undefined);
  assert.equal(afterRestore.body.series.episodes[0].projectId, first.body.project.id);
});
test('starting an episode with an existing native timeline links the project without seeding over it', async () => {
  const parent = (await api('projects', { name: '不覆盖分集验收', workflow: 'hedao' })).body.project;
  const plan = {
    format: 'series', title: '不覆盖分集', logline: '', synopsis: '', adaptationNotes: '', style: '',
    ratio: '9:16', targetEpisodeSeconds: null, plannedEpisodes: 1,
    characters: [], scenes: [], props: [],
    episodeOutlines: [{ number: 1, title: '第一集', summary: '', hook: '' }],
  };
  const saved = await api(`projects/${parent.id}/story`, {
    base: (await api(`projects/${parent.id}/story`)).body.revision,
    plan, episodes: [{ number: 1, title: '第一集', script: '新剧本内容' }],
  }, 'PUT');
  const story = saved.body.story;
  const child = (await api('projects', { name: '已有人工时间线', workflow: 'native', reuseExisting: false })).body.project;
  await mkdir(join(child.path, '.film'), { recursive: true });
  await writeFile(join(child.path, '.film/wanju-episode.json'), JSON.stringify({
    version: 1, seriesId: story.seriesId, episodeNumber: 1,
  }));
  await writeProjectFilm(child.path, {
    stage: { w: 1080, h: 1920 },
    tracks: [{ clips: [{ id: 'manual-clip', src: 'assets/existing.mp4', at: 0 }] }],
  });
  const filmBefore = await readFile(join(child.path, 'film.html'), 'utf8');
  const opened = await api(`projects/${parent.id}/story/episodes/1/project`, { base: saved.body.revision });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.project.id, child.id);
  assert.equal(opened.body.seeded, false);
  assert.equal((await api(`projects/${child.id}`)).body.state.script, '');
  assert.equal(await readFile(join(child.path, 'film.html'), 'utf8'), filmBefore);
  const filmAfter = await fetch(`${studio.origin}/api/projects/${child.id}`, {
    headers: { 'x-studio-key': studio.key },
  }).then((response) => response.json());
  assert.deepEqual(filmAfter.value.tracks[0].clips.map((clip) => clip.id), ['manual-clip']);
});
