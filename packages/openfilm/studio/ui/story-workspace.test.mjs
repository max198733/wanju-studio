import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startStudio } from '../server/server.mjs';

test('story workspace imports a novel, saves a script and opens an isolated episode editor', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-story-ui-'));
  const savedEnv = Object.fromEntries(['OPENFILM_HOME', 'OPENFILM_SHARED_HOME', 'OPENFILM_LIBRARY', 'WANJU_CONFIG_DIR']
    .map((key) => [key, process.env[key]]));
  process.env.OPENFILM_HOME = join(root, 'home');
  process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
  process.env.OPENFILM_LIBRARY = join(root, 'projects');
  process.env.WANJU_CONFIG_DIR = join(root, 'empty-config');
  await mkdir(process.env.WANJU_CONFIG_DIR, { recursive: true });
  const studio = await startStudio({ port: 0, openBrowser: () => {} });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  t.after(async () => {
    await studio.close();
    await browser.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const request = (path, body) => fetch(`${studio.origin}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-studio-key': studio.key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const created = await request('wanju/projects', { name: '浏览器验收短剧', workflow: 'hedao' }).then((response) => response.json());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(`${studio.origin}/open?key=${studio.key}&to=${encodeURIComponent(`/projects/${created.project.id}`)}`);
  const opener = page.getByRole('button', { name: '小说与分集工作台' });
  await opener.waitFor({ state: 'visible', timeout: 20000 });
  await opener.click();
  await page.getByRole('heading', { name: '小说与分集' }).waitFor();

  const upload = page.getByRole('dialog', { name: '小说与分集' }).locator('input[type=file]');
  await upload.setInputFiles({
    name: '小说.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章 初见\n林夏收到一封信。\n第二章 回城\n她回到旧城。', 'utf8'),
  });
  await page.getByText('已导入《小说.txt》', { exact: false }).waitFor();
  await page.waitForFunction(() => document.querySelector('.wj-story-reader pre')?.textContent?.includes('林夏'), null, { timeout: 6000 })
    .catch(async () => {
      throw new Error(`Imported novel did not appear in the reader. message=${await page.locator('.wj-story-message').textContent()} reader=${await page.locator('.wj-story-reader pre').textContent()}`);
    });
  await page.getByLabel('作品名称').fill('浏览器验收故事');
  await page.getByRole('button', { name: '新增人物' }).click();
  await page.getByLabel('人物名称 1').fill('林夏');
  await page.getByLabel('人物描述 1').fill('收到旧信的主角');
  await page.getByRole('button', { name: '新增一集' }).click();
  const episodeList = page.getByRole('navigation', { name: '分集列表' });
  await episodeList.locator('button').nth(0).click();
  await page.getByLabel('剧本正文').fill('内景，林夏拆开信封。');
  await page.getByRole('button', { name: '新增一集' }).click();
  await page.getByLabel('剧本正文').fill('外景，林夏走进旧车站。');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('故事策划和分集剧本已保存。').waitFor();

  const story = await request(`wanju/projects/${created.project.id}/story`).then((response) => response.json());
  assert.equal(story.story.plan.title, '浏览器验收故事');
  assert.equal(story.story.plan.characters[0].name, '林夏');
  assert.match(story.story.episodes[0].script, /拆开信封/);
  assert.match(story.story.episodes[1].script, /旧车站/);
  assert.equal(story.story.sources.length, 1);

  await episodeList.locator('button').nth(0).click();
  await page.getByRole('button', { name: '开始制作本集' }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/projects/') && !url.pathname.endsWith(created.project.id), { timeout: 20000 });
  const childId = new URL(page.url()).pathname.split('/').at(-1);
  assert.ok(childId);
  assert.notEqual(childId, created.project.id);
  const child = await request(`wanju/projects/${childId}`).then((response) => response.json());
  assert.equal(child.state.script, '内景，林夏拆开信封。');
  assert.deepEqual(child.tasks, []);
  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  const seriesContext = await request(`wanju/projects/${childId}/story/series`).then((response) => response.json());
  const seriesNavigation = page.getByRole('navigation', { name: '系列工程导航' });
  await seriesNavigation.waitFor({ timeout: 5000 }).catch(async () => {
    throw new Error(`Series navigation missing: ${JSON.stringify({ url: page.url(), seriesContext, dialog: await page.getByRole('dialog').textContent() })}`);
  });
  assert.ok(seriesContext.series, JSON.stringify({ seriesContext, navigation: await seriesNavigation.textContent() }));
  assert.match(await seriesNavigation.textContent(), /浏览器验收故事/);
  await seriesNavigation.getByRole('button', { name: /系列策划/ }).click();
  await page.waitForURL((url) => url.pathname === `/projects/${created.project.id}`, { timeout: 20000 });

  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  const parentEpisodeList = page.getByRole('navigation', { name: '分集列表' });
  await parentEpisodeList.locator('button').nth(1).click();
  await page.getByRole('button', { name: '开始制作本集' }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/projects/')
    && ![created.project.id, childId].includes(url.pathname.split('/').at(-1)), { timeout: 20000 });
  const secondChildId = new URL(page.url()).pathname.split('/').at(-1);
  assert.ok(secondChildId);
  assert.notEqual(secondChildId, childId);
  const secondChild = await request(`wanju/projects/${secondChildId}`).then((response) => response.json());
  assert.equal(secondChild.state.script, '外景，林夏走进旧车站。');
  assert.deepEqual(secondChild.tasks, []);
  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  const secondParentSeries = page.getByRole('navigation', { name: '系列工程导航' });
  await secondParentSeries.waitFor();
  const linkedEpisodes = secondParentSeries.locator('.wj-series-episodes > button');
  assert.equal(await linkedEpisodes.count(), 3);
  assert.equal(await linkedEpisodes.nth(0).isEnabled(), true);
  assert.equal(await linkedEpisodes.nth(1).isEnabled(), false);
  assert.match(await linkedEpisodes.nth(2).textContent(), /系列策划/);
  await linkedEpisodes.nth(2).click();
  await page.waitForURL((url) => url.pathname === `/projects/${created.project.id}`, { timeout: 20000 });
  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  const parentSeries = page.getByRole('navigation', { name: '系列工程导航' });
  await parentSeries.waitFor();
  const parentLinkedEpisodes = parentSeries.locator('.wj-series-episodes > button');
  assert.equal(await parentLinkedEpisodes.count(), 2);
  assert.equal(await parentLinkedEpisodes.nth(0).isEnabled(), true);
  assert.equal(await parentLinkedEpisodes.nth(1).isEnabled(), true);
  await parentLinkedEpisodes.nth(0).click();
  await page.waitForURL((url) => url.pathname === `/projects/${childId}`, { timeout: 20000 });
  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  const secondSeriesNavigation = page.getByRole('navigation', { name: '系列工程导航' });
  await secondSeriesNavigation.waitFor();
  await page.getByRole('button', { name: '返回系列策划', exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/projects/${created.project.id}`, { timeout: 20000 });

  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  const parentWorkspace = page.getByRole('dialog', { name: '小说与分集' });
  const archiveEpisodeList = parentWorkspace.getByRole('navigation', { name: '分集列表' });
  await archiveEpisodeList.locator('button').first().click();
  await parentWorkspace.getByRole('button', { name: '归档', exact: true }).click();
  await page.getByText('第 1 集已归档', { exact: false }).waitFor();
  const archivedStory = await request(`wanju/projects/${created.project.id}/story`).then((response) => response.json());
  assert.equal(archivedStory.story.episodes[0].archived, true);
  assert.equal(archivedStory.story.episodes[0].projectId, childId);
  assert.equal(await archiveEpisodeList.locator('button.archived').count(), 1);
  assert.equal(await archiveEpisodeList.locator('button:not(.archived)').count(), 1);

  await parentWorkspace.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByText('第 1 集已恢复到分集列表。').waitFor();
  const restoredStory = await request(`wanju/projects/${created.project.id}/story`).then((response) => response.json());
  assert.equal(restoredStory.story.episodes[0].archived, undefined);
  assert.equal(restoredStory.story.episodes[0].projectId, childId);
  assert.equal(await archiveEpisodeList.locator('button.archived').count(), 0);

  await parentWorkspace.getByRole('button', { name: '关闭小说与分集工作台' }).click();
  let hiddenReads = 0;
  const countReads = (request) => {
    if (request.method() === 'GET' && request.url().includes(`/story/sources/${restoredStory.story.sources[0].id}?`)) hiddenReads++;
  };
  page.on('request', countReads);
  const reloadedStory = page.waitForResponse((response) => response.url().endsWith(`/api/wanju/projects/${created.project.id}/story`));
  await page.reload();
  await reloadedStory;
  await page.getByRole('button', { name: '小说与分集工作台' }).waitFor();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(hiddenReads, 0, 'opening an editor does not parse source documents while the workbench is hidden');
  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  await page.waitForFunction(() => document.querySelector('.wj-story-reader pre')?.textContent?.includes('林夏'));
  page.off('request', countReads);

  const savedScript = await page.getByLabel('剧本正文').inputValue();
  const draftScript = `${savedScript}\n未保存的故事草稿。`;
  await page.getByLabel('剧本正文').fill(draftScript);
  let metadataReloads = 0;
  const countReloads = (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/api/wanju/projects/${created.project.id}/story`)) metadataReloads++;
  };
  page.on('request', countReloads);
  const renamed = await fetch(`${studio.origin}/api/projects/${created.project.id}`, {
    method: 'PATCH', headers: { 'x-studio-key': studio.key, 'content-type': 'application/json' },
    body: JSON.stringify({ name: '项目改名后保留故事草稿' }),
  });
  assert.equal(renamed.status, 200);
  await parentWorkspace.locator('.wj-story-dialog-header').getByText('项目改名后保留故事草稿', { exact: true }).waitFor();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(metadataReloads, 0, 'a project rename must not reload over an unsaved story draft');
  assert.equal(await page.getByLabel('剧本正文').inputValue(), draftScript);
  page.off('request', countReloads);

  page.once('dialog', (dialog) => dialog.dismiss());
  await parentWorkspace.getByRole('button', { name: '关闭小说与分集工作台' }).click();
  assert.equal(await parentWorkspace.isVisible(), true);
  assert.equal(await page.getByLabel('剧本正文').inputValue(), draftScript);
  page.once('dialog', (dialog) => dialog.accept());
  await parentWorkspace.getByRole('button', { name: '关闭小说与分集工作台' }).click();
  await parentWorkspace.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '小说与分集工作台' }).click();
  assert.equal(await page.getByLabel('剧本正文').inputValue(), savedScript, 'confirming discard actually restores the saved draft');
  const finalStory = await request(`wanju/projects/${created.project.id}/story`).then((response) => response.json());
  assert.equal(finalStory.story.episodes[0].script, restoredStory.story.episodes[0].script);
  await parentWorkspace.getByRole('button', { name: '重新读取', exact: true }).click();
  await page.getByText('故事资料已刷新。', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.wj-story-reader pre')?.textContent?.includes('林夏'));
  assert.deepEqual(failures, []);
});
