import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { createStudentService } from '../apps/wanju-service/server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  version: { type: 'string' }, released: { type: 'string' },
  installer: { type: 'string' }, output: { type: 'string' },
} });
const { version, released, installer, output } = values;
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version || '')
  || !/^\d{4}-\d{2}-\d{2}$/.test(released || '') || !installer || !output) {
  throw new Error('Provide --version, --released (YYYY-MM-DD), --installer and --output.');
}
await mkdir(output, { recursive: true });
const name = `Wanju-Setup-${version}-x64.exe`;
const describe = async (path, name) => {
  const bytes = await readFile(path);
  return { name, href: `/releases/${name}`, bytes: (await stat(path)).size,
    sha256: createHash('sha256').update(bytes).digest('hex') };
};
const { chromium } = createRequire(new URL('../apps/desktop/package.json', import.meta.url))('playwright-core');
const service = createStudentService({ adminSecret: 'release-guide-fixture-secret-only' });
service.server.listen(0, '127.0.0.1');
await once(service.server, 'listening');
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  for (const [route, name] of [['student-guide', 'Wanju-Student-Guide.pdf'], ['teacher-guide', 'Wanju-Teacher-Guide.pdf']]) {
    const page = await browser.newPage();
    await page.goto(`${origin}/${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: join(output, name), format: 'A4', printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' } });
    await page.close();
  }
  const manifest = {
    released, channel: version.includes('-') ? 'preview' : 'stable', unsigned: true, serviceUrl: 'https://wanju.kukukaka.cn',
    desktop: { version, released, ...(await describe(installer, name)) },
    studentGuide: await describe(join(output, 'Wanju-Student-Guide.pdf'), 'Wanju-Student-Guide.pdf'),
    teacherGuide: await describe(join(output, 'Wanju-Teacher-Guide.pdf'), 'Wanju-Teacher-Guide.pdf'),
  };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(root, 'apps/wanju-service/public/downloads.json'), json);
  await writeFile(join(output, 'release-manifest.json'), json);
  await writeFile(join(output, 'SHA256SUMS.txt'), [manifest.desktop, manifest.studentGuide, manifest.teacherGuide]
    .map((entry) => `${entry.sha256}  ${entry.name}`).join('\n') + '\n');
  for (const [label, width, height] of [['desktop', 1440, 950], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByText(`v${version}`, { exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${label}: horizontal overflow`);
    if (errors.length) throw new Error('Website has a browser error.');
    await page.screenshot({ path: join(output, `download-${label}.png`), fullPage: true });
    await page.close();
  }
  console.log(JSON.stringify({ version, output, bytes: manifest.desktop.bytes, sha256: manifest.desktop.sha256, pdfs: 2, browserChecks: 2 }));
} finally {
  await browser?.close(); service.server.closeAllConnections();
  await new Promise((done) => service.server.close(done)); service.store.close();
}
