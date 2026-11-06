import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createWanjuAccount } from './wanju-account.mjs';

test('account tier changes pin subsequent requests to the confirmed tier and price version', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-account-tier-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const installed = [];
  let tier = 'base', notifications = 0;
  const version = 'a'.repeat(64);
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: 'https://service.example',
    seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install: (value) => installed.push(value), remove() {} },
    onChange: () => notifications++,
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      if (path === '/api/login') return Response.json({ token: 'wjs_isolated-account-session' });
      if (path === '/api/chat/tier') {
        const body = JSON.parse(init.body);
        assert.equal(body.priceVersion, version);
        tier = body.tier;
        return Response.json({});
      }
      return Response.json({ user: { id: 'creator', balance: 1000 },
        chat: { enabled: true, authorized: true, selectedTier: tier, priceVersion: version } });
    },
  });
  await bridge.authenticate('login', { username: 'creator', password: 'isolated-password' });
  assert.equal(installed.at(-1).baseUrl, `https://service.example/v1/tier/base/${version}`);
  const before = notifications;
  assert.equal((await bridge.selectTier('claude', version)).chat.selectedTier, 'claude');
  assert.equal(installed.at(-1).baseUrl, `https://service.example/v1/tier/claude/${version}`);
  assert.equal(installed.at(-1).key, 'wjs_isolated-account-session');
  assert.equal(notifications, before + 1);
});

test('cloud assistant follows the server protocol without a supplier key and is removed on logout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-default-assistant-'));
  let format = 'responses', removed = 0;
  const installed = [];
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: 'https://service.example', seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install: (value) => installed.push(value), remove: () => removed++ },
    fetchImpl: async (url) => {
      if (new URL(url).pathname === '/api/login') return Response.json({ token: 'wjs_account-session-only' });
      return Response.json({ user: { id: 'creator', balance: 0 },
        chat: { enabled: true, authorized: true, format, billingMode: 'included', maxOutputTokens: 4096 } });
    },
  });
  try {
    await bridge.authenticate('login', { username: 'creator', password: 'test-password' });
    assert.equal(installed.at(-1).format, 'responses');
    assert.equal(installed.at(-1).billingMode, 'included');
    assert.equal(installed.at(-1).key, 'wjs_account-session-only');
    assert.equal(installed.at(-1).baseUrl, 'https://service.example/v1');
    format = 'chat';
    await bridge.status();
    assert.equal(installed.at(-1).format, 'chat');
    const before = removed;
    await bridge.logout();
    assert.equal(removed, before + 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('settlement refresh announces the new wallet balance without making ordinary status reads recursive', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-wallet-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let balance = 100, notifications = 0, reads = 0;
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: 'https://service.example',
    seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install() {}, remove() {} }, onChange: () => notifications++,
    fetchImpl: async (url) => {
      if (new URL(url).pathname === '/api/login') return Response.json({ token: 'wjs_local-test-only' });
      reads++;
      return Response.json({ user: { id: 'creator', balance }, chat: { enabled: false } });
    },
  });
  await bridge.authenticate('login', { username: 'creator', password: 'test-password' });
  const before = notifications, beforeReads = reads;
  balance = 94;
  assert.equal((await bridge.refresh()).user.balance, 94);
  assert.equal(notifications, before + 1);
  assert.equal(reads, beforeReads + 1);
  await bridge.status();
  assert.equal(notifications, before + 1);
});

test('own media is explicit, account-scoped, and revoked on expiry or connectivity failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-access-account-'));
  let identity = 'one', failure = 0, notifications = 0;
  const published = [];
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: 'https://service.example', seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install() { assert.fail('No paid model probes or installation without consent'); }, remove() {} },
    onState: (state) => published.push(state), onChange: () => notifications++,
    fetchImpl: async (url) => {
      if (failure === -1) throw new Error('offline');
      if (failure) return Response.json({ error: { message: 'expired' } }, { status: failure });
      const path = new URL(url).pathname;
      if (path === '/api/login') return Response.json({ token: `wjs_${identity}` });
      return Response.json({ user: { id: identity, username: identity, balance: 0 }, chat: { enabled: false } });
    },
  });
  try {
    await assert.rejects(bridge.setOwnMediaEnabled(true), /激活或登录/);
    await bridge.authenticate('login', { username: 'one', password: 'test-password' });
    assert.equal((await bridge.status()).ownMediaEnabled, false);
    assert.equal((await bridge.setOwnMediaEnabled(true)).ownMediaEnabled, true);
    failure = -1;
    await assert.rejects(bridge.status(), /连接不上/);
    assert.equal(published.at(-1).authenticated, false);
    failure = 0;
    assert.equal((await bridge.status()).ownMediaEnabled, true);
    failure = 401;
    const expired = await bridge.status();
    assert.equal(expired.authenticated, false);
    assert.equal(expired.ownMediaEnabled, false);
    assert.ok(notifications >= 3);
    failure = 0; identity = 'two';
    const next = await bridge.authenticate('login', { username: 'two', password: 'test-password' });
    assert.equal(next.ownMediaEnabled, false);
    await bridge.logout();
    assert.equal(published.at(-1).authenticated, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cloud transport keeps the session in the main process and rejects stale-account requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-cloud-account-'));
  let identity = 'first', calls = 0;
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: 'https://service.example', seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install() {}, remove() {} },
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      if (path === '/api/login') return Response.json({ token: `wjs_${identity}` });
      if (path === '/api/me') return Response.json({ user: { id: identity }, chat: { enabled: false } });
      if (path === '/api/cloud/projects') {
        calls++; assert.equal(init.headers.authorization, 'Bearer wjs_first');
        return Response.json({ projects: [] });
      }
      return Response.json({});
    },
  });
  try {
    await assert.rejects(bridge.cloudSession(), /请先登录/);
    await bridge.authenticate('login', { username: 'first', password: 'test-password' });
    const session = await bridge.cloudSession();
    assert.equal(session.userId, 'first');
    assert.equal(session.token, undefined);
    await session.request('/api/cloud/projects');
    await assert.rejects(session.request('/api/cloud/../admin'), /地址无效/);
    identity = 'second';
    await bridge.authenticate('login', { username: 'second', password: 'test-password' });
    await assert.rejects(session.request('/api/cloud/projects'), /账号已切换/);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const lateStatus of [200, 401]) {
  test(`a late ${lateStatus} status from the old account cannot replace or clear a completed login`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'wanju-login-race-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const published = [], installed = [];
    let loginCount = 0, releaseLogin, releaseStatus;
    const loginStarted = Promise.withResolvers();
    const statusStarted = Promise.withResolvers();
    const bridge = createWanjuAccount({
      dataDir: directory, serviceUrl: 'https://service.example',
      seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
      model: { install: (value) => installed.push(value), remove() {} },
      onState: (state) => published.push(state),
      fetchImpl: async (url, init) => {
        const path = new URL(url).pathname;
        if (path === '/api/login') {
          loginCount++;
          if (loginCount === 1) return Response.json({ token: 'wjs_first' });
          return new Promise((resolve) => {
            releaseLogin = () => resolve(Response.json({ token: 'wjs_second' }));
            loginStarted.resolve();
          });
        }
        const first = init.headers.authorization === 'Bearer wjs_first';
        if (first && loginCount === 2) {
          return new Promise((resolve) => {
            releaseStatus = () => resolve(lateStatus === 401
              ? Response.json({ error: { message: 'expired old account' } }, { status: 401 })
              : Response.json({ user: { id: 'first' }, chat: { enabled: true, authorized: true } }));
            statusStarted.resolve();
          });
        }
        return Response.json({ user: { id: first ? 'first' : 'second' }, chat: { enabled: true, authorized: true } });
      },
    });
    await bridge.authenticate('login', { username: 'first', password: 'test-password' });
    const login = bridge.authenticate('login', { username: 'second', password: 'test-password' });
    await loginStarted.promise;
    const status = bridge.status();
    const statusResult = lateStatus === 401 ? assert.rejects(status, /expired old account/) : status;
    await statusStarted.promise;
    releaseLogin();
    assert.equal((await login).user.id, 'second');
    const count = published.length;
    releaseStatus();
    await statusResult;
    assert.equal(published.length, count, 'the stale request must not publish any state');
    assert.equal(published.at(-1).user.id, 'second');
    assert.equal(installed.at(-1).key, 'wjs_second');
    await access(join(directory, 'student-session'));
    assert.equal((await bridge.status()).user.id, 'second');
  });
}

test('logout clears local credentials and aborts an in-flight cloud transfer before server revocation completes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-logout-transfer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const published = [];
  let releaseLogout, cloudSignal, logoutHeader, removed = 0;
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: 'https://service.example',
    seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install() {}, remove() { removed++; } },
    onState: (state) => published.push(state),
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      if (path === '/api/login') return Response.json({ token: 'wjs_first' });
      if (path === '/api/me') return Response.json({ user: { id: 'first' }, chat: { enabled: false } });
      if (path === '/api/logout') {
        logoutHeader = init.headers.authorization;
        return new Promise((resolve) => { releaseLogout = () => resolve(Response.json({})); });
      }
      cloudSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    },
  });
  await bridge.authenticate('login', { username: 'first', password: 'test-password' });
  const session = await bridge.cloudSession();
  const transfer = assert.rejects(session.request('/api/cloud/projects'), /abort/i);
  assert.equal(cloudSignal.aborted, false);
  const before = removed;
  const logout = bridge.logout();
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(cloudSignal.aborted, true);
    assert.equal(published.at(-1).authenticated, false);
    assert.equal(removed, before + 1);
    await assert.rejects(access(join(directory, 'student-session')), { code: 'ENOENT' });
    await assert.rejects(session.request('/api/cloud/projects'), /账号已切换/);
    assert.equal(logoutHeader, 'Bearer wjs_first', 'revocation uses the captured old token');
  } finally {
    releaseLogout();
    await logout;
    await transfer;
  }
});

test('expired accounts and explicit cancellation abort cloud requests', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-expired-transfer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let expired = false, signal;
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: 'https://service.example',
    seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install() {}, remove() {} },
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      if (path === '/api/login') return Response.json({ token: 'wjs_test' });
      if (path === '/api/me') return expired
        ? Response.json({ error: { message: 'expired' } }, { status: 401 })
        : Response.json({ user: { id: 'creator' }, chat: { enabled: false } });
      signal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    },
  });
  await bridge.authenticate('login', { username: 'creator', password: 'test-password' });
  const session = await bridge.cloudSession();
  const cancellation = new AbortController();
  const cancelled = assert.rejects(session.request('/api/cloud/projects', { signal: cancellation.signal }), /abort/i);
  cancellation.abort();
  await cancelled;
  const expiredTransfer = assert.rejects(session.request('/api/cloud/projects'), /abort/i);
  expired = true;
  assert.equal((await bridge.status()).authenticated, false);
  await expiredTransfer;
  assert.equal(signal.aborted, true);
});

test('switching accounts aborts an already streaming HTTP body and the new account gets a fresh transport', { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-stream-account-'));
  let identity = 'first';
  const server = createServer((req, res) => {
    if (req.url === '/api/login') return res.end(JSON.stringify({ token: `wjs_${identity}` }));
    if (req.url === '/api/me') return res.end(JSON.stringify({ user: { id: identity }, chat: { enabled: false } }));
    if (req.url === '/api/cloud/projects') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.write('first bytes');
      return;
    }
    res.end(JSON.stringify({ projects: [] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await rm(directory, { recursive: true, force: true });
  });
  const bridge = createWanjuAccount({
    dataDir: directory, serviceUrl: `http://127.0.0.1:${server.address().port}`,
    seal: (text) => Buffer.from(text), unseal: (bytes) => bytes.toString(),
    model: { install() {}, remove() {} },
  });
  await bridge.authenticate('login', { username: 'first', password: 'test-password' });
  const first = await bridge.cloudSession();
  const response = await first.request('/api/cloud/projects');
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'first bytes');
  const stopped = assert.rejects(reader.read(), /abort/i);
  identity = 'second';
  await bridge.authenticate('login', { username: 'second', password: 'test-password' });
  await stopped;
  await assert.rejects(first.request('/api/cloud/projects'), /账号已切换/);
  const second = await bridge.cloudSession();
  assert.equal(second.userId, 'second');
  assert.deepEqual(await (await second.request('/api/cloud/trash')).json(), { projects: [] });
});
