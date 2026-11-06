import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cacheCloudMedia, mediaSettings, pinMediaProfile, profileFingerprint, removeMediaProfile, resolveMediaProfile, saveMediaProfile, selectMediaProfile, taskMediaProfile } from './wanju-media.mjs';
import { blankState } from './wanju-model.mjs';
import { generateOne, querySeedance, taskSummary } from './wanju-generation.mjs';

const key = 'test-media-key-never-log';
const temporary = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'wanju-media-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};
const custom = (id = '', overrides = {}) => ({
  ...(id ? { id } : {}), category: 'audio', adapter: 'custom-http', name: '音乐供应商',
  baseUrl: 'https://music.example/api', model: 'music-test', key, note: 'POST /generate with documented JSON body.',
  ...overrides,
});
test('source CLI root resolves the shared media schema without a packaged cloud directory', async (t) => {
  const directory = await temporary(t);
  const source = `import {mediaSettings} from ${JSON.stringify(new URL('./wanju-media.mjs', import.meta.url).href)};
    const result = await mediaSettings(${JSON.stringify(directory)}, '');
    console.log(JSON.stringify({profiles: result.profiles.length}));`;
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, WANJU_ROOT: fileURLToPath(new URL('../../../../', import.meta.url)) },
    encoding: 'utf8', windowsHide: true,
  });
  assert.deepEqual(JSON.parse(result), { profiles: 0 });
});
test('legacy image format descriptions migrate without blocking status or changing the original credentials', async (t) => {
  const directory = await temporary(t), path = join(directory, 'xem8k5_gpt_image_config.json');
  const original = JSON.stringify({ api_key: key, response_format: 'url（推荐：返回公网图片地址）' });
  await writeFile(path, original);
  const settings = await mediaSettings(directory, '');
  assert.equal(settings.profiles[0].responseFormat, 'url');
  assert.equal(settings.profiles[0].configured, true);
  assert.doesNotMatch(JSON.stringify(settings), /test-media-key/);
  assert.equal(await readFile(path, 'utf8'), original);
});
test('generation uses the selected endpoint and model, and polling retains the original credential after edits', async (t) => {
  const directory = await temporary(t), root = await temporary(t);
  const previous = process.env.WANJU_CONFIG_DIR;
  process.env.WANJU_CONFIG_DIR = directory;
  t.after(() => { if (previous === undefined) delete process.env.WANJU_CONFIG_DIR; else process.env.WANJU_CONFIG_DIR = previous; });
  await mkdir(join(root, '.film')); await mkdir(join(root, 'assets'));
  const profile = { id: 'video-one', category: 'video', adapter: 'seedance', name: '我的视频',
    baseUrl: 'https://custom-video.example/api/v3/contents/generations/tasks', model: 'my-video-model', key };
  await saveMediaProfile(directory, profile); await selectMediaProfile(directory, { category: 'video', id: profile.id });
  const project = { id: 'media-test', path: root, name: 'test' };
  const state = { ...blankState(), shots: [{ id: 'S001', title: 'test', description: 'test shot', dialogue: '', duration: 4, media: '' }] };
  let submissions = 0, queries = 0;
  const request = async (url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${key}`);
    if (init.method === 'POST') {
      submissions++;
      assert.equal(url, profile.baseUrl); assert.equal(JSON.parse(init.body).model, profile.model);
      return Response.json({ id: 'original-remote-task' });
    }
    queries++; assert.equal(url, `${profile.baseUrl}/original-remote-task`);
    return Response.json({ status: 'running' });
  };
  const task = await generateOne(project, state, { provider: 'video', shot: 'S001', confirm: true }, { fetch: request });
  assert.equal(task.provider, 'seedance');
  await saveMediaProfile(directory, { ...profile, key: 'different-key-for-new-tasks', model: 'new-model' });
  await querySeedance(project, task.id, { fetch: request });
  assert.deepEqual([submissions, queries], [1, 1]);
  assert.equal(JSON.stringify(taskSummary(task)).includes(key), false);
  await selectMediaProfile(directory, { category: 'video', id: 'cloud' });
  await assert.rejects(resolveMediaProfile('video', { directory, owner: '' }), /尚无可用/);
});
test('local custom profiles are private, independently selected and preserve secrets only on unchanged endpoints', async (t) => {
  const directory = await temporary(t), added = await saveMediaProfile(directory, custom());
  const view = await mediaSettings(directory);
  assert.equal(view.profiles[0].id, added.id);
  assert.equal(view.profiles[0].configured, true);
  assert.equal(JSON.stringify(view).includes(key), false);
  await selectMediaProfile(directory, { category: 'audio', id: added.id });
  await saveMediaProfile(directory, custom(added.id, { name: '改名' }));
  const stored = JSON.parse(await readFile(join(directory, 'media-profiles.json'), 'utf8'));
  assert.equal(stored.profiles[0].key, key);
  await saveMediaProfile(directory, custom(added.id, { baseUrl: 'https://other.example/api', key: '' }));
  assert.equal(JSON.parse(await readFile(join(directory, 'media-profiles.json'), 'utf8')).profiles[0].key, undefined);
  await removeMediaProfile(directory, added.id);
  assert.equal((await mediaSettings(directory)).selection.audio, 'cloud');
});
test('cloud profiles are account isolated, preserve custom selection, and pin a task to the original key', async (t) => {
  const directory = await temporary(t);
  await saveMediaProfile(directory, custom('local-music', { name: '本地音乐' }));
  const cloudProfile = { id: 'cloud-video', category: 'video', adapter: 'seedance', name: '云端视频',
    baseUrl: 'https://ark.example/api/v3/contents/generations/tasks', model: 'video-model', key };
  await cacheCloudMedia(directory, 'account-a', { revision: 'cloud-r1', profiles: [cloudProfile], defaults: { video: cloudProfile.id } });
  assert.equal((await resolveMediaProfile('video', { directory, owner: 'account-a' })).key, key);
  await assert.rejects(resolveMediaProfile('video', { directory, owner: 'account-b' }), /尚无可用/);
  await selectMediaProfile(directory, { category: 'audio', id: 'local-music' });
  const task = await resolveMediaProfile('video', { directory, owner: 'account-a' });
  await pinMediaProfile(directory, 'task-1', task);
  const taskRecord = { id: 'task-1', profileFingerprint: profileFingerprint(task) };
  assert.equal((await taskMediaProfile(directory, taskRecord, 'account-a')).key, key);
  await assert.rejects(taskMediaProfile(directory, taskRecord, 'account-b'), /其他账号/);
  const view = await mediaSettings(directory, 'account-a');
  assert.equal(view.selection.audio, 'local-music');
  assert.equal(JSON.stringify(view).includes(key), false);
});
