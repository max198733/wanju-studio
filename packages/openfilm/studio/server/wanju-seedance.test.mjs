import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankState } from './wanju-model.mjs';
import { generateOne, generationTasks, querySeedance, seedanceRequest, SEEDANCE_MODEL } from './wanju-generation.mjs';
import { queryVideoTask, readWanju, saveWanju } from './wanju.mjs';
import { readProjectFilm } from './film.mjs';

const shot = { id: 'S001', title: '果茶', description: '第一人称果茶广告，保持人物与产品一致。', dialogue: '', duration: 5, media: 'assets/reference.png' };
const state = { ...blankState(), ratio: '9:16', shots: [shot] };
const secret = 'MOCK_ARK_PRIVATE_KEY';
const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const options = { prompt: '图片1的人物在视频1的场景中制作果茶，音频1作为背景音乐。',
  imageUrls: ['https://example.com/person.png'], videoUrls: ['https://example.com/place.mp4'], audioUrls: ['https://example.com/music.mp3'],
  resolution: '720p', duration: '5', generateAudio: true, ratio: '9:16', watermark: false };
const deps = {
  config: async (name) => { assert.equal(name, 'seedance_video_config.json'); return { api_key: secret, base_url: 'https://must-not-receive-key.invalid', model: 'wrong-model' }; },
  probe: async () => ({ width: 720, height: 1280, duration: 5 }),
  download: async () => ({ bytes: Buffer.from('mock-video') }),
  uploadCos: async (_p, path) => `https://example.com/${path}`,
};
const project = async () => { const path = await mkdtemp(join(tmpdir(), 'wanju-seedance-')); return { id: path, path, name: '测试' }; };
const submit = (p, extra = {}, videoOptions = options) => generateOne(p, state,
  { provider: 'seedance', shot: shot.id, confirm: true, videoOptions },
  { ...deps, fetch: async () => Response.json({ id: 'cgt-test-001' }), ...extra });

test('Seedance body maps the supplied native multimodal content and keeps numeric duration', () => {
  const result = seedanceRequest({ ...shot, duration: 11 }, '16:9', options, { ...options, ratio: '16:9', duration: 11 });
  assert.deepEqual(result, {
    model: SEEDANCE_MODEL,
    content: [
      { type: 'text', text: options.prompt },
      { type: 'image_url', image_url: { url: options.imageUrls[0] }, role: 'reference_image' },
      { type: 'video_url', video_url: { url: options.videoUrls[0] }, role: 'reference_video' },
      { type: 'audio_url', audio_url: { url: options.audioUrls[0] }, role: 'reference_audio' },
    ],
    generate_audio: true, ratio: '16:9', duration: 11, watermark: false, resolution: '720p',
  });
  for (const resolution of ['480p', '720p', '1080p']) {
    assert.equal(seedanceRequest(shot, '9:16', {}, { resolution }).resolution, resolution);
  }
});

test('Seedance uses official POST, Ark key and top-level id, without trusting imported model or URL', async () => {
  const p = await project();
  let calls = 0;
  const task = await submit(p, { fetch: async (url, init) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    assert.equal(init.redirect, 'error');
    assert.deepEqual(JSON.parse(init.body), seedanceRequest(shot, state.ratio, options, options));
    assert.equal((await generationTasks(p.path))[0].status, 'submitting');
    return Response.json({ id: 'cgt-test-001' });
  } });
  assert.equal(task.status, 'queued');
  assert.equal(task.remoteId, 'cgt-test-001');
  assert.equal(task.model, SEEDANCE_MODEL);
  await assert.rejects(submit(p), /未结束/);
  assert.equal(calls, 1);
  assert.doesNotMatch(await readFile(join(p.path, '.film/wanju-tasks.json'), 'utf8'), /MOCK_ARK_PRIVATE_KEY|example\.com/);
});

test('text-only calls do not silently reuse a storyboard image or upload anything', async () => {
  const p = await project();
  await submit(p, {
    uploadCos: async () => { assert.fail('text-only does not upload'); },
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.content, [{ type: 'text', text: shot.description }]);
      assert.equal(body.ratio, state.ratio);
      return Response.json({ id: 'cgt-text-only' });
    },
  }, {});
});

test('invalid references and duration fail before upload and paid submission', async () => {
  let calls = 0;
  const p = await project();
  for (const patch of [
    { imageUrls: Array(10).fill('assets/a.png') }, { prompt: '@Image 2' },
    { videoUrls: ['https://127.0.0.1/x.mp4'] }, { audioUrls: ['assets/a.png'] },
    { imageUrls: [], videoUrls: [], audioUrls: ['assets/voice.mp3'] },
    { duration: 7 }, { seed: 1.5 }, { generateAudio: 'true' }, { resolution: '4k' },
    { videoUrls: ['assets/ref.webm'] }, { watermark: 'false' },
  ]) {
    await assert.rejects(submit(p, {
      uploadCos: async () => { calls++; }, fetch: async () => { calls++; },
    }, { ...options, ...patch }));
  }
  assert.equal(calls, 0);
  assert.throws(() => seedanceRequest({ ...shot, duration: 16 }, '9:16'));
});

test('local multimodal assets upload in reference order and repeated assets upload once', async () => {
  const p = await project();
  const uploads = [];
  const refs = { imageUrls: ['assets/a.png', 'assets/a.png', 'assets/b.jpg'], videoUrls: ['assets/v.mp4'], audioUrls: ['assets/a.mp3'] };
  await submit(p, {
    uploadCos: async (_p, path) => { uploads.push(path); return `https://example.com/${path}`; },
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.content.slice(1).map((item) => item[item.type].url),
        [...refs.imageUrls, ...refs.videoUrls, ...refs.audioUrls].map((path) => `https://example.com/${path}`));
      return Response.json({ id: 'cgt-local-refs' });
    },
  }, refs);
  assert.deepEqual(uploads, ['assets/a.png', 'assets/b.jpg', 'assets/v.mp4', 'assets/a.mp3']);
});

test('Ark JSON errors retain a safe actionable cause and never leak keys or signed URLs', async () => {
  const p = await project();
  await assert.rejects(submit(p, {
    fetch: async () => Response.json({ error: {
      code: 'InvalidApiKey', message: `invalid key ${secret} https://example.com/private?token=secret`,
    } }, { status: 401 }),
  }), /InvalidApiKey.*invalid key/);
  const stored = (await generationTasks(p.path))[0];
  assert.equal(stored.status, 'rejected');
  assert.equal(stored.providerErrorCode, 'InvalidApiKey');
  assert.doesNotMatch(JSON.stringify(stored), /MOCK_ARK_PRIVATE_KEY|example\.com|token=secret/);
});

test('gateway errors, malformed success and missing ids stay unknown and block automatic resubmission', async () => {
  for (const response of [
    () => Response.json({ error: { code: 'InternalError', message: 'upstream timeout' } }, { status: 502 }),
    () => Response.json({ code: 0, msg: 'success' }),
    () => new Response('not json'),
    () => { throw new Error(secret); },
  ]) {
    const p = await project();
    let calls = 0;
    const fetch = async () => { calls++; return response(); };
    await assert.rejects(submit(p, { fetch }));
    assert.equal((await generationTasks(p.path))[0].status, 'unknown');
    await assert.rejects(submit(p, { fetch }), /未结束/);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(await generationTasks(p.path)), /MOCK_ARK_PRIVATE_KEY/);
  }
});

test('query uses original id with GET and downloads succeeded content.video_url exactly once', async () => {
  const p = await project(), task = await submit(p);
  let calls = 0;
  const queryDeps = { ...deps,
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, `${endpoint}/cgt-test-001`);
      assert.equal(init.method, 'GET');
      assert.equal(init.body, undefined);
      assert.equal(init.headers.Authorization, `Bearer ${secret}`);
      return Response.json({ id: 'cgt-test-001', status: 'succeeded', content: { video_url: 'https://example.com/result.mp4', last_frame_url: 'https://example.com/last.jpg' } });
    },
    download: async (url) => { assert.equal(url, 'https://example.com/result.mp4'); return { bytes: Buffer.from('mock-video') }; },
  };
  const done = await querySeedance(p, task.id, queryDeps);
  assert.equal(done.status, 'done');
  assert.equal((await readFile(join(p.path, done.path))).toString(), 'mock-video');
  await querySeedance(p, task.id, queryDeps);
  assert.equal(calls, 1);
});

test('queued, running, failed, expired and cancelled use the original Ark task without generating', async () => {
  for (const status of ['queued', 'running', 'failed', 'expired', 'cancelled']) {
    const p = await project(), task = await submit(p);
    const result = await querySeedance(p, task.id, { ...deps, fetch: async (_url, init) => {
      assert.equal(init.method, 'GET');
      return Response.json({ status, error: { code: 'ContentRisk', message: `rejected ${secret} https://example.com/private` } });
    } });
    assert.equal(result.status, ['queued', 'running'].includes(status) ? status : 'failed');
    assert.doesNotMatch(JSON.stringify(result), /MOCK_ARK_PRIVATE_KEY|example\.com/);
  }
});

test('download failure retries the original download and never submits a new generation', async () => {
  const p = await project(), task = await submit(p);
  const queryDeps = { ...deps, fetch: async (_url, init) => {
    assert.equal(init.method, 'GET');
    return Response.json({ status: 'succeeded', content: { video_url: 'https://example.com/result.mp4' } });
  } };
  await assert.rejects(querySeedance(p, task.id, { ...queryDeps, download: async () => { throw new Error(secret); } }));
  const stored = (await generationTasks(p.path))[0];
  assert.equal(stored.status, 'download-failed');
  assert.equal(stored.remoteId, 'cgt-test-001');
  assert.doesNotMatch(JSON.stringify(stored), /MOCK_ARK_PRIVATE_KEY/);
  assert.equal((await querySeedance(p, task.id, queryDeps)).status, 'done');
});

test('completed Seedance video uses native timeline binding and is inserted only once', async () => {
  const p = await project();
  await saveWanju(p.path, state);
  const task = await submit(p);
  const generation = { ...deps, fetch: async () => Response.json({
    status: 'succeeded', content: { video_url: 'https://example.com/result.mp4' },
  }) };
  await queryVideoTask(p, task.id, { generation, probe: deps.probe });
  await queryVideoTask(p, task.id, { generation, probe: deps.probe });
  const board = await readWanju(p.path);
  assert.match(board.state.shots[0].video, /^assets\/AI-S001-/);
  const film = await readProjectFilm(p.path);
  assert.equal(film.value.tracks.flatMap((track) => track.clips).length, 1);
  assert.equal(film.value.tracks[0].clips[0].src, board.state.shots[0].video);
});
