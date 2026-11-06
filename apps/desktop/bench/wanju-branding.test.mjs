import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import shellConfig from '../shell/vite.config.ts';

test('Wanju browser branding covers native settings, skills, chat notices and startup errors', { timeout: 90_000 }, async () => {
  const server = await createServer({
    ...shellConfig, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [...shellConfig.plugins, { name: 'wanju-branding-fixture', configureServer(app) {
      app.middlewares.use('/wanju-branding-ui', (_req, res, next) => {
        res.setHeader('content-type', 'text/html');
        void app.transformIndexHtml('/wanju-branding-ui', '<!doctype html><html data-wanju="1"><body><div id="root"></div><script type="module" src="/bench/wanju-branding.tsx"></script></body></html>')
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
    await page.route('**/api/**', (route) => {
      const request = route.request();
      requests.push({ path: new URL(request.url()).pathname, method: request.method() });
      const path = new URL(request.url()).pathname;
      return route.fulfill({ json: path.endsWith('/skills') ? [] : path.endsWith('/version') ? { version: '0.2.6', source: true } : {} });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/wanju-branding-ui`);
    await page.getByRole('img', { name: '玩剧', exact: true }).waitFor();
    await page.getByText(/上次任务因玩剧关闭而中断/).waitFor();
    assert.match(await page.locator('pre').first().innerText(), /玩剧 doctor\n玩剧 desktop app/);
    assert.doesNotMatch(await page.locator('pre').first().innerText(), /OpenFilm/);
    await page.getByRole('button', { name: '打开设置', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByText('玩剧', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('link', { name: '玩剧官网' }).getAttribute('href'), 'https://wanju.kukukaka.cn/');
    await dialog.getByRole('button', { name: '图片与视频', exact: true }).click();
    await dialog.getByText('请在玩剧桌面版配置服务', { exact: true }).waitFor();
    assert.equal(await dialog.getByText('OpenAI', { exact: true }).count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /OpenFilm/);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '打开技能', exact: true }).click();
    await page.getByText('发现', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /OpenFilm/);
    const failed = await readFile(new URL('../src/failed.html', import.meta.url), 'utf8');
    await page.route('**/failed.html*', (route) => route.fulfill({ contentType: 'text/html', body: failed }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/failed.html?product=wanju&message=test-only`);
    await page.getByRole('heading', { name: '玩剧未能启动剪辑器' }).waitFor();
    assert.equal(await page.title(), '玩剧');
    assert.doesNotMatch(await page.locator('body').innerText(), /OpenFilm/);
    assert.equal(requests.some((r) => r.method !== 'GET'), false, 'Display tests must not change settings or submit generation.');
    assert.deepEqual(errors, []);
    for (const path of ['../../../LICENSE', '../../../packages/openfilm/LICENSE']) {
      const license = await readFile(new URL(path, import.meta.url), 'utf8');
      assert.match(license, /Copyright \(c\) 2026 OpenFilm contributors/);
      assert.match(license, /permission notice shall be included/);
    }
  } finally { await browser?.close(); await server.close(); }
});
