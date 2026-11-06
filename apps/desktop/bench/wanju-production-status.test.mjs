import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import shellConfig from '../shell/vite.config.ts';

test('production status routes setup, preserves uncertainty and isolates project reads without submitting work', { timeout: 90000 }, async () => {
  const server = await createServer({
    ...shellConfig, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [...shellConfig.plugins, { name: 'production-status-fixture', configureServer(app) {
      app.middlewares.use('/production-status-test', (_req, res, next) => {
        res.setHeader('content-type', 'text/html');
        void app.transformIndexHtml('/production-status-test', '<!doctype html><html data-wanju="1"><body><div id="root"></div><script type="module" src="/bench/wanju-production-status.tsx"></script></body></html>')
          .then((html) => res.end(html), next);
      });
    } }],
  });
  let browser, releaseOld, releaseMedia;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.openfilmNative = { productName: '玩剧', wanju: { mediaProfiles: {
        onChange: (listener) => { window.productionStatusChanged = listener; return () => { window.productionStatusChanged = null; }; },
      } } };
      window.openfilmDesktop = { openSettings: (section) => { document.body.dataset.settings = section; } };
    });
    let enabled = false, failed = false, holdOld = false, oldStarted = false;
    let mediaFailed = false, configured = false, holdMedia = false, mediaStarted = false;
    const held = new Promise((resolve) => { releaseOld = resolve; });
    const heldMedia = new Promise((resolve) => { releaseMedia = resolve; });
    await page.route('**/api/wanju/**', async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      requests.push({ path, method: request.method() });
      if (failed) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      if (path.endsWith('/status')) {
        if (mediaFailed) return route.fulfill({ status: 503, json: {} });
        const activeMedia = configured ? { image: { configured: true }, video: { configured: true } } : { image: null, video: null };
        if (holdMedia) { mediaStarted = true; await heldMedia; }
        return route.fulfill({ json: { activeMedia } }).catch(() => {});
      }
      if (holdOld && path.includes('fixture-one')) { oldStarted = true; await held; }
      const other = path.includes('fixture-two');
      await route.fulfill({ json: {
        state: { script: 'A short film', shots: [{ id: 'S1' }, { id: 'S2' }] },
        workflow: { enabled: !other && enabled, referencesReady: false, issues: ['人物参考待确认'] },
        tasks: other ? [] : [{ id: 'uncertain', status: 'unknown' }, { id: 'recover', status: 'download-failed', recoveryAvailable: true }],
      } }).catch(() => {});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/production-status-test`);
    const panel = page.getByRole('region', { name: '制作状态', exact: true });
    await panel.getByText('原生剪辑', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '配置创作助手', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-settings'), 'agents');
    await panel.getByRole('button', { name: '玩剧账号', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-settings'), 'account');
    await page.getByRole('button', { name: '切换测试自有模型', exact: true }).click();
    await panel.getByText('自有密钥 · 供应商计费', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '使用玩剧积分助手', exact: true }).click();
    await panel.getByText('登录后即可使用玩剧积分助手', { exact: true }).waitFor();
    assert.equal(await page.locator('body').getAttribute('data-settings'), 'account');
    assert.equal(await panel.getByRole('button', { name: '配置图片与视频', exact: true }).count(), 0);
    const modes = page.getByRole('group', { name: '制作模式', exact: true });
    await modes.getByRole('button', { name: 'AI 剧情', exact: true }).click();
    await panel.getByText('剧情准备', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '配置图片与视频', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-settings'), 'providers');
    await panel.getByText('结果待核实 1', { exact: true }).waitFor();
    await panel.getByText('可恢复记录 1', { exact: true }).waitFor();
    await panel.getByText('费用待核对', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '查看制作详情', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-details'), 'open');
    holdMedia = true;
    await panel.getByRole('button', { name: '刷新制作状态', exact: true }).click();
    for (let i = 0; i < 50 && !mediaStarted; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(mediaStarted, true);
    configured = true;
    await page.evaluate(() => window.productionStatusChanged());
    holdMedia = false;
    releaseMedia();
    await page.waitForFunction(() => !document.querySelector('[aria-label="配置图片与视频"]'), null, { timeout: 5000 });
    mediaFailed = true;
    await panel.getByRole('button', { name: '刷新制作状态', exact: true }).click();
    await panel.getByText('媒体配置状态暂不可用', { exact: true }).waitFor();
    await panel.getByText('剧情准备', { exact: true }).waitFor();
    mediaFailed = false;
    enabled = true;
    await panel.getByRole('button', { name: '刷新制作状态', exact: true }).click();
    await panel.getByText('人物与场景', { exact: true }).waitFor();
    await modes.getByRole('button', { name: '快速创作', exact: true }).click();
    await panel.getByText('人物与场景', { exact: true }).waitFor();
    failed = true;
    await panel.getByRole('button', { name: '刷新制作状态', exact: true }).click();
    await panel.getByText('制作状态暂不可用', { exact: true }).waitFor();
    assert.equal(await panel.getByText('人物与场景', { exact: true }).count(), 0);
    failed = false;
    await panel.getByRole('button', { name: '刷新制作状态', exact: true }).click();
    await panel.getByText('人物与场景', { exact: true }).waitFor();
    holdOld = true;
    await panel.getByRole('button', { name: '刷新制作状态', exact: true }).click();
    await page.waitForFunction(() => true);
    for (let i = 0; i < 50 && !oldStarted; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(oldStarted, true);
    await page.getByRole('button', { name: '切换测试项目', exact: true }).click();
    await panel.getByText('原生剪辑', { exact: true }).waitFor();
    releaseOld();
    await page.waitForTimeout(200);
    assert.equal(await panel.getByText('人物与场景', { exact: true }).count(), 0);
    assert.equal(await panel.getByText('结果待核实 1', { exact: true }).count(), 0);
    await mkdir(fileURLToPath(new URL('../../../work/verification/', import.meta.url)), { recursive: true });
    for (const width of [1100, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: fileURLToPath(new URL(`../../../work/verification/wanju-production-status-${width}.png`, import.meta.url)) });
    }
    assert.equal(requests.every((request) => request.method === 'GET'), true);
    assert.equal(requests.every((request) => request.path.endsWith('/assets') || request.path.endsWith('/status')), true);
    assert.deepEqual(errors, []);
  } finally {
    releaseMedia?.();
    releaseOld?.();
    await browser?.close();
    await server.close();
  }
});
