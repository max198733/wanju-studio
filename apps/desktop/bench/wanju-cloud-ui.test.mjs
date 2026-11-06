import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import shellConfig from '../shell/vite.config.ts';
import { createStudentService } from '../../wanju-service/server.mjs';

test('unified account UI registers, saves, downloads and consents without legacy activation gates', { timeout: 90000 }, async () => {
  const server = await createServer({
    ...shellConfig, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [...shellConfig.plugins, { name: 'unified-cloud-test', configureServer(app) {
      app.middlewares.use('/wanju-cloud-ui', (_req, res, next) => {
        res.setHeader('content-type', 'text/html');
        void app.transformIndexHtml('/wanju-cloud-ui', '<!doctype html><html data-wanju="1"><body><div id="root"></div><script type="module" src="/bench/wanju-image-settings.tsx"></script></body></html>')
          .then((html) => res.end(html), next);
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', (route) => new URL(route.request().url()).pathname === '/api/wanju/status'
      ? route.fulfill({ json: { providers: [] } }) : route.abort());
    await page.addInitScript(() => {
      const listeners = new Set(), progress = new Set(), automaticListeners = new Set();
      const state = { configured: true, authenticated: false, user: { id: 'one', username: 'creator', balance: 0 },
        chat: { enabled: true, authorized: true, displayName: '玩剧创作助手', billingMode: 'included', format: 'responses',
          dailyRequestLimit: 200, inputPointsPerMillion: 0, outputPointsPerMillion: 0, reservePoints: 0, priceVersion: 'included-test' },
        cloud: { available: true, usedBytes: 1234, quotaBytes: 1024 ** 3, authorized: false,
          prices: { enabled: false, imagePoints: 5, videoPoints: 1, priceVersion: 'test-price' } } };
      const snapshot = () => structuredClone(state);
      const change = () => { for (const fn of listeners) fn(); return snapshot(); };
      const project = { id: 'remote-project', title: '我的云短剧', revision: 2, updated: Date.now(), trashToken: 'test-trash', deleted: Date.now() };
      window.cloudFixture = { state, change, pushed: 0, pulled: 0, consented: 0, trashed: false, purged: false, cleaned: 0, restored: 0, lastRevision: null, automatic: [] };
      window.cloudFixture.publishAutomatic = (userId, projects) => {
        for (const fn of automaticListeners) fn({ userId, projects });
      };
      window.openfilmNative = { productName: '玩剧', wanju: {
        accountMode: 'unified', studentEdition: false, importConfigs: async () => ({ imported: 0 }),
        imageConfig: { get: async () => ({ configured: true, model: 'test-image', baseUrl: 'https://supplier.example/v1' }) },
        seedanceConfig: { get: async () => ({ configured: true, model: 'doubao-seedance-2-0-260128', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }) },
        h3Config: { get: async () => ({ configured: false }) },
        account: {
          status: async () => snapshot(), register: async () => { state.authenticated = true; return change(); },
          login: async () => { state.authenticated = true; return change(); },
          onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        },
        cloud: {
          list: async () => ({ projects: window.cloudFixture.trashed || window.cloudFixture.purged ? [] : [project],
            localProjects: [{ id: 'local-project', name: '本地短剧' }] }),
          trashList: async () => ({ projects: window.cloudFixture.trashed ? [project] : [] }),
          versions: async () => ({ versions: [{ revision: 1, files: 2, bytes: 1000, created: Date.now() }], nextBefore: null }),
          trash: async () => { window.cloudFixture.trashed = true; },
          restore: async () => { window.cloudFixture.trashed = false; window.cloudFixture.restored++; },
          purge: async () => { window.cloudFixture.trashed = false; window.cloudFixture.purged = true; },
          cleanupPreview: async () => ({ token: 'test-preview', bytes: 5000000, objects: 2, more: false, graceHours: 24 }),
          cleanup: async () => { window.cloudFixture.cleaned++; return { bytes: 5000000, objects: 2, skipped: 0, more: false }; },
          push: async ({ projectId }) => {
            if (projectId !== 'local-project') throw new Error('wrong project');
            window.cloudFixture.pushed++;
            for (const fn of progress) fn({ phase: 'uploading', completed: 1, total: 2 });
            return { revision: 3, files: 2, uploaded: 1, charged: 0, billingWarnings: [] };
          },
          pull: async (input) => { window.cloudFixture.pulled++; window.cloudFixture.lastRevision = input.revision; return { revision: input.revision ?? 2, opened: true }; },
          consent: async () => { window.cloudFixture.consented++; state.cloud.authorized = true; change(); },
          onProgress: (fn) => { progress.add(fn); return () => progress.delete(fn); },
          automaticStatus: async () => ({ userId: 'one', projects: window.cloudFixture.automatic }),
          setAutomatic: async ({ projectId, enabled }) => {
            if (enabled && !window.cloudFixture.pushed) throw new Error('请先手动保存此项目到云端，再开启自动保存。');
            window.cloudFixture.automatic = enabled ? [{ projectId, enabled: true, phase: 'waiting', message: '等待项目稳定' }] : [];
            const result = { userId: 'one', projects: window.cloudFixture.automatic };
            for (const fn of automaticListeners) fn(result);
            return result;
          },
          onAutomatic: (fn) => { automaticListeners.add(fn); return () => automaticListeners.delete(fn); },
        },
      } };
    });
    const url = `http://127.0.0.1:${server.httpServer.address().port}/wanju-cloud-ui`;
    await page.goto(`${url}?account`);
    await page.getByRole('radio', { name: '创建账号', exact: true }).waitFor();
    assert.equal(await page.getByLabel('激活码', { exact: true }).count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /老师版|学员版|学员账号/);
    await page.getByLabel('玩剧账号', { exact: true }).fill('creator');
    await page.getByLabel('密码', { exact: true }).fill('test-password-long');
    await page.getByRole('button', { name: '创建并登录', exact: true }).click();
    await page.getByText('我的云短剧', { exact: true }).waitFor();
    await page.getByText('默认助手已开通，不扣钱包点数', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '同意当前价格并启用', exact: true }).count(), 0);
    const automatic = page.getByRole('switch', { name: '本项目自动保存', exact: true });
    assert.equal(await automatic.getAttribute('aria-checked'), 'false');
    await automatic.click();
    await page.getByRole('alert').filter({ hasText: '请先手动保存此项目到云端' }).waitFor();
    assert.equal(await automatic.getAttribute('aria-checked'), 'false');
    await page.getByRole('button', { name: '保存到云端', exact: true }).click();
    await page.getByText(/已保存云版本 3/).waitFor();
    await automatic.click();
    await page.getByText('本项目已开启自动保存。', { exact: true }).waitFor();
    assert.equal(await automatic.getAttribute('aria-checked'), 'true');
    await page.evaluate(() => {
      window.cloudFixture.automatic[0].phase = 'paused';
      window.cloudFixture.automatic[0].message = '另一台电脑已更新，请核对后恢复。';
      window.cloudFixture.publishAutomatic('one', window.cloudFixture.automatic);
    });
    await page.getByRole('button', { name: '恢复本项目自动保存', exact: true }).click();
    await page.getByText('等待项目稳定', { exact: true }).waitFor();
    await page.evaluate(() => window.cloudFixture.publishAutomatic('another-account', [
      { projectId: 'local-project', enabled: true, phase: 'paused', message: 'SHOULD_NOT_SHOW_OTHER_ACCOUNT' },
    ]));
    assert.doesNotMatch(await page.locator('body').innerText(), /SHOULD_NOT_SHOW_OTHER_ACCOUNT/);
    await page.screenshot({ path: fileURLToPath(new URL('../../../work/wanju-auto-cloud-desktop.png', import.meta.url)), fullPage: true });
    await page.setViewportSize({ width: 960, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: fileURLToPath(new URL('../../../work/wanju-auto-cloud-narrow.png', import.meta.url)), fullPage: true });
    await page.setViewportSize({ width: 1200, height: 1000 });
    await automatic.click();
    await page.getByText('本项目已关闭自动保存。', { exact: true }).waitFor();
    assert.equal(await automatic.getAttribute('aria-checked'), 'false');
    await page.getByRole('button', { name: '下载并打开我的云短剧', exact: true }).click();
    await page.getByText('已下载、校验并打开新的本地工程副本。', { exact: true }).waitFor();
    await page.evaluate(() => { window.cloudFixture.state.cloud.prices.enabled = true; window.cloudFixture.change(); });
    await page.getByRole('button', { name: '确认服务费', exact: true }).click();
    await page.getByText('当前价格已确认', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => [window.cloudFixture.pushed, window.cloudFixture.pulled, window.cloudFixture.consented]), [1, 1, 1]);
    await page.getByRole('button', { name: '历史版本我的云短剧', exact: true }).click();
    await page.getByRole('button', { name: '下载历史版本1', exact: true }).click();
    await page.getByText('已下载并打开历史版本 1 的独立副本。', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.cloudFixture.lastRevision), 1);
    await page.screenshot({ path: fileURLToPath(new URL('../../../work/wanju-cloud-history-0.1.12.png', import.meta.url)), fullPage: true });
    await page.getByRole('button', { name: '移入回收站我的云短剧', exact: true }).click();
    await page.getByRole('dialog', { name: '确认移入回收站' }).getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.cloudFixture.trashed), false);
    await page.getByRole('button', { name: '移入回收站我的云短剧', exact: true }).click();
    await page.getByRole('dialog', { name: '确认移入回收站' }).getByRole('button', { name: '移入回收站', exact: true }).click();
    await page.getByRole('tab', { name: '回收站（1）', exact: true }).click();
    await page.getByRole('button', { name: '恢复我的云短剧', exact: true }).click();
    await page.getByText('云项目已恢复，历史版本仍可下载。', { exact: true }).waitFor();
    await page.getByRole('tab', { name: '我的云项目（1）', exact: true }).click();
    await page.getByRole('button', { name: '移入回收站我的云短剧', exact: true }).click();
    await page.getByRole('dialog', { name: '确认移入回收站' }).getByRole('button', { name: '移入回收站', exact: true }).click();
    await page.getByRole('tab', { name: '回收站（1）', exact: true }).click();
    await page.getByRole('button', { name: '永久删除我的云短剧', exact: true }).click();
    const permanent = page.getByRole('button', { name: '永久删除云项目', exact: true });
    assert.equal(await permanent.isDisabled(), true);
    await page.getByLabel('输入完整项目名称', { exact: true }).fill('我的云短剧');
    await permanent.click();
    await page.getByText('回收站为空。不会自动清空。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清理空间', exact: true }).click();
    await page.getByRole('dialog', { name: '确认清理空间' }).waitFor();
    await page.getByRole('button', { name: '确认清理', exact: true }).click();
    await page.getByText(/已清理 2 个文件/).waitFor();
    assert.equal(await page.evaluate(() => window.cloudFixture.cleaned), 1);
    await page.screenshot({ path: fileURLToPath(new URL('../../../work/wanju-unified-cloud-2026-10-29.png', import.meta.url)), fullPage: true });
    await page.evaluate(() => {
      window.cloudFixture.state.user.balance = 1000;
      Object.assign(window.cloudFixture.state.chat, {
        billingMode: 'wallet', displayName: 'Claude Opus 5.5 · 玩剧积分',
        inputPointsPerMillion: 364, outputPointsPerMillion: 1820,
        cachedInputPointsPerMillion: 18.2, cacheWritePointsPerMillion: 455, reservePoints: 23,
      });
      window.cloudFixture.change();
    });
    await page.getByText(/缓存读取 ¥0\.182 \/ 百万Token；缓存写入 ¥4\.55/).waitFor();
    await page.screenshot({ path: fileURLToPath(new URL('../../../work/wanju-opus-wallet-prices.png', import.meta.url)), fullPage: true });
    await page.goto(url);
    await page.getByRole('button', { name: '配置视频 · 参考素材创作', exact: true }).click();
    await page.getByText('火山方舟 · Seedance 2.0', { exact: true }).waitFor();
    assert.match(await page.locator('body').innerText(), /doubao-seedance-2-0-260128/);
    assert.doesNotMatch(await page.locator('body').innerText(), /老师本机服务|激活后可配置|老师高级配置/);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});

test('admin cloud prices operate only on the local test server and default disabled', { timeout: 90000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-cloud-admin-ui-'));
  const secret = 'local-only-cloud-admin-test-secret-1234';
  const { server, store } = createStudentService({ adminSecret: secret, cloudDirectory: directory });
  let browser;
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/admin`);
    await page.getByLabel('后台登录密码', { exact: true }).fill(secret);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await page.getByText('后台已连接', { exact: true }).waitFor();
    await page.getByRole('button', { name: '云项目与服务费', exact: true }).click();
    assert.equal(await page.getByLabel('启用成功生成服务费', { exact: true }).isChecked(), false);
    assert.equal(await page.getByLabel('每次成功图片服务费（元）', { exact: true }).inputValue(), '0.05');
    await page.getByLabel('每次成功视频服务费（元）', { exact: true }).fill('0.02');
    await page.getByRole('button', { name: '保存服务费设置', exact: true }).click();
    await page.getByText('服务费已关闭，不会扣款。', { exact: true }).waitFor();
    assert.deepEqual({ enabled: store.cloud.prices().enabled, videoPoints: store.cloud.prices().videoPoints }, { enabled: false, videoPoints: 2 });
    await page.getByRole('button', { name: '默认模型配置', exact: true }).click();
    await page.getByRole('button', { name: '添加供应商', exact: true }).click();
    const dialog = page.locator('#media-profile-dialog');
    await dialog.locator('#media-name').fill('账号默认图片');
    await dialog.locator('#media-url').fill('https://image-test.example/v1');
    await dialog.locator('#media-model').fill('image-test-model');
    await dialog.locator('[type="submit"]').click();
    await page.locator('[data-category="image"]').selectOption({ label: '账号默认图片' });
    await page.getByRole('button', { name: '保存默认配置', exact: true }).click();
    await page.getByText(/默认配置已保存/).waitFor();
    assert.equal(store.media.catalog().profiles.length, 1);
    await page.getByRole('button', { name: '创作助手', exact: true }).click();
    await page.locator('#chat-url').fill('https://supplier-test.example/v1');
    await page.locator('#chat-model').fill('gpt-6.1-sol');
    await page.locator('#chat-key').fill('local-test-key-not-a-real-supplier-key');
    await page.locator('#chat-format').selectOption('responses');
    await page.locator('#chat-billing').selectOption('included');
    await page.locator('#chat-daily-limit').fill('100');
    assert.equal(await page.locator('#chat-input-price').isDisabled(), true);
    await page.locator('#chat-vision').check();
    await page.locator('#chat-enabled').check();
    await page.locator('#chat-form').getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByText('内部默认助手设置已保存，不扣用户钱包。', { exact: true }).waitFor();
    assert.equal(store.adminChat().format, 'responses');
    assert.equal(store.adminChat().billingMode, 'included');
    assert.equal(store.adminChat().dailyRequestLimit, 100);
    assert.equal(await page.locator('#chat-key').inputValue(), '');
    await page.locator('#chat-billing').selectOption('wallet');
    await page.locator('#chat-model').fill('claude-opus-5-5');
    await page.locator('#chat-input-price').fill('364');
    await page.locator('#chat-output-price').fill('1820');
    await page.locator('#chat-cache-read-price').fill('18.2');
    await page.locator('#chat-cache-write-price').fill('455');
    await page.locator('#chat-reserve').fill('23');
    await page.locator('#chat-form').getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByText('设置已保存。登录用户可直接使用并按实际用量扣点。', { exact: true }).waitFor();
    assert.equal(store.adminChat().model, 'claude-opus-5-5');
    assert.equal(store.adminChat().cachedInputPointsPerMillion, 18.2);
    assert.equal(store.adminChat().cacheWritePointsPerMillion, 455);
    await page.locator('#chat-tier').selectOption('claude');
    assert.equal(await page.locator('#chat-key').inputValue(), '');
    assert.equal(await page.locator('#chat-enabled').isChecked(), false);
    await page.locator('#chat-use-prices').click();
    assert.equal(await page.locator('#chat-input-price').inputValue(), '364');
    assert.equal(await page.locator('#chat-reserve').inputValue(), '23');
    await page.locator('#chat-url').fill('https://enhanced-supplier-test.example/v1');
    await page.locator('#chat-key').fill('isolated-enhanced-supplier-test-key');
    await page.locator('#chat-vision').check();
    await page.locator('#chat-enabled').check();
    await page.locator('#chat-form').getByRole('button', { name: '保存设置', exact: true }).click();
    await page.getByText('设置已保存。登录用户可直接使用并按实际用量扣点。', { exact: true }).waitFor();
    assert.equal(store.adminChat().tiers.claude.enabled, true);
    assert.equal(store.chat(undefined, 'claude').key, 'isolated-enhanced-supplier-test-key');
    assert.equal(store.chat(undefined, 'base').key, 'local-test-key-not-a-real-supplier-key');
    assert.equal(store.adminChat().defaultTier, 'base');
    await page.screenshot({ path: fileURLToPath(new URL('../../../work/wanju-default-assistant-admin.png', import.meta.url)), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: fileURLToPath(new URL('../../../work/wanju-default-assistant-admin-mobile.png', import.meta.url)), fullPage: true });
    await page.setViewportSize({ width: 1200, height: 850 });
    await page.goto(`http://127.0.0.1:${server.address().port}/register`);
    await page.getByRole('button', { name: '注册并登录', exact: true }).waitFor();
    assert.equal(await page.locator('#activation-code').isVisible(), false);
    await page.locator('#username').fill('browser-creator');
    await page.locator('#password').fill('browser-test-password');
    await page.locator('#confirm-password').fill('browser-test-password');
    await page.getByRole('button', { name: '注册并登录', exact: true }).click();
    await page.getByText('账号已登录', { exact: true }).waitFor();
    assert.equal(store.overview().totals.users, 1);
    const recharge = store.createCodes({ kind: 'recharge', count: 1, points: 100 })[0].code;
    await page.locator('#recharge-code').fill(recharge);
    await page.getByRole('button', { name: '充值', exact: true }).click();
    await page.getByText('充值已到账。', { exact: true }).waitFor();
    assert.equal(store.overview().users[0].balance, 100);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise((done) => server.close(done)); store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
