import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createWanjuAutoSync } from './wanju-cloud-auto.mjs';
import { createStudentService } from '../../wanju-service/server.mjs';
import { cloudLocalSnapshot, createCloudSync } from '../../wanju-service/cloud-client.mjs';

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-auto-cloud-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let time = 100000, owner = 'account-a', snapshot = 'snapshot-one', uploads = 0, working = false;
  const file = join(directory, 'preferences.json');
  const options = {
    file, identity: () => owner, now: () => time,
    projects: async () => [{ id: 'project-one' }],
    sample: async () => working ? null : snapshot,
    upload: async () => ({ revision: ++uploads, syncedAt: time, billingWarnings: [] }),
    ...overrides,
  };
  const automatic = createWanjuAutoSync(options);
  return { automatic, file, options, advance: (ms = 30000) => { time += ms; },
    owner: (value) => { owner = value; }, snapshot: (value) => { snapshot = value; },
    working: (value) => { working = value; }, uploads: () => uploads,
    enable: () => automatic.configure({ owner, projectId: 'project-one', enabled: true, priceVersion: 'price-one' }) };
}

test('automatic upload is opt-in, waits for stability, and skips unchanged snapshots', async (t) => {
  const f = await fixture(t);
  await f.automatic.tick(); assert.equal(f.uploads(), 0);
  f.enable(); await f.automatic.tick(); assert.equal(f.uploads(), 0);
  f.advance(29999); await f.automatic.tick(); assert.equal(f.uploads(), 0);
  f.advance(1); await f.automatic.tick(); assert.equal(f.uploads(), 1);
  assert.equal(f.automatic.list()[0].phase, 'synced');
  f.advance(); await f.automatic.tick(); assert.equal(f.uploads(), 1);
  f.snapshot('changed'); await f.automatic.tick(); assert.equal(f.uploads(), 1);
  f.advance(); await f.automatic.tick(); assert.equal(f.uploads(), 2);
});

test('working project waits, disabled rules stop, preferences survive restart and stay account-scoped', async (t) => {
  const f = await fixture(t); f.enable(); f.working(true);
  await f.automatic.tick(); f.advance(); await f.automatic.tick(); assert.equal(f.uploads(), 0);
  f.working(false); await f.automatic.tick(); f.advance(); await f.automatic.tick(); assert.equal(f.uploads(), 1);
  f.owner('account-b'); assert.deepEqual(f.automatic.list(), []);
  f.snapshot('another-change'); f.advance(); await f.automatic.tick(); assert.equal(f.uploads(), 1);
  assert.throws(() => f.automatic.configure({ owner: 'account-a', projectId: 'project-one', enabled: false }), /账号已切换/);
  f.owner('account-a');
  const restarted = createWanjuAutoSync(f.options);
  assert.equal(restarted.list()[0].enabled, true);
  restarted.configure({ owner: 'account-a', projectId: 'project-one', enabled: false });
  await restarted.tick(); assert.deepEqual(restarted.list(), []);
  assert.deepEqual(JSON.parse(await readFile(f.file, 'utf8')), []);
});

test('conflicts, deleted projects, quotas and authorization pause without repeated uploads', async (t) => {
  for (const status of [401, 403, 404, 409, 410, 413]) {
    let attempts = 0;
    const f = await fixture(t, { upload: async () => { attempts++; throw Object.assign(new Error('manual check required'), { status }); } });
    f.enable(); await f.automatic.tick(); f.advance(); await f.automatic.tick();
    assert.equal(f.automatic.list()[0].phase, 'paused');
    f.advance(1000000); await f.automatic.tick(); assert.equal(attempts, 1);
    const restarted = createWanjuAutoSync(f.options);
    await restarted.tick(); assert.equal(attempts, 1);
    assert.equal(restarted.list()[0].phase, 'paused');
  }
});

test('temporary network failures back off, stop after five attempts, and require explicit re-enable', async (t) => {
  let attempts = 0;
  const f = await fixture(t, { upload: async () => { attempts++; throw new Error('network unavailable'); } });
  f.enable(); await f.automatic.tick(); f.advance(); await f.automatic.tick();
  assert.equal(f.automatic.list()[0].phase, 'retry');
  await f.automatic.tick(); assert.equal(attempts, 1);
  for (let i = 1; i < 5; i++) { f.advance(1000000); await f.automatic.tick(); }
  assert.equal(attempts, 5); assert.equal(f.automatic.list()[0].phase, 'paused');
  f.advance(1000000); await f.automatic.tick(); assert.equal(attempts, 5);
  f.enable(); await f.automatic.tick(); assert.equal(f.automatic.list()[0].phase, 'waiting');
});

test('pending billing pauses and does not repeatedly try to charge', async (t) => {
  let attempts = 0;
  const f = await fixture(t, { upload: async () => { attempts++; return { revision: 2, billingWarnings: [{ message: 'balance' }] }; } });
  f.enable(); await f.automatic.tick(); f.advance(); await f.automatic.tick();
  assert.equal(f.automatic.list()[0].phase, 'paused');
  assert.equal(f.automatic.list()[0].revision, 2);
  f.advance(); await f.automatic.tick(); assert.equal(attempts, 1);
});

test('concurrent ticks and account switches never dispatch a late upload', async (t) => {
  let completeSample, samples = 0;
  const f = await fixture(t, { sample: () => { samples++; return new Promise((resolve) => { completeSample = resolve; }); } });
  f.enable();
  const pending = f.automatic.tick();
  await new Promise((resolve) => setImmediate(resolve));
  await f.automatic.tick(); assert.equal(samples, 1);
  f.owner('account-b'); completeSample('snapshot'); await pending;
  assert.equal(f.uploads(), 0); assert.deepEqual(f.automatic.list(), []);
});

test('corrupt preferences never get silently overwritten', async (t) => {
  const f = await fixture(t);
  await writeFile(f.file, '{corrupted');
  assert.throws(() => createWanjuAutoSync(f.options));
  assert.equal(await readFile(f.file, 'utf8'), '{corrupted');
});

test('an unavailable local Studio reports retry state without dropping configured projects', async (t) => {
  const f = await fixture(t, { projects: async () => { throw new Error('Studio temporarily unavailable'); } });
  f.enable(); await f.automatic.tick();
  assert.equal(f.automatic.list()[0].phase, 'retry');
  assert.equal(f.automatic.list()[0].enabled, true);
  assert.equal(f.uploads(), 0);
});

for (const legacy of [false, true]) {
  test(`real automatic ${legacy ? 'legacy' : 'resumable'} uploads charge once across restarts and stop on another computer revision`, async (t) => {
    let client;
    const f = await fixture(t, {
      sample: () => cloudLocalSnapshot(root, '自动云项目'),
      upload: (_project, expected) => client.push({ root, title: '自动云项目', expectedPriceVersion: expected.priceVersion }),
    });
    const root = join(dirname(f.file), 'project');
    await mkdir(join(root, '.film'), { recursive: true }); await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'film.html'), '<html>original</html>');
    const { server, store } = createStudentService({ adminSecret: 'local-auto-sync-test-secret-only',
      cloudDirectory: join(dirname(f.file), 'server') });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); store.close(); });
    const account = store.register({ username: 'auto-fixture', password: 'not-a-real-account-password' });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, options = {}) => {
      if (legacy) {
        assert.ok(!path.endsWith('/upload'));
        if (options.method === 'PUT') assert.equal(options.headers['content-range'], undefined);
      }
      const response = await fetch(`${origin}${path}`, { ...options,
        headers: { ...options.headers, authorization: `Bearer ${account.token}` } });
      if (legacy && path === '/api/cloud/status') {
        const data = await response.json();
        delete data.capabilities;
        return Response.json(data);
      }
      return response;
    };
    const connect = () => createCloudSync({ origin, userId: account.user.id, request });
    client = connect();
    let automatic = f.automatic;
    const initial = await client.push({ root, title: '自动云项目' });
    const prices = store.cloud.savePrices({ enabled: true, imagePoints: 5, videoPoints: 1 });
    const [card] = store.createCodes({ kind: 'recharge', count: 1, points: 20 });
    store.redeem(account.user.id, card.code); await client.consent(prices.priceVersion);
    automatic.configure({ owner: 'account-a', projectId: 'project-one', enabled: true, priceVersion: prices.priceVersion });
    await writeFile(join(root, 'assets/generated.png'), 'synthetic image bytes; not a supplier request');
    await writeFile(join(root, '.film/wanju-tasks.json'), JSON.stringify([
      { id: 'auto-success-fixture', status: 'done', path: 'assets/generated.png' },
    ]));
    await automatic.tick(); f.advance(); await automatic.tick();
    assert.equal(automatic.list()[0].phase, 'synced');
    assert.equal(store.wallet(account.user.id).user.balance, 15);
    f.advance(); await automatic.tick();
    assert.equal(store.wallet(account.user.id).user.balance, 15);
    assert.equal(store.cloud.version(account.user.id, initial.id).revision, 2);
    client = connect();
    automatic = createWanjuAutoSync(f.options);
    await automatic.tick(); f.advance(); await automatic.tick();
    assert.equal(automatic.list()[0].phase, 'synced');
    assert.equal(automatic.list()[0].revision, 2, 'persisted fingerprints prevent unchanged commits after restart');
    assert.equal(store.wallet(account.user.id).user.balance, 15, 'persisted receipts prevent repeat fees after restart');
    const second = join(dirname(f.file), 'second-computer'); await mkdir(second);
    const restored = await client.pull({ projectId: initial.id, parent: second });
    await writeFile(join(restored.path, 'film.html'), '<html>second computer</html>');
    await client.push({ root: restored.path, title: '自动云项目' });
    await writeFile(join(root, 'film.html'), '<html>local changes remain safe</html>');
    await automatic.tick(); f.advance(); await automatic.tick();
    assert.equal(automatic.list()[0].phase, 'paused');
    assert.match(automatic.list()[0].message, /另一台电脑/);
    assert.equal(await readFile(join(root, 'film.html'), 'utf8'), '<html>local changes remain safe</html>');
  });
}
