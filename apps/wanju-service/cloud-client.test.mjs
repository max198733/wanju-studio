import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudentService } from './server.mjs';
import { cloudLocalSnapshot, createCloudSync } from './cloud-client.mjs';
import { CLOUD_UPLOAD_CHUNK_BYTES } from './cloud.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-two-computers-'));
  const { server, store } = createStudentService({ adminSecret: 'local-sync-test-secret-not-production', cloudDirectory: join(directory, 'server') });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const account = store.register({ username: 'creator', password: 'test-password-long' });
  const request = (path, options = {}) => fetch(`${origin}${path}`, { ...options, headers: { ...options.headers, authorization: `Bearer ${account.token}` } });
  const client = createCloudSync({ origin, userId: account.user.id, request });
  t.after(async () => {
    server.closeAllConnections(); await new Promise((done) => server.close(done)); store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const local = async (name) => {
    const root = join(directory, name);
    await mkdir(join(root, '.film'), { recursive: true }); await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'film.html'), '<html><head></head><body>native test film</body></html>');
    return root;
  };
  return { directory, store, origin, account, request, client, local };
}

test('two computers recover actual files, exclude keys, deduplicate media fees and reject conflicting edits', async (t) => {
  const f = await fixture(t);
  const first = await f.local('computer-a'), second = join(f.directory, 'computer-b');
  await mkdir(second);
  await mkdir(join(first, '剧本资料/原著'), { recursive: true });
  await writeFile(join(first, '剧本资料/原著/novel.txt'), '第一章\n跨设备小说原文');
  await writeFile(join(first, '.film/wanju-story.json'), JSON.stringify({
    version: 1, seriesId: 'series-sync-test', sources: [{ id: 'test-source' }], plan: { title: '云端故事策划' }, episodes: [],
  }));
  await writeFile(join(first, '.film/wanju-episode.json'), JSON.stringify({
    version: 1, seriesId: 'series-sync-test', episodeNumber: 1,
  }));
  await mkdir(join(first, 'providers')); await writeFile(join(first, 'providers/key.json'), '{"private":"NEVER_UPLOAD_TEST"}');
  await mkdir(join(first, '.film/logs')); await writeFile(join(first, '.film/logs/session.json'), '{"private":"TEST_LOG"}');
  await mkdir(join(first, '.film/wanju-image-results'));
  await writeFile(join(first, '.film/wanju-image-results/private.json'), '{"url":"https://example.com/?signature=PRIVATE"}');
  await writeFile(join(first, '.env'), 'TEST_PRIVATE_VALUE=not-real');
  await writeFile(join(first, '.film/wanju-tasks.json'), JSON.stringify([{ id: 'historic-task', status: 'done', path: 'assets/old.png' }]));
  await writeFile(join(first, 'assets/old.png'), 'old picture');
  const initial = await f.client.push({ root: first, title: '跨电脑短剧' });
  assert.equal(initial.revision, 1);
  assert.equal(f.store.cloud.list(f.account.user.id).length, 1);
  const prices = f.store.cloud.savePrices({ enabled: true, imagePoints: 5, videoPoints: 1 });
  await f.client.consent(prices.priceVersion);
  const [card] = f.store.createCodes({ kind: 'recharge', count: 1, points: 20 });
  f.store.redeem(f.account.user.id, card.code);
  await writeFile(join(first, 'assets/new.png'), 'new simulated generated image');
  await writeFile(join(first, '.film/wanju-tasks.json'), JSON.stringify([
    { id: 'historic-task', status: 'done', path: 'assets/old.png' },
    { id: 'new-image-task', status: 'done', path: 'assets/new.png' },
    { id: 'failed-task', status: 'failed' },
  ]));
  const saved = await f.client.push({ root: first, title: '跨电脑短剧' });
  assert.equal(saved.charged, 5);
  assert.equal(saved.billingWarnings.length, 0);
  assert.equal((await f.client.push({ root: first, title: '跨电脑短剧' })).charged, 0);
  assert.equal(f.store.wallet(f.account.user.id).user.balance, 15);
  const restored = await f.client.pull({ projectId: initial.id, parent: second });
  assert.equal(await readFile(join(restored.path, 'assets/new.png'), 'utf8'), 'new simulated generated image');
  assert.equal(await readFile(join(restored.path, '剧本资料/原著/novel.txt'), 'utf8'), '第一章\n跨设备小说原文');
  const restoredStory = JSON.parse(await readFile(join(restored.path, '.film/wanju-story.json'), 'utf8'));
  assert.equal(restoredStory.seriesId, 'series-sync-test');
  assert.equal(restoredStory.plan.title, '云端故事策划');
  assert.deepEqual(JSON.parse(await readFile(join(restored.path, '.film/wanju-episode.json'), 'utf8')), {
    version: 1, seriesId: 'series-sync-test', episodeNumber: 1,
  });
  assert.equal((await readdir(restored.path)).includes('providers'), false);
  assert.equal((await readdir(restored.path)).includes('.env'), false);
  assert.equal((await readdir(join(restored.path, '.film'))).includes('logs'), false);
  assert.equal((await readdir(join(restored.path, '.film'))).includes('wanju-image-results'), false);
  assert.equal(f.store.wallet(f.account.user.id).user.balance, 15, 'restoring does not charge');
  await writeFile(join(restored.path, 'film.html'), '<html>computer B edit</html>');
  const newer = await f.client.push({ root: restored.path, title: '跨电脑短剧' });
  assert.equal(newer.revision, 3);
  await writeFile(join(first, 'film.html'), '<html>computer A edit</html>');
  await assert.rejects(f.client.push({ root: first, title: '跨电脑短剧' }), /另一台电脑/);
  assert.equal(await readFile(join(first, 'film.html'), 'utf8'), '<html>computer A edit</html>');
  const remote = f.store.cloud.version(f.account.user.id, initial.id);
  assert.equal(remote.revision, 3);
  const other = createCloudSync({ origin: f.origin, userId: 'another-account', request: f.request });
  await assert.rejects(other.push({ root: first, title: 'no leak' }), /其他账号/);
});

test('cloud roundtrip preserves a series parent and both independently synced episode links', async (t) => {
  const f = await fixture(t);
  const parent = await f.local('series-parent');
  const first = await f.local('series-episode-1');
  const second = await f.local('series-episode-2');
  const seriesId = 'series-cloud-roundtrip';
  const parentId = 'parent-project-id';
  const firstId = 'episode-one-project-id';
  const secondId = 'episode-two-project-id';
  const novelPath = '剧本资料/原著/novel.txt';

  await mkdir(join(parent, '.film'), { recursive: true });
  await mkdir(join(parent, '剧本资料/原著'), { recursive: true });
  await writeFile(join(parent, novelPath), '第一章\n原文内容应随系列总控工程恢复。');
  await writeFile(join(parent, '.film/id'), `${parentId}\n`);
  await writeFile(join(parent, '.film/wanju-story.json'), JSON.stringify({
    version: 1,
    seriesId,
    sources: [{ id: 'source-sha256', name: 'novel.txt', path: novelPath, characters: 18, chapterCount: 1 }],
    plan: { title: '云同步系列验收', ratio: '9:16' },
    episodes: [
      { number: 1, title: '第一集', script: '第一集剧本。', projectId: firstId },
      { number: 2, title: '第二集', script: '第二集剧本。', projectId: secondId },
    ],
  }));
  for (const [root, id, number] of [[first, firstId, 1], [second, secondId, 2]]) {
    await mkdir(join(root, '.film'), { recursive: true });
    await writeFile(join(root, '.film/id'), `${id}\n`);
    await writeFile(join(root, '.film/wanju-episode.json'), JSON.stringify({
      version: 1, seriesId, episodeNumber: number, parentProjectId: parentId,
    }));
    await writeFile(join(root, 'wanju.json'), JSON.stringify({
      version: 1, title: `第${number}集`, ratio: '9:16', script: `第${number}集剧本。`, music: '', shots: [],
    }));
  }

  const parentCloud = await f.client.push({ root: parent, title: '云同步系列验收' });
  const firstCloud = await f.client.push({ root: first, title: '云同步系列验收 · 第1集' });
  const secondCloud = await f.client.push({ root: second, title: '云同步系列验收 · 第2集' });
  const destination = join(f.directory, 'series-restored'); await mkdir(destination);
  const [restoredParent, restoredFirst, restoredSecond] = await Promise.all([
    f.client.pull({ projectId: parentCloud.id, parent: destination }),
    f.client.pull({ projectId: firstCloud.id, parent: destination }),
    f.client.pull({ projectId: secondCloud.id, parent: destination }),
  ]);

  const story = JSON.parse(await readFile(join(restoredParent.path, '.film/wanju-story.json'), 'utf8'));
  assert.equal(story.seriesId, seriesId);
  assert.deepEqual(story.episodes.map(({ number, projectId }) => ({ number, projectId })), [
    { number: 1, projectId: firstId }, { number: 2, projectId: secondId },
  ]);
  assert.equal(await readFile(join(restoredParent.path, novelPath), 'utf8'), '第一章\n原文内容应随系列总控工程恢复。');
  assert.equal((await readFile(join(restoredParent.path, '.film/id'), 'utf8')).trim(), parentId);
  assert.deepEqual(JSON.parse(await readFile(join(restoredFirst.path, '.film/wanju-episode.json'), 'utf8')), {
    version: 1, seriesId, episodeNumber: 1, parentProjectId: parentId,
  });
  assert.deepEqual(JSON.parse(await readFile(join(restoredSecond.path, '.film/wanju-episode.json'), 'utf8')), {
    version: 1, seriesId, episodeNumber: 2, parentProjectId: parentId,
  });
  assert.equal(await readFile(join(restoredFirst.path, 'wanju.json'), 'utf8')
    .then((value) => JSON.parse(value).script), '第1集剧本。');
  assert.equal(await readFile(join(restoredSecond.path, 'wanju.json'), 'utf8')
    .then((value) => JSON.parse(value).script), '第2集剧本。');
});

test('lost commit response retries the same snapshot, never producing a duplicate version', async (t) => {
  const f = await fixture(t), root = await f.local('response-lost');
  let lost = false;
  const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request: async (path, options) => {
    const response = await f.request(path, options);
    if (path.startsWith('/api/cloud/projects/') && options?.method === 'POST' && !lost) {
      lost = true; await response.text(); throw new Error('simulated lost response');
    }
    return response;
  } });
  await assert.rejects(client.push({ root, title: 'recover' }), /lost response/);
  assert.equal(f.store.cloud.list(f.account.user.id)[0].revision, 1);
  const recovered = await client.push({ root, title: 'recover' });
  assert.equal(recovered.revision, 1);
  assert.equal(recovered.uploaded, 0);
});

test('client resumes an upload when the first chunk was committed but its response was lost', async (t) => {
  const f = await fixture(t), root = await f.local('upload-response-lost');
  const bytes = Buffer.alloc(CLOUD_UPLOAD_CHUNK_BYTES + 19, 3);
  await writeFile(join(root, 'assets/large.mp4'), bytes);
  let lost = false;
  const request = async (path, options) => {
    const response = await f.request(path, options);
    if (options?.method === 'PUT' && path.startsWith('/api/cloud/objects/') && !lost) {
      lost = true;
      await response.text();
      throw new Error('simulated lost upload response');
    }
    return response;
  };
  const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request });
  await assert.rejects(client.push({ root, title: '上传断点恢复' }), /lost upload response/);
  const resumed = await client.push({ root, title: '上传断点恢复' });
  assert.equal(resumed.revision, 1);
  assert.equal(resumed.uploaded, 2);
  const manifest = f.store.cloud.version(f.account.user.id, resumed.id);
  assert.equal(manifest.files.find((file) => file.path === 'assets/large.mp4').size, bytes.length);
});

for (const advertisedVersion of [undefined, 2]) {
  test(`servers with ${advertisedVersion === undefined ? 'no' : 'an unknown'} resumable protocol use whole-file uploads and recover a lost response`, async (t) => {
    const f = await fixture(t), root = await f.local('legacy-upload');
    const bytes = Buffer.alloc(CLOUD_UPLOAD_CHUNK_BYTES + 19, 4);
    await writeFile(join(root, 'assets/large.mp4'), bytes);
    await writeFile(join(root, 'assets/empty.txt'), '');
    let lost = false;
    const puts = [];
    const request = async (path, options) => {
      assert.ok(!path.endsWith('/upload'), 'legacy servers must never be asked for upload offsets');
      if (path === '/api/cloud/status') {
        const data = await (await f.request(path, options)).json();
        delete data.capabilities;
        if (advertisedVersion !== undefined) data.capabilities = {
          resumableUpload: { version: advertisedVersion, chunkBytes: CLOUD_UPLOAD_CHUNK_BYTES },
        };
        return Response.json(data);
      }
      if (options?.method === 'PUT') {
        assert.equal(options.headers['content-range'], undefined);
        puts.push({ path, size: Number(options.headers['content-length']) });
      }
      const response = await f.request(path, options);
      if (options?.method === 'PUT' && !lost) {
        lost = true;
        await response.text();
        throw new Error('legacy response lost');
      }
      return response;
    };
    const makeClient = () => createCloudSync({ origin: f.origin, userId: f.account.user.id, request });
    await assert.rejects(makeClient().push({ root, title: '旧服务兼容' }), /legacy response lost/);
    const saved = await makeClient().push({ root, title: '旧服务兼容' });
    assert.equal(saved.revision, 1);
    assert.ok(puts.some((put) => put.size === bytes.length), 'large files must use one complete request');
    assert.ok(puts.some((put) => put.size === 0), 'empty files must retain their exact size');
    assert.equal(new Set(puts.map((put) => put.path)).size, puts.length, 'objects confirmed by check are never resent');
    const again = await makeClient().push({ root, title: '旧服务兼容' });
    assert.equal(again.revision, 1, 'restart cannot create a duplicate snapshot');
    assert.equal(again.uploaded, 0);
    const target = join(f.directory, 'legacy-restored'); await mkdir(target);
    const restored = await makeClient().pull({ projectId: saved.id, parent: target });
    assert.deepEqual(await readFile(join(restored.path, 'assets/large.mp4')), bytes);
    assert.equal((await readFile(join(restored.path, 'assets/empty.txt'))).length, 0);
    assert.equal(f.store.wallet(f.account.user.id).user.balance, 0);
  });
}

test('a smaller advertised chunk size is respected and the new protocol remains resumable', async (t) => {
  const f = await fixture(t), root = await f.local('small-chunks');
  const bytes = Buffer.alloc(20003, 6), lengths = [];
  await writeFile(join(root, 'assets/video.mp4'), bytes);
  const request = async (path, options) => {
    if (path === '/api/cloud/status') {
      const data = await (await f.request(path, options)).json();
      data.capabilities.resumableUpload.chunkBytes = 4096;
      return Response.json(data);
    }
    if (options?.method === 'PUT') {
      assert.match(options.headers['content-range'], /^bytes /);
      lengths.push(Number(options.headers['content-length']));
    }
    return f.request(path, options);
  };
  const saved = await createCloudSync({ origin: f.origin, userId: f.account.user.id, request }).push({ root, title: '协商分片' });
  assert.equal(saved.revision, 1);
  assert.ok(lengths.every((length) => length <= 4096));
  assert.ok(lengths.includes(4096));
});

for (const status of [401, 403, 404, 409, 413, 429, 500, 503]) {
  for (const jsonError of [true, false]) {
    test(`an advertised resumable endpoint returning ${status} with ${jsonError ? 'JSON' : 'plain text'} cannot trigger a whole-file fallback`, async (t) => {
      const f = await fixture(t), root = await f.local('upload-refused');
      const request = async (path, options) => {
        assert.notEqual(options?.method, 'PUT', 'an offset query failure cannot trigger any upload');
        if (path.endsWith('/upload')) return jsonError
          ? Response.json({ error: { message: 'original upload status failure' } }, { status })
          : new Response('proxy error page', { status });
        return f.request(path, options);
      };
      const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request });
      await assert.rejects(client.push({ root, title: '必须停止' }), (error) => error.status === status
        && error.message === (jsonError ? 'original upload status failure' : '云项目请求失败。'));
      assert.deepEqual(f.store.cloud.list(f.account.user.id), []);
      assert.equal(f.store.cloud.status(f.account.user.id).usedBytes, 0);
      assert.match(await readFile(join(root, 'film.html'), 'utf8'), /native test film/);
    });
  }
}

test('invalid advertised chunk settings fail before any object transfer', async (t) => {
  const f = await fixture(t), root = await f.local('invalid-upload-protocol');
  for (const chunkBytes of [0, -1, 0.5, null, '4096']) {
    const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request: async (path, options) => {
      assert.equal(path, '/api/cloud/status', 'invalid protocol must stop before any upload or project request');
      const data = await (await f.request(path, options)).json();
      data.capabilities.resumableUpload.chunkBytes = chunkBytes;
      return Response.json(data);
    } });
    await assert.rejects(client.push({ root, title: 'invalid' }), (error) => error.status === 422 && /协议配置无效/.test(error.message));
  }
  assert.deepEqual(f.store.cloud.list(f.account.user.id), []);
});

test('a successful status response containing an HTML page cannot select the legacy protocol', async (t) => {
  const f = await fixture(t), root = await f.local('html-status');
  const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request: async (path) => {
    assert.equal(path, '/api/cloud/status');
    return new Response('<html>sign in</html>');
  } });
  await assert.rejects(client.push({ root, title: 'invalid status' }), (error) => error.status === 502 && /无效结果/.test(error.message));
  assert.deepEqual(f.store.cloud.list(f.account.user.id), []);
});

for (const legacy of [false, true]) {
  for (const body of ['null', '[]', '<html>proxy page</html>', '{}']) {
    test(`invalid ${legacy ? 'whole-file' : 'chunk'} upload receipt ${body} stops before committing a version`, async (t) => {
      const f = await fixture(t), root = await f.local('invalid-upload-receipt');
      const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request: async (path, options) => {
        if (options?.method === 'PUT') {
          options.body.destroy();
          return new Response(body);
        }
        const response = await f.request(path, options);
        if (legacy && path === '/api/cloud/status') {
          const data = await response.json();
          delete data.capabilities;
          return Response.json(data);
        }
        return response;
      } });
      await assert.rejects(client.push({ root, title: 'invalid receipt' }), (error) => error.status === 502 && /无效/.test(error.message));
      assert.deepEqual(f.store.cloud.list(f.account.user.id), []);
      assert.equal(f.store.cloud.status(f.account.user.id).usedBytes, 0);
    });
  }
  test(`a ${legacy ? 'whole-file' : 'chunk'} upload stored before an invalid receipt is recovered without a second upload`, async (t) => {
    const f = await fixture(t), root = await f.local('invalid-receipt-recovery');
    let puts = 0, invalid = true;
    const request = async (path, options) => {
      const response = await f.request(path, options);
      if (path === '/api/cloud/status' && legacy) {
        const data = await response.json();
        delete data.capabilities;
        return Response.json(data);
      }
      if (options?.method === 'PUT') {
        puts++;
        if (invalid) {
          invalid = false;
          await response.text();
          return new Response('null');
        }
      }
      return response;
    };
    const makeClient = () => createCloudSync({ origin: f.origin, userId: f.account.user.id, request });
    await assert.rejects(makeClient().push({ root, title: 'recover receipt' }), (error) => error.status === 502);
    assert.deepEqual(f.store.cloud.list(f.account.user.id), []);
    const saved = await makeClient().push({ root, title: 'recover receipt' });
    assert.equal(saved.revision, 1);
    assert.equal(saved.uploaded, 0);
    assert.equal(puts, 1);
  });
}

test('corrupt download is discarded without replacing any existing project', async (t) => {
  const f = await fixture(t), root = await f.local('original');
  const saved = await f.client.push({ root, title: 'original' });
  const parent = join(f.directory, 'restore'); await mkdir(parent);
  await writeFile(join(parent, 'keep.txt'), 'must remain');
  const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request: async (path, options) => {
    if (/\/objects\/[a-f0-9]{64}$/.test(path) && !options?.method) {
      const original = await f.request(path, options);
      return new Response('!'.repeat((await original.arrayBuffer()).byteLength));
    }
    return f.request(path, options);
  } });
  await assert.rejects(client.pull({ projectId: saved.id, parent }), /校验失败/);
  assert.deepEqual(await readdir(parent), ['keep.txt']);
  assert.equal(await readFile(join(parent, 'keep.txt'), 'utf8'), 'must remain');
});

test('interrupted download resumes the same object offset after a client restart and opens only a verified complete copy', async (t) => {
  const f = await fixture(t), root = await f.local('resume-original');
  const bytes = '0123456789'.repeat(1000);
  await writeFile(join(root, 'assets/video.mp4'), bytes);
  const saved = await f.client.push({ root, title: '断点恢复' });
  const manifest = f.store.cloud.version(f.account.user.id, saved.id);
  const video = manifest.files.find((file) => file.path === 'assets/video.mp4');
  const parent = join(f.directory, 'resume-target'); await mkdir(parent);
  await writeFile(join(parent, 'keep.txt'), 'existing local work');
  const ranges = [];
  let interrupted = false;
  const request = async (path, options) => {
    if (path.endsWith(video.hash)) {
      ranges.push(options?.headers?.range ?? null);
      if (!interrupted) {
        interrupted = true;
        let sent = false;
        return new Response(new ReadableStream({
          pull(controller) {
            if (!sent) { controller.enqueue(Buffer.from(bytes.slice(0, 4096))); sent = true; }
            else controller.error(new Error('test connection lost'));
          },
        }));
      }
    }
    return f.request(path, options);
  };
  const first = createCloudSync({ origin: f.origin, userId: f.account.user.id, request });
  await assert.rejects(first.pull({ projectId: saved.id, parent }), /保留进度/);
  assert.equal((await readdir(parent)).filter((name) => name.includes('-云端-')).length, 0);
  const restarted = createCloudSync({ origin: f.origin, userId: f.account.user.id, request });
  const restored = await restarted.pull({ projectId: saved.id, parent });
  assert.deepEqual(ranges, [null, 'bytes=4096-']);
  assert.equal(await readFile(join(restored.path, video.path), 'utf8'), bytes);
  assert.equal(await readFile(join(parent, 'keep.txt'), 'utf8'), 'existing local work');
  assert.equal((await readdir(parent)).some((name) => name.startsWith('.wanju-download-')), false);
});

test('an older server ignoring Range restarts the file instead of appending duplicate bytes', async (t) => {
  const f = await fixture(t), root = await f.local('old-server');
  const saved = await f.client.push({ root, title: '兼容旧服务' });
  const parent = join(f.directory, 'old-target'); await mkdir(parent);
  let first = true, range;
  const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request: async (path, options) => {
    if (/\/objects\/[a-f0-9]{64}$/.test(path)) {
      if (first) { first = false; return new Response('<html>'); }
      range = options?.headers?.range;
      return f.request(path); // Legacy server returns 200 and the entire object.
    }
    return f.request(path, options);
  } });
  await assert.rejects(client.pull({ projectId: saved.id, parent }), /保留进度/);
  const restored = await client.pull({ projectId: saved.id, parent });
  assert.equal(range, 'bytes=6-');
  assert.equal(await readFile(join(restored.path, 'film.html'), 'utf8'), await readFile(join(root, 'film.html'), 'utf8'));
});

test('a wrong continuation range is refused and temporary data removed without changing local work', async (t) => {
  const f = await fixture(t), root = await f.local('range-original');
  const saved = await f.client.push({ root, title: 'wrong range' });
  const parent = join(f.directory, 'range-target'); await mkdir(parent);
  let first = true;
  const client = createCloudSync({ origin: f.origin, userId: f.account.user.id, request: async (path, options) => {
    if (/\/objects\/[a-f0-9]{64}$/.test(path)) {
      if (first) { first = false; return new Response('part'); }
      return new Response('rest', { status: 206, headers: { 'content-range': 'bytes 0-3/4' } });
    }
    return f.request(path, options);
  } });
  await assert.rejects(client.pull({ projectId: saved.id, parent }), /保留进度/);
  await assert.rejects(client.pull({ projectId: saved.id, parent }), /续传范围无效/);
  assert.deepEqual(await readdir(parent), []);
});

test('client lifecycle roundtrip preserves local files and refuses unchanged uploads of trashed projects', async (t) => {
  const f = await fixture(t), root = await f.local('lifecycle-client');
  const saved = await f.client.push({ root, title: '我的云项目' });
  assert.equal((await f.client.versions({ projectId: saved.id })).versions[0].revision, 1);
  await f.client.trash({ projectId: saved.id, revision: saved.revision });
  await assert.rejects(f.client.push({ root, title: '我的云项目' }), /回收站/);
  const [trashed] = (await f.client.trashList()).projects;
  await f.client.restore({ projectId: saved.id, trashToken: trashed.trashToken });
  assert.equal((await f.client.push({ root, title: '我的云项目' })).revision, 1);
  await f.client.trash({ projectId: saved.id, revision: saved.revision });
  const [again] = (await f.client.trashList()).projects;
  await f.client.purge({ projectId: saved.id, trashToken: again.trashToken, confirmTitle: again.title });
  assert.equal((await f.client.list()).projects.length, 0);
  assert.equal((await f.client.cleanupPreview()).objects, 0, 'fresh files receive a 24 hour grace period');
  assert.match(await readFile(join(root, 'film.html'), 'utf8'), /native test film/);
  await assert.rejects(f.client.push({ root, title: '我的云项目' }), /不存在/);
});

test('automatic uploads require the captured price and consent before transferring files', async (t) => {
  const f = await fixture(t), root = await f.local('automatic-prices');
  assert.equal((await f.client.binding({ root })).owned, false);
  const first = await f.client.push({ root, title: '自动保存测试' });
  assert.deepEqual(await f.client.binding({ root }), { owned: true, revision: 1, pending: false });
  const initial = (await f.client.status()).prices.priceVersion;
  const changed = f.store.cloud.savePrices({ enabled: true, imagePoints: 5, videoPoints: 1 });
  await writeFile(join(root, 'film.html'), '<html>edited locally</html>');
  await assert.rejects(f.client.push({ root, title: '自动保存测试', expectedPriceVersion: initial }), /价格或授权已变化/);
  await assert.rejects(f.client.push({ root, title: '自动保存测试', expectedPriceVersion: changed.priceVersion }), /价格或授权已变化/);
  assert.equal(f.store.cloud.version(f.account.user.id, first.id).revision, 1);
  await f.client.consent(changed.priceVersion);
  assert.equal((await f.client.push({ root, title: '自动保存测试', expectedPriceVersion: changed.priceVersion })).revision, 2);
});

test('metadata sampling ignores private settings and detects project edits and title changes', async (t) => {
  const f = await fixture(t), root = await f.local('sample');
  const before = await cloudLocalSnapshot(root, 'one');
  await writeFile(join(root, '.film/wanju-cloud.json'), '{"private":"session metadata"}');
  await writeFile(join(root, '.env'), 'DO_NOT_UPLOAD');
  assert.equal(await cloudLocalSnapshot(root, 'one'), before);
  assert.notEqual(await cloudLocalSnapshot(root, 'two'), before);
  await writeFile(join(root, 'assets/extra.png'), 'local fixture');
  assert.notEqual(await cloudLocalSnapshot(root, 'one'), before);
});

test('valid JSON with broken sync metadata cannot enable automatic save or recreate billing state', async (t) => {
  const f = await fixture(t), root = await f.local('broken-sync');
  await f.client.push({ root, title: 'keep binding' });
  const file = join(root, '.film/wanju-cloud.json');
  const broken = JSON.parse(await readFile(file, 'utf8'));
  delete broken.revision;
  await writeFile(file, JSON.stringify(broken));
  await assert.rejects(f.client.binding({ root }), /同步记录无法读取/);
  await assert.rejects(f.client.push({ root, title: 'do not reset' }), /同步记录无法读取/);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), broken);
});
