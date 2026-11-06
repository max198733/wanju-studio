import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankState } from './wanju-model.mjs';
import { generateOne, generationTasks, querySparkVideo } from './wanju-generation.mjs';

const shot = { id: 'S001', title: 'Legacy shot', description: 'A scene.', dialogue: '', duration: 5, media: '' };
const state = { ...blankState(), shots: [shot] };
const secret = 'MOCK_OLD_RUNNINGHUB_KEY';
const deps = {
  config: async (name) => { assert.equal(name, 'runninghub_sparkvideo_config.json'); return { api_key: secret }; },
  probe: async () => ({ width: 720, height: 1280, duration: 5 }),
  download: async () => ({ bytes: Buffer.from('mock-video') }),
};
async function legacyTask() {
  const path = await mkdtemp(join(tmpdir(), 'wanju-legacy-video-'));
  const project = { id: path, path, name: 'Legacy' };
  const task = { id: 'local-old-001', shot: shot.id, provider: 'sparkvideo', remoteId: 'remote-old-001',
    status: 'queued', createdAt: new Date().toISOString() };
  await mkdir(join(path, '.film'));
  await writeFile(join(path, '.film/wanju-tasks.json'), JSON.stringify([task]));
  return { project, task };
}

test('retired SparkVideo submissions stop before credentials, upload or network access', async () => {
  const { project } = await legacyTask();
  await assert.rejects(generateOne(project, state, { provider: 'sparkvideo', shot: shot.id, confirm: true }, {
    config: async () => assert.fail('must not read retired credentials'),
    uploadCos: async () => assert.fail('must not upload'),
    fetch: async () => assert.fail('must not submit'),
  }), /已停用/);
});

test('historical SparkVideo task queries its original provider and downloads only once', async () => {
  const { project, task } = await legacyTask();
  let calls = 0;
  const queryDeps = { ...deps, fetch: async (url, init) => {
    calls++;
    assert.equal(url, 'https://www.runninghub.cn/openapi/v2/query');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { taskId: task.remoteId });
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    return Response.json({ status: 'SUCCESS', results: [
      { url: 'https://example.com/poster.jpg', outputType: 'jpg' },
      { url: 'https://example.com/result.mp4', outputType: 'mp4' },
    ] });
  } };
  const done = await querySparkVideo(project, task.id, queryDeps);
  assert.equal(done.status, 'done');
  assert.equal(done.provider, 'sparkvideo');
  assert.equal(done.remoteId, task.remoteId);
  assert.equal((await readFile(join(project.path, done.path))).toString(), 'mock-video');
  await querySparkVideo(project, task.id, queryDeps);
  assert.equal(calls, 1);
});

test('historical provider failures do not disclose keys or signed result URLs', async () => {
  const { project, task } = await legacyTask();
  const failed = await querySparkVideo(project, task.id, { ...deps,
    fetch: async () => Response.json({ status: 'FAILED', errorMessage: `${secret} https://example.com/private?signature=secret` }),
  });
  assert.equal(failed.status, 'failed');
  assert.doesNotMatch(JSON.stringify(failed), /MOCK_OLD_RUNNINGHUB_KEY|signature/);
});

test('historical download failure retries the same task without creating a new generation', async () => {
  const { project, task } = await legacyTask();
  const queryDeps = { ...deps, fetch: async (url, init) => {
    assert.equal(url, 'https://www.runninghub.cn/openapi/v2/query');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { taskId: task.remoteId });
    return Response.json({ status: 'SUCCESS', results: [{ url: 'https://example.com/result.mp4' }] });
  } };
  await assert.rejects(querySparkVideo(project, task.id, { ...queryDeps,
    download: async () => { throw new Error(secret); },
  }));
  const stored = (await generationTasks(project.path))[0];
  assert.equal(stored.status, 'download-failed');
  assert.equal(stored.remoteId, task.remoteId);
  assert.doesNotMatch(JSON.stringify(stored), /MOCK_OLD_RUNNINGHUB_KEY/);
  assert.equal((await querySparkVideo(project, task.id, queryDeps)).status, 'done');
});
