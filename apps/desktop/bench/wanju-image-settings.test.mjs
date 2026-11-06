import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import shellConfig from '../shell/vite.config.ts';

test('teacher configuration and student activation/own-media flow never submit generation', { timeout: 90_000 }, async () => {
  const server = await createServer({
    ...shellConfig, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [...shellConfig.plugins, { name: 'wanju-settings-fixture', configureServer(app) {
      app.middlewares.use('/wanju-settings-ui', (_req, res, next) => {
        res.setHeader('content-type', 'text/html');
        void app.transformIndexHtml('/wanju-settings-ui', '<!doctype html><html><body><div id="root"></div><script type="module" src="/bench/wanju-image-settings.tsx"></script></body></html>')
          .then((html) => res.end(html), next);
      });
    } }],
  });
  let browser;
  const errors = [], requests = [];
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const url = `http://127.0.0.1:${server.httpServer.address().port}/wanju-settings-ui`;
    const setup = async (studentEdition) => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        requests.push(path);
        if (path !== '/api/wanju/status') return route.abort();
        return route.fulfill({ json: { providers: [
          { id: 'image', configured: true }, { id: 'seedance', configured: true }, { id: 'h3_zm_nono', configured: true },
          { id: 'grok', configured: true }, { id: 'music', configured: true },
        ] } });
      });
      await page.addInitScript(({ studentEdition }) => {
        document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = 'dark'; });
        const saved = { image: [], seedance: [], h3: [] };
        const listeners = new Set();
        const state = {
          configured: true, authenticated: false, ownMediaEnabled: false,
          user: { id: 'fixture-one', username: 'teststudent', balance: 100 },
          chat: { enabled: true, authorized: false, displayName: '玩剧创作助手', priceVersion: 'one',
            inputPointsPerMillion: 100, outputPointsPerMillion: 200, reservePoints: 50 },
        };
        const snapshot = () => structuredClone(state);
        const change = () => { for (const listener of listeners) listener(); return snapshot(); };
        const config = (id, model) => ({
          get: async () => {
            if (studentEdition && (!state.authenticated || !state.ownMediaEnabled)) throw new Error('activation required');
            return { configured: true, model };
          },
          saveKey: async ({ key }) => { saved[id].push(key); return { configured: true, model }; },
        });
        window.settingsFixture = { saved, state, change, offline: false };
        window.openfilmNative = { wanju: {
          studentEdition, importConfigs: async () => ({ imported: 0 }),
          imageConfig: config('image', 'image-model-test'),
          seedanceConfig: config('seedance', 'doubao-seedance-2-0-260128'),
          h3Config: config('h3', 'minimax_h3_zm_nono'),
          account: {
            status: async () => { if (window.settingsFixture.offline) throw new Error('服务暂不可用'); return snapshot(); },
            activate: async () => { state.authenticated = true; return change(); },
            login: async () => { state.authenticated = true; return change(); },
            logout: async () => { state.authenticated = false; state.ownMediaEnabled = false; return change(); },
            setOwnMediaEnabled: async (enabled) => { state.ownMediaEnabled = enabled; return change(); },
            consent: async () => { state.chat.authorized = true; return change(); },
            onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
          },
        } };
      }, { studentEdition });
      await page.goto(url);
      return page;
    };
    const teacher = await setup(false);
    await teacher.getByText('图片生成', { exact: true }).waitFor();
    assert.equal(await teacher.getByText('图片生成', { exact: true }).count(), 1);
    assert.equal(await teacher.getByText(/备用线路/).count(), 0);
    for (const [name, field, id] of [
      ['图片生成', '图片 API 密钥', 'image'],
      ['视频 · 参考素材创作', '参考素材视频 API 密钥', 'seedance'],
      ['视频 · 首帧快拍', '首帧视频 API 密钥', 'h3'],
    ]) {
      await teacher.getByRole('button', { name: `配置${name}`, exact: true }).click();
      assert.doesNotMatch(await teacher.locator('body').innerText(), /AutoDL|火山方舟|Seedance|MiniMax|doubao-seedance|https:\/\/api\./);
      const input = teacher.getByLabel(field, { exact: true });
      assert.equal(await input.getAttribute('type'), 'password');
      await input.fill(`TEST_ONLY_${id}_KEY`);
      await teacher.getByRole('button', { name: '保存密钥', exact: true }).click();
      await teacher.getByRole('status').filter({ hasText: '密钥已保存。尚未发送' }).waitFor();
      assert.deepEqual(await teacher.evaluate((id) => window.settingsFixture.saved[id], id), [`TEST_ONLY_${id}_KEY`]);
      await teacher.getByRole('button', { name: `配置${name}`, exact: true }).click();
      assert.equal(await input.inputValue(), '');
      await teacher.getByRole('button', { name: '取消', exact: true }).click();
    }
    if (process.env.WANJU_SETTINGS_PREVIEW) await teacher.screenshot({ path: `${process.env.WANJU_SETTINGS_PREVIEW}-teacher.png`, fullPage: true });
    const student = await setup(true);
    await student.getByRole('button', { name: '前往激活 / 登录' }).waitFor();
    assert.equal(await student.getByRole('button', { name: '配置图片生成', exact: true }).count(), 0);
    await student.evaluate(() => { window.settingsFixture.state.authenticated = true; window.settingsFixture.change(); });
    await student.getByRole('button', { name: '启用自有服务', exact: true }).click();
    await student.getByRole('button', { name: '配置图片生成', exact: true }).waitFor();
    if (process.env.WANJU_SETTINGS_PREVIEW) await student.screenshot({ path: `${process.env.WANJU_SETTINGS_PREVIEW}-student.png`, fullPage: true });
    await student.getByRole('button', { name: '停用自有服务', exact: true }).click();
    assert.equal(await student.getByRole('button', { name: '配置图片生成', exact: true }).count(), 0);
    await student.goto(`${url}?account`);
    await student.getByRole('radio', { name: '首次激活', exact: true }).waitFor();
    await student.getByLabel('学员账号', { exact: true }).fill('teststudent');
    await student.getByLabel('密码', { exact: true }).fill('test-password-123');
    await student.getByLabel('激活码', { exact: true }).fill('WJA_TEST_ONLY');
    await student.getByRole('button', { name: '激活并登录', exact: true }).click();
    assert.equal(await student.getByRole('button', { name: '同意当前价格并启用', exact: true }).count(), 0);
    await student.getByText('已开通，按用量扣点', { exact: true }).first().waitFor();
    await student.evaluate(() => { window.settingsFixture.state.user.balance = 0; window.settingsFixture.change(); });
    await student.getByText('余额不足，请充值', { exact: true }).first().waitFor();
    await student.evaluate(() => { window.settingsFixture.offline = true; window.settingsFixture.change(); });
    await student.getByText('连接中断，权益待核实', { exact: true }).first().waitFor();
    if (process.env.WANJU_SETTINGS_PREVIEW) await student.screenshot({ path: `${process.env.WANJU_SETTINGS_PREVIEW}-account.png`, fullPage: true });
    assert.equal(requests.every((path) => path === '/api/wanju/status'), true);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});
