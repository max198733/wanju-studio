import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import shellConfig from '../shell/vite.config.ts';

test('native production-assets panel displays missing media and restores only saved image associations', { timeout: 90_000 }, async () => {
  const server = await createServer({
    ...shellConfig, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [...shellConfig.plugins, { name: 'wanju-assets-fixture', configureServer(app) {
      app.middlewares.use('/wanju-production-assets-ui', (_req, res, next) => {
        res.setHeader('content-type', 'text/html');
        void app.transformIndexHtml('/wanju-production-assets-ui', '<!doctype html><html><body><div id="root"></div><script type="module" src="/bench/wanju-production-assets.tsx"></script></body></html>')
          .then((html) => res.end(html), next);
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    const errors = [], requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let recovered = false;
    let expanded = false;
    let enabledLegacy = false;
    let imageRecovered = false;
    let delayOld = false, oldRequestStarted = false, releaseOld;
    const heldOld = new Promise((resolve) => { releaseOld = resolve; });
    const path = 'assets/saved.png';
    const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKQAAAAASUVORK5CYII=';
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({ path: url.pathname, method: request.method() });
      if (url.pathname === '/api/wanju/projects/asset-fixture/generations/recover-image/query') {
        assert.equal(request.method(), 'POST');
        imageRecovered = true;
        return route.fulfill({ json: { task: { id: 'recover-image', status: 'done', recoveryAvailable: false } } });
      }
      if (url.pathname === '/api/wanju/projects/legacy-project/workflow') {
        assert.equal(request.method(), 'POST');
        assert.deepEqual(request.postDataJSON(), { base: 'current-board-rev', assetBase: null });
        enabledLegacy = true;
        return route.fulfill({ json: { workflow: { enabled: true } } });
      }
      if (url.pathname.endsWith('/assets/recover')) {
        assert.equal(request.method(), 'POST');
        assert.equal(request.postDataJSON().base, 'current-board-rev');
        recovered = true;
        return route.fulfill({ json: { recovered: [{ shot: 'S001', path }] } });
      }
      const other = url.pathname === '/api/wanju/projects/other-project/assets';
      const legacy = url.pathname === '/api/wanju/projects/legacy-project/assets';
      if (!other && !legacy) assert.equal(url.pathname, '/api/wanju/projects/asset-fixture/assets');
      if (!other && !legacy && delayOld) { oldRequestStarted = true; await heldOld; }
      return route.fulfill({ json: {
        project: { id: legacy ? 'legacy-project' : other ? 'other-project' : 'asset-fixture', name: legacy ? '旧广告工程' : other ? '另一个故事' : '资产验收项目' },
        rev: 'current-board-rev', folder: `http://127.0.0.1:${server.httpServer.address().port}/media`,
        tasks: [{ id: 'timed-image', shot: 'S001', provider: 'image', status: 'done', timing: { providerMs: 20000, downloadMs: 140000, totalMs: 160000 } },
          ...(!imageRecovered && !other && !legacy ? [{ id: 'recover-image', shot: 'S002', provider: 'image', status: 'download-failed', recoveryAvailable: true }] : [])],
        workflow: {
          enabled: !legacy || enabledLegacy, revision: null, catalogPresent: legacy && enabledLegacy, referencesReady: false, storyboardApproved: false, readyForVideo: false,
          assets: expanded && !other && !legacy ? Array.from({ length: 18 }, (_, i) => ({
            id: `C${i + 1}`, kind: 'character', name: `测试人物 ${i + 1}`, path: '', exists: false, approved: false,
          })) : [], bindings: [], issues: ['人物资产尚未生成'], recoverable: legacy || recovered ? [] : [{ shot: 'S001', path }],
          counts: { characters: 0, scenes: 0, props: 0, storyboardImages: recovered ? 1 : 0, videos: 0 },
          shotImages: expanded && !other && !legacy
            ? Array.from({ length: 36 }, (_, i) => ({ shot: `S${String(i + 1).padStart(3, '0')}`, path: i === 0 ? path : '', exists: i === 0 }))
            : [{ shot: 'S001', path: recovered ? path : '', exists: recovered }],
        },
      } });
    });
    await page.route('**/media/**', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from(image, 'base64') }));
    await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = 'dark'; }); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/wanju-production-assets-ui`);
    await page.getByRole('button', { name: '制作资产', exact: true }).click();
    await page.getByText('资产验收项目', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')), 'no-drag');
    await page.getByText(/图片接口 20 秒.*下载 2 分 20 秒/).waitFor();
    await page.getByText('人物资产尚未生成', { exact: true }).waitFor();
    await page.getByRole('button', { name: '恢复分镜图关联（不计费）', exact: true }).click();
    const picture = page.getByRole('img', { name: 'S001', exact: true });
    await picture.waitFor();
    await page.waitForFunction(() => document.querySelector('img')?.naturalWidth > 0);
    assert.equal(await page.getByRole('button', { name: '恢复分镜图关联（不计费）', exact: true }).count(), 0);
    await page.getByRole('button', { name: '恢复原图片（不重新生成）', exact: true }).click();
    await page.getByRole('button', { name: '恢复原图片（不重新生成）', exact: true }).waitFor({ state: 'detached' });
    assert.equal(imageRecovered, true);
    expanded = true;
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByText('S036', { exact: true }).waitFor();
    const mobile = { width: 390, height: 844 };
    for (const viewport of [{ width: 1200, height: 850 }, { width: 1536, height: 664 }, mobile]) {
      await page.setViewportSize(viewport);
      const box = await page.getByRole('dialog').boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width + 1);
      assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1);
      const overflow = await page.getByRole('dialog').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false);
      const content = page.getByRole('region', { name: '制作资产内容', exact: true });
      await content.evaluate((el) => { el.scrollTop = 0; });
      assert.equal(await content.evaluate((el) => el.scrollHeight > el.clientHeight), true);
      const bounds = await content.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => document.querySelector('[aria-label="制作资产内容"]')?.scrollTop > 0);
      await content.focus();
      await page.keyboard.press('End');
      await page.waitForFunction(() => {
        const el = document.querySelector('[aria-label="制作资产内容"]');
        return el && el.scrollHeight - el.clientHeight - el.scrollTop < 2;
      });
      const last = await page.getByText('S036', { exact: true }).boundingBox();
      assert.ok(last && last.y >= bounds.y && last.y + last.height <= bounds.y + bounds.height + 1);
      const close = await page.getByRole('button', { name: '关闭制作资产', exact: true }).boundingBox();
      assert.ok(close && close.y >= box.y && close.y + close.height <= bounds.y);
      await content.evaluate((el) => { el.scrollTop = 0; });
      const thumb = await content.evaluate((el) => Math.max(18, el.clientHeight * el.clientHeight / el.scrollHeight));
      await page.mouse.move(bounds.x + bounds.width - 4, bounds.y + thumb / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width - 4, bounds.y + bounds.height - 12, { steps: 6 });
      await page.mouse.up();
      await page.waitForFunction(() => document.querySelector('[aria-label="制作资产内容"]')?.scrollTop > 0);
    }
    await page.getByRole('region', { name: '制作资产内容', exact: true }).evaluate((el) => { el.scrollTop = 0; });
    if (process.env.WANJU_ASSETS_PREVIEW) {
      await page.setViewportSize({ width: 1200, height: 850 });
      await page.screenshot({ path: process.env.WANJU_ASSETS_PREVIEW, fullPage: true });
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: '制作资产', exact: true }).click();
    await page.getByText('资产验收项目', { exact: true }).waitFor();
    delayOld = true;
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    const deadline = Date.now() + 3000;
    while (!oldRequestStarted && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(oldRequestStarted, true);
    // Switch tabs with an old response still in flight; that response must not populate the new project's dialog.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '切换测试项目', exact: true }).click();
    await page.getByRole('button', { name: '制作资产', exact: true }).click();
    await page.getByText('另一个故事', { exact: true }).waitFor();
    releaseOld();
    await page.waitForTimeout(100);
    assert.equal(await page.getByText('资产验收项目', { exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '打开旧工程', exact: true }).click();
    await page.getByRole('button', { name: '制作资产', exact: true }).click();
    await page.getByText('旧广告工程', { exact: true }).waitFor();
    await page.getByRole('button', { name: '启用何导流程', exact: true }).click();
    await page.getByText('资产：待规划', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '启用何导流程', exact: true }).count(), 0);
    assert.equal(enabledLegacy, true);
    await page.keyboard.press('Escape');
    assert.deepEqual(requests.filter((r) => r.method === 'POST').map((r) => r.path), [
      '/api/wanju/projects/asset-fixture/assets/recover',
      '/api/wanju/projects/asset-fixture/generations/recover-image/query',
      '/api/wanju/projects/legacy-project/workflow',
    ]);
    assert.equal(requests.some((r) => r.method === 'POST' && r.path.endsWith('/generations')), false);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
