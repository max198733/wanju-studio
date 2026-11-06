import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { createStudentService } from '../../wanju-service/server.mjs';

test('teacher pricing calculator works on desktop and mobile without changing the live tariff', { timeout: 60000 }, async () => {
  const password = 'test-pricing-admin-secret-only-1234';
  const { server, store } = createStudentService({
    adminSecret: password, fetchImpl: async () => assert.fail('calculator cannot call a supplier'),
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/admin`);
    await page.getByLabel('后台登录密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await page.getByRole('button', { name: '创作助手', exact: true }).click();
    await page.getByLabel('计价单位', { exact: true }).selectOption('image');
    await page.getByLabel('供应商单位成本（元）', { exact: true }).fill('0.15');
    await page.getByLabel('预计数量', { exact: true }).fill('100');
    await page.getByRole('button', { name: '计算售价', exact: true }).click();
    await page.getByText(/建议每单位 30 点.*账面毛利 ¥15.0000/).waitFor();
    for (const viewport of [{ width: 1200, height: 850 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await page.locator('#pricing-form').evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
    }
    assert.equal(store.publicChat().enabled, false);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    store.close();
  }
});
