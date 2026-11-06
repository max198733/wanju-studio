import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(new URL('../apps/desktop/package.json', import.meta.url))('playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const { desktop: release } = JSON.parse(await readFile(
  join(root, '.local/public-release/release-manifest.json'), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let checks = 0;
try {
  for (const [name, width, height] of [['desktop', 1440, 950], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const route of ['/', '/register', '/student-guide', '/teacher-guide', '/admin']) {
      const response = await page.goto(`https://wanju.kukukaka.cn${route}`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      if (route === '/') {
        await page.getByText(`v${release.version}`, { exact: true }).waitFor();
        assert.equal(await page.locator('#desktop-download').getAttribute('href'), release.href);
      } else if (route === '/register') {
        await page.getByRole('button', { name: '注册并登录', exact: true }).waitFor();
        assert.equal(await page.locator('#activation-code').isVisible(), false);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} ${name} must not overflow`);
      assert.deepEqual(errors, []);
      checks++;
    }
    await page.goto('https://wanju.kukukaka.cn/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(root, '.local/public-release', `live-${name}.png`), fullPage: true });
    await page.close();
  }
  console.log(JSON.stringify({ livePages: checks, javascriptErrors: 0, responsiveOverflow: 0 }));
} finally { await browser.close(); }
