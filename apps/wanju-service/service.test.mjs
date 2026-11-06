import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudentService } from './server.mjs';
import { createWanjuAccount, studentServiceUrl } from '../desktop/src/wanju-account.mjs';
const adminSecret = 'test-admin-secret-not-a-production-password';
const upstreamKey = 'test-supplier-key-never-delivered-to-students';
const settings = { enabled: true, baseUrl: 'https://supplier.example/v1', model: 'test-model', key: upstreamKey,
  visionVerified: true, inputPointsPerMillion: 1000, outputPointsPerMillion: 2000, reservePoints: 50 };
async function fixture(t, fetchImpl = async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'test answer' } }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } }), serviceOptions = {}) {
  let calls = 0;
  const { server, store } = createStudentService({ ...serviceOptions, adminSecret, fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); store.close(); });
  const call = async (path, { data, method = data === undefined ? 'GET' : 'POST', token, headers = {} } = {}) => {
    const response = await fetch(`${url}${path}`, { method, headers: {
      ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers,
    }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, data: await response.json() };
  };
  const approve = (id) => {
    const draft = store.adminEnrollment(id);
    store.saveEnrollment(id, { ...draft, state: 'ready', channels: draft.channels.map((channel) => ({
      ...channel, credentialMode: 'shared', state: channel.id === 'chat' ? 'ready' : 'unavailable',
    })) });
  };
  const user = async (username = 'student1', points = 1000) => {
    const codes = await call('/api/admin/codes', { token: adminSecret, data: { kind: 'activation', count: 1, points } });
    const activated = await call('/api/activate', { data: { username, password: 'test-password-123', code: codes.data.codes[0].code } });
    const token = activated.data.token;
    approve(activated.data.user.id);
    return { ...activated.data, token };
  };
  return { url, store, call, user, approve, calls: () => calls };
}
const prompt = { model: 'wanju-creative', messages: [{ role: 'user', content: 'test prompt' }], max_tokens: 1000 };

test('included Responses assistant installs after login with zero balance, keeps the upstream key private and enforces a rolling request limit', async (t) => {
  const requests = [];
  const f = await fixture(t, async (url, init) => {
    requests.push(JSON.parse(init.body));
    assert.equal(url, 'https://supplier.example/v1/responses');
    assert.equal(init.headers.authorization, `Bearer ${upstreamKey}`);
    return Response.json({ id: 'response-test', object: 'response', status: 'completed', model: 'gpt-6.1-sol',
      output: [{ type: 'function_call', call_id: 'call-local', name: 'write', arguments: '{"path":"film.html","content":"local test"}' }],
      usage: { input_tokens: 10, output_tokens: 5 } });
  });
  f.store.saveChat({ ...settings, format: 'responses', model: 'gpt-6.1-sol', billingMode: 'included', dailyRequestLimit: 1 });
  const a = await f.user('internal-creator', 0);
  const before = f.store.wallet(a.user.id);
  const account = await f.call('/api/me', { token: a.token });
  assert.equal(account.data.chat.authorized, true);
  assert.equal(account.data.chat.format, 'responses');
  assert.equal(account.data.chat.reservePoints, 0);
  assert.equal(account.data.chat.billingMode, 'included');
  assert.doesNotMatch(JSON.stringify(account.data), /test-supplier-key|supplier\.example|gpt-6\.1-sol/);
  const input = { model: 'wanju-creative', input: 'make a coded title', max_output_tokens: 1000,
    tools: [{ type: 'function', name: 'write', parameters: { type: 'object' } }] };
  const result = await f.call('/v1/responses', { token: a.token, data: input });
  assert.equal(result.status, 200);
  assert.equal(result.data.model, 'wanju-creative');
  assert.equal(result.data.output[0].call_id, 'call-local');
  assert.equal(requests[0].model, 'gpt-6.1-sol');
  assert.equal(requests[0].store, false);
  assert.deepEqual(requests[0].tools, input.tools);
  assert.equal(f.store.wallet(a.user.id).user.balance, before.user.balance);
  assert.equal(f.store.wallet(a.user.id).ledger.length, before.ledger.length, 'included requests do not clutter the wallet with zero-value rows');
  assert.equal(f.store.wallet(a.user.id).operations[0].charged, 0);
  assert.equal((await f.call('/v1/responses', { token: a.token, data: input })).status, 429);
  assert.equal(f.calls(), 1);
});

test('Responses forwards fragmented function calls but never enables provider-side tools or foreign conversation access', async (t) => {
  const events = [
    { type: 'response.created', response: { id: 'r-local', status: 'in_progress', model: 'gpt-6.1-sol' } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc1', call_id: 'call-1', name: 'write', arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc1', output_index: 0, delta: '{"path":"film.html"}' },
    { type: 'response.completed', response: { id: 'r-local', status: 'completed', model: 'gpt-6.1-sol', usage: { input_tokens: 1000, output_tokens: 1000 } } },
  ];
  const f = await fixture(t, async () => {
    const bytes = Buffer.from(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
    return new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.subarray(index, index + 7));
      controller.close();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  });
  f.store.saveChat({ ...settings, format: 'responses' });
  const a = await f.user('response-stream');
  const input = { model: 'wanju-creative', input: [{ role: 'user', content: 'test' }], stream: true };
  for (const extra of [{ tools: [{ type: 'web_search' }] }, { previous_response_id: 'another-users-id' },
    { conversation: 'foreign-conversation' }, { background: true }, { input: [{ type: 'item_reference', id: 'foreign' }] },
    { max_output_tokens: 100000 }]) {
    assert.equal((await f.call('/v1/responses', { token: a.token, data: { ...input, ...extra } })).status, 400);
  }
  assert.equal(f.calls(), 0);
  assert.equal((await f.call('/v1/chat/completions', { token: a.token, data: prompt })).status, 409);
  const response = await fetch(`${f.url}/v1/responses`, { method: 'POST',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /event: response.function_call_arguments.delta/);
  assert.match(text, /call-1/);
  assert.match(text, /film.html/);
  assert.doesNotMatch(text, /gpt-6\.1-sol|test-supplier-key/);
  assert.equal(f.store.wallet(a.user.id).operations[0].charged, 3);
});

test('incomplete Responses streams retain accounting review and redact upstream error details without resubmitting', async (t) => {
  const f = await fixture(t, async () => new Response(`event: response.failed\ndata: ${JSON.stringify({
    type: 'response.failed', response: { status: 'failed', error: { message: upstreamKey } },
  })}\n\n`, { headers: { 'content-type': 'text/event-stream' } }));
  f.store.saveChat({ ...settings, format: 'responses' });
  const a = await f.user('response-failure');
  const response = await fetch(`${f.url}/v1/responses`, { method: 'POST',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'wanju-creative', input: 'test', stream: true }) });
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(upstreamKey));
  assert.equal(f.store.wallet(a.user.id).operations[0].status, 'review');
  assert.equal(f.calls(), 1);
});

test('pricing calculator is teacher-only, does not charge users or change the live tariff', async (t) => {
  const f = await fixture(t);
  const data = { unit: 'input-million', costYuan: '10', multiplier: '2', quantity: 1 };
  assert.equal((await f.call('/api/admin/pricing/quote', { data })).status, 401);
  const before = f.store.adminChat();
  const result = await f.call('/api/admin/pricing/quote', { token: adminSecret, data });
  assert.equal(result.status, 200);
  assert.equal(result.data.unitPoints, 2000);
  assert.deepEqual(f.store.adminChat(), before);
  assert.equal(f.calls(), 0);
});

test('private proxy authentication separates visitors and normalizes mapped IPv4 addresses', async (t) => {
  const proxyToken = 'private-proxy-test-token-not-for-production';
  const f = await fixture(t, undefined, { proxyToken });
  f.store.setAdminPassword('proxy-test-password');
  const headers = (address, proof = proxyToken) => ({ 'x-wanju-client-ip': address, 'x-wanju-proxy-token': proof });
  for (let i = 0; i < 10; i++) {
    assert.equal((await f.call('/api/admin/login', { headers: headers('::ffff:192.0.2.1'), data: { password: 'wrong-password' } })).status, 401);
  }
  assert.equal((await f.call('/api/admin/login', { headers: headers('192.0.2.1'), data: { password: 'proxy-test-password' } })).status, 429);
  assert.equal((await f.call('/api/admin/login', { headers: headers('192.0.2.2'), data: { password: 'proxy-test-password' } })).status, 200);
  for (let i = 0; i < 10; i++) {
    assert.equal((await f.call('/api/admin/login', { headers: headers(`198.51.100.${i + 1}`, 'forged-token'), data: { password: 'wrong-password' } })).status, 401);
  }
  assert.equal((await f.call('/api/admin/login', { headers: headers('203.0.113.20', 'forged-token'), data: { password: 'proxy-test-password' } })).status, 429);
  assert.equal((await f.call('/api/admin/login', { headers: headers('192.0.2.3'), data: { password: 'proxy-test-password' } })).status, 200);
  assert.equal(f.calls(), 0);
});

test('forwarding headers cannot bypass limits when private proxy authentication is disabled', async (t) => {
  const f = await fixture(t);
  f.store.setAdminPassword('direct-test-password');
  for (let i = 0; i < 10; i++) {
    assert.equal((await f.call('/api/admin/login', {
      headers: { 'x-forwarded-for': `192.0.2.${i + 1}`, 'x-wanju-client-ip': `192.0.2.${i + 1}` },
      data: { password: 'wrong-password' },
    })).status, 401);
  }
  assert.equal((await f.call('/api/admin/login', {
    headers: { 'x-wanju-client-ip': '198.51.100.5' }, data: { password: 'direct-test-password' },
  })).status, 429);
});

test('review queue retains old unresolved charges, paginates, and clamps after settlement', async (t) => {
  const f = await fixture(t);
  f.store.saveChat(settings);
  const a = await f.user('reviewstudent', 10000);
  const old = f.store.reserve(a.user.id, 'old-review', 'old-fingerprint');
  f.store.review(old.id, 'Old unresolved test request.');
  for (let i = 0; i < 100; i++) {
    const op = f.store.reserve(a.user.id, `settled-${i}`, `fingerprint-${i}`);
    f.store.settle(op.id, 0, 'Local test: no supplier charge.');
  }
  const overview = f.store.overview();
  assert.equal(overview.operations.some((op) => op.id === old.id), false);
  assert.equal(overview.reviewQueue.items[0].id, old.id);
  assert.equal(overview.reviewQueue.heldPoints, 50);
  for (let i = 0; i < 22; i++) {
    const op = f.store.reserve(a.user.id, `review-${i}`, `review-fingerprint-${i}`);
    f.store.review(op.id, 'Additional unresolved test request.');
  }
  assert.equal((await f.call('/api/admin/operations/review')).status, 401);
  assert.equal((await f.call('/api/admin/operations/review', { token: a.token })).status, 401);
  const first = await f.call('/api/admin/operations/review', { token: adminSecret });
  const second = await f.call('/api/admin/operations/review?page=2', { token: adminSecret });
  assert.equal(first.status, 200);
  assert.equal(first.data.total, 23);
  assert.equal(first.data.heldPoints, 1150);
  assert.equal(first.data.items.length, 20);
  assert.equal(first.data.items[0].id, old.id);
  assert.equal(second.data.items.length, 3);
  assert.equal(new Set([...first.data.items, ...second.data.items].map((op) => op.id)).size, 23);
  assert.equal((await f.call('/api/admin/operations/review?page=-1', { token: adminSecret })).status, 400);
  assert.equal((await f.call('/api/admin/operations/review?pageSize=101', { token: adminSecret })).status, 400);
  assert.equal((await f.call('/api/admin/operations/review?page=999', { token: adminSecret })).data.page, 2);
  for (const op of [...first.data.items, ...second.data.items]) f.store.settle(op.id, 0, 'Local test: verified no supplier charge.', null, true);
  const empty = await f.call('/api/admin/operations/review?page=2', { token: adminSecret });
  assert.equal(empty.data.page, 1);
  assert.equal(empty.data.pages, 1);
  assert.equal(empty.data.total, 0);
  assert.deepEqual(empty.data.items, []);
  assert.equal(f.store.wallet(a.user.id).user.balance, 10000);
  assert.equal(f.calls(), 0);
});

test('administrator sessions are revoked on password change and encrypted configuration is preserved', async (t) => {
  const f = await fixture(t);
  f.store.saveChat(settings);
  f.store.setAdminPassword('first-test-password');
  const login = await f.call('/api/admin/login', { data: { password: 'first-test-password' } });
  assert.equal(login.status, 200);
  assert.match(login.data.token, /^wja_/);
  assert.equal((await f.call('/api/admin/overview', { token: login.data.token })).status, 200);
  assert.equal((await f.call('/api/admin/password', { token: login.data.token, method: 'PUT', data: { password: 'second-test-password' } })).status, 200);
  assert.equal((await f.call('/api/admin/overview', { token: login.data.token })).status, 401);
  assert.equal((await f.call('/api/admin/login', { data: { password: 'first-test-password' } })).status, 401);
  const next = await f.call('/api/admin/login', { data: { password: 'second-test-password' } });
  assert.equal(next.status, 200);
  assert.equal(f.store.chat().key, upstreamKey);
  assert.doesNotMatch(f.store.db.prepare("SELECT sealed FROM settings WHERE id='admin-login'").get().sealed, /second-test-password/);
  assert.equal((await f.call('/api/admin/logout', { token: next.data.token, data: {} })).status, 200);
  assert.equal((await f.call('/api/admin/overview', { token: next.data.token })).status, 401);
  for (let i = 0; i < 10; i++) assert.equal((await f.call('/api/admin/login', { data: { password: 'wrong-password' } })).status, 401);
  assert.equal((await f.call('/api/admin/login', { data: { password: 'second-test-password' } })).status, 429);
  assert.equal(f.calls(), 0);
});

test('public downloads and tutorials are available without exposing teacher administration', async (t) => {
  const f = await fixture(t);
  for (const path of ['/', '/download', '/download/', '/student-guide', '/teacher-guide', '/register', '/account']) {
    const response = await fetch(`${f.url}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /玩剧/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  }
  const head = await fetch(`${f.url}/download`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await f.call('/api/admin/overview')).status, 401);
});

test('preview defaults closed and opt-in only serves direct loopback requests', async (t) => {
  const production = await fixture(t);
  for (const path of ['/preview', '/preview.js']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`${production.url}${path}`, { method });
      assert.equal(response.status, 404);
      assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline/);
      await response.text();
    }
  }
  const local = await fixture(t, undefined, { enablePreview: true });
  for (const path of ['/preview', '/preview.js']) {
    const response = await fetch(`${local.url}${path}`);
    assert.equal(response.status, 200);
    await response.text();
    const proxied = await fetch(`${local.url}${path}`, { headers: { 'x-forwarded-for': '203.0.113.10' } });
    assert.equal(proxied.status, 404);
    await proxied.text();
  }
  assert.equal(production.calls() + local.calls(), 0);
});

test('teacher API is authenticated; students cannot create cards, settle, or choose supplier models', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/admin/overview')).status, 401);
  assert.equal((await f.call('/api/admin/codes', { token: adminSecret, data: { kind: 'activation', count: 1, points: 0 }, headers: { origin: 'https://untrusted.example' } })).status, 403);
  f.store.saveChat(settings);
  const a = await f.user();
  assert.equal((await f.call('/api/admin/overview', { token: a.token })).status, 401);
  const data = await f.call('/api/me', { token: a.token });
  assert.doesNotMatch(JSON.stringify(data.data), /test-supplier-key|supplier\.example|test-model|password/);
  assert.equal((await f.call('/v1/chat/completions', { token: a.token, data: { ...prompt, model: 'unauthorized' } })).status, 400);
  assert.equal(f.calls(), 0);
});

test('teacher can preflight the saved chat route without sending content or creating a billable operation', async (t) => {
  let catalog = { data: [{ id: 'test-model' }, { id: 'other-model' }] };
  const requests = [];
  const f = await fixture(t, async (url, init) => {
    requests.push({ url, method: init.method, body: init.body, authorization: init.headers.authorization });
    return Response.json(catalog);
  });
  f.store.saveChat(settings);
  assert.equal((await f.call('/api/admin/chat/check', { data: { tier: 'base' } })).status, 401);
  const first = await f.call('/api/admin/chat/check', { token: adminSecret, data: { tier: 'base' } });
  assert.equal(first.status, 200);
  assert.equal(first.data.ok, true);
  assert.equal(first.data.verified, true);
  assert.equal(first.data.modelMatched, true);
  assert.equal(first.data.model, 'test-model');
  assert.equal(first.data.host, 'supplier.example');
  assert.equal(requests[0].url, 'https://supplier.example/v1/models');
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].body, undefined);
  assert.equal(requests[0].authorization, `Bearer ${upstreamKey}`);
  assert.doesNotMatch(JSON.stringify(first.data), new RegExp(upstreamKey));
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n, 0);

  catalog = { data: [{ id: 'different-model' }] };
  const mismatch = await f.call('/api/admin/chat/check', { token: adminSecret, data: { tier: 'base' } });
  assert.equal(mismatch.status, 200);
  assert.equal(mismatch.data.ok, false);
  assert.equal(mismatch.data.verified, false);
  assert.match(mismatch.data.message, /模型目录中没有/);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n, 0);
});

test('media templates are teacher-only, per-account credentials are encrypted, and clients receive only their own assignment', async (t) => {
  const f = await fixture(t), first = await f.user('media-first'), second = await f.user('media-second');
  const profile = { id: 'student-image', category: 'image', adapter: 'openai-image', name: '默认图片',
    baseUrl: 'https://images.example/v1', model: 'image-test-model' };
  assert.equal((await f.call('/api/admin/media/config')).status, 401);
  assert.equal((await f.call('/api/media/config', { token: first.token })).status, 200);
  const catalog = await f.call('/api/admin/media/config', { token: adminSecret });
  assert.equal(catalog.data.revision, 'empty');
  const savedCatalog = await f.call('/api/admin/media/config', { token: adminSecret, method: 'PUT',
    data: { base: 'empty', profiles: [profile], defaults: { image: profile.id } } });
  assert.equal(savedCatalog.status, 200);
  const savedKeys = await f.call(`/api/admin/users/${first.user.id}/media`, { token: adminSecret, method: 'PUT',
    data: { base: 'empty', catalogRevision: savedCatalog.data.revision, keys: [{ id: profile.id, key: 'media-secret-key-never-returned' }] } });
  assert.equal(savedKeys.status, 200);
  assert.equal(JSON.stringify(savedKeys.data).includes('media-secret-key-never-returned'), false);
  const firstConfig = await f.call('/api/media/config', { token: first.token });
  const secondConfig = await f.call('/api/media/config', { token: second.token });
  assert.equal(firstConfig.data.profiles[0].key, 'media-secret-key-never-returned');
  assert.equal(secondConfig.data.profiles[0].key, undefined);
  const dbValue = f.store.db.prepare('SELECT sealed FROM media_assignments WHERE user_id=?').get(first.user.id).sealed;
  assert.equal(dbValue.includes('media-secret-key-never-returned'), false);
  const adminScript = await fetch(`${f.url}/media-admin.js`);
  assert.equal(adminScript.status, 200);
  assert.match(adminScript.headers.get('content-type'), /javascript/);
  const changed = await f.call('/api/admin/media/config', { token: adminSecret, method: 'PUT',
    data: { base: savedCatalog.data.revision, profiles: [{ ...profile, baseUrl: 'https://other-images.example/v1' }], defaults: { image: profile.id } } });
  assert.equal(changed.status, 200);
  const staleKeys = await f.call(`/api/admin/users/${first.user.id}/media`, { token: adminSecret, method: 'PUT',
    data: { base: savedKeys.data.revision, catalogRevision: savedCatalog.data.revision, keys: [{ id: profile.id, key: 'must-not-send-old-key' }] } });
  assert.equal(staleKeys.status, 409);
  assert.equal((await f.call('/api/media/config', { token: first.token })).data.profiles[0].key, undefined);
});

test('invalid media settings return actionable validation without mutating saved configuration', async (t) => {
  const f = await fixture(t), account = await f.user('invalid-media');
  const profile = { id: 'image-main', category: 'image', adapter: 'openai-image',
    name: '图片服务', baseUrl: 'https://images.example/v1', model: 'image-model' };
  const invalid = await f.call('/api/admin/media/config', { token: adminSecret, method: 'PUT',
    data: { base: 'empty', profiles: [{ ...profile, baseUrl: 'http://images.example' }] } });
  assert.equal(invalid.status, 400);
  assert.match(invalid.data.error.message, /HTTPS/);
  assert.equal(f.store.media.catalog().revision, 'empty');
  const config = f.store.media.saveCatalog({ base: 'empty', profiles: [profile] });
  const rejectedKey = await f.call(`/api/admin/users/${account.user.id}/media`, { token: adminSecret, method: 'PUT',
    data: { base: 'empty', catalogRevision: config.revision, keys: [{ id: profile.id, key: 'Bearer invalid-secret' }] } });
  assert.equal(rejectedKey.status, 400);
  assert.match(rejectedKey.data.error.message, /API 密钥/);
  assert.equal(f.store.media.adminAssignment(account.user.id).revision, 'empty');
});

test('wallet chat starts without price confirmation, settles actual usage and rejects duplicate requests', async (t) => {
  const f = await fixture(t, async (url, init) => {
    assert.equal(url, 'https://supplier.example/v1/chat/completions');
    assert.equal(init.headers.authorization, `Bearer ${upstreamKey}`);
    assert.match(init.headers['idempotency-key'], /^[a-f0-9-]{36}$/i);
    assert.equal(init.headers['x-wanju-operation'], init.headers['idempotency-key']);
    const input = JSON.parse(init.body);
    assert.equal(input.model, 'test-model');
    return Response.json({ choices: [{ message: { content: 'test answer' } }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } });
  });
  f.store.saveChat(settings);
  const a = await f.user();
  const request = { token: a.token, headers: { 'idempotency-key': 'one-request' }, data: prompt };
  assert.equal((await f.call('/v1/chat/completions', request)).status, 200);
  assert.equal((await f.call('/api/me', { token: a.token })).data.user.balance, 997);
  assert.equal((await f.call('/v1/chat/completions', request)).status, 409);
  assert.equal(f.calls(), 1);
  f.store.saveChat({ ...settings, inputPointsPerMillion: 1001 });
  assert.equal((await f.call('/v1/chat/completions', { ...request, headers: {} })).status, 200);
  assert.equal(f.calls(), 2);
  assert.equal(f.store.wallet(a.user.id).user.balance, 993);
  assert.equal(f.store.wallet(a.user.id).heldPoints, 0);
});

test('empty or insufficient wallets are blocked before upstream calls or reservations', async (t) => {
  const f = await fixture(t);
  f.store.saveChat(settings);
  for (const [name, balance] of [['empty-wallet', 0], ['low-wallet', 49]]) {
    const account = await f.user(name, balance);
    const state = (await f.call('/api/me', { token: account.token })).data;
    assert.equal(state.chat.authorized, true);
    assert.equal(f.store.db.prepare('SELECT consent FROM users WHERE id=?').get(account.user.id).consent, '');
    const response = await f.call('/v1/chat/completions', { token: account.token, data: prompt });
    assert.equal(response.status, 402);
    assert.match(response.data.error.message, /余额不足/);
    const wallet = f.store.wallet(account.user.id);
    assert.equal(wallet.user.balance, balance);
    assert.equal(wallet.heldPoints, 0);
    assert.equal(wallet.operations.length, 0);
  }
  assert.equal(f.calls(), 0);
});

test('fragmented streaming usage settles exactly once without storing prompts', async (t) => {
  const events = `data: ${JSON.stringify({ choices: [{ delta: { content: '测试' } }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 1000 } })}\n\ndata: [DONE]\n\n`;
  const bytes = Buffer.from(events);
  const f = await fixture(t, async () => new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.subarray(i, i + 7));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } }));
  f.store.saveChat(settings);
  const a = await f.user();
  const response = await fetch(`${f.url}/v1/chat/completions`, { method: 'POST',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...prompt, stream: true }) });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /测试/);
  const result = await f.call('/api/me', { token: a.token });
  assert.equal(result.data.user.balance, 997);
  assert.equal(result.data.heldPoints, 0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n, 1);
});

test('Chat streams preserve tool deltas but redact supplier errors and retain uncertain accounting', async (t) => {
  const events = [
    { model: 'private-upstream-model', choices: [{ delta: { content: '准备中',
      tool_calls: [{ index: 0, id: 'local-call', type: 'function', function: { name: 'write', arguments: '{"path":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"film.html"}' } }] } }] },
    { error: { code: 'provider_error', message: `private request headers: Bearer ${upstreamKey}` } },
  ].map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join('') + 'data: [DONE]\n\n';
  const bytes = Buffer.from(events);
  const f = await fixture(t, async () => new Response(new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.subarray(index, index + 7));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } }));
  f.store.saveChat(settings);
  const a = await f.user('chat-stream-error');
  const response = await fetch(`${f.url}/v1/chat/completions`, { method: 'POST',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...prompt, stream: true }) });
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(upstreamKey));
  assert.doesNotMatch(text, /private-upstream-model|private request headers/);
  const chunks = text.split(/\r?\n\r?\n/).filter((event) => event.startsWith('data:') && !event.includes('[DONE]'))
    .map((event) => JSON.parse(event.slice(5)));
  assert.equal(chunks[0].model, 'wanju-creative');
  assert.equal(chunks[0].choices[0].delta.content, '准备中');
  assert.equal(chunks[0].choices[0].delta.tool_calls[0].function.name, 'write');
  assert.equal(chunks[1].choices[0].delta.tool_calls[0].function.arguments, '"film.html"}');
  assert.equal(chunks[2].error.code, 'upstream_error');
  assert.equal(f.store.wallet(a.user.id).operations[0].status, 'review');
  assert.equal(f.calls(), 1);
});

test('upstream status errors are classified, redacted, and queryable by administrators without changing billing rules', async (t) => {
  let failure = { status: 401, code: 'invalid_api_key' };
  const f = await fixture(t, async () => new Response(JSON.stringify({ error: {
    code: failure.code, message: `Bearer ${upstreamKey}; ${prompt.messages[0].content}`,
  } }), { status: failure.status, headers: { 'content-type': 'application/json' } }));
  f.store.saveChat(settings);
  const cases = [
    [401, 'invalid_api_key', 'upstream_auth', 'released'],
    [404, 'model_not_found', 'upstream_model', 'released'],
    [400, 'context_length_exceeded', 'upstream_context', 'released'],
    [429, 'rate_limit_exceeded', 'upstream_rate_limit', 'released'],
    [402, 'insufficient_quota', 'upstream_quota', 'released'],
    [503, 'server_error', 'upstream_http', 'review'],
  ];
  for (const [status, code, category, billing] of cases) {
    failure = { status, code };
    const a = await f.user(`diagnostic-${status}`);
    const response = await fetch(`${f.url}/v1/chat/completions`, {
      method: 'POST', headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(prompt),
    });
    const body = await response.json();
    assert.equal(response.status, status === 429 ? 429 : 502);
    assert.equal(body.error.code, category);
    assert.equal(body.error.billing_status, billing);
    assert.match(body.error.operation_id, /^[a-f0-9-]{36}$/i);
    assert.match(body.error.message, new RegExp(body.error.operation_id));
    assert.doesNotMatch(JSON.stringify(body), new RegExp(`${upstreamKey}|test prompt`));
    const balance = f.store.wallet(a.user.id);
    assert.equal(balance.user.balance, billing === 'released' ? 1000 : 950);
    assert.equal(balance.heldPoints, billing === 'released' ? 0 : 50);

    assert.equal((await f.call(`/api/admin/operations/${body.error.operation_id}`)).status, 401);
    const diagnostic = await f.call(`/api/admin/operations/${body.error.operation_id}`, { token: adminSecret });
    assert.equal(diagnostic.status, 200);
    assert.equal(diagnostic.data.diagnostic.category, category);
    assert.equal(diagnostic.data.diagnostic.errorCode, code);
    assert.equal(diagnostic.data.diagnostic.host, 'supplier.example');
    assert.equal(diagnostic.data.diagnostic.model, 'test-model');
    assert.doesNotMatch(JSON.stringify(diagnostic.data), new RegExp(`${upstreamKey}|test prompt`));
  }
  assert.equal(f.calls(), cases.length);
});

test('connection failures refund only when DNS/connect failed before the request could be sent', async (t) => {
  let code = 'ENOTFOUND';
  const f = await fixture(t, async () => {
    const cause = Object.assign(new Error('connection failed'), { code });
    throw Object.assign(new Error('fetch failed'), { cause });
  });
  f.store.saveChat(settings);
  const a = await f.user('connection-failure');
  const first = await f.call('/v1/chat/completions', { token: a.token, data: prompt });
  assert.equal(first.data.error.code, 'upstream_connection');
  assert.equal(first.data.error.billing_status, 'released');
  assert.equal(f.store.wallet(a.user.id).user.balance, 1000);
  code = 'ECONNRESET';
  const second = await f.call('/v1/chat/completions', { token: a.token, data: prompt });
  assert.equal(second.data.error.billing_status, 'review');
  assert.equal(f.store.wallet(a.user.id).heldPoints, 50);
  assert.equal(f.calls(), 2);
});

test('idle timeout returns a request ID and keeps the reservation for review without resubmitting', async (t) => {
  const f = await fixture(t, async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }), { chatIdleTimeoutMs: 100, chatHeartbeatMs: 20 });
  f.store.saveChat(settings);
  const a = await f.user('chat-timeout');
  const result = await f.call('/v1/chat/completions', { token: a.token, data: prompt });
  assert.equal(result.status, 504);
  assert.equal(result.data.error.code, 'upstream_timeout');
  assert.equal(result.data.error.billing_status, 'review');
  assert.match(result.data.error.operation_id, /^[a-f0-9-]{36}$/i);
  assert.equal(f.store.wallet(a.user.id).heldPoints, 50);
  assert.equal(f.calls(), 1);
});

test('stream EOF without a completion marker is an explicit failed turn with an auditable request ID', async (t) => {
  const f = await fixture(t, async () => new Response(
    'data: {"choices":[{"delta":{"content":"partial answer"}}]}\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  ));
  f.store.saveChat(settings);
  const a = await f.user('incomplete-chat-stream');
  const response = await fetch(`${f.url}/v1/chat/completions`, { method: 'POST',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...prompt, stream: true }) });
  const text = await response.text();
  assert.match(text, /partial answer/);
  assert.match(text, /"code":"upstream_error"/);
  assert.match(text, /"failure_code":"stream_incomplete"/);
  const operation = f.store.wallet(a.user.id).operations[0];
  assert.equal(operation.status, 'review');
  const diagnostic = await f.call(`/api/admin/operations/${operation.id}`, { token: adminSecret });
  assert.equal(diagnostic.data.diagnostic.category, 'stream_incomplete');
  assert.equal(diagnostic.data.diagnostic.phase, 'stream');
  assert.equal(f.calls(), 1);
});

test('stream timeout resets on arriving chunks and permits a healthy response longer than its idle limit', async (t) => {
  const parts = [
    'data: {"choices":[{"delta":{"content":"first"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"second"}}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}\n\n',
    'data: [DONE]\n\n',
  ].map((part) => Buffer.from(part));
  const f = await fixture(t, async () => new Response(new ReadableStream({
    pull(controller) {
      const next = parts.shift();
      if (!next) return controller.close();
      return new Promise((resolve) => setTimeout(() => { controller.enqueue(next); resolve(); }, 90));
    },
  }), { headers: { 'content-type': 'text/event-stream' } }), { chatIdleTimeoutMs: 160, chatHeartbeatMs: 25 });
  f.store.saveChat(settings);
  const a = await f.user('healthy-long-chat-stream');
  const response = await fetch(`${f.url}/v1/chat/completions`, { method: 'POST',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...prompt, stream: true }) });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /first/);
  assert.match(text, /second/);
  assert.equal(f.store.wallet(a.user.id).user.balance, 997);
  assert.equal(f.store.wallet(a.user.id).heldPoints, 0);
  assert.equal(f.calls(), 1);
});

test('downstream heartbeat never hides an idle upstream or turns a malformed stream into success', async (t) => {
  let malformed = false;
  const f = await fixture(t, async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      if (malformed) {
        controller.enqueue(Buffer.from('data: not-json\n\n'));
        controller.close();
      } else {
        init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true });
      }
    },
  }), { headers: { 'content-type': 'text/event-stream' } }), { chatIdleTimeoutMs: 100, chatHeartbeatMs: 20 });
  f.store.saveChat(settings);
  const a = await f.user('idle-stream');
  const request = () => fetch(`${f.url}/v1/chat/completions`, { method: 'POST',
    headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...prompt, stream: true }) });
  const response = await request();
  const text = await response.text();
  assert.match(text, /: wanju-heartbeat/);
  assert.match(text, /"failure_code":"upstream_timeout"/);
  assert.doesNotMatch(text, /\[DONE\]/);
  malformed = true;
  assert.match(await (await request()).text(), /"failure_code":"upstream_protocol"/);
  assert.equal(f.store.wallet(a.user.id).heldPoints, 100);
  assert.equal(f.calls(), 2);
});

test('uncertain supplier failures are held, definitive rejection is released, and missing usage is not guessed', async (t) => {
  let mode = 401;
  const f = await fixture(t, async () => mode === 200
    ? Response.json({ choices: [{ message: { content: 'ok' } }] })
    : new Response('supplier private error', { status: mode }));
  f.store.saveChat(settings);
  const a = await f.user();
  assert.equal((await f.call('/v1/chat/completions', { token: a.token, data: prompt })).status, 502);
  assert.equal(f.store.wallet(a.user.id).user.balance, 1000);
  mode = 503;
  assert.equal((await f.call('/v1/chat/completions', { token: a.token, data: prompt })).status, 502);
  assert.equal(f.store.wallet(a.user.id).heldPoints, 50);
  mode = 200;
  assert.equal((await f.call('/v1/chat/completions', { token: a.token, data: prompt })).status, 200);
  assert.equal(f.store.wallet(a.user.id).heldPoints, 100);
  const operation = f.store.wallet(a.user.id).operations.find((op) => op.status === 'review');
  assert.equal((await f.call(`/api/admin/operations/${operation.id}/settle`, { token: a.token, data: { points: 0, reason: 'invalid student attempt' } })).status, 401);
  assert.equal((await f.call(`/api/admin/operations/${operation.id}/settle`, { token: adminSecret, data: { points: 0, reason: '测试账单确认未计费' } })).status, 200);
  assert.equal(f.store.wallet(a.user.id).heldPoints, 50);
});

test('concurrent card redemptions credit exactly one student', async (t) => {
  const f = await fixture(t);
  const a = await f.user('student1'), b = await f.user('student2');
  const code = f.store.createCodes({ kind: 'recharge', count: 1, points: 9900 })[0].code;
  const results = await Promise.all([a, b].map((person) => f.call('/api/redeem', { token: person.token, data: { code } })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(f.store.wallet(a.user.id).user.balance + f.store.wallet(b.user.id).user.balance, 11900);
});

test('desktop activation remembers only a protected student session, restores login, and never probes a paid model', async (t) => {
  const f = await fixture(t);
  f.store.saveChat(settings);
  const dir = mkdtempSync(join(tmpdir(), 'wanju-student-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const installs = [];
  const options = { dataDir: dir, serviceUrl: f.url, seal: (text) => Buffer.from(Buffer.from(text).toString('base64')),
    unseal: (bytes) => Buffer.from(bytes.toString(), 'base64').toString(), model: { install: (value) => installs.push(value), remove() {} } };
  const desktop = createWanjuAccount(options);
  const activated = await desktop.authenticate('activate', { username: 'desktopstudent', password: 'test-password-123',
    code: f.store.createCodes({ kind: 'activation', count: 1, points: 1000 })[0].code });
  assert.equal(activated.authenticated, true);
  assert.equal(installs.length, 0);
  assert.equal(activated.onboarding.state, 'pending');
  f.approve(activated.user.id);
  const enabled = await desktop.status();
  assert.equal(enabled.chat.authorized, true);
  assert.equal(installs[0].baseUrl, `${f.url}/v1/tier/base/${enabled.chat.priceVersion}`);
  assert.equal(installs[0].maxOutputTokens, 4096);
  const restored = createWanjuAccount(options);
  assert.equal((await restored.status()).user.id, activated.user.id);
  assert.equal(f.calls(), 0);
  assert.doesNotMatch(readFileSync(join(dir, 'student-session'), 'utf8'), /wjs_|test-supplier-key|test-password/);
  await restored.logout();
  assert.equal((await restored.status()).authenticated, false);
  assert.throws(() => studentServiceUrl('http://public.example'), /无效/);
  assert.throws(() => studentServiceUrl('https://user:password@example.com'), /无效/);
});

test('manual registration is atomic, recoverable, and cannot open or charge an unapproved account', async (t) => {
  const f = await fixture(t);
  f.store.saveChat(settings);
  const code = f.store.createCodes({ kind: 'activation', count: 1, points: 100 })[0];
  const input = { username: 'newstudent', password: 'test-password-123', code: code.code, contact: 'private-contact', note: 'private-student-note' };
  const first = await f.call('/api/register', { data: input });
  assert.equal(first.status, 201);
  assert.equal(first.data.onboarding.state, 'pending');
  assert.equal(first.data.onboarding.thirdPartyAccountsAutomatic, false);
  assert.equal(first.data.onboarding.services.length, 4);
  assert.doesNotMatch(JSON.stringify(first.data), /private-contact|private-student-note/);
  const retry = await f.call('/api/register', { data: input });
  assert.equal(retry.status, 201);
  assert.equal(retry.data.alreadyRegistered, true);
  assert.equal(retry.data.user.id, first.data.user.id);
  assert.equal(f.store.overview().totals.users, 1);
  assert.equal(f.store.wallet(first.data.user.id).ledger.length, 1);
  const pending = await f.call('/api/me', { token: first.data.token });
  assert.equal(pending.data.chat.enabled, false);
  assert.equal((await f.call('/v1/chat/completions', { token: first.data.token, data: prompt })).status, 503);
  assert.equal(f.store.wallet(first.data.user.id).heldPoints, 0);
  assert.equal(f.calls(), 0);
  const path = `/api/admin/users/${first.data.user.id}/enrollment`;
  assert.equal((await f.call(path, { token: first.data.token })).status, 401);
  const draft = await f.call(path, { token: adminSecret });
  assert.equal(draft.data.contact, 'private-contact');
  assert.equal((await f.call(path, { token: adminSecret, method: 'PUT', data: { ...draft.data, state: 'ready' } })).status, 400);
  f.approve(first.data.user.id);
  assert.equal((await f.call('/api/me', { token: first.data.token })).data.onboarding.state, 'ready');
  assert.equal((await f.call('/api/me', { token: first.data.token })).data.chat.enabled, true);
  assert.equal(f.calls(), 0);
});

test('independent student channels are encrypted, do not leak, and route only the approved student', async (t) => {
  const studentKey = 'private-independent-student-key';
  const f = await fixture(t, async (url, init) => {
    assert.equal(url, 'https://independent.example/v1/chat/completions');
    assert.equal(init.headers.authorization, `Bearer ${studentKey}`);
    assert.equal(JSON.parse(init.body).model, 'teacher-confirmed-model');
    return Response.json({ choices: [{ message: { content: 'fake answer' } }], usage: { prompt_tokens: 100, completion_tokens: 100 } });
  });
  f.store.saveChat(settings);
  const a = await f.user('boundstudent'), b = await f.user('otherstudent');
  const original = f.store.adminEnrollment(a.user.id);
  const channel = original.channels.find((entry) => entry.id === 'chat');
  Object.assign(channel, {
    state: 'ready', credentialMode: 'student', accountRef: 'supplier-user-id',
    baseUrl: 'https://independent.example/v1', model: 'teacher-confirmed-model',
    key: studentKey, protocol: 'openai-chat', visionVerified: true,
  });
  const stored = f.store.saveEnrollment(a.user.id, { ...original, state: 'ready', teacherNote: 'private-teacher-note' });
  assert.equal(stored.channels[0].keyConfigured, true);
  assert.equal(stored.channels[0].key, undefined);
  assert.doesNotMatch(f.store.db.prepare('SELECT sealed FROM enrollments WHERE user_id=?').get(a.user.id).sealed, /private-independent|supplier-user-id/);
  assert.equal(f.store.chat(a.user.id).key, studentKey);
  assert.equal(f.store.chat(b.user.id).key, upstreamKey);
  const publicState = (await f.call('/api/me', { token: a.token })).data;
  assert.doesNotMatch(JSON.stringify(publicState), /independent\.example|private-independent|supplier-user-id|private-teacher-note/);
  assert.equal(publicState.chat.authorized, true);
  assert.equal((await f.call('/v1/chat/completions', { token: a.token, data: prompt })).status, 200);
  assert.equal(f.calls(), 1);
  const redacted = f.store.adminEnrollment(a.user.id);
  f.store.saveEnrollment(a.user.id, { ...redacted, channels: redacted.channels.map((entry) => ({ ...entry, key: '' })), state: 'ready' });
  assert.equal(f.store.chat(a.user.id).key, studentKey);
  const reopened = f.store.adminEnrollment(a.user.id);
  reopened.channels[0].visionVerified = false;
  f.store.saveEnrollment(a.user.id, { ...reopened, state: 'ready' });
  assert.equal(f.store.studentChat(a.user.id).enabled, false);
});
