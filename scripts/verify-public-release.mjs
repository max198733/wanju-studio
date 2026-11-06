import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCloudSync } from '../apps/wanju-service/cloud-client.mjs';
import { saveAssetCatalog, assetAudit } from '../packages/openfilm/studio/server/wanju-assets.mjs';
import { saveWanju } from '../packages/openfilm/studio/server/wanju.mjs';
import { blankState } from '../packages/openfilm/studio/server/wanju-model.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://wanju.kukukaka.cn';
const output = join(root, '.local/public-release');
const call = async (path, token = '', data, method = data === undefined ? 'GET' : 'POST') => {
  const response = await fetch(`${origin}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Public check failed: ${method} ${path}, HTTP ${response.status}.`);
  return value;
};
assert.equal((await call('/health')).release, '0.1.11');
const publicState = await call('/api/public');
assert.equal(publicState.registration.mode, 'unified_account');
assert.equal(publicState.cloud.available, true);
assert.equal(publicState.cloud.prices.enabled, false, 'Release must not silently enable fees.');
let admin;
for (const password of [process.env.WANJU_ADMIN_LOGIN, (await readFile(join(root, '.local/cloud-admin-login.password'), 'utf8')).trim()].filter(Boolean)) {
  try { admin = (await call('/api/admin/login', '', { password })).token; break; } catch { /* Preserve the server encryption key. */ }
}
if (!admin) throw new Error('Existing administrator password did not authenticate; nothing was reset.');
let catalog = await call('/api/admin/media/config', admin);
if (!catalog.profiles.length) {
  catalog = await call('/api/admin/media/config', admin, {
    base: catalog.revision,
    profiles: [
      { id: 'wanju-image', name: 'XEM 图片', category: 'image', adapter: 'openai-image',
        baseUrl: 'https://image.xem8k5.top', model: 'gpt-image-2.5-flare' },
      { id: 'wanju-seedance', name: 'Seedance 2.0', category: 'video', adapter: 'seedance',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks', model: 'doubao-seedance-2-0-260128' },
      { id: 'wanju-h3', name: 'H3 首帧', category: 'video', adapter: 'h3-single',
        baseUrl: 'https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_zm_nono', model: 'minimax_h3_zm_nono' },
      { id: 'wanju-audio', name: '音乐自定义服务', category: 'audio', adapter: 'custom-http',
        baseUrl: 'https://open.mxapi.org', model: '',
        note: '此服务尚未完成协议验证。按照供应商文档填写请求字段、任务查询与结果下载；不得自动重试付费请求。' },
    ], defaults: { image: 'wanju-image', video: 'wanju-seedance', audio: 'wanju-audio' },
  }, 'PUT');
}
const accounts = [];
try {
  for (let i = 0; i < 2; i++) {
    accounts.push(await call('/api/account/register', '', {
      username: `releasecheck-${randomUUID().slice(0, 8)}`, password: randomUUID(),
    }));
  }
  const [first, other] = accounts;
  const profile = catalog.profiles[0];
  let assignment = await call(`/api/admin/users/${first.user.id}/media`, admin);
  await call(`/api/admin/users/${first.user.id}/media`, admin, {
    base: assignment.revision, catalogRevision: assignment.catalogRevision,
    keys: [{ id: profile.id, key: 'RELEASE_TEST_ONLY_NO_PAID_CALL' }],
  }, 'PUT');
  const mine = await call('/api/media/config', first.token), theirs = await call('/api/media/config', other.token);
  assert.equal(mine.profiles.find((p) => p.id === profile.id).key, 'RELEASE_TEST_ONLY_NO_PAID_CALL');
  assert.equal(theirs.profiles.some((p) => p.key), false);
  assignment = await call(`/api/admin/users/${first.user.id}/media`, admin);
  assert.equal(assignment.profiles.find((p) => p.id === profile.id).key, undefined);
  await call(`/api/admin/users/${first.user.id}/media`, admin, {
    base: assignment.revision, catalogRevision: assignment.catalogRevision, keys: [{ id: profile.id, remove: true }],
  }, 'PUT');
  const session = (account) => createCloudSync({
    origin, userId: account.user.id,
    request: (path, options = {}) => fetch(`${origin}${path}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { ...options.headers, authorization: `Bearer ${account.token}` },
    }),
  });
  const firstDirectory = join(output, `live-source-${randomUUID().slice(0, 8)}`);
  await mkdir(join(firstDirectory, 'assets'), { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKQAAAAASUVORK5CYII=', 'base64');
  for (const name of ['hero.png', 'scene.png', 'shot.png']) await writeFile(join(firstDirectory, 'assets', name), png);
  await writeFile(join(firstDirectory, 'film.html'), '<!doctype html><html><body><img src="assets/shot.png"></body></html>');
  const state = { ...blankState(), title: '发布自检工程（无付费生成）', script: '隔离验证跨电脑的资产与审核记录。',
    shots: [{ id: 'S001', title: '自检', description: '一张仅供测试文件恢复的图片。', dialogue: '', duration: 5, media: '', image: 'assets/shot.png' }] };
  await saveWanju(firstDirectory, state);
  const reviewed = await saveAssetCatalog(firstDirectory, state, { assetBase: null, catalog: { enabled: true,
    assets: [
      { id: 'C01', kind: 'character', name: '测试人物', prompt: '', path: 'assets/hero.png', approved: true, reviewNote: '测试夹具，已确认文件校验和恢复用途。' },
      { id: 'SC01', kind: 'scene', name: '测试场景', prompt: '', path: 'assets/scene.png', approved: true, reviewNote: '测试夹具，已确认文件校验和恢复用途。' },
    ], bindings: [{ shot: 'S001', assetIds: ['C01', 'SC01'] }] } });
  await saveAssetCatalog(firstDirectory, state, { assetBase: reviewed.revision, approveStoryboard: true, reviewNote: '仅供发布恢复测试的夹具审核，不代表真实成片审核。' });
  const client = session(first), saved = await client.push({ root: firstDirectory, title: state.title });
  const downloadParent = join(output, 'live-restored'); await mkdir(downloadParent, { recursive: true });
  const restored = await client.pull({ projectId: saved.id, parent: downloadParent });
  assert.equal((await assetAudit(restored.path, state)).readyForVideo, true);
  assert.deepEqual(await readFile(join(restored.path, 'assets/hero.png')), png);
  assert.equal((await session(other).list()).projects.length, 0);
  const forbidden = await fetch(`${origin}/api/cloud/projects/${saved.id}`, { headers: { authorization: `Bearer ${other.token}` } });
  assert.equal(forbidden.status, 404);
  assert.equal((await call('/api/me', first.token)).user.balance, 0);
  const manifest = await call('/downloads.json');
  assert.equal(manifest.desktop.version, '0.1.11');
  const download = await fetch(`${origin}${manifest.desktop.href}`, { headers: { range: 'bytes=0-31' } });
  assert.equal(download.status, 206); assert.equal((await download.arrayBuffer()).byteLength, 32);
  for (const guide of ['studentGuide', 'teacherGuide']) {
    const response = await fetch(`${origin}${manifest[guide].href}`, { method: 'HEAD' });
    assert.equal(response.status, 200); assert.equal(Number(response.headers.get('content-length')), manifest[guide].bytes);
  }
  await writeFile(join(output, 'live-verification.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), origin, release: '0.1.11',
    registration: 'passed', cloudRoundtrip: 'passed', reviewedAssets: 'passed', accountIsolation: 'passed',
    mediaDefaults: catalog.profiles.length, accountCredentialIsolation: 'passed', charged: 0, downloadRange: 'passed',
    testAccounts: accounts.map((a) => a.user.id), testProject: saved.id,
    notes: ['Two release-check accounts are suspended after verification.', 'No paid supplier generation requests.'],
  }, null, 2));
  console.log(JSON.stringify({ release: '0.1.11', cloudRoundtrip: 'passed', reviewedAssets: 'passed', isolation: 'passed', downloads: 'passed', paidRequests: 0 }));
} finally {
  for (const account of accounts) await call(`/api/admin/users/${account.user.id}`, admin, { status: 'suspended' }, 'PATCH');
  await call('/api/admin/logout', admin, {}).catch(() => {});
}
