import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankState, stateRev } from './wanju-model.mjs';
import { archiveWorkflowImage, assetAudit, generationAssetContext, prepareAssetReviewsForSync, readAssetCatalog, recoverStoryboardImages, saveAssetCatalog } from './wanju-assets.mjs';
import { generateOne, generationTasks, queryImage } from './wanju-generation.mjs';
import { bindGeneratedMedia, readWanju, saveWanju } from './wanju.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKQAAAAASUVORK5CYII=', 'base64');
const shot = { id: 'S001', title: '门后的脚步', description: '林夏握住门把，回头看向走廊。', dialogue: '谁在外面？', duration: 5, media: '' };
const deps = {
  config: async () => ({ api_key: 'MOCK_PRIVATE_KEY', model: 'mock-image' }),
  probe: async () => ({ width: 1, height: 1 }),
  fetch: async () => Response.json({ data: [{ b64_json: png.toString('base64') }], usage: { input_tokens_details: { image_tokens: 20 } } }),
};
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), '玩剧-资产闭环-'));
  await mkdir(join(path, 'assets'));
  const state = { ...blankState(), script: '林夏听到门外脚步声，发现一封旧信。', shots: [{ ...shot }] };
  await saveWanju(path, state);
  return { project: { id: path, path, name: '悬疑试拍' }, state };
}
function plan(paths = false) {
  return {
    enabled: true,
    assets: [
      { id: 'C01', kind: 'character', name: '林夏身份', prompt: '林夏单人人脸特写，黑色短发。', path: paths ? 'assets/hero.png' : '', references: [] },
      { id: 'SC01', kind: 'scene', name: '走廊', prompt: '夜晚的窄走廊，左侧木门。', path: paths ? 'assets/scene.png' : '', references: [] },
    ],
    bindings: [{ shot: 'S001', assetIds: ['C01', 'SC01'] }],
  };
}
async function approvedAssets(p, state) {
  for (const file of ['hero.png', 'scene.png']) await writeFile(join(p.path, 'assets', file), png);
  return saveAssetCatalog(p.path, state, {
    assetBase: null, catalog: { ...plan(true), assets: plan(true).assets.map((a) => ({ ...a, approved: true, reviewNote: '已查看真实图片，身份、服装或空间符合剧本。' })) },
  });
}

test('reviewed images survive another computer but a changed image invalidates both approval gates', async () => {
  const { project: p, state } = await fixture();
  await writeFile(join(p.path, 'assets/shot.png'), png);
  state.shots[0].image = 'assets/shot.png';
  const reviewed = await approvedAssets(p, state);
  await saveAssetCatalog(p.path, state, { assetBase: reviewed.revision, approveStoryboard: true, reviewNote: '已查看全部真实图片，确认逐镜身份、场景与剧本。' });
  assert.equal((await assetAudit(p.path, state)).readyForVideo, true);
  const restored = await mkdtemp(join(tmpdir(), 'wanju-portable-review-'));
  await cp(p.path, restored, { recursive: true });
  for (const name of ['hero.png', 'scene.png', 'shot.png']) await utimes(join(restored, 'assets', name), new Date(2000, 0, 1), new Date(2000, 0, 1));
  assert.equal((await assetAudit(restored, state)).readyForVideo, true);
  await writeFile(join(restored, 'assets/hero.png'), Buffer.concat([png, Buffer.from('changed content')]));
  const changed = await assetAudit(restored, state);
  assert.equal(changed.assets[0].approved, false);
  assert.equal(changed.storyboardApproved, false);
  assert.equal(changed.readyForVideo, false);
});

test('sync upgrades only still-valid legacy approvals without approving missing or changed assets', async () => {
  const { project: p, state } = await fixture();
  await approvedAssets(p, state);
  const current = await readAssetCatalog(p.path);
  for (const asset of current.catalog.assets) {
    const info = await stat(join(p.path, asset.path));
    asset.approval = stateRev({ path: asset.path, size: info.size, modified: info.mtimeMs });
  }
  await writeFile(join(p.path, '.film/wanju-assets.json'), JSON.stringify(current.catalog));
  assert.equal((await assetAudit(p.path, state)).assets.every((asset) => asset.approved), true);
  await writeFile(join(p.path, 'assets/scene.png'), Buffer.concat([png, Buffer.from('changed')]));
  await prepareAssetReviewsForSync(p.path);
  const migrated = await readAssetCatalog(p.path);
  assert.match(migrated.catalog.assets[0].approval, /^sha256:/);
  assert.equal(migrated.catalog.assets[1].approval, undefined);
  assert.equal((await assetAudit(p.path, state)).storyboardApproved, false);
});

test('an independent asset recovers delivery and workflow copies without creating a shot', async () => {
  const { project: p, state } = await fixture();
  await saveAssetCatalog(p.path, state, { assetBase: null, catalog: plan() });
  await assert.rejects(generateOne(p, state, { provider: 'image', assetId: 'C01', confirm: true }, {
    ...deps, fetch: async () => Response.json({ data: [{ url: 'https://example.com/hero.png' }] }),
    download: async () => { throw new Error('failed delivery'); },
  }));
  const [task] = await generationTasks(p.path);
  const recovered = await queryImage(p, task.id, {
    ...deps, fetch: () => assert.fail('no generation retry'), download: async () => ({ bytes: png }),
  });
  const { catalog } = await readAssetCatalog(p.path);
  assert.equal(catalog.assets[0].path, recovered.path);
  assert.match(recovered.workflowPath, /^02-角色\/01-定妆照\//);
  assert.deepEqual(await readFile(join(p.path, recovered.workflowPath)), png);
  assert.equal(catalog.assets[0].approval, undefined);
  assert.equal((await readWanju(p.path)).state.shots.length, 1);
});
test('recovering an older asset preserves a manually selected image and its approval', async () => {
  const { project: p, state } = await fixture();
  await saveAssetCatalog(p.path, state, { assetBase: null, catalog: plan() });
  await assert.rejects(generateOne(p, state, { provider: 'image', assetId: 'C01', confirm: true }, {
    ...deps, fetch: async () => Response.json({ data: [{ url: 'https://example.com/hero.png' }] }),
    download: async () => { throw new Error('failed delivery'); },
  }));
  const [task] = await generationTasks(p.path);
  await writeFile(join(p.path, 'assets/manual.png'), png);
  const current = await readAssetCatalog(p.path);
  current.catalog.assets[0].path = 'assets/manual.png';
  current.catalog.assets[0].approved = true;
  current.catalog.assets[0].reviewNote = '已人工查看这张图片，确认身份符合要求。';
  await saveAssetCatalog(p.path, state, { assetBase: current.revision, catalog: current.catalog });
  const recovered = await queryImage(p, task.id, {
    ...deps, fetch: () => assert.fail('no paid retry'), download: async () => ({ bytes: png }),
  });
  assert.equal(recovered.status, 'done');
  assert.match(recovered.error, /资产绑定未完成/);
  assert.equal(recovered.recoveryAvailable, true);
  const saved = await readAssetCatalog(p.path);
  assert.equal(saved.catalog.assets[0].path, 'assets/manual.png');
  assert.ok(saved.catalog.assets[0].approval);
});
test('repeating an already bound asset archive preserves its subsequent human review', async () => {
  const { project: p, state } = await fixture();
  await saveAssetCatalog(p.path, state, { assetBase: null, catalog: plan() });
  const context = await generationAssetContext(p.path, state, { provider: 'image', assetId: 'C01' });
  const task = await generateOne(p, state, { provider: 'image', assetId: 'C01', confirm: true }, deps);
  const current = await readAssetCatalog(p.path);
  current.catalog.assets[0].approved = true;
  current.catalog.assets[0].reviewNote = '已查看实际定妆照，确认人物身份和服装。';
  const reviewed = await saveAssetCatalog(p.path, state, { assetBase: current.revision, catalog: current.catalog });
  await archiveWorkflowImage(p.path, task, context);
  const saved = await readAssetCatalog(p.path);
  assert.equal(saved.revision, reviewed.revision);
  assert.equal(saved.catalog.assets[0].approval, reviewed.catalog.assets[0].approval);
  assert.equal((await assetAudit(p.path, state)).assets[0].approved, true);
  assert.deepEqual(await readFile(join(p.path, task.workflowPath)), png);
});

test('legacy Hedao directories activate checks, generic OpenFilm projects remain unaffected', async () => {
  const { project: p, state } = await fixture();
  assert.equal((await assetAudit(p.path, state)).enabled, false);
  assert.equal((await generationAssetContext(p.path, state, { shot: 'S001', provider: 'seedance' })).referencePaths, null);
  await mkdir(join(p.path, '13-工作流文档'));
  const report = await assetAudit(p.path, state);
  assert.equal(report.enabled, true);
  assert.equal(report.referencesReady, false);
  assert.match(report.issues[0], /尚未登记/);
});
test('unmarked older Wanju desktop projects cannot silently skip asset gates', async () => {
  const { project: p, state } = await fixture();
  const previous = process.env.WANJU_DESKTOP;
  try {
    process.env.WANJU_DESKTOP = '1';
    assert.equal((await assetAudit(p.path, state)).enabled, true);
    for (const provider of ['image', 'seedance']) {
      await assert.rejects(generateOne(p, state, { provider, shot: 'S001', confirm: true }, {
        config: () => assert.fail('no supplier config before workflow initialization'),
        fetch: () => assert.fail('no paid request'),
      }), /资产关卡/);
    }
    await mkdir(join(p.path, '.film'), { recursive: true });
    await writeFile(join(p.path, '.film/wanju-workflow.json'), JSON.stringify({ version: 1, mode: 'native' }));
    assert.equal((await assetAudit(p.path, state)).enabled, false);
    assert.equal((await generationAssetContext(p.path, state, { provider: 'image', shot: 'S001' })).referencePaths, null);
  } finally {
    if (previous === undefined) delete process.env.WANJU_DESKTOP;
    else process.env.WANJU_DESKTOP = previous;
  }
});

test('missing assets and failed reference gates block before config, upload or a paid request', async () => {
  const { project: p, state } = await fixture();
  await saveAssetCatalog(p.path, state, { assetBase: null, catalog: plan() });
  const noCalls = { config: () => assert.fail('no private config read'), uploadCos: () => assert.fail('no upload'), fetch: () => assert.fail('no paid request') };
  for (const provider of ['image', 'seedance']) {
    await assert.rejects(generateOne(p, state, { shot: 'S001', provider, confirm: true }, noCalls), /资产关卡/);
  }
  assert.deepEqual(await generationTasks(p.path), []);
});

test('independent character and scene generation saves canonical files and expected Chinese folders, never fake shots', async () => {
  const { project: p, state } = await fixture();
  await saveAssetCatalog(p.path, state, { assetBase: null, catalog: plan() });
  const before = structuredClone(state);
  for (const assetId of ['C01', 'SC01']) {
    const task = await generateOne(p, state, { assetId, provider: 'image', confirm: true }, deps);
    assert.equal(task.status, 'done');
    assert.equal(task.assetId, assetId);
    assert.match(task.path, /^assets\/(characters|scenes)\//);
    assert.match(task.workflowPath, /^(02-角色\/01-定妆照|03-场景\/01-场景图)\//);
    assert.deepEqual(await readFile(join(p.path, task.path)), png);
    assert.deepEqual(await readFile(join(p.path, task.workflowPath)), png);
  }
  assert.deepEqual(state, before);
  assert.deepEqual((await readWanju(p.path)).state.shots, before.shots);
  const report = await assetAudit(p.path, state);
  assert.equal(report.counts.characters, 1);
  assert.equal(report.counts.scenes, 1);
  assert.equal(report.counts.storyboardImages, 0);
  assert.equal(report.referencesReady, false);
  assert.equal(report.assets.every((a) => a.exists && !a.approved), true);
  assert.doesNotMatch(JSON.stringify(await generationTasks(p.path)), /MOCK_PRIVATE_KEY/);
});

test('prop assets use approved character references and keep their own category', async () => {
  const { project: p, state } = await fixture();
  const saved = await approvedAssets(p, state);
  const catalog = saved.catalog;
  catalog.assets.push({ id: 'P01', kind: 'prop', name: '旧信', prompt: '只展示人物手中的旧信。', path: '', references: ['C01'] });
  await saveAssetCatalog(p.path, state, { assetBase: saved.revision, catalog });
  const task = await generateOne(p, state, { assetId: 'P01', provider: 'image', confirm: true }, {
    ...deps, fetch: async (url, init) => {
      assert.match(url, /\/images\/edits$/);
      assert.equal(init.body.getAll('image').length, 1);
      return deps.fetch();
    },
  });
  assert.match(task.path, /^assets\/props\//);
  assert.match(task.workflowPath, /^04-参考素材\/01-道具\//);
});

test('asset review requires a real image and note; malformed bindings and stale revisions are refused', async () => {
  const { project: p, state } = await fixture();
  const catalog = plan();
  catalog.assets[0].approved = true; catalog.assets[0].reviewNote = '已看过';
  await assert.rejects(saveAssetCatalog(p.path, state, { assetBase: null, catalog }), /真实图片/);
  catalog.assets[0].approved = false;
  catalog.bindings[0].assetIds = ['C01'];
  await assert.rejects(saveAssetCatalog(p.path, state, { assetBase: null, catalog }), /场景/);
  catalog.bindings[0].assetIds = ['C01', 'MISSING'];
  await assert.rejects(saveAssetCatalog(p.path, state, { assetBase: null, catalog }), /未登记/);
  const saved = await saveAssetCatalog(p.path, state, { assetBase: null, catalog: plan() });
  await assert.rejects(saveAssetCatalog(p.path, state, { assetBase: null, catalog: plan() }), (e) => e.status === 409);
  assert.equal((await readAssetCatalog(p.path)).revision, saved.revision);
  await writeFile(join(p.path, 'assets/not-image.png'), 'This file is not a real PNG image.');
  assert.equal((await assetAudit(p.path, { ...state, shots: [{ ...shot, image: 'assets/not-image.png' }] })).counts.storyboardImages, 0);
});

test('approved per-shot assets are automatically sent as multipart image references and storyboard images are archived', async () => {
  const { project: p, state } = await fixture();
  await approvedAssets(p, state);
  const task = await generateOne(p, state, { shot: 'S001', provider: 'image', confirm: true }, {
    ...deps, fetch: async (url, init) => {
      assert.match(url, /\/images\/edits$/);
      assert.deepEqual(init.body.getAll('image').map((file) => file.name), ['hero.png', 'scene.png']);
      assert.match(init.body.get('prompt'), /图片1：C01 林夏身份.*图片2：SC01 走廊/);
      return deps.fetch();
    },
  });
  bindGeneratedMedia(state.shots[0], task);
  assert.match(task.workflowPath, /^08-分镜静态图\//);
  assert.deepEqual(await readFile(join(p.path, task.workflowPath)), png);
  assert.equal((await assetAudit(p.path, state)).counts.storyboardImages, 1);
});
test('missing usage metadata is reported as unverified instead of pretending the reference was rejected', async () => {
  const { project: p, state } = await fixture();
  await approvedAssets(p, state);
  const task = await generateOne(p, state, { shot: 'S001', provider: 'image', confirm: true }, {
    ...deps, fetch: async () => Response.json({ data: [{ b64_json: png.toString('base64') }] }),
  });
  assert.equal(task.status, 'done');
  assert.equal(task.imageTokens, null);
  assert.match(task.error, /服务未返回参考图用量/);
  assert.deepEqual(await readFile(join(p.path, task.workflowPath)), png);
});

test('video cannot skip storyboard review and then carries locked shot/person/scene references in order', async () => {
  const { project: p, state } = await fixture();
  await approvedAssets(p, state);
  await writeFile(join(p.path, 'assets/story.png'), png);
  state.shots[0].image = 'assets/story.png';
  await assert.rejects(generateOne(p, state, { shot: 'S001', provider: 'seedance', confirm: true }, {
    fetch: () => assert.fail('no paid call before review'),
  }), /分镜关卡/);
  const current = await readAssetCatalog(p.path);
  await saveAssetCatalog(p.path, state, { assetBase: current.revision, approveStoryboard: true, reviewNote: '实际看过图册，人物、空间、动作和前后因果一致。' });
  const report = await assetAudit(p.path, state);
  assert.equal(report.storyboardApproved, true);
  assert.equal(report.readyForVideo, true);
  const uploads = [];
  const task = await generateOne(p, state, { shot: 'S001', provider: 'seedance', confirm: true }, {
    ...deps, uploadCos: async (_project, path) => { uploads.push(path); return `https://example.com/${path}`; },
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.content.length, 4);
      assert.match(body.content[0].text, /图片1为本镜已审核分镜图；图片2：C01.*图片3：SC01/);
      return Response.json({ id: 'cgt-workflow-001' });
    },
  });
  assert.deepEqual(uploads, ['assets/story.png', 'assets/hero.png', 'assets/scene.png']);
  assert.equal(task.status, 'queued');
  await assert.rejects(generationAssetContext(p.path, state, { provider: 'seedance', shot: 'S001', videoOptions: { imageUrls: ['assets/different.png'] } }), /不要临时更换人物/);
  await assert.rejects(generationAssetContext(p.path, state, { provider: 'h3', shot: 'S001' }), /默认视频线路/);
});

test('review receipts survive video binding but are invalidated by changed story, asset files or descriptions', async () => {
  const { project: p, state } = await fixture();
  const saved = await approvedAssets(p, state);
  await writeFile(join(p.path, 'assets/story.png'), png);
  state.shots[0].image = 'assets/story.png';
  await saveAssetCatalog(p.path, state, { assetBase: saved.revision, approveStoryboard: true, reviewNote: '已逐镜核对当前图册。' });
  bindGeneratedMedia(state.shots[0], { provider: 'seedance', path: 'assets/movie.mp4' });
  assert.equal((await assetAudit(p.path, state)).storyboardApproved, true);
  assert.equal((await assetAudit(p.path, { ...state, script: state.script + '新结尾' })).storyboardApproved, false);
  const changed = structuredClone(state);
  changed.shots[0].description += '换一套衣服';
  assert.equal((await assetAudit(p.path, changed)).storyboardApproved, false);
  await writeFile(join(p.path, 'assets/hero.png'), Buffer.concat([png, Buffer.from('changed')]));
  const stale = await assetAudit(p.path, state);
  assert.equal(stale.assets[0].approved, false);
  assert.equal(stale.readyForVideo, false);
});

test('old successful images recover only empty associations, preserve videos/manual images and do not create paid tasks', async () => {
  const { project: p, state } = await fixture();
  state.shots[0].media = 'assets/movie.mp4'; state.shots[0].video = 'assets/movie.mp4';
  state.shots.push({ ...shot, id: 'S002', image: 'assets/manual.png', media: 'assets/manual.png' });
  for (const name of ['old.png', 'new.png', 'manual.png']) await writeFile(join(p.path, 'assets', name), png);
  const tasks = [
    { shot: 'S001', provider: 'image', status: 'done', path: 'assets/old.png' },
    { shot: 'S001', provider: 'image', status: 'done', path: 'assets/new.png' },
    { shot: 'S002', provider: 'image', status: 'done', path: 'assets/old.png' },
    { shot: 'S003', provider: 'image', status: 'done', path: 'assets/old.png' },
  ];
  const report = await assetAudit(p.path, state, tasks);
  assert.deepEqual(report.recoverable, [{ shot: 'S001', path: 'assets/new.png' }]);
  const recovered = await recoverStoryboardImages(p.path, state, tasks);
  assert.equal(recovered.length, 1);
  assert.equal(state.shots[0].image, 'assets/new.png');
  assert.equal(state.shots[0].media, 'assets/movie.mp4');
  assert.equal(state.shots[1].image, 'assets/manual.png');
  assert.deepEqual(await readFile(join(p.path, '08-分镜静态图/new.png')), png);
  assert.deepEqual(await recoverStoryboardImages(p.path, state, tasks), []);
  assert.deepEqual(await generationTasks(p.path), []);
});
