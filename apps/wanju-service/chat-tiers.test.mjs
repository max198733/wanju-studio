import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStudentService } from './server.mjs';
import { openStore, usagePoints } from './store.mjs';
import { claudeOpusPriceDraft } from './claude-opus-pricing.mjs';

const secret = 'isolated-tier-service-test-admin-secret';
const ready = (tier) => ({ ...claudeOpusPriceDraft(tier), tier, enabled: true,
  key: `isolated-${tier}-supplier-key`, visionVerified: true, baseUrl: `https://${tier}.example/v1` });
const creator = (store, name = 'tier-creator') => {
  const account = store.register({ username: name, password: 'isolated-test-password' });
  store.redeem(account.user.id, store.createCodes({ kind: 'recharge', count: 1, points: 1000 })[0].code);
  return account;
};
const usage = { prompt_tokens: 20000, completion_tokens: 1000,
  prompt_tokens_details: { cached_tokens: 10000, cached_creation_tokens: 5000 } };

test('tiers keep keys separate, default to base, reject stale terms and snapshot the selected price', () => {
  const store = openStore(':memory:', secret);
  try {
    for (const id of ['base', 'claude', 'claude-max']) store.saveChat(ready(id));
    const account = creator(store);
    const id = account.user.id;
    const first = store.studentChat(id);
    assert.equal(first.selectedTier, 'base');
    assert.equal(first.tiers.length, 3);
    assert.equal(first.authorized, true);
    assert.equal(first.reservePoints, 5);
    assert.doesNotMatch(JSON.stringify(first), /supplier-key|\.example|claude-opus/);
    assert.doesNotMatch(JSON.stringify(store.adminChat()), /isolated-.*-supplier-key/);
    assert.equal(store.db.prepare('SELECT consent FROM users WHERE id=?').get(id).consent, '');
    const base = store.reserve(id, 'base-request', 'same-content');
    assert.equal(base.rates.tier, 'base');
    assert.equal(base.rates.key, ready('base').key);
    const enhanced = first.tiers.find((tier) => tier.id === 'claude');
    assert.throws(() => store.selectChatTier(id, 'claude', enhanced.priceVersion), /正在执行/);
    store.settle(base.id, usagePoints(usage, base.rates));
    const selected = store.selectChatTier(id, 'claude', enhanced.priceVersion);
    assert.equal(selected.chat.authorized, true);
    assert.equal(selected.chat.selectedTier, 'claude');
    assert.throws(() => store.assertChatSelection(id, 'base', first.priceVersion), /档位或价格/);
    store.assertChatSelection(id, 'claude', enhanced.priceVersion);
    const operation = store.reserve(id, 'enhanced-request', 'same-content');
    store.saveChat({ tier: 'claude', cachedInputPointsPerMillion: 18.3 });
    assert.throws(() => store.assertChatSelection(id, 'claude', enhanced.priceVersion), /档位或价格/);
    assert.equal(store.studentChat(id).authorized, true, 'a price update does not require another activation');
    assert.equal(operation.rates.cachedInputPointsPerMillion, 18.2);
    store.settle(operation.id, usagePoints(usage, operation.rates));
    assert.equal(store.wallet(id).heldPoints, 0);
    const snapshot = JSON.parse(store.db.prepare('SELECT rates FROM operations WHERE id=?').get(operation.id).rates);
    assert.equal(snapshot.tier, 'claude');
    assert.equal(snapshot.key, undefined);
    assert.equal(snapshot.baseUrl, undefined);
    assert.equal(snapshot.model, undefined);
    store.saveChat({ tier: 'claude', enabled: false });
    assert.equal(store.studentChat(id).selectedTier, 'claude');
    assert.equal(store.studentChat(id).enabled, false, 'disabled selected tiers must not fall back to another route');
    assert.equal(store.studentChat(id).authorized, false);
    assert.throws(() => store.reserve(id, 'disabled-request', 'fp'), /尚未开通/);
    assert.throws(() => store.selectChatTier(id, 'other', enhanced.priceVersion), /档位无效/);
  } finally { store.close(); }
});

test('legacy single-route database upgrades to base without losing its key, consent or balance', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wanju-tiers-upgrade-'));
  const file = join(directory, 'wallet.sqlite');
  let store = openStore(file, secret);
  try {
    store.saveChat(ready('base'));
    const account = creator(store);
    store.consent(account.user.id, store.publicChat().priceVersion);
    const balance = store.wallet(account.user.id).user.balance;
    store.db.prepare("DELETE FROM settings WHERE id='chat-tiers'").run();
    store.db.exec('ALTER TABLE users DROP COLUMN chat_tier');
    store.close();
    store = openStore(file, secret);
    assert.equal(store.chat(account.user.id).key, ready('base').key);
    assert.equal(store.studentChat(account.user.id).selectedTier, 'base');
    assert.equal(store.studentChat(account.user.id).authorized, true);
    assert.equal(store.wallet(account.user.id).user.balance, balance);
    assert.equal(store.studentChat(account.user.id).tiers.find((tier) => tier.id === 'claude').enabled, false);
    store.saveChat({ tier: 'claude', ...ready('claude'), defaultTier: 'claude' });
    assert.equal(store.studentChat(creator(store, 'new-default-creator').user.id).selectedTier, 'claude');
    assert.equal(store.studentChat(account.user.id).selectedTier, 'base', 'existing users retain their chosen tier');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('pinned gateway rejects old-tier clients before charging or contacting any supplier', async (t) => {
  const calls = [];
  const { server, store } = createStudentService({ adminSecret: secret, fetchImpl: async (url, init) => {
    calls.push({ url, authorization: init.headers.authorization });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'isolated answer' } }], usage });
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); store.close(); });
  for (const id of ['base', 'claude', 'claude-max']) store.saveChat(ready(id));
  const account = creator(store);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, data) => {
    const response = await fetch(`${origin}${path}`, { method: 'POST',
      headers: { authorization: `Bearer ${account.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(data) });
    return { status: response.status, data: await response.json() };
  };
  const prompt = { model: 'wanju-creative', messages: [{ role: 'user', content: 'isolated test' }] };
  const first = store.studentChat(account.user.id);
  const path = `/v1/tier/base/${first.priceVersion}/chat/completions`;
  assert.equal((await request(path, prompt)).status, 200);
  const tier = first.tiers.find((item) => item.id === 'claude-max');
  assert.equal((await request('/api/chat/tier', { tier: tier.id, priceVersion: 'stale' })).status, 409);
  const selected = await request('/api/chat/tier', { tier: tier.id, priceVersion: tier.priceVersion });
  assert.equal(selected.status, 200);
  const balance = store.wallet(account.user.id).user.balance;
  assert.equal((await request(path, prompt)).status, 409);
  assert.equal((await request('/v1/chat/completions', prompt)).status, 409);
  assert.equal(store.wallet(account.user.id).user.balance, balance);
  assert.equal(calls.length, 1);
  assert.equal((await request(`/v1/tier/claude-max/${tier.priceVersion}/chat/completions`, prompt)).status, 200);
  assert.deepEqual(calls.map((call) => call.authorization), [
    'Bearer isolated-base-supplier-key', 'Bearer isolated-claude-max-supplier-key',
  ]);
  assert.deepEqual(calls.map((call) => call.url), ['https://base.example/v1/chat/completions', 'https://claude-max.example/v1/chat/completions']);
});

test('historical individual routes stay on base while approval restrictions still apply to every tier', () => {
  const store = openStore(':memory:', secret);
  try {
    for (const id of ['base', 'claude', 'claude-max']) store.saveChat(ready(id));
    const account = creator(store);
    const id = account.user.id;
    const channels = store.adminEnrollment(id).channels.map((channel) => ({
      ...channel, state: channel.id === 'chat' ? 'ready' : 'unavailable',
      credentialMode: 'student', accountRef: 'legacy-assigned-account', protocol: 'openai-chat',
      baseUrl: 'https://legacy.example/v1', model: 'legacy-model', key: 'legacy-individual-key',
      visionVerified: true,
    }));
    store.saveEnrollment(id, { state: 'ready', channels });
    assert.equal(store.chat(id).key, 'legacy-individual-key');
    const enhanced = store.studentChat(id).tiers.find((tier) => tier.id === 'claude');
    store.selectChatTier(id, 'claude', enhanced.priceVersion);
    const operation = store.reserve(id, 'isolated-enhanced', 'fp');
    assert.equal(operation.rates.key, ready('claude').key);
    assert.equal(operation.rates.baseUrl, ready('claude').baseUrl);
    assert.equal(operation.rates.inputPointsPerMillion, ready('claude').inputPointsPerMillion);
    store.settle(operation.id, 0);
    store.saveEnrollment(id, { state: 'pending', channels: channels.map((channel) => ({ ...channel, state: 'pending' })) });
    assert.ok(store.studentChat(id).tiers.every((tier) => !tier.enabled));
    assert.throws(() => store.reserve(id, 'unapproved', 'fp'), /尚未开通/);
  } finally { store.close(); }
});
