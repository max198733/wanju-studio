import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { usableSkills } from '../../src/skills.mjs';
import { startStudio } from '../server/server.mjs';

test('the style catalog installs one style without adding the whole library to a session', { timeout: 90000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-styles-ui-'));
  const savedEnv = Object.fromEntries([
    'OPENFILM_HOME', 'OPENFILM_SHARED_HOME', 'OPENFILM_LIBRARY', 'OPENFILM_SKILLS', 'WANJU_CONFIG_DIR',
  ].map((key) => [key, process.env[key]]));
  process.env.OPENFILM_HOME = join(root, 'home');
  process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
  process.env.OPENFILM_LIBRARY = join(root, 'projects');
  process.env.OPENFILM_SKILLS = join(root, 'skills');
  process.env.WANJU_CONFIG_DIR = join(root, 'empty-config');
  let studio, browser;
  t.after(async () => {
    await browser?.close();
    await studio?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  await mkdir(process.env.WANJU_CONFIG_DIR, { recursive: true });
  studio = await startStudio({ port: 0, openBrowser: () => {} });
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const response = await fetch(`${studio.origin}/api/wanju/projects`, {
    method: 'POST',
    headers: { 'x-studio-key': studio.key, 'content-type': 'application/json' },
    body: JSON.stringify({ name: '风格库隔离验收', workflow: 'hedao' }),
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  const stylesForSession = () => usableSkills({ home: process.env.OPENFILM_HOME })
    .filter((skill) => skill.name.startsWith('code-animation-')).map((skill) => skill.name);
  assert.deepEqual(stylesForSession(), []);

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  page.setDefaultTimeout(10000);
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.addInitScript(() => {
    window.openfilmHost = {
      version: 1,
      onCommand(listener) { window.styleLibraryCommand = listener; },
    };
  });
  await page.goto(`${studio.origin}/open?key=${studio.key}&to=${encodeURIComponent(`/projects/${created.project.id}`)}`);
  await page.waitForFunction(() => typeof window.styleLibraryCommand === 'function');
  await page.evaluate(() => window.styleLibraryCommand({ type: 'show-examples' }));
  const dialog = page.getByRole('dialog', { name: '社区' });
  await dialog.getByRole('tab', { name: '发现', exact: true }).click();
  await dialog.getByRole('tab', { name: '风格', exact: true }).click();
  const search = dialog.getByPlaceholder('搜索 skill');
  await search.fill('code-animation-');
  await dialog.getByRole('button', { name: /^O98 一战再战/ }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: '安装', exact: true }).count(), 341);

  await search.fill('code-animation-a1');
  const title = dialog.getByRole('button', { name: /^A1 字雨/ });
  await title.waitFor();
  const card = title.locator('../..');
  const image = card.locator('img');
  await image.scrollIntoViewIfNeeded();
  await image.waitFor();
  await image.evaluate((element) => element.decode());
  const installed = page.waitForResponse((result) => result.url().endsWith('/skills/code-animation-a1/installed')
    && result.request().method() === 'PUT');
  await card.getByRole('button', { name: '安装', exact: true }).click();
  assert.equal((await installed).status(), 200);
  await dialog.getByRole('tab', { name: /^已安装/ }).click();
  await dialog.getByText('A1 字雨', { exact: true }).waitFor();
  assert.deepEqual(stylesForSession(), ['code-animation-a1']);
  assert.deepEqual(failures, []);
});
