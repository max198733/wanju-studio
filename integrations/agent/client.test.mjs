import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute, localOrigin, makeClient, publicResult } from './client.mjs';

test('Studio credentials can only be sent to a loopback origin without redirects', async () => {
  for (const value of ['https://example.com', 'http://127.0.0.1.evil.test:4848', 'http://user:pass@127.0.0.1:4848', 'http://127.0.0.1:4848/path']) {
    assert.throws(() => localOrigin(value));
  }
  let request;
  const client = makeClient({
    connect: async () => ({ origin: 'http://127.0.0.1:4848', key: 'private-test-session' }),
    fetcher: async (url, options) => { request = { url, options }; return Response.json({ ok: true }); },
  });
  assert.deepEqual(await client('/api/wanju/status'), { ok: true });
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['x-studio-key'], 'private-test-session');
  await assert.rejects(() => client('/api/quit'), /Unsupported/);
});

test('unapproved paid calls cannot start Studio or submit anything', async () => {
  let called = 0;
  const deps = { api: async () => { called++; }, start: async () => { called++; } };
  for (const action of ['generate_asset', 'generate_image', 'generate_video']) {
    await assert.rejects(() => execute(action, { confirm_spend: false }, deps), /authorize/);
    await assert.rejects(() => execute(action, {}, deps), /authorize/);
  }
  assert.equal(called, 0);
});
test('asset tools preserve both revisions, standalone asset identity and non-billable recovery route', async () => {
  const seen = [];
  const api = async (path, options) => { seen.push({ path, options }); return { ok: true }; };
  const deps = { api, start: async () => {} };
  const input = { project_id: 'project1', revision: 'board-rev' };
  await execute('assets', input, deps);
  await execute('save_assets', { ...input, asset_revision: null, catalog: { enabled: true, assets: [], bindings: [] } }, deps);
  await execute('generate_asset', { ...input, asset_id: 'C01', confirm_spend: true }, deps);
  await execute('recover_assets', input, deps);
  assert.equal(seen[0].path, '/api/wanju/projects/project1/assets');
  assert.equal(seen[1].options.body.assetBase, null);
  assert.equal(seen[1].options.body.base, 'board-rev');
  assert.equal(seen[2].options.body.assetId, 'C01');
  assert.equal(seen[2].options.body.provider, 'image');
  assert.equal('shot' in seen[2].options.body, false);
  assert.equal(seen[3].path, '/api/wanju/projects/project1/assets/recover');
  await assert.rejects(execute('save_assets', input, deps), /asset_revision/);
});

test('save preserves the exact optimistic revision and server conflict', async () => {
  const state = { title: 'real screenplay' };
  const api = async (path, options) => {
    assert.equal(path, '/api/wanju/projects/project1');
    assert.deepEqual(options.body, { base: 'old-revision', state });
    const error = new Error('conflict');
    error.status = 409;
    throw error;
  };
  await assert.rejects(() => execute('save', {
    project_id: 'project1', revision: 'old-revision', state,
  }, { api, start: async () => {} }), (error) => error.status === 409);
});

test('novel tools use the independent story revision and upload only text source files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-novel-agent-'));
  try {
    const file = join(directory, '原著.txt');
    await writeFile(file, '第一章\n故事正文', 'utf8');
    const calls = [];
    const api = async (path, options = {}) => {
      let uploaded;
      if (options.stream) {
        const chunks = [];
        for await (const chunk of options.stream) chunks.push(chunk);
        uploaded = Buffer.concat(chunks).toString('utf8');
      }
      calls.push({ path, options, uploaded });
      return { revision: 'story-rev', source: { id: 'a'.repeat(64) } };
    };
    const deps = { api, start: async () => {} };
    await execute('story', { project_id: 'project1' }, deps);
    await execute('import_story', { project_id: 'project1', revision: 'story-rev', file }, deps);
    await execute('read_story_source', { project_id: 'project1', source_id: 'a'.repeat(64), offset: 120, limit: 800 }, deps);
    await execute('save_story', {
      project_id: 'project1', revision: 'story-rev', plan: null,
      episodes: [{ number: 3, title: '第三集', script: '已保存剧本', archived: true }],
    }, deps);
    await execute('episode_project', {
      project_id: 'project1', revision: 'story-rev', episode_number: 3,
    }, deps);
    assert.equal(calls[0].path, '/api/wanju/projects/project1/story');
    assert.match(calls[1].path, /^\/api\/wanju\/projects\/project1\/story\/sources\?base=story-rev&name=/);
    assert.equal(calls[1].uploaded, '第一章\n故事正文');
    assert.equal(calls[2].path, `/api/wanju/projects/project1/story/sources/${'a'.repeat(64)}?offset=120&limit=800`);
    assert.deepEqual(calls[3].options.body, {
      base: 'story-rev', plan: null,
      episodes: [{ number: 3, title: '第三集', script: '已保存剧本', archived: true }],
    });
    assert.equal(calls[4].path, '/api/wanju/projects/project1/story/episodes/3/project');
    assert.deepEqual(calls[4].options.body, { base: 'story-rev' });
    await assert.rejects(execute('episode_project', {
      project_id: 'project1', revision: 'story-rev', episode_number: -1,
    }, deps), /positive integer/);
    await assert.rejects(execute('import_story', { project_id: 'project1', revision: 'story-rev', file: join(directory, 'book.pdf') }, deps), /支持 TXT 和 Markdown/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('results omit local authenticated URLs but retain assets and completed export paths', () => {
  const result = publicResult({
    folder: 'http://localhost:4849/?key=secret', key: 'secret',
    tasks: [{ path: 'assets/shot.mp4', url: 'signed-url' }],
    export: { out: 'C:/Films/cut.mp4' },
  });
  assert.deepEqual(result, { tasks: [{ path: 'assets/shot.mp4' }], export: { out: 'C:/Films/cut.mp4' } });
});

test('native current project matches the working folder and returns its saved revision', async () => {
  const api = async (path) => path === '/api/projects'
    ? { projects: [{ id: 'other', path: 'C:/elsewhere' }, { id: 'current1', path: process.cwd(), name: 'Current film' }] }
    : { state: { title: 'Saved screenplay' }, rev: 'real-revision' };
  const value = await execute('current', {}, { api, start: async () => {} });
  assert.equal(value.project_id, 'current1');
  assert.equal(value.rev, 'real-revision');
  assert.equal(value.state.title, 'Saved screenplay');
});
test('new productions enable Hedao by default, while native editing explicitly opts out', async () => {
  const seen = [];
  const deps = { start: async () => {}, api: async (_path, options) => { seen.push(options.body); return {}; } };
  await execute('create', { name: 'A drama' }, deps);
  await execute('create', { name: 'A graphic', workflow: 'native' }, deps);
  assert.equal(seen[0].workflow, 'hedao');
  assert.equal(seen[1].workflow, 'native');
  await assert.rejects(execute('create', { name: 'Bad', workflow: 'unknown' }, deps), /Invalid workflow/);
  assert.equal(seen.length, 2);
});
test('diagnostics uses the explicit project without calling paid services', async () => {
  const calls = [];
  const result = await execute('diagnostics', { project_id: 'project1' }, {
    start: async () => {}, api: async (path) => { calls.push(path); return { imageTiming: { count: 6 } }; },
  });
  assert.deepEqual(calls, ['/api/wanju/projects/project1/diagnostics']);
  assert.equal(result.imageTiming.count, 6);
});
test('enabling an existing project preserves both revisions and makes no generation request', async () => {
  const calls = [];
  const deps = { start: async () => {}, api: async (path, options) => { calls.push({ path, options }); return { workflow: { enabled: true } }; } };
  await assert.rejects(execute('enable_workflow', { project_id: 'project1', revision: 'rev' }, deps), /asset_revision/);
  await execute('enable_workflow', { project_id: 'project1', revision: 'rev', asset_revision: null }, deps);
  assert.deepEqual(calls, [{ path: '/api/wanju/projects/project1/workflow', options: { method: 'POST', body: { base: 'rev', assetBase: null } } }]);
});
test('video provider and multimodal options reach the local generation route', async () => {
  const options = { imageUrls: ['assets/a.png'], videoUrls: ['assets/b.mp4'], generateAudio: true };
  const seen = [];
  const api = async (_path, request) => { seen.push(request.body); return { task: { status: 'queued' } }; };
  const input = { project_id: 'project1', revision: 'rev1', shot_id: 'S001', confirm_spend: true };
  await execute('generate_video', { ...input, provider: 'seedance', video_options: options }, { api, start: async () => {} });
  await execute('generate_video', input, { api, start: async () => {} });
  assert.equal(seen[0].provider, 'seedance'); assert.deepEqual(seen[0].videoOptions, options);
  assert.equal(seen[1].provider, 'video');
  await assert.rejects(execute('generate_video', { ...input, provider: 'sparkvideo' }, {
    api: async () => assert.fail('retired provider cannot submit'), start: async () => assert.fail('retired provider cannot start'),
  }), /RunningHub submissions are disabled/);
});
