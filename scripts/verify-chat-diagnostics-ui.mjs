import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createStudentService } from '../apps/wanju-service/server.mjs';

const { chromium } = createRequire(new URL('../apps/desktop/package.json', import.meta.url))('playwright-core');
const directory = resolve(process.argv[2] || 'outputs/chat-diagnostics');
await mkdir(directory, { recursive: true });
const secret = 'local-ui-test-admin-secret-not-for-production';
const supplierKey = 'local-ui-test-supplier-key';
let supplierCalls = 0;
const { server, store } = createStudentService({
  adminSecret: secret,
  fetchImpl: async () => {
    supplierCalls++;
    return Response.json({ error: { code: 'server_error', message: supplierKey } }, { status: 500 });
  },
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const evidence = [];
try {
  store.setAdminPassword('local-ui-test-password');
  store.saveChat({ enabled: true, visionVerified: true, baseUrl: 'https://supplier.example/v1', key: supplierKey,
    model: 'fixture-model', inputPointsPerMillion: 1000, outputPointsPerMillion: 2000, reservePoints: 50 });
  const account = store.activate({ username: 'diagnostic-fixture', password: 'local-user-password',
    code: store.createCodes({ kind: 'activation', count: 1, points: 1000 })[0].code });
  const draft = store.adminEnrollment(account.user.id);
  store.saveEnrollment(account.user.id, { ...draft, state: 'ready', channels: draft.channels.map((channel) => ({
    ...channel, credentialMode: 'shared', state: channel.id === 'chat' ? 'ready' : 'unavailable',
  })) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/v1/chat/completions`, { method: 'POST',
    headers: { authorization: `Bearer ${account.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'wanju-creative', messages: [{ role: 'user', content: 'private fixture prompt' }] }) });
  const { error } = await response.json();
  assert.equal(response.status, 502);

  for (const [name, width, height, colorScheme] of [
    ['desktop', 1440, 950, 'light'], ['mobile', 390, 844, 'light'], ['dark', 1440, 950, 'dark'],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
    await page.locator('#admin-secret').fill('local-ui-test-password');
    await page.locator('#login-form button').click();
    await page.locator('#dashboard').waitFor({ state: 'visible' });
    await page.locator('#operation-id').fill(error.operation_id);
    await page.locator('#operation-lookup button').click();
    await page.locator('#operation-result').waitFor({ state: 'visible' });
    await page.getByText('fixture-model', { exact: true }).waitFor();
    assert.match(await page.locator('#operation-result').textContent(), /500 \/ server_error/);
    assert.doesNotMatch(await page.locator('#operation-result').textContent(), /local-ui-test-supplier-key|private fixture prompt/);
    await page.getByRole('button', { name: '查看诊断', exact: true }).click();
    await page.getByText('fixture-model', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(directory, `${name}.png`), fullPage: true });
    evidence.push({ viewport: name, lookup: 'passed', reviewLink: 'passed', javascriptErrors: errors.length, overflow: false });
    await page.close();
  }
  assert.equal(supplierCalls, 1);
  const result = { checkedAt: new Date().toISOString(), realSupplierCalls: 0, mockSupplierCalls: supplierCalls, evidence };
  await writeFile(resolve(directory, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  store.close();
}
