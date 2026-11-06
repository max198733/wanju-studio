import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudentService } from '../apps/wanju-service/server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.WANJU_DOWNLOAD_OUTPUT || join(root, 'work', 'downloads');
const proof = process.env.WANJU_DOWNLOAD_PROOF || output;
const publicDir = join(root, 'apps/wanju-service/public');
const installers = join(dirname(root), '安装包');
const require = createRequire(join(root, 'apps/desktop/package.json'));
const { chromium } = require('playwright-core');
mkdirSync(output, { recursive: true });
mkdirSync(proof, { recursive: true });
const sha256 = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
const roles = {
  student: { version: '0.1.1', source: join(installers, '学员内测-0.1.1', 'Wanju-Setup-0.1.1-x64.exe'), name: 'Wanju-Student-Setup-0.1.1-x64.exe', resources: join(installers, '学员内测-0.1.1', 'win-unpacked/resources/wanju') },
  teacher: { version: '0.1.0', source: join(installers, 'Wanju-Setup-0.1.0-x64.exe'), name: 'Wanju-Creator-Setup-0.1.0-x64.exe', resources: join(installers, 'win-unpacked/resources/wanju') },
};
const manifest = { released: '2026-10-27', channel: 'internal-preview', unsigned: true, serviceUrl: 'https://wanju.kukukaka.cn', aiServiceEnabled: false };
const inspect = (directory) => {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true });
  const privateNames = files.filter((entry) => /^(?:\.local|\.env(?:\..*)?|config\.zip|authorized_keys|student-cloud-admin\.key|wallet\.sqlite(?:-.*)?)$|\.(?:key|pem|sqlite|zip)$/i.test(entry.name));
  assert.equal(privateNames.length, 0, 'A release resource contains a private filename.');
  return files.filter((entry) => entry.isFile()).length;
};
for (const [role, release] of Object.entries(roles)) {
  const checkedResourceFiles = inspect(release.resources);
  manifest[role] = {
    version: release.version, name: release.name, href: `/releases/${release.name}`,
    bytes: statSync(release.source).size, sha256: await sha256(release.source),
    released: manifest.released, checkedResourceFiles,
  };
}
const config = JSON.parse(readFileSync(join(roles.student.resources, 'student-service.public.json'), 'utf8'));
assert.equal(config.serviceUrl, manifest.serviceUrl);
assert.equal(config.studentEdition, true);
copyFileSync(join(root, 'apps/desktop/build/wanju.png'), join(publicDir, 'wanju.png'));
writeFileSync(join(publicDir, 'downloads.json'), JSON.stringify(manifest, null, 2));

const { server, store } = createStudentService({ adminSecret: 'download-preview-only-not-a-production-key' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [role, title] of [['student', 'Wanju-Student-Guide'], ['teacher', 'Wanju-Teacher-Guide']]) {
    await page.goto(`${origin}/${role}-guide`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const name = `${title}.pdf`;
    const file = join(output, name);
    await page.pdf({ path: file, format: 'A4', printBackground: true, margin: { top: '16mm', right: '15mm', bottom: '16mm', left: '15mm' } });
    manifest[`${role}Guide`] = { name, href: `/releases/${name}`, bytes: statSync(file).size, sha256: await sha256(file) };
    if (proof !== output) copyFileSync(file, join(proof, name));
  }
  writeFileSync(join(publicDir, 'downloads.json'), JSON.stringify(manifest, null, 2));
  await page.goto(`${origin}/download`, { waitUntil: 'networkidle' });
  assert.match(await page.locator('#student-sha').textContent(), /^[a-f0-9]{64}$/);
  for (const [width, height, name] of [[1440, 1000, 'desktop'], [390, 844, 'mobile'], [320, 740, 'small-mobile']]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows`);
    assert.equal(await page.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
    await page.screenshot({ path: join(proof, `wanju-download-${name}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
  const files = Object.values(manifest).filter((item) => item && typeof item === 'object' && item.sha256);
  writeFileSync(join(output, 'SHA256SUMS.txt'), files.map((item) => `${item.sha256}  ${item.name}`).join('\n') + '\n');
  writeFileSync(join(proof, 'wanju-download-release.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ prepared: true, output, manifest, browserErrors: errors, paidProviderCalls: 0 }));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  store.close();
}
