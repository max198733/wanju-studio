import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { repository } from './wanju-resources.mjs';

export async function makeWanjuIcons() {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { Clapperboard } = require('lucide-react');
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const dir = join(repository, 'apps/desktop/build');
  mkdirSync(dir, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
    const icon = renderToStaticMarkup(React.createElement(Clapperboard, { size: 154, color: '#ffffff', strokeWidth: 1.7 }));
    await page.setContent(`<html><body style="margin:0;width:256px;height:256px;display:grid;place-items:center;background:#007f7a">${icon}</body></html>`);
    const png = await page.screenshot({ path: join(dir, 'wanju.png') });
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    writeFileSync(join(dir, 'wanju.ico'), Buffer.concat([header, png]));
  } finally { await browser.close(); }
}
