import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import shellConfig from '../shell/vite.config.ts';

test('production selector changes starters and fits wide and narrow views', { timeout: 60000 }, async () => {
  const server = await createServer({
    ...shellConfig, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [...shellConfig.plugins, { name: 'production-mode-test', configureServer(app) {
      app.middlewares.use('/production-mode-test', (_req, res, next) => {
        res.setHeader('content-type', 'text/html');
        void app.transformIndexHtml('/production-mode-test', '<!doctype html><html data-wanju="1"><body><div id="root"></div><script type="module" src="/bench/wanju-production-modes.tsx"></script></body></html>')
          .then((html) => res.end(html), next);
      });
    } }],
  });
  let browser;
  let phase = 'start test server';
  try {
    await server.listen();
    phase = 'launch browser';
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    phase = 'open page';
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.openfilmNative = { productName: '玩剧' };
      localStorage.setItem('openfilm.language', 'zh-CN');
    });
    phase = 'load production mode fixture';
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/production-mode-test`, { timeout: 30000, waitUntil: 'domcontentloaded' });
    phase = 'mount production selector';
    await page.waitForFunction(() => document.querySelector('[role="group"]') || document.querySelector('vite-error-overlay'), null, { timeout: 15000 });
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('vite-error-overlay').count(), 0,
      (await page.locator('vite-error-overlay').allTextContents()).join('\n'));
    const selector = page.getByRole('group', { name: '制作模式', exact: true });
    phase = 'switch production starters';
    for (const [mode, starter] of [
      ['快速创作', '用 OpenFilm 原生流程做一支 15 秒的产品介绍，先做可预览版本'],
      ['AI 剧情', '做一集 30 秒的竖屏悬疑短剧，先给我剧本和分镜'],
      ['混合制作', '用已有素材和代码动画制作广告，先不要调用付费生成'],
    ]) {
      await selector.getByRole('button', { name: mode, exact: true }).click();
      assert.equal(await selector.getByRole('button', { name: mode, exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: starter, exact: true }).waitFor();
    }
    await mkdir(fileURLToPath(new URL('../../../work/', import.meta.url)), { recursive: true });
    for (const width of [1100, 390, 320]) {
      phase = `check viewport ${width}`;
      await page.setViewportSize({ width, height: 900 });
      for (const label of ['自动', '快速创作', 'AI 剧情', '混合制作']) {
        const button = selector.getByRole('button', { name: label, exact: true });
        await button.click();
        assert.equal(await button.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight), true);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: fileURLToPath(new URL(`../../../work/wanju-production-mode-${width}.png`, import.meta.url)) });
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    throw new Error(`Production-mode browser check failed during: ${phase}`, { cause: error });
  } finally {
    await browser?.close();
    await server.close();
  }
});
