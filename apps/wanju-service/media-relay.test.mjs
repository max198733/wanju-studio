import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStudentService } from './server.mjs';
import { createMediaRelay } from './media-relay.mjs';

const adminSecret = 'test-admin-secret-not-a-production-password';

async function fixture(t, fetchImpl) {
  const { server, store } = createStudentService({ adminSecret, fetchImpl });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)); store.close(); });
  const call = async (path, { data, method = data === undefined ? 'GET' : 'POST', token } = {}) => {
    const response = await fetch(`${url}${path}`, { method, headers: {
      ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}),
    }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, data: await response.json() };
  };
  const codes = await call('/api/admin/codes', { token: adminSecret, data: { kind: 'activation', count: 1, points: 1000 } });
  const activated = await call('/api/activate', { data: { username: 'creator', password: 'test-password-123', code: codes.data.codes[0].code } });
  return { store, call, url, user: activated.data.user, token: activated.data.token, adminSecret };
}

const catalog = {
  profiles: [{ id: 'img-1', category: 'image', adapter: 'openai-image', name: '图片', baseUrl: 'https://image.example',
    model: 'gpt-image-2.5-flare', auth: 'Authorization: Bearer {key}', key: 'server-side-secret-key-0001', responseFormat: 'url' }],
  defaults: { image: 'img-1', video: null, audio: null },
};
const videoCatalog = {
  profiles: [{ id: 'vid-1', category: 'video', adapter: 'seedance', name: '视频',
    baseUrl: 'https://ark.example/api/v3/contents/generations/tasks', model: 'doubao-seedance-2-0-260128',
    auth: 'Authorization: Bearer {key}', key: 'server-side-secret-key-0002' }],
  defaults: { image: null, video: 'vid-1', audio: null },
};
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const relayFor = (store, fetchImpl, cat = catalog) => createMediaRelay({
  store, fail, fetchImpl, profilesFor: async () => cat,
});

test('图片同步生成成功后按次扣点，密钥不出现在返回里', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ image: { points: 5, enabled: true }, video: { points: 60, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;
  let seen;
  const relay = relayFor(f.store, async (url, init) => {
    seen = { url, auth: init.headers.Authorization ?? init.headers.authorization };
    return Response.json({ data: [{ url: 'https://cdn.example/one.png' }] });
  });
  const result = await relay.submit(f.user.id, { category: 'image', payload: { model: 'gpt-image-2.5-flare', prompt: 'test' } });
  assert.equal(result.pending, false);
  assert.equal(result.result.data[0].url, 'https://cdn.example/one.png');
  assert.equal(seen.url, 'https://image.example/v1/images/generations');
  assert.equal(seen.auth, 'Bearer server-side-secret-key-0001', '服务端注入密钥');
  assert.equal(f.store.wallet(f.user.id).user.balance, before - 5);
  assert.equal(JSON.stringify(result).includes('server-side-secret-key-0001'), false, '返回体不得含密钥');
});

test('上游明确拒绝时退回预留，不扣学员点数', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;
  const relay = relayFor(f.store, async () => new Response('{"error":{"message":"bad model"}}', { status: 400 }));
  await assert.rejects(() => relay.submit(f.user.id, { category: 'image', payload: { prompt: 'x' } }), /拒绝了本次请求/);
  assert.equal(f.store.wallet(f.user.id).user.balance, before, '拒绝必须全额退回');
});

test('连接中断视为结果未知，预留保持并进入待核对，不自动重发', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;
  const relay = relayFor(f.store, async () => { throw new Error('socket hang up'); });
  await assert.rejects(() => relay.submit(f.user.id, { category: 'image', payload: { prompt: 'x' } }), /请勿重复提交/);
  assert.equal(f.store.wallet(f.user.id).user.balance, before - 5, '未知状态不能退款，钱要留着');
  const review = f.store.reviewOperations({ pageSize: 10 });
  assert.equal(review.items.length, 1);
  assert.match(review.items[0].note, /未自动重发/);
});

test('连接阶段就失败（DNS/TCP 没打通）视为请求未送达，全额退回且不进待核对', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;
  const relay = relayFor(f.store, async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) });
  });
  await assert.rejects(() => relay.submit(f.user.id, { category: 'image', payload: { prompt: 'x' } }), /未扣点/);
  assert.equal(f.store.wallet(f.user.id).user.balance, before, '根本没连上，必须全额退回');
  assert.equal(f.store.reviewOperations({ pageSize: 10 }).items.length, 0, '不要给老师制造假待核对');
});

test('AggregateError 里任意一个连接失败即算未送达', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;
  const relay = relayFor(f.store, async () => {
    const aggregate = new AggregateError([], 'all attempts failed');
    aggregate.errors = [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })];
    throw aggregate;
  });
  await assert.rejects(() => relay.submit(f.user.id, { category: 'image', payload: { prompt: 'x' } }), /未扣点/);
  assert.equal(f.store.wallet(f.user.id).user.balance, before);
  assert.equal(f.store.reviewOperations({ pageSize: 10 }).items.length, 0);
});

test('同一幂等键不能重复提交，防止二次扣费', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });
  const relay = relayFor(f.store, async () => Response.json({ data: [{ url: 'https://cdn.example/a.png' }] }));
  await relay.submit(f.user.id, { category: 'image', payload: { prompt: 'a' } }, 'key-1');
  await assert.rejects(() => relay.submit(f.user.id, { category: 'image', payload: { prompt: 'a' } }, 'key-1'), /已经提交/);
});

test('同一账号不允许并发生成，避免重复扣费', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ video: { points: 60, enabled: true } });
  // 第一个任务停在 submitted（异步等待），第二个必须被拒
  const relay = relayFor(f.store, async () => Response.json({ id: 'task-1', status: 'queued' }), videoCatalog);
  const first = await relay.submit(f.user.id, { category: 'video', payload: { model: 'doubao-seedance-2-0-260128', content: [] } });
  assert.equal(first.pending, true);
  await assert.rejects(() => relay.submit(f.user.id, { category: 'video', payload: { model: 'x', content: [] } }), /正在执行/);
});

test('视频任务提交不立即扣费，查询确认成功后才结算', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ video: { points: 60, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;
  let phase = 'submit';
  const relay = relayFor(f.store, async (url, init) => {
    if (phase === 'submit') {
      assert.equal(url, 'https://ark.example/api/v3/contents/generations/tasks');
      assert.equal(init.method, 'POST');
      return Response.json({ id: 'task-9', status: 'queued' });
    }
    assert.equal(url, 'https://ark.example/api/v3/contents/generations/tasks/task-9');
    assert.equal(init.method, 'GET');
    return Response.json({ id: 'task-9', status: 'succeeded', content: { video_url: 'https://cdn.example/v.mp4' } });
  }, videoCatalog);

  const submitted = await relay.submit(f.user.id, { category: 'video', payload: { model: 'm', content: [] } });
  assert.equal(submitted.pending, true);
  assert.equal(submitted.remoteId, 'task-9');
  assert.equal(f.store.wallet(f.user.id).user.balance, before - 60, '提交时预占');

  phase = 'query';
  const running = await relay.query(f.user.id, submitted.operationId);
  assert.equal(running.status, 'succeeded');
  assert.equal(running.settled, true);
  assert.equal(f.store.wallet(f.user.id).user.balance, before - 60, '成功才实扣，金额与预占一致');
  assert.equal(f.store.mediaOperation(f.user.id, submitted.operationId).status, 'settled');
});

test('视频任务上游失败时退回预留', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ video: { points: 60, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;
  let phase = 'submit';
  const relay = relayFor(f.store, async () => (phase === 'submit'
    ? Response.json({ id: 'task-bad', status: 'queued' })
    : Response.json({ id: 'task-bad', status: 'failed' })), videoCatalog);
  const submitted = await relay.submit(f.user.id, { category: 'video', payload: { model: 'm', content: [] } });
  phase = 'query';
  const result = await relay.query(f.user.id, submitted.operationId);
  assert.equal(result.status, 'failed');
  assert.equal(f.store.wallet(f.user.id).user.balance, before, '失败全额退回');
});

test('未开启计费的类别直接拒绝，不会静默扣费', async (t) => {
  const f = await fixture(t);
  const relay = relayFor(f.store, async () => Response.json({ data: [] }));
  await assert.rejects(() => relay.submit(f.user.id, { category: 'image', payload: { prompt: 'x' } }), /尚未开放计费通道/);
});

test('其他账号查不到别人的媒体任务', async (t) => {
  const f = await fixture(t);
  f.store.saveMediaPrices({ video: { points: 60, enabled: true } });
  const relay = relayFor(f.store, async () => Response.json({ id: 'task-x', status: 'queued' }), videoCatalog);
  const submitted = await relay.submit(f.user.id, { category: 'video', payload: { model: 'm', content: [] } });
  assert.equal(f.store.mediaOperation('someone-else', submitted.operationId), null);
});

test('HTTP 接线：老师配价→学员提交→服务端注入密钥→扣点，全程密钥不下发', async (t) => {
  let upstream;
  const f = await fixture(t, async (url, init) => {
    upstream = { url, auth: init.headers.Authorization ?? init.headers.authorization };
    return Response.json({ data: [{ url: 'https://cdn.example/http.png' }] });
  });
  // 老师：配默认供应商 + 给账号分配密钥 + 开图片计费
  const catalog = f.store.media.saveCatalog({ base: 'empty',
    profiles: [{ id: 'img-http', category: 'image', adapter: 'openai-image',
    name: 'HTTP 图片', baseUrl: 'https://image.example', model: 'gpt-image-2.5-flare', responseFormat: 'url' }],
    defaults: { image: 'img-http' } });
  f.store.media.saveAssignment(f.user.id, { catalogRevision: catalog.revision, base: 'empty',
    keys: [{ id: 'img-http', key: 'never-should-leak-0001' }] });
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });

  const before = (await f.call('/api/me', { token: f.token })).data.user.balance;

  // 学员：查价格
  const prices = await f.call('/api/media/prices', { token: f.token });
  assert.equal(prices.data.available, true);
  assert.equal(prices.data.prices.image.points, 5);

  // 学员：提交生成
  const result = await f.call('/api/relay/media', { token: f.token, headers: { 'idempotency-key': 'http-1' },
    data: { category: 'image', payload: { model: 'gpt-image-2.5-flare', prompt: '测试画面' } } });
  assert.equal(result.status, 200);
  assert.equal(result.data.result.data[0].url, 'https://cdn.example/http.png');
  assert.equal(upstream.auth, 'Bearer never-should-leak-0001', '密钥由服务端注入');
  assert.equal(JSON.stringify(result.data).includes('never-should-leak-0001'), false, '响应里不得出现密钥');

  const after = (await f.call('/api/me', { token: f.token })).data.user.balance;
  assert.equal(after, before - 5);

  // 未登录不能提交
  const denied = await f.call('/api/relay/media', { data: { category: 'image', payload: {} } });
  assert.equal(denied.status, 401);
});

test('HTTP 接线：老师端可以读写媒体定价', async (t) => {
  const f = await fixture(t);
  const saved = await f.call('/api/admin/media-prices', { token: f.adminSecret, method: 'PUT',
    data: { image: { points: 8, enabled: true } } });
  assert.equal(saved.data.image.points, 8);
  const read = await f.call('/api/admin/media-prices', { token: f.adminSecret });
  assert.equal(read.data.image.enabled, true);
});

test('供应商同形兼容：/v1/images/generations 直接返回供应商原样结构并按张结算', async (t) => {
  let upstream;
  const f = await fixture(t, async (url, init) => {
    upstream = { url: String(url), auth: init.headers.Authorization ?? init.headers.authorization,
      body: JSON.parse(String(init.body)) };
    return Response.json({ created: 1, data: [{ b64_json: 'aGVsbG8=', size: '1024x1024' }] });
  });
  const saved = f.store.media.saveCatalog({ base: 'empty',
    profiles: [{ id: 'img-compat', category: 'image', adapter: 'openai-image', name: '兼容图片',
      baseUrl: 'https://image.example', model: 'gpt-image-2.5-flare', responseFormat: 'b64_json' }],
    defaults: { image: 'img-compat' } });
  f.store.media.saveAssignment(f.user.id, { catalogRevision: saved.revision, base: 'empty',
    keys: [{ id: 'img-compat', key: 'compat-secret-key-0001' }] });
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });
  const before = f.store.wallet(f.user.id).user.balance;

  // 客户端只把 base_url 指到服务端、密钥填自己的令牌，请求体完全照供应商格式写
  const response = await fetch(`${f.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${f.token}`, 'idempotency-key': 'compat-1' },
    body: JSON.stringify({ model: 'gpt-image-2.5-flare', prompt: '兼容路由测试', n: 1, response_format: 'b64_json' }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  // 供应商原样结构，没有被 result 包裹，OpenFilm 的解析不用改
  assert.equal(data.data[0].b64_json, 'aGVsbG8=');
  assert.equal(data.result, undefined);
  assert.equal(upstream.url, 'https://image.example/v1/images/generations');
  assert.equal(upstream.auth, 'Bearer compat-secret-key-0001', '密钥由服务端注入，学员令牌不能透给供应商');
  assert.equal(upstream.body.prompt, '兼容路由测试');
  assert.equal(JSON.stringify(data).includes('compat-secret-key-0001'), false, '响应里不得出现供应商密钥');
  assert.equal(f.store.wallet(f.user.id).user.balance, before - 5);
});

test('供应商同形兼容：带参考图的 multipart 原样转发到 /v1/images/edits', async (t) => {
  let upstream;
  const f = await fixture(t, async (url, init) => {
    upstream = { url: String(url), length: init.body?.length ?? 0,
      contentType: String(init.headers['content-type'] ?? init.headers['Content-Type'] ?? ''),
      auth: init.headers.Authorization ?? init.headers.authorization };
    return Response.json({ data: [{ b64_json: 'ZWRpdA==' }] });
  });
  const saved = f.store.media.saveCatalog({ base: 'empty',
    profiles: [{ id: 'img-edit', category: 'image', adapter: 'openai-image', name: '兼容图片',
      baseUrl: 'https://image.example', model: 'gpt-image-2.5-flare', responseFormat: 'b64_json' }],
    defaults: { image: 'img-edit' } });
  f.store.media.saveAssignment(f.user.id, { catalogRevision: saved.revision, base: 'empty',
    keys: [{ id: 'img-edit', key: 'compat-secret-key-0002' }] });
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });

  const form = new FormData();
  form.append('model', 'gpt-image-2.5-flare');
  form.append('prompt', '带参考图的画面');
  form.append('n', '1');
  form.append('image', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'ref.png');
  const response = await fetch(`${f.url}/v1/images/edits`, {
    method: 'POST', headers: { authorization: `Bearer ${f.token}` }, body: form,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].b64_json, 'ZWRpdA==');
  assert.equal(upstream.url, 'https://image.example/v1/images/edits');
  assert.match(upstream.contentType, /^multipart\/form-data; boundary=/, '原始 content-type 与分隔符必须保留');
  assert.ok(upstream.length > 0, '原始字节被完整转发，服务端不解析也不重编码');
  assert.equal(upstream.auth, 'Bearer compat-secret-key-0002');
});

test('客户端视角：图片指向本站代理并只下发学员令牌，供应商密钥留在服务端', async (t) => {
  const f = await fixture(t);
  const saved = f.store.media.saveCatalog({ base: 'empty',
    profiles: [{ id: 'img-r', category: 'image', adapter: 'openai-image', name: '图片',
      baseUrl: 'https://image.example', model: 'gpt-image-2.5-flare', responseFormat: 'b64_json' }],
    defaults: { image: 'img-r' } });
  f.store.media.saveAssignment(f.user.id, { catalogRevision: saved.revision, base: 'empty',
    keys: [{ id: 'img-r', key: 'server-only-key-0001' }] });

  // 服务端自己用的视图（代理按它挑供应商）必须还是真供应商 + 真密钥
  const vendor = f.store.media.forUser(f.user.id);
  assert.equal(vendor.defaults.image, 'img-r');
  assert.equal(vendor.profiles.find((p) => p.id === 'img-r').key, 'server-only-key-0001');

  // 客户端视图：图片换成本站代理，密钥是学员自己的令牌
  const client = f.store.media.forUser(f.user.id, { origin: 'https://wanju.example', token: f.token });
  assert.equal(client.defaults.image, 'wanju-relay-image');
  const relay = client.profiles.find((p) => p.id === 'wanju-relay-image');
  assert.equal(relay.baseUrl, 'https://wanju.example');
  assert.equal(relay.model, 'gpt-image-2.5-flare');
  assert.equal(relay.key, f.token);
  assert.equal(client.profiles.some((p) => p.category === 'image' && p.id !== 'wanju-relay-image'), false);
  assert.equal(JSON.stringify(client).includes('server-only-key-0001'), false, '供应商密钥不得下发给客户端');

  // 明文 HTTP（本机/内网调试）保持直连视图，避免测试与本地环境被改道
  const plain = await f.call('/api/media/config', { token: f.token });
  assert.equal(plain.data.defaults.image, 'img-r');
});

test('运营方统一密钥：没被单独分配密钥的账号也能出图，且密钥不下发', async (t) => {
  let upstream;
  const f = await fixture(t, async (url, init) => {
    upstream = { url: String(url), auth: init.headers.Authorization ?? init.headers.authorization };
    return Response.json({ created: 1, data: [{ b64_json: 'aGVsbG8=' }] });
  });
  f.store.media.saveCatalog({ base: 'empty',
    profiles: [{ id: 'img-op', category: 'image', adapter: 'openai-image', name: '统一出图',
      baseUrl: 'https://image.example', model: 'gpt-image-2.5-flare', responseFormat: 'b64_json' }],
    defaults: { image: 'img-op' } });
  f.store.saveMediaPrices({ image: { points: 5, enabled: true } });

  // 老师只配一次运营方密钥，不给这个账号做任何分配
  const saved = await f.call('/api/admin/media/operator', { token: f.adminSecret, method: 'PUT',
    data: { id: 'img-op', key: 'operator-shared-key-0001' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.profiles.find((p) => p.id === 'img-op').configured, true);
  assert.equal(JSON.stringify(saved.data).includes('operator-shared-key-0001'), false, '后台查看也不回显密钥');

  const before = f.store.wallet(f.user.id).user.balance;
  const response = await fetch(`${f.url}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${f.token}`, 'idempotency-key': 'op-1' },
    body: JSON.stringify({ prompt: '统一密钥出图', n: 1 }),
  });
  assert.equal(response.status, 200);
  assert.equal(upstream.auth, 'Bearer operator-shared-key-0001', '代理用运营方密钥访问上游');
  assert.equal(f.store.wallet(f.user.id).user.balance, before - 5);

  // 客户端视图里依旧只有学员令牌
  const client = f.store.media.forUser(f.user.id, { origin: 'https://wanju.example', token: f.token }, { operator: true });
  assert.equal(JSON.stringify(client).includes('operator-shared-key-0001'), false);

  // 账号级分配的密钥优先于运营方密钥
  const catalog = f.store.media.catalog();
  f.store.media.saveAssignment(f.user.id, { catalogRevision: catalog.revision, base: 'empty',
    keys: [{ id: 'img-op', key: 'own-personal-key-0002' }] });
  assert.equal(f.store.media.forUser(f.user.id, null, { operator: true })
    .profiles.find((p) => p.id === 'img-op').key, 'own-personal-key-0002');
});
