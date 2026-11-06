import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const origin = 'https://wanju.kukukaka.cn';
const privateFile = new URL('../.local/cloud-admin-login.password', import.meta.url);
const call = async (path, token = '', data, method = data === undefined ? 'GET' : 'POST') => {
  const response = await fetch(`${origin}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { status: response.status, value: await response.json() };
};
const health = await call('/health'), state = await call('/api/public');
assert.equal(health.value.release, '0.1.11');
assert.equal(state.value.registration.mode, 'unified_account');
assert.equal(state.value.cloud.available, true);
assert.equal(state.value.cloud.prices.enabled, false);
const password = (await readFile(privateFile, 'utf8')).trim();
const login = await call('/api/admin/login', '', { password });
assert.equal(login.status, 200);
const token = login.value.token;
try {
  const before = (await call('/api/admin/media/config', token)).value;
  assert.ok(before.profiles.length > 0);
  const invalid = await call('/api/admin/media/config', token, {
    ...before, base: before.revision,
    profiles: before.profiles.map((profile, index) => index ? profile : { ...profile, baseUrl: 'http://invalid.example' }),
  }, 'PUT');
  assert.equal(invalid.status, 400);
  assert.match(invalid.value.error.message, /HTTPS/);
  const after = (await call('/api/admin/media/config', token)).value;
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.profiles, before.profiles);
  const manifest = (await call('/downloads.json')).value;
  const result = { checkedAt: new Date().toISOString(), release: health.value.release,
    registration: state.value.registration.mode, cloud: true, feesEnabled: false, adminLogin: 'passed',
    invalidMediaInput: 400, savedCatalogUnchanged: true, downloadManifest: manifest };
  await writeFile(new URL('../.local/public-release/final-check.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ release: result.release, adminLogin: result.adminLogin,
    invalidMediaInput: result.invalidMediaInput, savedCatalogUnchanged: true, feesEnabled: false,
    evidence: fileURLToPath(new URL('../.local/public-release/final-check.json', import.meta.url)) }));
} finally {
  await call('/api/admin/logout', token);
}
