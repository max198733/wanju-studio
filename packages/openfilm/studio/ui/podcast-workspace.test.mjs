import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { startStudio } from '../server/server.mjs';
import { readProjectFilm, writeProjectFilm } from '../server/film.mjs';
import { writePodcastSource } from '../server/podcast-source.mjs';

test('podcast review selects displayed cuts, applies a real edit and restores it through undo', { timeout: 90000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-podcast-ui-'));
  const keys = ['OPENFILM_HOME', 'OPENFILM_SHARED_HOME', 'OPENFILM_LIBRARY', 'WANJU_CONFIG_DIR'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.OPENFILM_HOME = join(root, 'home');
  process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
  process.env.OPENFILM_LIBRARY = join(root, 'projects');
  process.env.WANJU_CONFIG_DIR = join(root, 'config');
  await mkdir(process.env.WANJU_CONFIG_DIR, { recursive: true });
  let studio, browser;
  t.after(async () => {
    await browser?.close();
    await studio?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  studio = await startStudio({ port: 0, openBrowser: () => {} });
  const created = await fetch(`${studio.origin}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-key': studio.key },
    body: JSON.stringify({ name: '口播复核浏览器测试' }),
  }).then((response) => response.json());
  const project = created.project;
  await writeProjectFilm(project.path, {
    stage: { w: 1920, h: 1080 },
    tracks: [{ clips: [{ id: 'voice', src: 'assets/voice.wav', time: [0, 10] }] }],
  });
  const current = await readProjectFilm(project.path);
  const cuts = Array.from({ length: 405 }, (_, index) => ({
    startSec: index / 50, endSec: index / 50 + 0.01, reason: 'filler', reasons: ['filler'], text: '嗯',
  }));
  browser = await chromium.launch({
    headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failures = [];
  const plans = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/podcast-cut', async (route) => {
    const body = route.request().postDataJSON();
    if (body.includeOps) plans.push(body);
    await route.fulfill({ json: {
      cuts, rev: current.rev, reviewId: 'reviewed-word-times', durationSec: 10, clipId: 'voice',
      ...(body.includeOps ? { ops: [], removedSec: 0 } : {}),
    } });
  });
  await page.goto(`${studio.origin}/open?key=${studio.key}&to=${encodeURIComponent(`/projects/${project.id}`)}`);
  await page.getByRole('button', { name: '口播粗剪', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '口播粗剪', exact: true });
  await dialog.getByRole('button', { name: '分析录音', exact: true }).click();
  await dialog.getByRole('button', { name: '应用选中 400 项' }).waitFor();
  assert.equal(await dialog.locator('.podcast-cut-list li').count(), 400);
  const category = dialog.locator('.podcast-cut-checks input');
  await category.uncheck();
  assert.equal(await dialog.getByRole('button', { name: '应用选中 0 项' }).isDisabled(), true);
  await category.check();
  await dialog.getByRole('button', { name: '应用选中 400 项' }).click();
  await dialog.getByText('所选剪点没有产生时间线变化。', { exact: true }).waitFor();
  assert.deepEqual(plans[0].selectedCuts, Array.from({ length: 400 }, (_, index) => index));
  assert.equal(plans[0].expectedRev, current.rev);
  assert.equal(plans[0].reviewId, 'reviewed-word-times');
  assert.equal((await readProjectFilm(project.path)).rev, current.rev);

  await dialog.getByRole('button', { name: '分析录音', exact: true }).click();
  await dialog.getByRole('button', { name: '显示后续 5 项', exact: true }).click();
  assert.equal(await dialog.locator('.podcast-cut-list li').count(), 405);
  assert.equal(await dialog.locator('.podcast-cut-list input:checked').count(), 400, 'revealing suggestions does not automatically select them');
  await category.uncheck();
  await category.check();
  await dialog.getByRole('button', { name: '应用选中 405 项' }).waitFor();
  const output = resolve(import.meta.dirname, '../../../../outputs');
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, 'wanju-podcast-review-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
  const bounds = await dialog.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391);
  await page.screenshot({ path: join(output, 'wanju-podcast-review-mobile.png') });

  await page.setViewportSize({ width: 1280, height: 800 });
  await mkdir(join(project.path, 'assets'), { recursive: true });
  const wav = Buffer.alloc(44 + 16000 * 2 * 10);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  await writeFile(join(project.path, 'assets/voice.wav'), wav);
  await writePodcastSource(project.path, 'assets/voice.wav', [
    { token: '开始', startSec: 0, endSec: 1 },
    { token: '继续', startSec: 3, endSec: 4 },
    { token: '结束', startSec: 9, endSec: 10 },
  ]);
  await page.unroute('**/podcast-cut');
  await page.route('**/podcast-cut', (route) => route.continue({
    postData: JSON.stringify({ ...route.request().postDataJSON(), durationSec: 10 }),
  }));
  await dialog.getByRole('button', { name: '重新分析', exact: true }).click();
  await dialog.getByRole('button', { name: '应用选中 2 项', exact: true }).waitFor();
  await dialog.getByRole('button', { name: '应用选中 2 项', exact: true }).click();
  await dialog.getByText('已应用 2 个剪点，可在时间线编辑历史中撤销。', { exact: true }).waitFor();
  const edited = await readProjectFilm(project.path);
  assert.notEqual(edited.rev, current.rev);
  assert.deepEqual(edited.value.tracks[0].clips.map((clip) => clip.time), [[0, 1.18], [2.82, 4.18], [8.82, 10]]);
  await dialog.getByRole('button', { name: '关闭口播粗剪', exact: true }).click();
  const undone = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith(`/projects/${project.id}/edit`));
  await page.keyboard.press('Control+z');
  assert.equal((await undone).status(), 200);
  assert.equal((await readProjectFilm(project.path)).rev, current.rev, 'undo restores the original timeline exactly');
  assert.deepEqual(failures, []);

  await page.getByRole('button', { name: '口播粗剪', exact: true }).click();
  await dialog.getByRole('button', { name: '分析录音', exact: true }).click();
  await dialog.getByRole('button', { name: '应用选中 2 项', exact: true }).waitFor();
  const brokenText = '<html><body>an external writer has not finished the film</body></html>';
  await page.route(`**/api/projects/${project.id}/edit`, async (route) => {
    await writeFile(join(project.path, 'film.html'), brokenText);
    await route.continue();
  }, { times: 1 });
  await dialog.getByRole('button', { name: '应用选中 2 项', exact: true }).click();
  await dialog.locator('.podcast-cut-status.error').getByText('时间线已变化，请重新分析口播剪点后再应用。', { exact: true }).waitFor({ timeout: 8000 });
  assert.equal((await readProjectFilm(project.path)).text, brokenText);
  assert.equal(await dialog.getByText('已应用 2 个剪点，可在时间线编辑历史中撤销。', { exact: true }).count(), 0,
    'a refused edit on an unreadable film must not be reported as applied');
  await writeFile(join(project.path, 'film.html'), current.text);
  assert.deepEqual(failures.filter((message) =>
    !message.startsWith('film.html:1: text "an external writer has not finished the " is outside any clip')), [],
  'only the deliberately broken film may produce a preview error');
});
