import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetPath, blankState, nextShotId, shotImage, shotVideo, shotPlanRev, timelineOf, validateState, stateRev } from './wanju-model.mjs';
import { bindGeneratedMedia, providerStatus, projectTurn, queryVideoTask, readWanju, saveWanju, syncReadyShots } from './wanju.mjs';
import { readProjectFilm, writeProjectFilm } from './film.mjs';
import { generateOne, generationTasks } from './wanju-generation.mjs';

const shot = (patch = {}) => ({ id: 'S001', title: '海边来信', description: '', dialogue: '', duration: 6, media: 'assets/scene.mp4', ...patch });
test('assembly preserves IDs, sequence, ratio and clamps video to its actual duration', () => {
  const film = timelineOf({ ...blankState(), music: 'assets/music.mp3', shots: [
    shot(),
    shot({ id: 'S009', media: 'assets/photo.jpg', duration: 4 }),
    shot({ id: 'S010', media: 'assets/next.mp4', duration: 3 }),
  ] }, { 'assets/scene.mp4': 2.5, 'assets/music.mp3': 3 });
  assert.deepEqual(film.stage, { w: 1080, h: 1920 });
  assert.deepEqual(film.tracks[0].clips.map((c) => [c.id, c.at, c.time]), [['S001', 0, [0, 2.5]], ['S010', 10, [0, 3]]]);
  assert.deepEqual(film.tracks[1].clips[0].time, [0, 3]);
});
test('omits pending shots and storyboard images while preserving planned positions', () => {
  const film = timelineOf({ ...blankState(), shots: [
    shot({ id: 'S001', media: '' }),
    shot({ id: 'S002', media: 'assets/scene.png', duration: 5 }),
    shot({ id: 'S003', media: '' }),
    shot({ id: 'S004', media: 'assets/final.mp4', duration: 5 }),
  ] });
  assert.deepEqual(film.tracks[0].clips.map((c) => [c.id, c.at, c.time]), [['S004', 17, [0, 5]]]);
});
test('keeps the storyboard image as reference when generated video is bound', () => {
  const legacy = validateState({ ...blankState(), shots: [shot({ media: 'assets/reference.png' })] }).shots[0];
  assert.equal(shotImage(legacy), 'assets/reference.png');
  assert.equal(shotVideo(legacy), '');

  bindGeneratedMedia(legacy, { provider: 'h3_zm_nono', path: 'assets/final.mp4' });
  const checked = validateState({ ...blankState(), shots: [legacy] }).shots[0];
  assert.equal(shotImage(checked), 'assets/reference.png');
  assert.equal(shotVideo(checked), 'assets/final.mp4');
  assert.deepEqual(timelineOf({ ...blankState(), shots: [checked] }).tracks[0].clips.map((clip) => clip.src), ['assets/final.mp4']);

  bindGeneratedMedia(checked, { provider: 'image', path: 'assets/revised.png' });
  assert.equal(shotImage(checked), 'assets/revised.png');
  assert.equal(shotVideo(checked), 'assets/final.mp4');
});
test('rejects invalid duration, duplicate IDs and paths escaping assets', () => {
  for (const path of ['../key', 'assets/../config.json', 'assets/.env', 'assets/a.mp4:stream', 'assets\\a.mp4', 'https://site/a.mp4']) assert.throws(() => assetPath(path));
  assert.deepEqual(timelineOf({ ...blankState(), shots: [] }).tracks, []);
  assert.deepEqual(timelineOf({ ...blankState(), shots: [shot({ media: '' })] }).tracks, []);
  assert.throws(() => validateState({ ...blankState(), shots: [shot({ duration: NaN })] }));
  assert.throws(() => validateState({ ...blankState(), shots: [shot(), shot()] }));
  assert.equal(nextShotId([shot(), shot({ id: 'S003' })]), 'S002');
});
test('only a successful video shot appears in the same OpenFilm timeline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-timeline-'));
  const project = { path: root };
  const state = { ...blankState(), shots: [
    shot({ id: 'S001', media: 'assets/first.mp4', duration: 4 }),
    shot({ id: 'S002', media: '', duration: 5 }),
  ] };
  const dependencies = { probe: async (_root, path) => ({ duration: path.includes('second') ? 5 : 4 }) };
  let synced = await syncReadyShots(project, state, dependencies);
  assert.deepEqual(synced.value.tracks[0].clips.map((clip) => [clip.id, clip.src, Number(clip.at ?? 0), clip.time]), [['wjshot-S001', 'assets/first.mp4', 0, [0, 4]]]);
  state.shots[1].media = 'assets/second.png';
  synced = await syncReadyShots(project, state, dependencies);
  assert.deepEqual(synced.value.tracks[0].clips.map((clip) => [clip.id, clip.src, Number(clip.at ?? 0), clip.time]), [
    ['wjshot-S001', 'assets/first.mp4', 0, [0, 4]],
  ]);
  state.shots[1].media = 'assets/second.mp4';
  synced = await syncReadyShots(project, state, dependencies);
  assert.deepEqual(synced.value.tracks[0].clips.map((clip) => [clip.id, clip.src, Number(clip.at ?? 0), clip.time]), [
    ['wjshot-S001', 'assets/first.mp4', 0, [0, 4]],
    ['wjshot-S002', 'assets/second.mp4', 4, [0, 5]],
  ]);
  state.shots[0].media = '';
  synced = await syncReadyShots(project, state, dependencies);
  assert.deepEqual(synced.value.tracks[0].clips.map((clip) => clip.id), ['wjshot-S002']);
});
test('timeline sync adopts an identical native clip without stacking it and preserves its edits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-duplicate-'));
  const project = { path: root };
  const state = { ...blankState(), shots: [shot({ media: 'assets/final.mp4', duration: 4 })] };
  const managed = { id: 'wjshot-S001', src: 'assets/final.mp4', at: 0, time: [0, 4],
    attrs: { 'data-wanju-auto': JSON.stringify({ shot: 'S001', src: 'assets/final.mp4', at: 0, time: [0, 4] }) } };
  const native = { id: 'S001', src: 'assets/final.mp4', at: 0, time: [0, 4], style: 'filter: brightness(0)' };
  await writeProjectFilm(root, { stage: { w: 1080, h: 1920 }, tracks: [{ clips: [native] }] });
  const synced = await syncReadyShots(project, state, { probe: async () => ({ duration: 4 }) });
  const clips = synced.value.tracks.flatMap((track) => track.clips);
  assert.equal(clips.length, 1);
  assert.equal(clips[0].id, 'S001');
  assert.match(clips[0].style, /brightness\(0\)/);
  assert.equal(JSON.parse(clips[0].attrs['data-wanju-auto']).shot, 'S001');
  await writeProjectFilm(root, { stage: { w: 1080, h: 1920 }, tracks: [{ clips: [native] }, { clips: [managed] }] });
  const conflicting = await syncReadyShots(project, state, { probe: async () => ({ duration: 4 }) });
  assert.equal(conflicting.value.tracks.flatMap((track) => track.clips).length, 2);
  assert.match(conflicting.value.tracks[0].clips[0].style, /brightness\(0\)/);
});
for (const native of [false, true]) {
  for (const edit of [{ at: 2 }, { time: [1, 3] }]) {
    test(`repeated sync preserves ${native ? 'adopted' : 'automatic'} clip ${edit.at ? 'movement' : 'trimming'} after a shot is unlinked`, async (t) => {
      const root = await mkdtemp(join(tmpdir(), 'wanju-manual-edit-'));
      t.after(() => rm(root, { recursive: true, force: true }));
      const project = { path: root };
      const state = { ...blankState(), shots: [shot({ media: 'assets/final.mp4', duration: 4 })] };
      const dependencies = { probe: async () => ({ duration: 4 }) };
      if (native) await writeProjectFilm(root, {
        stage: { w: 1080, h: 1920 },
        tracks: [{ clips: [{ id: 'S001', src: 'assets/final.mp4', at: 0, time: [0, 4] }] }],
      });
      let film = await syncReadyShots(project, state, dependencies);
      Object.assign(film.value.tracks[0].clips[0], edit);
      await writeProjectFilm(root, film.value);
      film = await syncReadyShots(project, state, dependencies);
      let clips = film.value.tracks.flatMap((track) => track.clips);
      assert.equal(clips.length, 1, 'sync must reuse a previously adopted clip after manual edits');
      assert.equal(JSON.parse(clips[0].attrs['data-wanju-auto']).at, 0);
      assert.deepEqual(JSON.parse(clips[0].attrs['data-wanju-auto']).time, [0, 4]);
      state.shots[0].media = 'assets/replacement.mp4';
      await syncReadyShots(project, state, dependencies);
      film = await syncReadyShots(project, { ...state, shots: [] }, dependencies);
      clips = film.value.tracks.flatMap((track) => track.clips);
      assert.equal(clips.length, 1, 'unlinking a shot must preserve manually edited clips');
      assert.equal(clips[0].src, 'assets/replacement.mp4');
      assert.equal(Number(clips[0].at ?? 0), edit.at ?? 0);
      assert.deepEqual(clips[0].time, edit.time ?? [0, 4]);
    });
  }
}
test('board persists, concurrent updates serialize and revisions change with content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-state-'));
  const state = { ...blankState(), shots: [shot()] };
  const saved = await saveWanju(root, state);
  assert.deepEqual(await readWanju(root), saved);
  assert.notEqual(stateRev(state), stateRev({ ...state, title: 'another' }));
  const order = [];
  await Promise.all([projectTurn('test', async () => { await Promise.resolve(); order.push(1); }), projectTurn('test', async () => order.push(2))]);
  assert.deepEqual(order, [1, 2]);
});
test('completed background tasks bind to the native timeline once and preserve manual media changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-complete-'));
  const project = { id: root, path: root };
  await saveWanju(root, { ...blankState(), shots: [shot({ media: 'assets/reference.png' })] });
  const task = { id: 'task-1', shot: 'S001', provider: 'h3', status: 'done', path: 'assets/final.mp4', imageBefore: 'assets/reference.png', videoBefore: '' };
  task.shotPlan = shotPlanRev((await readWanju(root)).state, (await readWanju(root)).state.shots[0]);
  const dependencies = { query: async () => task, probe: async () => ({ duration: 4 }) };
  await queryVideoTask(project, task.id, dependencies);
  await queryVideoTask(project, task.id, dependencies);
  const board = await readWanju(root);
  assert.equal(shotImage(board.state.shots[0]), 'assets/reference.png');
  assert.equal(shotVideo(board.state.shots[0]), 'assets/final.mp4');
  const film = await readProjectFilm(root);
  assert.deepEqual(film.value.tracks.flatMap((track) => track.clips.map((clip) => clip.src)), ['assets/final.mp4']);
  await saveWanju(root, { ...board.state, shots: [shot({ media: 'assets/manual.mp4', video: 'assets/manual.mp4', image: 'assets/reference.png' })] });
  await queryVideoTask(project, task.id, dependencies);
  assert.equal(shotVideo((await readWanju(root)).state.shots[0]), 'assets/manual.mp4');
});

test('a completed task can recover timeline synchronization after its board save succeeded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-sync-recovery-'));
  const project = { id: root, path: root };
  await saveWanju(root, { ...blankState(), shots: [shot({ media: 'assets/reference.png' })] });
  const task = { id: 'task-2', shot: 'S001', provider: 'h3', status: 'done', path: 'assets/final.mp4', mediaBefore: 'assets/reference.png' };
  task.shotPlan = shotPlanRev((await readWanju(root)).state, (await readWanju(root)).state.shots[0]);
  let attempts = 0;
  const dependencies = { query: async () => task, probe: async () => {
    if (++attempts === 1) throw new Error('temporary local failure');
    return { duration: 4 };
  } };
  await assert.rejects(queryVideoTask(project, task.id, dependencies), /temporary local failure/);
  assert.equal(shotVideo((await readWanju(root)).state.shots[0]), 'assets/final.mp4');
  await queryVideoTask(project, task.id, dependencies);
  assert.equal((await readProjectFilm(root)).value.tracks[0].clips[0].src, 'assets/final.mp4');
});
test('recovering a delivered image associates only the original shot and never creates a timeline clip', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKQAAAAASUVORK5CYII=', 'base64');
  for (const changed of [false, true]) {
    const root = await mkdtemp(join(tmpdir(), 'wanju-recover-image-'));
    const project = { id: root, path: root };
    const original = { ...blankState(), shots: [shot({ description: '原来的故事', media: '' })] };
    await saveWanju(root, original);
    await assert.rejects(generateOne(project, original, { provider: 'image', shot: 'S001', confirm: true }, {
      config: async () => ({ api_key: 'MOCK_RECOVERY_KEY', model: 'mock' }),
      fetch: async () => Response.json({ data: [{ url: 'https://example.com/original.png' }] }),
      download: async () => { throw new Error('failed delivery'); },
    }));
    const [failed] = await generationTasks(root);
    if (changed) await saveWanju(root, { ...original, title: '另一个故事' });
    const result = await queryVideoTask(project, failed.id, { generation: {
      fetch: () => assert.fail('no paid retry'), download: async () => ({ bytes: png }),
      probe: async () => ({ width: 1, height: 1 }),
    } });
    assert.equal(result.status, 'done');
    assert.equal(shotImage((await readWanju(root)).state.shots[0]), changed ? '' : result.path);
    if (changed) {
      assert.match(result.bindingWarning, /未自动替换/);
      assert.equal((await generationTasks(root))[0].bindingWarning, result.bindingWarning, 'refresh preserves the warning');
    }
    assert.equal((await readProjectFilm(root)).value, null);
  }
});
test('malformed state never falls back to an empty board', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-invalid-'));
  await writeFile(join(root, 'wanju.json'), '{broken');
  await assert.rejects(readWanju(root), /无法读取/);
  assert.equal(await readFile(join(root, 'wanju.json'), 'utf8'), '{broken');
});
test('late results cannot bind a recycled shot number, a changed story, or another project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-late-task-'));
  const project = { id: 'current-project', path: root };
  const original = validateState({ ...blankState(), title: '广告', shots: [shot({ media: '' })] });
  const task = { id: 'late-result', shot: 'S001', provider: 'h3', status: 'done', path: 'assets/old.mp4',
    projectId: project.id, shotPlan: shotPlanRev(original, original.shots[0]), imageBefore: '', videoBefore: '' };
  const changed = { ...original, title: '新悬疑剧', shots: [{ ...original.shots[0], description: '陌生人在门外' }] };
  await saveWanju(root, changed);
  const result = await queryVideoTask(project, task.id, { query: async () => ({ ...task }) });
  assert.match(result.bindingWarning, /未自动放入/);
  assert.equal(shotVideo((await readWanju(root)).state.shots[0]), '');
  assert.equal((await readProjectFilm(root)).value, null);
  await saveWanju(root, original);
  const foreign = await queryVideoTask(project, task.id, { query: async () => ({ ...task, projectId: 'different-project' }) });
  assert.match(foreign.bindingWarning, /未自动放入/);
  const legacy = await queryVideoTask(project, task.id, { query: async () => ({ ...task, shotPlan: undefined }) });
  assert.match(legacy.bindingWarning, /旧任务/);
  assert.throws(() => bindGeneratedMedia(original.shots[0], { ...task, shot: 'S002' }), /镜号不一致/);
});
test('credential status never returns API keys or COS identifiers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-config-'));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'xem8k5_gpt_image_config.json'), JSON.stringify({ api_key: 'SECRET_IMAGE', base_url: 'https://private.example' }));
  await writeFile(join(root, 'cos_config.json'), JSON.stringify({ secret_id: 'SECRET_ID', secret_key: 'SECRET_KEY', bucket: 'PRIVATE_BUCKET' }));
  const status = await providerStatus(root);
  assert.equal(status.find((p) => p.id === 'image').configured, true);
  assert.equal(status.find((p) => p.id === 'seedance').configured, false);
  assert.doesNotMatch(JSON.stringify(status), /SECRET|PRIVATE_BUCKET|private\.example/);
});
