import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createStudentService } from './server.mjs';
import { CLOUD_CLEANUP_GRACE_MS, CLOUD_UPLOAD_CHUNK_BYTES, cloudPathAllowed, createCloudFiles } from './cloud.mjs';
import { fail, openStore } from './store.mjs';

const secret = 'local-cloud-test-admin-not-for-production';
const hashOf = (value) => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-cloud-'));
  const service = createStudentService({ adminSecret: secret, cloudDirectory: directory });
  service.server.listen(0, '127.0.0.1');
  await once(service.server, 'listening');
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  t.after(async () => {
    service.server.closeAllConnections();
    await new Promise((done) => service.server.close(done));
    service.store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const call = async (path, token, data, method = data === undefined ? 'GET' : 'POST') => {
    const raw = Buffer.isBuffer(data);
    const response = await fetch(`${origin}${path}`, { method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data === undefined ? {} : { 'content-type': raw ? 'application/octet-stream' : 'application/json' }) },
      ...(data === undefined ? {} : { body: raw ? data : JSON.stringify(data) }) });
    return { status: response.status, data: await response.json() };
  };
  const account = (name, points = 20) => {
    const [card] = service.store.createCodes({ kind: 'activation', count: 1, points });
    return service.store.activate({ username: name, password: 'cloud-test-password', code: card.code });
  };
  const upload = async (a, path, contents) => {
    const bytes = Buffer.from(contents), hash = hashOf(bytes);
    assert.equal((await call(`/api/cloud/objects/${hash}`, a.token, bytes, 'PUT')).status, 200);
    return { path, hash, size: bytes.length };
  };
  return { ...service, directory, origin, call, account, upload };
}

test('cloud paths exclude credentials, escapes, Windows collisions and generated caches', () => {
  for (const path of ['film.html', '.film/settings.json', '.film/wanju-story.json', '.film/wanju-episode.json',
    '剧本资料/原著/0123456789-小说.txt', 'assets/人物/林夏.png', '13-工作流文档/生成台账.json']) assert.ok(cloudPathAllowed(path), path);
  for (const path of ['../secret', '/abs', 'a\\b', 'C:/file', 'assets/CON.png', 'assets/teSt.', '.env', 'a/.env.local',
    'providers/key.json', 'assets/cos_config.json', '.film/cache/frame.jpg', '.film/logs/token.json', '.film/wanju-cloud.json',
    'node_modules/a.js', 'a//b', '.film/wanju-image-results/task.json', '.FILM/WANJU-IMAGE-RESULTS/task.json']) assert.equal(cloudPathAllowed(path), false, path);
});

test('upload capabilities are authenticated and match the deployed file adapter', async (t) => {
  const f = await fixture(t), a = f.account('capability-owner');
  assert.equal((await f.call('/api/cloud/status')).status, 401);
  const status = await f.call('/api/cloud/status', a.token);
  assert.equal(status.status, 200);
  assert.equal(status.data.available, true);
  assert.deepEqual(status.data.capabilities.resumableUpload, { version: 1, chunkBytes: CLOUD_UPLOAD_CHUNK_BYTES });
  assert.equal(status.data.prices.enabled, false);
});

test('cloud objects are verified; snapshots are immutable, retryable and private between accounts', async (t) => {
  const f = await fixture(t), a = f.account('creator-a'), b = f.account('creator-b');
  assert.equal(f.server.requestTimeout, 15 * 60 * 1000, 'large cloud uploads share the desktop client transfer window');
  assert.equal((await f.call('/api/cloud/projects')).status, 401);
  const film = await f.upload(a, 'film.html', '<html>native film</html>');
  const image = await f.upload(a, 'assets/角色.png', 'simulated picture');
  const wrong = await f.call(`/api/cloud/objects/${hashOf('different bytes')}`, a.token, Buffer.from('wrong'), 'PUT');
  assert.equal(wrong.status, 422);
  const commit = { title: '云短剧', parentRevision: 0, requestKey: 'snapshot-0001', files: [film, image] };
  const saved = await f.call('/api/cloud/projects/project-0001', a.token, commit);
  assert.equal(saved.data.revision, 1);
  assert.equal((await f.call('/api/cloud/projects/project-0001', a.token, commit)).data.repeated, true);
  assert.equal((await f.call('/api/cloud/projects/project-0001', a.token, { ...commit, title: 'different' })).status, 409);
  assert.equal((await f.call('/api/cloud/projects/project-0001', a.token, { ...commit, requestKey: 'snapshot-0002' })).status, 409);
  assert.equal((await f.call('/api/cloud/projects/project-0001', b.token)).status, 404);
  assert.deepEqual((await f.call('/api/cloud/projects', b.token)).data.projects, []);
  assert.equal((await f.call(`/api/cloud/objects/${image.hash}`, b.token)).status, 404);
  const restored = await fetch(`${f.origin}/api/cloud/objects/${image.hash}`, { headers: { authorization: `Bearer ${a.token}` } });
  assert.equal(hashOf(Buffer.from(await restored.arrayBuffer())), image.hash);
  const changed = await f.upload(a, 'film.html', '<html>changed</html>');
  assert.equal((await f.call('/api/cloud/projects/project-0001', a.token,
    { ...commit, parentRevision: 1, requestKey: 'snapshot-0003', files: [changed, image] })).data.revision, 2);
  assert.equal((await f.call('/api/cloud/projects/project-0001?revision=1', a.token)).data.files[0].hash, image.hash);
  assert.equal(f.store.wallet(a.user.id).user.balance, 20, 'saving/downloading never charges a generation fee');
});

test('quota includes unreferenced objects; duplicate uploads consume no extra space', async (t) => {
  const f = await fixture(t), a = f.account('quota-user');
  f.store.cloud.setQuota(a.user.id, 4);
  const file = await f.upload(a, 'assets/a.png', '1234');
  assert.equal(f.store.cloud.status(a.user.id).usedBytes, 4);
  await f.upload(a, 'assets/a.png', '1234');
  assert.equal(f.store.cloud.status(a.user.id).usedBytes, 4);
  assert.equal((await f.call(`/api/cloud/objects/${hashOf('5')}`, a.token, Buffer.from('5'), 'PUT')).status, 413);
  assert.equal((await f.call('/api/cloud/projects/project-0001', a.token, { title: 'missing', parentRevision: 0,
    requestKey: 'missing-object', files: [{ ...file, path: 'film.html', hash: hashOf('absent') }] })).status, 409);
});

test('concurrent partial uploads reserve total sizes and completion converts rather than doubles quota', async (t) => {
  const f = await fixture(t), a = f.account('pending-quota');
  f.store.cloud.setQuota(a.user.id, 6);
  const values = [Buffer.from('abcd'), Buffer.from('efgh')];
  const chunk = async (bytes, start, end) => {
    const response = await fetch(`${f.origin}/api/cloud/objects/${hashOf(bytes)}`, {
      method: 'PUT', headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/octet-stream',
        'content-range': `bytes ${start}-${end}/${bytes.length}` }, body: bytes.subarray(start, end + 1),
    });
    return { status: response.status, data: await response.json() };
  };
  const results = await Promise.all(values.map((bytes) => chunk(bytes, 0, 1)));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 413]);
  assert.equal(f.store.cloud.status(a.user.id).usedBytes, 4, 'displayed usage includes pending reservations');
  assert.equal(f.store.cloud.status(a.user.id).completedBytes, 0);
  assert.equal(f.store.cloud.status(a.user.id).reservedBytes, 4);
  const winner = values[results.findIndex((r) => r.status === 200)];
  assert.equal((await chunk(winner, 0, 1)).status, 409, 'stale offset does not add another reservation');
  assert.equal((await chunk(winner, 2, 3)).status, 200);
  assert.equal(f.store.cloud.status(a.user.id).usedBytes, 4);
  assert.equal(f.store.cloud.status(a.user.id).reservedBytes, 0);
  await f.upload(a, 'assets/existing.png', winner);
  assert.equal(f.store.cloud.status(a.user.id).usedBytes, 4);
  const bad = await chunk(Buffer.from('ijkl'), 0, 3);
  assert.equal(bad.status, 413);
});

test('failed checksums release reservations for both ordinary and chunked uploads', async (t) => {
  const f = await fixture(t), a = f.account('pending-checksum');
  f.store.cloud.setQuota(a.user.id, 4);
  const hash = hashOf('abcd');
  for (const headers of [{}, { 'content-range': 'bytes 0-3/4' }]) {
    const response = await fetch(`${f.origin}/api/cloud/objects/${hash}`, {
      method: 'PUT', headers: { authorization: `Bearer ${a.token}`, ...headers }, body: 'wrong'.slice(0, 4),
    });
    assert.equal(response.status, 422);
    await response.text();
    assert.equal(f.store.cloud.status(a.user.id).reservedBytes, 0);
  }
  assert.equal((await f.upload(a, 'assets/good.png', 'abcd')).size, 4);
});

test('restart recovers legacy partials; stale cleanup respects backup, fresh uploads and completed objects', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-upload-recovery-'));
  const database = join(directory, 'wallet.sqlite'), objects = join(directory, 'objects');
  let store = openStore(database, secret), files;
  t.after(async () => { files?.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  const [card] = store.createCodes({ kind: 'activation', count: 1, points: 0 });
  const a = store.activate({ username: 'recovery-owner', password: 'cloud-test-password', code: card.code });
  store.cloud.setQuota(a.user.id, 12);
  const hash = hashOf('abcd'), folder = join(objects, hashOf(a.user.id), hash.slice(0, 2)), path = join(folder, hash);
  await mkdir(folder, { recursive: true });
  await writeFile(`${path}.upload`, 'ab');
  await writeFile(`${path}.upload.json`, JSON.stringify({ total: 4 }));
  const broken = hashOf('broken'), brokenFolder = join(objects, hashOf(a.user.id), broken.slice(0, 2));
  await mkdir(brokenFolder, { recursive: true });
  await writeFile(join(brokenFolder, `${broken}.upload`), 'unresumable bytes');
  const crashed = join(brokenFolder, `${broken}.old-process.upload`);
  await writeFile(crashed, 'abandoned whole-file transfer');
  store.close();
  store = openStore(database, secret);
  files = createCloudFiles(objects, store.cloud, fail);
  assert.equal(store.cloud.status(a.user.id).reservedBytes, 4, 'pre-upgrade partials count before new requests');
  await assert.rejects(readFile(crashed), { code: 'ENOENT' });
  assert.equal((await files.uploadStatus(a.user.id, broken)).offset, 0, 'a partial without metadata restarts cleanly');
  assert.deepEqual(await files.uploadStatus(a.user.id, hash), { hash, complete: false, offset: 2, size: 4 });
  files.close(); store.close();
  store = openStore(database, secret);
  files = createCloudFiles(objects, store.cloud, fail);
  assert.equal(store.cloud.status(a.user.id).reservedBytes, 4, 'reservation survives restart without doubling');
  const request = (text, headers = {}) => Object.assign(Readable.from([Buffer.from(text)]),
    { headers: { 'content-length': String(Buffer.byteLength(text)), ...headers } });
  const completed = hashOf('done');
  await files.upload(a.user.id, completed, request('done'));
  const fresh = hashOf('efgh');
  await files.upload(a.user.id, fresh, request('ef', { 'content-range': 'bytes 0-1/4' }));
  store.db.prepare('UPDATE cloud_uploads SET updated=0 WHERE hash=?').run(hash);
  await utimes(`${path}.upload`, 0, 0); await utimes(`${path}.upload.json`, 0, 0);
  store.db.prepare("INSERT INTO cloud_maintenance VALUES ('backup',?)").run(Date.now() + 60000);
  assert.equal(files.sweepUploads().skipped, true);
  assert.equal(await readFile(`${path}.upload`, 'utf8'), 'ab');
  store.db.prepare('DELETE FROM cloud_maintenance').run();
  const cleaned = files.sweepUploads();
  assert.equal(cleaned.files, 2);
  assert.equal(store.cloud.status(a.user.id).reservedBytes, 4, 'fresh upload is preserved');
  assert.equal((await files.uploadStatus(a.user.id, fresh)).offset, 2);
  assert.equal((await files.uploadStatus(a.user.id, completed)).complete, true);
  assert.equal(await readFile(join(objects, hashOf(a.user.id), completed.slice(0, 2), completed), 'utf8'), 'done');
  assert.deepEqual(await files.uploadStatus(a.user.id, hash), { hash, complete: false, offset: 0, size: null });
});

test('cleanup cannot remove an active upload even when its reservation appears expired', async (t) => {
  const f = await fixture(t), a = f.account('active-upload');
  let started, finish;
  const running = new Promise((resolve) => { started = resolve; });
  const proceed = new Promise((resolve) => { finish = resolve; });
  const req = Object.assign(Readable.from((async function* () {
    yield Buffer.from('ab'); started(); await proceed; yield Buffer.from('cd');
  })()), { headers: { 'content-length': '4' } });
  const upload = f.cloudFiles.upload(a.user.id, hashOf('abcd'), req);
  t.after(() => finish());
  await running;
  f.store.db.prepare('UPDATE cloud_uploads SET updated=0').run();
  assert.equal(f.cloudFiles.sweepUploads(Date.now() + 2 * CLOUD_CLEANUP_GRACE_MS).files, 0);
  finish();
  assert.equal((await upload).size, 4);
  assert.equal(f.store.cloud.status(a.user.id).reservedBytes, 0);
});

test('range downloads remain authenticated and accept only valid open-ended byte offsets', async (t) => {
  const f = await fixture(t), a = f.account('range-owner'), b = f.account('range-other');
  const file = await f.upload(a, 'assets/video.mp4', '0123456789');
  const get = (range, token = a.token) => fetch(`${f.origin}/api/cloud/objects/${file.hash}`, {
    headers: { authorization: `Bearer ${token}`, ...(range === undefined ? {} : { range }) },
  });
  const resumed = await get('bytes=4-');
  assert.equal(resumed.status, 206);
  assert.equal(resumed.headers.get('content-range'), 'bytes 4-9/10');
  assert.equal(resumed.headers.get('content-length'), '6');
  assert.equal(await resumed.text(), '456789');
  for (const invalid of ['bytes=10-', 'bytes=-3', 'bytes=1-3', 'bytes=0-1,3-4', 'bytes=9007199254740993-']) {
    const response = await get(invalid);
    assert.equal(response.status, 416, invalid);
    assert.equal(response.headers.get('content-range'), 'bytes */10');
    assert.equal(await response.text(), '');
  }
  const forbidden = await get('bytes=4-', b.token);
  assert.equal(forbidden.status, 404); await forbidden.text();
  const complete = await get();
  assert.equal(complete.status, 200); assert.equal(await complete.text(), '0123456789');
});

test('chunk uploads resume after interruption, validate offsets, and isolate temporary state by account', async (t) => {
  const f = await fixture(t), a = f.account('upload-resume-owner'), b = f.account('upload-resume-other');
  const bytes = Buffer.alloc(CLOUD_UPLOAD_CHUNK_BYTES + 37, 7), hash = hashOf(bytes);
  const statusPath = `/api/cloud/objects/${hash}/upload`;
  const first = await fetch(`${f.origin}/api/cloud/objects/${hash}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/octet-stream',
      'content-length': String(CLOUD_UPLOAD_CHUNK_BYTES), 'content-range': `bytes 0-${CLOUD_UPLOAD_CHUNK_BYTES - 1}/${bytes.length}` },
    body: bytes.subarray(0, CLOUD_UPLOAD_CHUNK_BYTES),
  });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { hash, size: bytes.length, offset: CLOUD_UPLOAD_CHUNK_BYTES, complete: false });
  assert.deepEqual((await f.call(statusPath, a.token)).data,
    { hash, complete: false, offset: CLOUD_UPLOAD_CHUNK_BYTES, size: bytes.length });
  assert.equal((await f.call(statusPath, b.token)).status, 200);
  assert.deepEqual((await f.call(statusPath, b.token)).data, { hash, complete: false, offset: 0, size: null });

  const wrongOffset = await fetch(`${f.origin}/api/cloud/objects/${hash}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/octet-stream',
      'content-length': '37', 'content-range': `bytes ${CLOUD_UPLOAD_CHUNK_BYTES - 1}-${bytes.length - 2}/${bytes.length}` },
    body: bytes.subarray(-37),
  });
  assert.equal(wrongOffset.status, 409);
  assert.equal((await wrongOffset.json()).error.message.includes(`当前应从 ${CLOUD_UPLOAD_CHUNK_BYTES} 字节继续`), true);

  const final = await fetch(`${f.origin}/api/cloud/objects/${hash}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/octet-stream',
      'content-length': '37', 'content-range': `bytes ${CLOUD_UPLOAD_CHUNK_BYTES}-${bytes.length - 1}/${bytes.length}` },
    body: bytes.subarray(-37),
  });
  assert.equal(final.status, 200);
  assert.deepEqual(await final.json(), { hash, size: bytes.length, offset: bytes.length, complete: true });
  assert.deepEqual((await f.call(statusPath, a.token)).data,
    { hash, complete: true, offset: bytes.length, size: bytes.length });
  const stored = await fetch(`${f.origin}/api/cloud/objects/${hash}`, { headers: { authorization: `Bearer ${a.token}` } });
  assert.deepEqual(Buffer.from(await stored.arrayBuffer()), bytes);
  assert.equal((await f.call(`/api/cloud/objects/${hash}`, b.token)).status, 404);
});

test('media fees default off; only successful archived tasks settle once after price consent', async (t) => {
  const f = await fixture(t), a = f.account('billing-user'), b = f.account('other-user');
  assert.equal(f.store.cloud.prices().enabled, false);
  const files = [await f.upload(a, 'film.html', '<html>film</html>'),
    await f.upload(a, 'assets/a.png', 'simulated picture'), await f.upload(a, 'assets/a.mp4', 'simulated video')];
  await f.call('/api/cloud/projects/project-0001', a.token,
    { title: 'film', parentRevision: 0, requestKey: 'billing-snapshot', files });
  const prices = (await f.call('/api/admin/cloud/prices', secret, { enabled: true, imagePoints: 5, videoPoints: 1 }, 'PUT')).data;
  const receipt = { taskId: 'task-image-001', projectId: 'project-0001', status: 'done', kind: 'image', hash: files[1].hash, priceVersion: prices.priceVersion };
  assert.equal((await f.call('/api/cloud/generations/success', a.token, receipt)).status, 409);
  await f.call('/api/cloud/consent', a.token, { priceVersion: prices.priceVersion });
  assert.equal((await f.call('/api/cloud/generations/success', a.token, { ...receipt, status: 'failed' })).status, 400);
  assert.equal((await f.call('/api/cloud/generations/success', a.token, { ...receipt, hash: hashOf('missing') })).status, 409);
  assert.equal((await f.call('/api/cloud/generations/success', b.token, receipt)).status, 404);
  const results = await Promise.all(Array.from({ length: 3 }, () => f.call('/api/cloud/generations/success', a.token, receipt)));
  assert.ok(results.every((result) => result.status === 200 && result.data.charged === 5));
  assert.equal(f.store.wallet(a.user.id).user.balance, 15);
  assert.equal(f.store.wallet(a.user.id).ledger.filter((entry) => entry.kind === 'media-service').length, 1);
  assert.equal((await f.call('/api/cloud/generations/success', a.token, { ...receipt, hash: files[2].hash })).status, 409);
  await f.call('/api/cloud/generations/success', a.token,
    { ...receipt, taskId: 'task-video-001', kind: 'video', hash: files[2].hash });
  assert.equal(f.store.wallet(a.user.id).user.balance, 14);
  await f.call('/api/admin/cloud/prices', secret, { enabled: true, imagePoints: 6, videoPoints: 2 }, 'PUT');
  assert.equal((await f.call('/api/cloud/generations/success', a.token, receipt)).data.charged, 5, 'old receipts keep their original fee');
  assert.equal((await f.call('/api/cloud/generations/success', a.token, { ...receipt, taskId: 'task-image-002' })).status, 409);
});

test('insufficient balance never writes a partial receipt or discards the cloud project', async (t) => {
  const f = await fixture(t), a = f.account('empty-wallet', 0);
  const files = [await f.upload(a, 'film.html', '<html>film</html>'), await f.upload(a, 'assets/a.png', 'picture')];
  await f.call('/api/cloud/projects/project-0001', a.token, { title: 'film', parentRevision: 0, requestKey: 'empty-snapshot', files });
  const rates = f.store.cloud.savePrices({ enabled: true, imagePoints: 5, videoPoints: 1 });
  f.store.cloud.consent(a.user.id, rates.priceVersion);
  assert.equal((await f.call('/api/cloud/generations/success', a.token, {
    projectId: 'project-0001', taskId: 'empty-task-01', hash: files[1].hash, kind: 'image', status: 'done', priceVersion: rates.priceVersion,
  })).status, 402);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM cloud_receipts').get().n, 0);
  assert.equal((await f.call('/api/cloud/projects/project-0001', a.token)).status, 200);
});

test('cloud trash, recovery and permanent deletion enforce ownership and stale-version protection', async (t) => {
  const f = await fixture(t), a = f.account('lifecycle-owner'), b = f.account('lifecycle-other');
  const film = await f.upload(a, 'film.html', '<html>original</html>');
  const commit = { title: '不能误删的短剧', parentRevision: 0, requestKey: 'lifecycle-first', files: [film] };
  const endpoint = '/api/cloud/projects/project-lifecycle';
  await f.call(endpoint, a.token, commit);
  await f.call(endpoint, a.token, { ...commit, parentRevision: 1, requestKey: 'lifecycle-second' });
  assert.equal((await f.call(`${endpoint}/trash`, b.token, { revision: 2 })).status, 404);
  assert.equal((await f.call(`${endpoint}/trash`, a.token, { revision: 1 })).status, 409);
  assert.deepEqual((await f.call(`${endpoint}/versions`, a.token)).data.versions.map((v) => v.revision), [2, 1]);
  const trash = (await f.call(`${endpoint}/trash`, a.token, { revision: 2 })).data;
  assert.equal((await f.call('/api/cloud/projects', a.token)).data.projects.length, 0);
  assert.equal((await f.call('/api/cloud/trash', a.token)).data.projects[0].trashToken, trash.trashToken);
  assert.equal((await f.call(endpoint, a.token)).status, 410);
  assert.equal((await f.call(endpoint, a.token, commit)).status, 410, 'an old idempotent request cannot resurrect trash');
  assert.equal((await f.call(`${endpoint}/restore`, a.token, { trashToken: 'stale-token' })).status, 409);
  await f.call(`${endpoint}/restore`, a.token, trash);
  assert.equal((await f.call(endpoint, a.token)).data.revision, 2);
  const secondTrash = (await f.call(`${endpoint}/trash`, a.token, { revision: 2 })).data;
  assert.notEqual(secondTrash.trashToken, trash.trashToken);
  assert.equal((await f.call(`${endpoint}/purge`, a.token, { ...trash, confirmTitle: commit.title })).status, 409);
  assert.equal((await f.call(`${endpoint}/purge`, a.token, { ...secondTrash, confirmTitle: 'wrong title' })).status, 409);
  assert.equal((await f.call(`${endpoint}/purge`, a.token, { ...secondTrash, confirmTitle: commit.title })).status, 200);
  assert.equal((await f.call(endpoint, a.token, commit)).status, 410, 'purged ids stay retired');
  assert.equal((await f.call('/api/cloud/trash', a.token)).data.projects.length, 0);
  assert.equal(f.store.wallet(a.user.id).user.balance, 20);
});

test('space reclamation protects all versions, shared assets, trash, fresh uploads and billing receipts', async (t) => {
  const f = await fixture(t), a = f.account('cleanup-owner'), b = f.account('cleanup-other');
  const oldFilm = await f.upload(a, 'film.html', '<html>old</html>');
  const newFilm = await f.upload(a, 'film.html', '<html>new</html>');
  const shared = await f.upload(a, 'assets/shared.png', 'shared picture');
  const orphan = await f.upload(a, 'assets/orphan.png', 'orphan picture');
  const fresh = await f.upload(a, 'assets/fresh.png', 'fresh picture');
  await f.upload(b, 'assets/orphan.png', 'orphan picture');
  const endpoint = '/api/cloud/projects/project-cleanup';
  await f.call(endpoint, a.token, { title: 'cleanup', parentRevision: 0, requestKey: 'cleanup-first', files: [oldFilm, shared] });
  const receipt = { projectId: 'project-cleanup', taskId: 'cleanup-task-image', status: 'done', kind: 'image', hash: shared.hash };
  assert.equal((await f.call('/api/cloud/generations/success', a.token, receipt)).status, 200);
  await f.call(endpoint, a.token, { title: 'cleanup', parentRevision: 1, requestKey: 'cleanup-second', files: [newFilm, shared] });
  await f.call('/api/cloud/projects/shared-project', a.token, { title: 'shared', parentRevision: 0, requestKey: 'shared-first', files: [newFilm, shared] });
  const trash = (await f.call(`${endpoint}/trash`, a.token, { revision: 2 })).data;
  f.store.db.prepare('UPDATE cloud_objects SET created=0 WHERE user_id=? AND hash<>?').run(a.user.id, fresh.hash);
  const preview = (await f.call('/api/cloud/storage/preview', a.token)).data;
  assert.equal(preview.objects, 1, 'trash and historical film remain protected');
  assert.equal(preview.bytes, orphan.size);
  assert.equal((await f.call('/api/cloud/storage/cleanup', b.token, { token: preview.token, confirm: '清理未引用文件' })).status, 409);
  assert.equal((await f.call('/api/cloud/storage/cleanup', a.token, { token: preview.token })).status, 409);
  f.store.db.prepare("INSERT INTO cloud_maintenance VALUES ('backup',?)").run(Date.now() + 60000);
  assert.equal((await f.call('/api/cloud/storage/cleanup', a.token, { token: preview.token, confirm: '清理未引用文件' })).status, 409);
  f.store.db.prepare('DELETE FROM cloud_maintenance').run();
  const cleaned = await f.call('/api/cloud/storage/cleanup', a.token, { token: preview.token, confirm: '清理未引用文件' });
  assert.equal(cleaned.data.bytes, orphan.size);
  assert.equal((await f.call(`/api/cloud/objects/${orphan.hash}`, a.token)).status, 404);
  assert.ok(f.store.cloud.blob(b.user.id, orphan.hash));
  assert.ok(f.store.cloud.blob(a.user.id, oldFilm.hash));
  assert.ok(f.store.cloud.blob(a.user.id, fresh.hash));
  await f.call(`${endpoint}/purge`, a.token, { ...trash, confirmTitle: 'cleanup' });
  const after = (await f.call('/api/cloud/storage/preview', a.token)).data;
  assert.equal(after.objects, 1, 'the other project still protects shared image and new film');
  assert.equal(after.bytes, oldFilm.size);
  assert.equal((await f.call('/api/cloud/storage/cleanup', a.token, { token: preview.token, confirm: '清理未引用文件' })).status, 409);
  assert.equal((await f.call('/api/cloud/generations/success', a.token, receipt)).data.repeated, true, 'receipts survive project removal');
});

test('history paginates and cleanup rejects changed references while preserving busy files', async (t) => {
  const f = await fixture(t), a = f.account('history-pagination');
  const film = await f.upload(a, 'film.html', '<html>history</html>');
  for (let i = 0; i < 102; i++) f.store.cloud.commit(a.user.id, 'history-project', {
    title: 'history', parentRevision: i, requestKey: `history-request-${i}`, files: [film],
  });
  const first = (await f.call('/api/cloud/projects/history-project/versions', a.token)).data;
  assert.equal(first.versions.length, 100);
  assert.equal(first.nextBefore, 3);
  const second = (await f.call(`/api/cloud/projects/history-project/versions?before=${first.nextBefore}`, a.token)).data;
  assert.deepEqual(second.versions.map((entry) => entry.revision), [2, 1]);
  assert.equal((await f.call('/api/cloud/projects/history-project/versions?before=bad', a.token)).status, 400);
  const loose = await f.upload(a, 'assets/loose.png', 'previously unused');
  f.store.db.prepare('UPDATE cloud_objects SET created=0').run();
  const preview = f.store.cloud.cleanupPreview(a.user.id);
  const skipped = f.store.cloud.cleanup(a.user.id, { token: preview.token, confirm: '清理未引用文件' }, () => false);
  assert.equal(skipped.skipped, 1);
  assert.ok(f.store.cloud.blob(a.user.id, loose.hash), 'busy/unreadable file metadata is preserved');
  f.store.cloud.commit(a.user.id, 'history-project', {
    title: 'history', parentRevision: 102, requestKey: 'history-added-reference', files: [film, loose],
  });
  assert.equal((await f.call('/api/cloud/storage/cleanup', a.token, { token: preview.token, confirm: '清理未引用文件' })).status, 409);
  assert.ok(f.store.cloud.blob(a.user.id, loose.hash));
});
