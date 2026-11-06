import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openStore, usagePoints, maximumUsagePoints } from './store.mjs';
import { CLAUDE_OPUS_PRICE_TIERS, claudeOpusPriceDraft } from './claude-opus-pricing.mjs';
import { createStudentService } from './server.mjs';

const secret = 'local-only-opus-pricing-admin-test-secret';
const ready = (tier = 'claude') => ({ ...claudeOpusPriceDraft(tier), enabled: true,
  key: 'local-only-shared-model-test-key', visionVerified: true });
const mixedUsage = { prompt_tokens: 20000, completion_tokens: 1000,
  prompt_tokens_details: { cached_tokens: 10000, cache_write_tokens: 5000 } };

test('new service defaults to the requested model without enabling an unconfigured wallet', () => {
  const store = openStore(':memory:', secret);
  try {
    assert.equal(store.adminChat().model, 'claude-opus-5-5');
    assert.equal(store.adminChat().enabled, false);
    assert.equal(store.adminChat().keyConfigured, false);
  } finally { store.close(); }
});

test('all screenshot tiers preserve the exact doubled price and require an explicit choice', () => {
  assert.throws(() => claudeOpusPriceDraft(), /explicitly/);
  assert.throws(() => claudeOpusPriceDraft('default'), /explicitly/);
  assert.deepEqual(CLAUDE_OPUS_PRICE_TIERS.base, { inputPointsPerMillion: 80, outputPointsPerMillion: 400,
    cachedInputPointsPerMillion: 4, cacheWritePointsPerMillion: 100 });
  assert.equal(claudeOpusPriceDraft('claude').reservePoints, 23);
  assert.equal(claudeOpusPriceDraft('claude-max').reservePoints, 61);
  assert.equal(claudeOpusPriceDraft('base').reservePoints, 5);
  for (const tier of Object.keys(CLAUDE_OPUS_PRICE_TIERS)) {
    const draft = claudeOpusPriceDraft(tier);
    assert.equal(draft.enabled, false);
    assert.equal(draft.model, 'claude-opus-5-5');
    assert.equal(draft.billingMode, 'wallet');
    assert.equal(draft.key, undefined);
  }
});

test('cache read and write replace normal input charges and fractional point rates are not rounded early', () => {
  const rates = ready();
  assert.equal(usagePoints(mixedUsage, rates), 7);
  assert.equal(usagePoints({ prompt_tokens: 100000000, completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 100000000 } }, rates), 1820);
  assert.equal(usagePoints({ prompt_tokens: 0, completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 0 } }, rates), 0);
  assert.equal(usagePoints({ prompt_tokens: 1, completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 1 } }, rates), 1);
  assert.equal(usagePoints({ ...mixedUsage, prompt_tokens_details: undefined,
    cache_read_input_tokens: 10000, cache_creation_input_tokens: 5000 }, rates), 7);
});

test('missing, contradictory or impossible cache usage is never silently billed as ordinary input', () => {
  const rates = ready();
  for (const usage of [
    { prompt_tokens: 100, completion_tokens: 10 },
    { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: -1 } },
    { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 101 } },
    { ...mixedUsage, cache_read_input_tokens: 9999 },
  ]) assert.throws(() => usagePoints(usage, rates));
  assert.equal(usagePoints({ prompt_tokens: 100, completion_tokens: 10 }, {
    inputPointsPerMillion: 1000, outputPointsPerMillion: 2000,
  }), 1, 'legacy flat-input configurations retain their accounting');
});

test('relay Claude cache-write counters are billed even when only the split-duration fields are supplied', () => {
  const rates = ready();
  const observedShape = { prompt_tokens: 20000, completion_tokens: 1000,
    prompt_tokens_details: { cached_tokens: 10000 },
    claude_cache_creation_5_m_tokens: 3000, claude_cache_creation_1_h_tokens: 2000 };
  assert.equal(usagePoints(observedShape, rates), 7);
  assert.equal(usagePoints({ ...observedShape, cache_creation_input_tokens: 5000 }, rates), 7);
  assert.equal(usagePoints({ ...observedShape, claude_cache_creation_1_h_tokens: undefined }, rates), 6);
  assert.throws(() => usagePoints({ ...observedShape, cache_creation_input_tokens: 4999 }, rates), /相互矛盾/);
  assert.throws(() => usagePoints({ ...observedShape, claude_cache_creation_5_m_tokens: -1 }, rates));
  assert.throws(() => usagePoints({ ...observedShape, claude_cache_creation_1_h_tokens: 20001 }, rates), /超过总输入/);
  assert.equal(usagePoints({ prompt_tokens: 0, completion_tokens: 0,
    claude_cache_creation_5_m_tokens: 0, claude_cache_creation_1_h_tokens: 0 }, rates), 0);
});

test('cache terms are price-versioned, preserved in request snapshots and included in the reservation maximum', () => {
  const store = openStore(':memory:', secret);
  try {
    const config = ready();
    assert.throws(() => store.saveChat({ ...config, reservePoints: 22 }), /至少为23/);
    store.saveChat(config);
    const firstVersion = store.publicChat().priceVersion;
    const registered = store.register({ username: 'cache-creator', password: 'local-test-password' });
    const id = registered.user.id;
    store.redeem(id, store.createCodes({ kind: 'recharge', count: 1, points: 1000 })[0].code);
    const operation = store.reserve(id, 'cache-request-one', 'local-fingerprint');
    store.saveChat({ cachedInputPointsPerMillion: 18.3 });
    assert.notEqual(store.publicChat().priceVersion, firstVersion);
    const next = store.reserve(id, 'cache-request-two', 'local-fingerprint');
    assert.equal(next.rates.cachedInputPointsPerMillion, 18.3);
    store.settle(next.id, 0);
    assert.equal(operation.rates.cachedInputPointsPerMillion, 18.2);
    const points = usagePoints(mixedUsage, operation.rates);
    store.settle(operation.id, points, 'local cache usage test', mixedUsage);
    assert.equal(store.wallet(id).user.balance, 993);
    assert.equal(store.wallet(id).heldPoints, 0);
    const snapshot = JSON.parse(store.db.prepare('SELECT rates FROM operations WHERE id=?').get(operation.id).rates);
    assert.equal(snapshot.cachedInputPointsPerMillion, 18.2);
    assert.equal(snapshot.key, undefined);
    assert.equal(maximumUsagePoints(config), 23);
  } finally { store.close(); }
});

test('invalid cache rates cannot mutate settings, and clearing both fields restores legacy prices', () => {
  const store = openStore(':memory:', secret);
  try {
    store.saveChat(ready());
    const before = store.adminChat();
    for (const update of [
      { cachedInputPointsPerMillion: null }, { cachedInputPointsPerMillion: -1 },
      { cachedInputPointsPerMillion: 18.20001 }, { cachedInputPointsPerMillion: 'NaN' },
      { cacheWritePointsPerMillion: 1000000001 },
    ]) {
      assert.throws(() => store.saveChat(update));
      assert.deepEqual(store.adminChat(), before);
    }
    store.saveChat({ cachedInputPointsPerMillion: null, cacheWritePointsPerMillion: null });
    assert.equal(store.publicChat().cachedInputPointsPerMillion, undefined);
    store.saveChat({ billingMode: 'included' });
    assert.equal(store.adminChat().cachedInputPointsPerMillion, null);
    assert.equal(store.adminChat().reservePoints, 0);
  } finally { store.close(); }
});

for (const format of ['chat', 'responses']) {
  for (const streaming of [false, true]) {
    test(`${format} ${streaming ? 'streaming' : 'JSON'} settles cache-aware usage through the account gateway`, async (t) => {
      let missingUsage = false, calls = 0;
      const { server, store } = createStudentService({
        adminSecret: secret,
        fetchImpl: async (_url, init) => {
          calls++;
          assert.equal(init.headers.authorization, 'Bearer local-only-shared-model-test-key');
          const usage = missingUsage ? { prompt_tokens: 20000, completion_tokens: 1000 } : mixedUsage;
          const providerUsage = format === 'responses'
            ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens,
              ...(usage.prompt_tokens_details ? { input_tokens_details: usage.prompt_tokens_details } : {}) } : usage;
          const output = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'local test' }] }];
          if (!streaming) return Response.json(format === 'responses'
            ? { status: 'completed', output, usage: providerUsage }
            : { choices: [{ message: { role: 'assistant', content: 'local test' } }], usage: providerUsage });
          const events = format === 'responses'
            ? [{ type: 'response.completed', response: { status: 'completed', output, usage: providerUsage } }]
            : [{ choices: [{ delta: { content: 'local test' } }], usage: providerUsage }];
          return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
            + (format === 'chat' ? 'data: [DONE]\n\n' : ''), { headers: { 'content-type': 'text/event-stream' } });
        },
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        store.close();
      });
      store.saveChat({ ...ready(), format });
      const account = store.register({ username: 'cache-account', password: 'local-test-password' });
      store.redeem(account.user.id, store.createCodes({ kind: 'recharge', count: 1, points: 1000 })[0].code);
      store.consent(account.user.id, store.publicChat().priceVersion);
      const request = async () => fetch(`http://127.0.0.1:${server.address().port}/v1/${format === 'responses' ? 'responses' : 'chat/completions'}`, {
        method: 'POST', headers: { authorization: `Bearer ${account.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'wanju-creative', stream: streaming,
          ...(format === 'responses' ? { input: 'local test' } : { messages: [{ role: 'user', content: 'local test' }] }) }),
      });
      const first = await request();
      assert.equal(first.status, 200);
      await first.text();
      assert.equal(store.wallet(account.user.id).user.balance, 993);
      assert.equal(store.wallet(account.user.id).heldPoints, 0);
      missingUsage = true;
      const second = await request();
      assert.equal(second.status, 200);
      await second.text();
      const wallet = store.wallet(account.user.id);
      assert.equal(wallet.operations[0].status, 'review');
      assert.equal(wallet.heldPoints, 23);
      assert.equal(wallet.user.balance, 970);
      assert.equal(calls, 2);
    });
  }
}
