import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCloudSync } from '../apps/wanju-service/cloud-client.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://wanju.kukukaka.cn', release = '0.1.12';
const directory = join(root, '.local/public-release', `lifecycle-${release}-${randomUUID().slice(0, 8)}`);
await mkdir(join(directory, 'source/assets'), { recursive: true });
const call = async (path, token = '', data, method = data === undefined ? 'GET' : 'POST') => {
  const response = await fetch(`${origin}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { status: response.status, value: await response.json() };
};
assert.equal((await call('/health')).value.release, release);
const initialPrices = (await call('/api/public')).value.cloud.prices;
const login = await call('/api/admin/login', '', { password: (await readFile(join(root, '.local/cloud-admin-login.password'), 'utf8')).trim() });
assert.equal(login.status, 200);
const admin = login.value.token, accounts = [];
try {
  for (let i = 0; i < 2; i++) {
    const account = await call('/api/account/register', '', { username: `lifecycle-${randomUUID().slice(0, 8)}`, password: randomUUID() });
    assert.equal(account.status, 201); accounts.push(account.value);
  }
  const [account, other] = accounts;
  const client = createCloudSync({ origin, userId: account.user.id,
    request: (path, options = {}) => fetch(`${origin}${path}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { ...options.headers, authorization: `Bearer ${account.token}` } }) });
  const local = join(directory, 'source');
  const original = '<!doctype html><html><body>cloud lifecycle test version one</body></html>';
  await writeFile(join(local, 'film.html'), original);
  const first = await client.push({ root: local, title: '云项目生命周期自检（无付费生成）' });
  await writeFile(join(local, 'film.html'), '<!doctype html><html><body>cloud lifecycle test version two</body></html>');
  await client.push({ root: local, title: '云项目生命周期自检（无付费生成）' });
  assert.deepEqual((await client.versions({ projectId: first.id })).versions.map((v) => v.revision), [2, 1]);
  await mkdir(join(directory, 'history'));
  const historical = await client.pull({ projectId: first.id, revision: 1, parent: join(directory, 'history') });
  assert.equal(await readFile(join(historical.path, 'film.html'), 'utf8'), original);
  assert.equal((await call(`/api/cloud/projects/${first.id}/versions`, other.token)).status, 404);
  await client.trash({ projectId: first.id, revision: 2 });
  assert.equal((await client.list()).projects.length, 0);
  await assert.rejects(client.push({ root: local, title: '云项目生命周期自检（无付费生成）' }), /回收站/);
  const [trash] = (await client.trashList()).projects;
  await client.restore({ projectId: first.id, trashToken: trash.trashToken });
  assert.equal((await client.list()).projects[0].revision, 2);
  await client.trash({ projectId: first.id, revision: 2 });
  const [again] = (await client.trashList()).projects;
  const invalid = await call(`/api/cloud/projects/${first.id}/purge`, account.token, { trashToken: again.trashToken, confirmTitle: 'wrong title' });
  assert.equal(invalid.status, 409);
  await client.purge({ projectId: first.id, trashToken: again.trashToken, confirmTitle: again.title });
  assert.equal((await client.trashList()).projects.length, 0);
  const preview = await client.cleanupPreview();
  assert.equal(preview.objects, 0, 'fresh test uploads must receive 24-hour protection');
  const cleaned = await client.cleanup({ token: preview.token, confirm: '清理未引用文件' });
  assert.equal(cleaned.objects, 0);
  assert.match(await readFile(join(local, 'film.html'), 'utf8'), /version two/);
  assert.equal((await call('/api/me', account.token)).value.user.balance, 0);
  assert.deepEqual((await call('/api/public')).value.cloud.prices, initialPrices, 'Verification must not change live pricing.');
  const manifest = (await call('/downloads.json')).value;
  const expected = JSON.parse(await readFile(join(root, '.local/public-release/release-manifest.json'), 'utf8'));
  assert.deepEqual(manifest, expected);
  const download = await fetch(`${origin}${manifest.desktop.href}`, { headers: { range: 'bytes=0-31' } });
  assert.equal(download.status, 206); assert.equal((await download.arrayBuffer()).byteLength, 32);
  for (const guide of ['studentGuide', 'teacherGuide']) {
    const response = await fetch(`${origin}${manifest[guide].href}`, { method: 'HEAD' });
    assert.equal(response.status, 200); assert.equal(Number(response.headers.get('content-length')), manifest[guide].bytes);
  }
  const evidence = { checkedAt: new Date().toISOString(), release, cloudHistoryDownload: 'passed', trashRestore: 'passed',
    staleUploadBlocked: true, permanentDeleteConfirmed: true, accountIsolation: 'passed', recentUploadsProtected: true,
    localFilesPreserved: true, downloadRange: 'passed', pdfs: 2,
    feesEnabled: initialPrices.enabled, pricingUnchanged: true, paidRequests: 0,
    accounts: accounts.map((a) => a.user.id), project: first.id, fixtureDirectory: directory,
    note: 'Only synthetic owned fixtures were deleted. Accounts are suspended after the check; recent tiny blobs remain protected.' };
  await writeFile(join(root, '.local/public-release/cloud-lifecycle-0.1.12.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ release, cloudLifecycle: 'passed', downloads: 'passed', localFilesPreserved: true, paidRequests: 0 }));
} finally {
  for (const account of accounts) {
    const result = await call(`/api/admin/users/${account.user.id}`, admin, { status: 'suspended' }, 'PATCH');
    assert.equal(result.status, 200);
  }
  await call('/api/admin/logout', admin, {}).catch(() => {});
}
