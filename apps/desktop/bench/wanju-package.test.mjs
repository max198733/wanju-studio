import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { prepareWanjuResources, repository } from '../scripts/wanju-resources.mjs';
import { docxFixture, pdfFixture } from '../../../packages/openfilm/studio/server/story-document-fixtures.mjs';

const sourceMode = process.env.WANJU_SOURCE_TEST === '1';
const currentFeatures = sourceMode || process.env.WANJU_PACKAGE_TEST_CURRENT === '1';
const executable = sourceMode ? createRequire(import.meta.url)('electron') : process.env.WANJU_PACKAGE_TEST_EXE;
test('desktop uses the real account IPC, native new-project and workflow migration paths', {
  skip: !executable, timeout: 240000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-package-check-'));
  let launcher;
  if (sourceMode) {
    launcher = join(directory, 'launcher');
    await mkdir(launcher);
    await writeFile(join(launcher, 'package.json'), JSON.stringify({
      name: 'wanju-debug-check', productName: '玩剧调试版', version: '0.1.13-dev',
      main: join(repository, 'apps/desktop/src/wanju-main.mjs'),
    }));
    prepareWanjuResources(join(directory, 'resources'), { studentEdition: process.env.WANJU_SOURCE_STUDENT === '1' });
  }
  const calls = [];
  let automaticRevision = 1, automaticCommits = 0;
  let cloudTrashed = false, cloudPurged = false;
  const cloudProject = { id: 'package-cloud-project', title: '桌面云项目测试', revision: 1, updated: Date.now(), trashToken: 'package-trash', deleted: Date.now() };
  const service = createServer((request, response) => {
    calls.push(request.url);
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/cloud/projects') {
      response.end(JSON.stringify({ projects: cloudTrashed || cloudPurged ? [] : [cloudProject] }));
    } else if (request.url === '/api/cloud/projects/automatic-fixture-project') {
      if (request.method === 'POST') {
        let body = '';
        request.on('data', (bytes) => { body += bytes; });
        request.on('end', () => {
          const value = JSON.parse(body);
          if (value.parentRevision !== automaticRevision) { response.statusCode = 409; response.end(JSON.stringify({ error: { message: 'fixture revision conflict' } })); return; }
          automaticCommits++; response.end(JSON.stringify({ revision: ++automaticRevision }));
        });
      } else response.end(JSON.stringify({ revision: automaticRevision }));
    } else if (request.url === '/api/cloud/objects/check') {
      request.resume(); response.end(JSON.stringify({ present: [] }));
    } else if (/^\/api\/cloud\/objects\/[a-f0-9]{64}$/.test(request.url) && request.method === 'PUT') {
      let bytes = 0;
      request.on('data', (chunk) => { bytes += chunk.length; });
      request.on('end', () => response.end(JSON.stringify({ stored: true, hash: request.url.split('/').at(-1), size: bytes })));
    } else if (request.url === '/api/cloud/status') {
      response.end(JSON.stringify({ prices: { enabled: false, priceVersion: 'fixture-price' }, authorized: false }));
    } else if (request.url === '/api/cloud/trash') {
      response.end(JSON.stringify({ projects: cloudTrashed ? [cloudProject] : [] }));
    } else if (request.url === '/api/cloud/projects/package-cloud-project/versions') {
      response.end(JSON.stringify({ versions: [{ revision: 1, files: 1, bytes: 100, created: Date.now() }], nextBefore: null }));
    } else if (request.url === '/api/cloud/projects/package-cloud-project/trash') {
      cloudTrashed = true; response.end(JSON.stringify({ trashToken: cloudProject.trashToken }));
    } else if (request.url === '/api/cloud/projects/package-cloud-project/restore') {
      cloudTrashed = false; response.end(JSON.stringify({ restored: true }));
    } else if (request.url === '/api/cloud/projects/package-cloud-project/purge') {
      cloudTrashed = false; cloudPurged = true; response.end(JSON.stringify({ purged: true }));
    } else if (request.url === '/api/cloud/storage/preview') {
      response.end(JSON.stringify({ token: 'package-cleanup', bytes: 0, objects: 0, more: false, graceHours: 24 }));
    } else if (request.url === '/api/cloud/storage/cleanup') {
      response.end(JSON.stringify({ bytes: 0, objects: 0, skipped: 0, more: false }));
    } else if (['/api/login', '/api/activate'].includes(request.url)) {
      response.end(JSON.stringify({ token: 'wjs_packaged_test_only' }));
    } else if (request.url === '/api/media/config') {
      response.end(JSON.stringify({ revision: 'fixture-media-1', profiles: [{
        id: 'cloud-image', category: 'image', adapter: 'openai-image', name: '云端图片测试',
        baseUrl: 'https://image-test.example/v1', model: 'test-image', key: 'ONLY_TEST_CLOUD_KEY',
      }], defaults: { image: 'cloud-image', video: null, audio: null } }));
    } else {
      response.end(JSON.stringify({
        user: { id: 'packaged-fixture', username: 'packaged-test', balance: 0 },
        chat: { enabled: false, authorized: false },
        media: { available: true, revision: 'fixture-media-1' },
      }));
    }
  });
  service.listen(0, '127.0.0.1');
  await once(service, 'listening');
  const debugPort = createServer();
  debugPort.listen(0, '127.0.0.1');
  await once(debugPort, 'listening');
  const port = debugPort.address().port;
  await new Promise((resolve) => debugPort.close(resolve));
  const child = spawn(executable, [...(launcher ? [launcher] : []), `--remote-debugging-port=${port}`], {
    windowsHide: false, stdio: 'ignore',
    env: {
      ...process.env, WANJU_DATA_DIR: join(directory, 'data'), WANJU_LIBRARY: join(directory, 'projects'),
      WANJU_EXPORTS: join(directory, 'exports'), WANJU_CONFIG_DIR: join(directory, 'providers'),
      ...(sourceMode ? { WANJU_DEBUG: '1', WANJU_RESOURCES_DIR: join(directory, 'resources') } : {}),
      WANJU_STUDENT_SERVICE_URL: `http://127.0.0.1:${service.address().port}`,
    },
  });
  let browser;
  let externalBrowser;
  let page;
  try {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Packaged desktop exited during startup (${child.exitCode}).`);
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
    }
    assert.ok(browser, 'Packaged desktop must expose its test browser.');
    while (Date.now() < deadline) {
      page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => /^http:\/\/127\.0\.0\.1:/.test(candidate.url()));
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(page, 'Packaged Studio must load.');
    page.setDefaultTimeout(10000);
    await page.waitForFunction(() => Boolean(window.openfilmNative?.wanju?.account), { timeout: 20000 });
    if (process.platform === 'win32') {
      const hello = await page.evaluate(() => window.openfilmNative.hello());
      assert.equal(hello.windowVisible, true, 'The actual desktop window must be visible, not only its hidden browser page.');
      console.log('Native Windows application window is visible.');
    }
    const student = await page.evaluate(() => window.openfilmNative.wanju.studentEdition);
    console.log(`${sourceMode ? 'Source debug' : 'Packaged'} ${student ? 'student' : 'teacher'} Studio loaded.`);
    const status = () => page.evaluate(async () => {
      const response = await fetch('/api/wanju/status');
      if (!response.ok) throw new Error('Studio status failed.');
      return response.json();
    });
    const waitAllowed = async (value) => {
      await page.waitForFunction(async (value) => {
        const response = await fetch('/api/wanju/status');
        return (await response.json()).access?.localMediaAllowed === value;
      }, value, { timeout: 10000 });
    };
    await waitAllowed(!student);
    if (student) {
      const denied = await page.evaluate(async () => {
        try { await window.openfilmNative.wanju.h3Config.get(); return false; }
        catch { return true; }
      });
      assert.equal(denied, true);
      await page.evaluate(() => window.openfilmNative.wanju.account.login({ username: 'packaged-test', password: 'fixture-password' }));
      await waitAllowed(false);
      await page.evaluate(() => window.openfilmNative.wanju.account.setOwnMediaEnabled(true));
      await waitAllowed(true);
    }
    await page.evaluate(() => window.openfilmNative.wanju.h3Config.saveKey({ key: 'PACKAGED_TEST_KEY_ONLY' }));
    await page.evaluate(async () => {
      await window.openfilmNative.wanju.imageConfig.saveKey({ key: 'PACKAGED_IMAGE_TEST_KEY_ONLY', responseFormat: 'b64_json' });
      await window.openfilmNative.wanju.imageConfig.saveKey({ key: '', responseFormat: 'url' });
    });
    const imageMode = await page.evaluate(() => window.openfilmNative.wanju.imageConfig.get());
    assert.equal(imageMode.responseFormat, 'url');
    assert.equal(imageMode.configured, true);
    assert.doesNotMatch(JSON.stringify(imageMode), /PACKAGED_IMAGE_TEST/);
    const installedSkill = JSON.parse(await readFile(join(directory, 'data/Skills/wanju-creator/openfilm.json'), 'utf8'));
    assert.equal(installedSkill.title['zh-CN'], '何导短剧工作流');
    console.log('Native configuration saved.');
    const state = await status();
    assert.equal(state.providers.find((provider) => provider.id === 'h3_zm_nono').configured, true);
    const config = await page.evaluate(() => window.openfilmNative.wanju.h3Config.get());
    assert.equal(config.configured, true);
    assert.equal(config.api_key, undefined);
    assert.equal(config.key, undefined);
    await page.getByRole('button', { name: '账户与权益', exact: true, includeHidden: true }).first().dispatchEvent('click', { timeout: 30000 });
    await page.getByRole('button', { name: '图片、视频与音频', exact: true }).dispatchEvent('click', { timeout: 15000 });
    await page.getByRole('button', { name: '添加视频供应商', exact: true }).waitFor();
    await page.getByRole('button', { name: '添加音频供应商', exact: true }).click();
    await page.getByLabel('供应商名称', { exact: true }).fill('测试音乐服务');
    await page.getByLabel('API 地址', { exact: true }).fill('https://audio-test.example/api');
    await page.getByLabel('模型名称', { exact: true }).fill('music-test');
    await page.getByLabel('API 密钥', { exact: true }).fill('ONLY_TEST_AUDIO_KEY');
    await page.getByLabel('调用说明', { exact: true }).fill('POST /generate with prompt; query by task id.');
    await page.getByRole('button', { name: '保存供应商', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '供应商已保存' }).waitFor();
    await page.getByLabel('音频服务来源', { exact: true }).selectOption({ label: '测试音乐服务' });
    await page.waitForFunction(async () => {
      const value = await window.openfilmNative.wanju.mediaProfiles.get();
      return value.selection.audio === value.profiles.find((p) => p.name === '测试音乐服务')?.id;
    });
    const media = await page.evaluate(() => window.openfilmNative.wanju.mediaProfiles.get());
    assert.equal(media.profiles.find((p) => p.name === '测试音乐服务').configured, true);
    assert.doesNotMatch(JSON.stringify(media), /ONLY_TEST_AUDIO_KEY/);
    await page.getByRole('button', { name: '编辑测试音乐服务', exact: true }).click();
    assert.equal(await page.getByLabel('API 密钥', { exact: true }).inputValue(), '');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByText('密钥已保存 · 未验证', { exact: true }).first().waitFor();
    if (!student) {
      await page.evaluate(() => window.openfilmNative.wanju.account.login({ username: 'packaged-test', password: 'fixture-password' }));
      await page.waitForFunction(async () => (await window.openfilmNative.wanju.mediaProfiles.get()).cloud.profiles.some((p) => p.id === 'cloud-image'));
      const synced = await page.evaluate(() => window.openfilmNative.wanju.mediaProfiles.get());
      assert.equal(synced.cloud.profiles[0].configured, true);
      assert.doesNotMatch(JSON.stringify(synced), /ONLY_TEST_CLOUD_KEY/);
      assert.equal(synced.selection.audio, media.selection.audio);
      assert.ok(calls.includes('/api/media/config'), 'Login must automatically sync account-owned media.');
      const lifecycle = await page.evaluate(async () => {
        const cloud = window.openfilmNative.wanju.cloud, projectId = 'package-cloud-project';
        const before = await cloud.list(), versions = await cloud.versions({ projectId });
        await cloud.trash({ projectId, revision: 1 });
        const trashed = await cloud.trashList();
        await cloud.restore({ projectId, trashToken: 'package-trash' });
        const restored = await cloud.list();
        await cloud.trash({ projectId, revision: 1 });
        await cloud.purge({ projectId, trashToken: 'package-trash', confirmTitle: '桌面云项目测试' });
        const preview = await cloud.cleanupPreview();
        await cloud.cleanup({ token: preview.token, confirm: '清理未引用文件' });
        return { before: before.projects.length, versions: versions.versions.length,
          trashed: trashed.projects.length, restored: restored.projects.length, preview: preview.objects };
      });
      assert.deepEqual(lifecycle, { before: 1, versions: 1, trashed: 1, restored: 1, preview: 0 });
      console.log('Cloud lifecycle crossed the actual preload, main process and HTTP transport.');
      await page.evaluate(() => window.openfilmNative.wanju.account.logout());
      await page.waitForFunction(async () => (await window.openfilmNative.wanju.mediaProfiles.get()).cloud.profiles.length === 0);
    }
    if (process.env.WANJU_PACKAGE_TEST_PREVIEW) await page.screenshot({ path: process.env.WANJU_PACKAGE_TEST_PREVIEW });
    if (student) {
      await page.evaluate(() => window.openfilmNative.wanju.account.logout());
      await waitAllowed(false);
      assert.equal((await status()).providers.every((provider) => !provider.configured), true);
    }
    const { execute } = await import(pathToFileURL(sourceMode ? join(repository, 'integrations/agent/client.mjs')
      : join(dirname(executable), 'resources/wanju/integrations/agent/client.mjs')).href);
    const oldDesktop = process.env.WANJU_DESKTOP;
    process.env.WANJU_DESKTOP = '1';
    let story;
    try {
      story = await execute('create', { name: 'Packaged suspense story' }, {
        start: async () => {},
        api: (path, options = {}) => page.evaluate(async ({ path, options }) => {
          const response = await fetch(path, {
            method: options.method ?? 'GET',
            headers: { 'content-type': 'application/json' },
            ...(options.body ? { body: JSON.stringify(options.body) } : {}),
          });
          if (!response.ok) throw new Error('Packaged project operation failed.');
          return response.json();
        }, { path, options }),
      });
    } finally {
      if (oldDesktop === undefined) delete process.env.WANJU_DESKTOP;
      else process.env.WANJU_DESKTOP = oldDesktop;
    }
    assert.equal(story.opened, true);
    assert.equal(story.workflow.enabled, true);
    await page.waitForFunction(async (id) => (await window.openfilmNative.tabs.list()).tabs.some((tab) => tab.active && tab.projectId === id), story.project.id);
    const projectPage = async (id) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const candidate = browser.contexts().flatMap((context) => context.pages()).find((candidate) => {
          try { return new URL(candidate.url()).pathname === `/projects/${id}`; } catch { return false; }
        });
        if (candidate) {
          await candidate.waitForFunction(() => Boolean(window.openfilmNative?.tabs));
          return candidate;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('The native project page did not open.');
    };
    page = await projectPage(story.project.id);
    const film = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), story.project.id);
    assert.deepEqual(film.value.tracks, []);
    assert.equal(story.state.shots.length, 0);
    if (currentFeatures && !student && process.env.WANJU_PACKAGE_TEST_SKIP_AUTOMATIC !== '1') {
      await page.evaluate(() => window.openfilmNative.wanju.account.login({ username: 'packaged-test', password: 'fixture-password' }));
      const rejected = await page.evaluate(async (projectId) => {
        try { await window.openfilmNative.wanju.cloud.setAutomatic({ projectId, enabled: true, priceVersion: 'fixture-price' }); return false; }
        catch (error) { return /先手动保存/.test(error.message); }
      }, story.project.id);
      assert.equal(rejected, true);
      await writeFile(join(story.project.path, '.film/wanju-cloud.json'), JSON.stringify({
        version: 1, origin: `http://127.0.0.1:${service.address().port}`, owner: 'packaged-fixture',
        projectId: 'automatic-fixture-project', revision: 1, baseline: [], receipts: [],
      }));
      const automatic = await page.evaluate(async (projectId) => {
        const cloud = window.openfilmNative.wanju.cloud;
        await cloud.setAutomatic({ projectId, enabled: true, priceVersion: 'fixture-price' });
        return await cloud.automaticStatus();
      }, story.project.id);
      assert.equal(automatic.projects[0].projectId, story.project.id);
      const automaticDeadline = Date.now() + 95000;
      let automaticResult;
      do {
        automaticResult = await page.evaluate(() => window.openfilmNative.wanju.cloud.automaticStatus());
        if (['synced', 'paused'].includes(automaticResult.projects[0]?.phase)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } while (Date.now() < automaticDeadline);
      assert.equal(automaticResult.projects[0]?.phase, 'synced', JSON.stringify(automaticResult));
      assert.equal(automaticResult.projects[0].revision, 2);
      assert.equal(automaticCommits, 1);
      await page.evaluate((projectId) => window.openfilmNative.wanju.cloud.setAutomatic({
        projectId, enabled: false, priceVersion: 'fixture-price',
      }), story.project.id);
      assert.deepEqual((await page.evaluate(() => window.openfilmNative.wanju.cloud.automaticStatus())).projects, []);
      await page.evaluate(() => window.openfilmNative.wanju.account.logout());
      assert.deepEqual((await page.evaluate(() => window.openfilmNative.wanju.cloud.automaticStatus())).projects, []);
      console.log('Automatic save crossed actual preload, main timer, file upload and version commit; unbound projects and logout stay isolated.');
    }
    // Exercise the same plus/library path the person uses, instead of only the agent tool.
    await page.getByRole('button', { name: '打开项目', exact: true }).click();
    const [createdResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/projects' && response.request().method() === 'POST'),
      page.getByRole('button', { name: '新建项目', exact: true }).first().click(),
    ]);
    assert.equal(createdResponse.status(), 200);
    const createdProject = (await createdResponse.json()).project;
    await page.waitForFunction(async (id) => {
      const { tabs } = await window.openfilmNative.tabs.list();
      return tabs.some((tab) => tab.active && tab.projectId === id);
    }, createdProject.id);
    page = await projectPage(createdProject.id);
    const nativeCreated = await page.evaluate(async (id) => {
      return (await fetch(`/api/wanju/projects/${id}`)).json();
    }, createdProject.id);
    assert.equal(nativeCreated.workflow.enabled, !currentFeatures);
    assert.equal(nativeCreated.workflow.catalogPresent, !currentFeatures);
    assert.deepEqual(nativeCreated.state.shots, []);
    const legacy = await page.evaluate(async () => (await fetch('/api/wanju/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Existing native project', workflow: 'native' }),
    })).json());
    assert.equal(legacy.workflow.enabled, false);
    await page.evaluate((projectId) => window.openfilmNative.tabs.open(projectId), legacy.project.id);
    await page.waitForFunction(async (id) => (await window.openfilmNative.tabs.list()).tabs.some((tab) => tab.active && tab.projectId === id), legacy.project.id);
    page = await projectPage(legacy.project.id);
    if (currentFeatures) {
      await page.locator('#of-chat aside').waitFor({ timeout: 15000 });
      const mode = page.getByRole('group', { name: '制作模式', exact: true });
      await mode.getByRole('button', { name: '自动', exact: true }).waitFor();
      await mode.getByRole('button', { name: '快速创作', exact: true }).click();
      assert.equal(await mode.getByRole('button', { name: '快速创作', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: '用 OpenFilm 原生流程做一支 15 秒的产品介绍，先做可预览版本', exact: true }).waitFor();
      await page.waitForFunction(async (path) => (await window.openfilmNative.chat.load(path)).sessions.some((s) => s.productionMode === 'quick'), legacy.project.path);
      // The native store debounces writes for 150ms; allow the whole UI commit to settle before reloading.
      await page.waitForTimeout(500);
      await page.waitForFunction(async (path) => {
        const kept = await window.openfilmNative.chat.load(path);
        return kept.sessions.some((s) => s.id === kept.last && s.productionMode === 'quick');
      }, legacy.project.path);
      const keptMode = await page.evaluate(async (path) => window.openfilmNative.chat.load(path), legacy.project.path);
      assert.ok(keptMode.sessions.some((s) => s.id === keptMode.last && s.productionMode === 'quick' && typeof s.createdAt === 'string'), JSON.stringify({ last: keptMode.last, sessions: keptMode.sessions }));
      const beforeMode = await page.evaluate(() => window.openfilmNative.tabs.list());
      await page.reload();
      await page.getByRole('group', { name: '制作模式', exact: true }).getByRole('button', { name: '快速创作', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('[aria-label="制作模式"] [aria-label="快速创作"]')?.getAttribute('aria-pressed') === 'true');
      assert.equal(await page.getByRole('button', { name: '快速创作', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'AI 剧情', exact: true }).click();
      await page.getByRole('button', { name: '做一集 30 秒的竖屏悬疑短剧，先给我剧本和分镜', exact: true }).waitFor();
      const afterMode = await page.evaluate(() => window.openfilmNative.tabs.list());
      assert.deepEqual(afterMode, beforeMode, 'Selecting a production mode must not create or switch project tabs.');
      const unchanged = await page.evaluate(async (id) => (await fetch(`/api/wanju/projects/${id}`)).json(), legacy.project.id);
      assert.equal(unchanged.workflow.enabled, false, 'A routing preference must not silently enable or disable asset gates.');
      assert.deepEqual(unchanged.tasks, []);
      if (process.env.WANJU_PACKAGE_TEST_PREVIEW) await page.screenshot({ path: `${process.env.WANJU_PACKAGE_TEST_PREVIEW}.modes.png` });
    }
    await page.getByRole('button', { name: '制作资产', exact: true }).click();
    await page.getByRole('dialog').getByText('Existing native project', { exact: true }).waitFor();
    await page.getByRole('button', { name: '启用何导流程', exact: true }).click();
    await page.getByText('资产：待规划', { exact: true }).waitFor();
    const migrated = await page.evaluate(async (id) => (await fetch(`/api/wanju/projects/${id}`)).json(), legacy.project.id);
    assert.equal(migrated.workflow.enabled, true);
    assert.equal(migrated.workflow.counts.characters, 0);
    assert.deepEqual(migrated.tasks, []);
    if (currentFeatures) {
      const skills = await page.evaluate(async (path) => {
        const value = await window.openfilmNative.skills.list(path, 'byok');
        return value.openfilm.map((skill) => ({ name: skill.name, title: skill.title }));
      }, legacy.project.path);
      assert.ok(skills.some((skill) => skill.name === 'wanju-creator'));
      await page.getByRole('button', { name: '关闭制作资产', exact: true }).click();
      const assets = await page.evaluate(async (id) => (await fetch(`/api/wanju/projects/${id}/assets`)).json(), legacy.project.id);
      assets.workflow.shotImages = Array.from({ length: 36 }, (_, i) => ({
        shot: `S${String(i + 1).padStart(3, '0')}`, path: '', exists: false,
      }));
      await page.route(`**/api/wanju/projects/${legacy.project.id}/assets`, (route) => route.fulfill({ json: assets }));
      await page.getByRole('button', { name: '制作资产', exact: true }).click();
      await page.getByText('S036', { exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')), 'no-drag');
      const content = page.getByRole('region', { name: '制作资产内容', exact: true });
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
      const close = await page.getByRole('button', { name: '关闭制作资产', exact: true }).boundingBox();
      assert.ok(close && close.y + close.height <= bounds.y);
      console.log('Native asset scrolling and workflow skill loading passed.');
      await page.getByRole('button', { name: '关闭制作资产', exact: true }).click();

      await page.getByRole('button', { name: '小说与分集工作台', exact: true }).click();
      await page.getByRole('heading', { name: '小说与分集', exact: true }).waitFor();
      const storyDialog = page.getByRole('dialog', { name: '小说与分集' });
      const sourceResponses = [];
      page.on('response', async (response) => {
        if (new URL(response.url()).pathname.endsWith('/story/sources')) {
          sourceResponses.push({ status: response.status(), body: await response.text().catch(() => '') });
        }
      });
      await storyDialog.locator('input[type=file]').setInputFiles({
        name: '候选验收小说.txt', mimeType: 'text/plain',
        buffer: Buffer.from('第一章 初见\n林夏收到一封信。\n第二章 回城\n她回到旧城。', 'utf8'),
      });
      await page.getByText('已导入《候选验收小说.txt》', { exact: false }).waitFor();
      await storyDialog.locator('input[type=file]').setInputFiles({
        name: '候选验收原著.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docxFixture('第一章 初见\n林夏收到一封信。'),
      });
      await page.getByText('已导入《候选验收原著.docx》', { exact: false }).waitFor();
      await storyDialog.locator('input[type=file]').setInputFiles({
        name: '候选验收原著.pdf',
        mimeType: 'application/pdf',
        buffer: pdfFixture([['第一页：', '林夏收到一封信。'], '第二页：她回到旧城。']),
      });
      await page.getByText('已导入《候选验收原著.pdf》', { exact: false }).waitFor({ timeout: 10000 }).catch(async () => {
        const alerts = await storyDialog.getByRole('alert').allTextContents();
        throw new Error(`Packaged PDF import failed: ${JSON.stringify({ sourceResponses, alerts })}`);
      });
      const importedDocuments = await page.evaluate(async (id) => (await fetch(`/api/wanju/projects/${id}/story`)).json(), legacy.project.id);
      assert.deepEqual(importedDocuments.story.sources.map(({ format, encoding }) => [format, encoding]), [
        ['txt', 'utf-8'], ['docx', 'docx'], ['pdf', 'pdf'],
      ]);
      await page.getByLabel('作品名称').fill('候选包故事验收');
      await page.getByRole('button', { name: '新增一集', exact: true }).click();
      const storyEpisodes = storyDialog.getByRole('navigation', { name: '分集列表' });
      await storyEpisodes.locator('button').nth(0).click();
      await page.getByLabel('剧本正文').fill('内景，林夏拆开信封。');
      await page.getByRole('button', { name: '新增一集', exact: true }).click();
      await page.getByLabel('剧本正文').fill('外景，林夏走进旧车站。');
      await storyDialog.getByRole('button', { name: '保存', exact: true }).click();
      await page.getByText('故事策划和分集剧本已保存。').waitFor();
      const storyBeforeEpisode = await page.evaluate(async (id) => (await fetch(`/api/wanju/projects/${id}/story`)).json(), legacy.project.id);
      assert.equal(storyBeforeEpisode.story.plan.title, '候选包故事验收');
      assert.equal(storyBeforeEpisode.story.sources.length, 3);
      assert.match(storyBeforeEpisode.story.episodes[0].script, /拆开信封/);
      assert.match(storyBeforeEpisode.story.episodes[1].script, /旧车站/);
      await storyEpisodes.locator('button').nth(0).click();
      const episodeResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.startsWith(`/api/wanju/projects/${legacy.project.id}/story/episodes/`)
          && url.pathname.endsWith('/project') && response.request().method() === 'POST';
      });
      await storyDialog.getByRole('button', { name: '开始制作本集', exact: true }).click();
      const episodeResponse = await episodeResponsePromise;
      assert.equal(episodeResponse.status(), 200);
      const episodeResult = await episodeResponse.json();
      const episodeProjectId = episodeResult.project.id;
      assert.ok(episodeProjectId);
      assert.notEqual(episodeProjectId, legacy.project.id);
      await page.waitForFunction(async (id) => {
        const { tabs } = await window.openfilmNative.tabs.list();
        return tabs.some((tab) => tab.projectId === id && tab.active);
      }, episodeProjectId);
      const episodeProject = await page.evaluate(async (id) => (await fetch(`/api/wanju/projects/${id}`)).json(), episodeProjectId);
      assert.equal(episodeProject.state.script, '内景，林夏拆开信封。');
      assert.deepEqual(episodeProject.tasks, []);
      page = await projectPage(episodeProjectId);
      const editEpisodeFilm = async (id, clipId, src, width, height) => {
        const result = await page.evaluate(async ({ id, clipId, src, width, height }) => {
          const current = await fetch(`/api/projects/${id}`).then((response) => response.json());
          const response = await fetch(`/api/projects/${id}/edit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              base: current.rev,
              ops: [
                { op: 'stage', w: width, h: height },
                { op: 'insert', clip: { id: clipId, src, at: 0 } },
              ],
            }),
          });
          return { status: response.status, body: await response.json() };
        }, { id, clipId, src, width, height });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return result.body;
      };
      const firstEditedFilm = await editEpisodeFilm(episodeProjectId, 'episode-one-cut', 'assets/episode-one.mp4', 1080, 1920);
      assert.equal(firstEditedFilm.value.stage.w, 1080);
      assert.deepEqual(firstEditedFilm.value.tracks.flatMap((track) => track.clips).map((clip) => clip.id), ['episode-one-cut']);
      await page.getByRole('button', { name: '小说与分集工作台', exact: true }).click();
      const episodeSeries = page.getByRole('navigation', { name: '系列工程导航' });
      await episodeSeries.waitFor();
      await episodeSeries.getByRole('button', { name: /系列策划/ }).click();
      page = await projectPage(legacy.project.id);
      await page.getByRole('button', { name: '小说与分集工作台', exact: true }).click();
      const parentEpisodes = page.getByRole('navigation', { name: '分集列表' });
      await parentEpisodes.locator('button').nth(1).click();
      const secondEpisodeResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.startsWith(`/api/wanju/projects/${legacy.project.id}/story/episodes/`)
          && url.pathname.endsWith('/project') && response.request().method() === 'POST';
      });
      await page.getByRole('button', { name: '开始制作本集', exact: true }).click();
      const secondEpisodeResponse = await secondEpisodeResponsePromise;
      assert.equal(secondEpisodeResponse.status(), 200);
      const secondEpisodeProjectId = (await secondEpisodeResponse.json()).project.id;
      assert.notEqual(secondEpisodeProjectId, episodeProjectId);
      page = await projectPage(secondEpisodeProjectId);
      const secondEpisodeProject = await page.evaluate(async (id) => (await fetch(`/api/wanju/projects/${id}`)).json(), secondEpisodeProjectId);
      assert.equal(secondEpisodeProject.state.script, '外景，林夏走进旧车站。');
      assert.deepEqual(secondEpisodeProject.tasks, []);
      const secondEditedFilm = await editEpisodeFilm(secondEpisodeProjectId, 'episode-two-cut', 'assets/episode-two.mp4', 1920, 1080);
      assert.equal(secondEditedFilm.value.stage.w, 1920);
      assert.deepEqual(secondEditedFilm.value.tracks.flatMap((track) => track.clips).map((clip) => clip.id), ['episode-two-cut']);
      await page.getByRole('button', { name: '小说与分集工作台', exact: true }).click();
      const secondEpisodeSeries = page.getByRole('navigation', { name: '系列工程导航' });
      await secondEpisodeSeries.waitFor();
      await secondEpisodeSeries.locator('.wj-series-episodes > button').nth(0).click();
      page = await projectPage(episodeProjectId);
      const firstFilmAfterSwitch = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), episodeProjectId);
      assert.equal(firstFilmAfterSwitch.value.stage.w, 1080);
      assert.deepEqual(firstFilmAfterSwitch.value.tracks.flatMap((track) => track.clips).map((clip) => clip.id), ['episode-one-cut']);
      await page.getByRole('button', { name: '小说与分集工作台', exact: true }).click();
      await page.getByRole('button', { name: '返回系列策划', exact: true }).click();
      page = await projectPage(legacy.project.id);
      const secondFilmAfterSwitch = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}`)).json(), secondEpisodeProjectId);
      assert.equal(secondFilmAfterSwitch.value.stage.w, 1920);
      assert.deepEqual(secondFilmAfterSwitch.value.tracks.flatMap((track) => track.clips).map((clip) => clip.id), ['episode-two-cut']);
      console.log('Packaged two-episode creation, independent native timelines, switch and return passed without media tasks.');
    }
    if (process.env.WANJU_PACKAGE_TEST_PREVIEW) await page.screenshot({ path: `${process.env.WANJU_PACKAGE_TEST_PREVIEW}.workflow.png` });
    assert.equal(calls.every((path) => ['/api/public', '/api/me', '/api/login', '/api/activate', '/api/logout', '/api/media/config',
      '/api/cloud/projects', '/api/cloud/status', '/api/cloud/trash', '/api/cloud/projects/package-cloud-project/versions',
      '/api/cloud/projects/package-cloud-project/trash', '/api/cloud/projects/package-cloud-project/restore',
      '/api/cloud/projects/package-cloud-project/purge', '/api/cloud/storage/preview', '/api/cloud/storage/cleanup',
      '/api/cloud/projects/automatic-fixture-project', '/api/cloud/objects/check'].includes(path)
      || /^\/api\/cloud\/objects\/[a-f0-9]{64}$/.test(path)), true);
    const runtime = JSON.parse(await readFile(join(directory, 'data/wanju-run.json'), 'utf8'));
    assert.ok(runtime.origin);
    if (currentFeatures) {
      externalBrowser = await chromium.launch({ channel: 'msedge', headless: true });
      const externalPage = await externalBrowser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      externalPage.on('pageerror', (error) => errors.push(error.message));
      const key = (await readFile(join(directory, 'data/home/key'), 'utf8')).trim();
      const address = new URL(`/projects/${legacy.project.id}`, runtime.origin);
      address.searchParams.set('key', key);
      await externalPage.goto(address.href);
      await externalPage.getByRole('button', { name: '制作资产', exact: true }).waitFor({ timeout: 20000 });
      assert.equal(await externalPage.evaluate(() => Boolean(window.openfilmNative || window.openfilmHost)), false);
      assert.equal(await externalPage.locator('#of-chat').count(), 0);
      await externalPage.getByRole('button', { name: '制作资产', exact: true }).click();
      await externalPage.getByRole('dialog').getByText('Existing native project', { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log('External browser loads the editor without desktop-only APIs.');
    }
    console.log(JSON.stringify({ edition: student ? 'student' : 'teacher', startup: 'passed', nativeConfiguration: 'passed', projectSwitch: 'passed', nativeCreation: 'passed', workflowMigration: 'passed', directory }));
  } catch (error) {
    if (page && process.env.WANJU_PACKAGE_TEST_PREVIEW) {
      await page.screenshot({ path: `${process.env.WANJU_PACKAGE_TEST_PREVIEW}.failure.png`, timeout: 3000 }).catch(() => {});
    }
    throw error;
  } finally {
    await externalBrowser?.close();
    if (browser) {
      await Promise.race([
        (async () => { const session = await browser.newBrowserCDPSession(); await session.send('Browser.close'); })().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      await Promise.race([browser.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
    if (child.exitCode === null) {
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (child.exitCode === null) child.kill();
    }
    service.closeAllConnections();
    await new Promise((resolve) => service.close(resolve));
  }
});
