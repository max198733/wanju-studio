import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createStudentService } from '../../wanju-service/server.mjs';

test('real desktop enables wallet chat on login, switches tiers in one click and blocks insufficient points', { timeout: 180000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wanju-wallet-desktop-'));
  const root = fileURLToPath(new URL('..', import.meta.url));
  const artifact = process.env.WANJU_WALLET_ARTIFACTS || join(directory, 'artifacts');
  mkdirSync(artifact, { recursive: true });
  const requests = [], gatewayRequests = [];
  const supplierKey = 'local-only-shared-supplier-test-key';
  const adminSecret = 'local-only-wallet-admin-test-secret-12345';
  const { server, store } = createStudentService({
    adminSecret, cloudDirectory: join(directory, 'cloud'),
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://supplier.example/v1/responses');
      assert.equal(init.headers.authorization, `Bearer ${supplierKey}`);
      const body = JSON.parse(init.body);
      requests.push(body);
      assert.equal(body.model, 'local-mock-model');
      assert.equal(JSON.stringify(body).includes(supplierKey), false);
      const first = requests.length === 1;
      const item = first
        ? { id: 'fc_write', type: 'function_call', call_id: 'call_write', name: 'write',
          arguments: JSON.stringify({ path: 'wallet-proof.txt', content: 'shared gateway tools work' }), status: 'completed' }
        : { id: 'msg_done', type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'Wallet flow completed.', annotations: [] }] };
      const events = [
        { type: 'response.created', response: { id: `r${requests.length}`, status: 'in_progress', model: body.model } },
        { type: 'response.output_item.added', output_index: 0, item: first ? { ...item, arguments: '' } : { ...item, content: [] } },
        ...(first
          ? [{ type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: item.arguments }]
          : [{ type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] } },
          { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Wallet flow completed.' }]),
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `r${requests.length}`, status: 'completed', model: body.model,
          output: [item], usage: { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 } } },
      ];
      return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  server.on('request', (req) => { if (req.url.startsWith('/v1/')) gatewayRequests.push(req.url); });
  const settings = { enabled: true, baseUrl: 'https://supplier.example/v1', model: 'local-mock-model', key: supplierKey,
    format: 'responses', billingMode: 'wallet', visionVerified: true,
    inputPointsPerMillion: 1000, outputPointsPerMillion: 2000, reservePoints: 50 };
  store.saveChat(settings);
  for (const tier of ['claude', 'claude-max']) store.saveChat({ ...settings, tier,
    key: `isolated-${tier}-key`, inputPointsPerMillion: 1200, outputPointsPerMillion: 2400,
    reservePoints: 50, displayName: `玩剧创作助手 · ${tier === 'claude' ? '增强档' : '高阶档'}` });
  const recharge = store.createCodes({ kind: 'recharge', count: 1, points: 1000 })[0].code;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const launcher = join(directory, 'launcher');
  mkdirSync(launcher);
  writeFileSync(join(launcher, 'package.json'), JSON.stringify({
    name: 'wanju-wallet-test', version: '0.0.0', type: 'module', main: join(root, 'src/wanju-main.mjs'),
  }));
  const brief = join(directory, 'brief.txt');
  writeFileSync(brief, 'Isolated test attachment.');
  const env = { ...process.env, WANJU_DATA_DIR: join(directory, 'data'), WANJU_LIBRARY: join(directory, 'projects'),
    WANJU_CONFIG_DIR: join(directory, 'providers'), WANJU_EXPORTS: join(directory, 'exports'),
    WANJU_STUDENT_SERVICE_URL: `http://127.0.0.1:${server.address().port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page, packagedChild;
  try {
    if (process.env.WANJU_WALLET_EXECUTABLE) {
      const portServer = createServer();
      portServer.listen(0, '127.0.0.1');
      await once(portServer, 'listening');
      const port = portServer.address().port;
      await new Promise((resolve) => portServer.close(resolve));
      packagedChild = spawn(process.env.WANJU_WALLET_EXECUTABLE,
        [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: root, env, stdio: 'ignore', windowsHide: true });
      let browser;
      for (let attempt = 0; attempt < 180; attempt++) {
        if (packagedChild.exitCode !== null) throw new Error(`Packaged app exited: ${packagedChild.exitCode}`);
        try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 750 }); break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
      }
      assert.ok(browser, 'Packaged app must start');
      app = { context: () => browser.contexts()[0], close: () => browser.close() };
    } else {
      app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [launcher], cwd: root, env });
    }
    for (let i = 0; i < 300; i++) {
      page = app.context().pages().find((p) => /\/projects\/[\w-]+/.test(p.url()));
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(page, 'The isolated project must open');
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => window.openfilmNative.setLanguage('zh-CN'));
    const editor = page.locator('[data-prompt-editor]');
    await editor.waitFor();
    const panel = page.getByRole('region', { name: '制作状态', exact: true });
    await panel.getByText('登录后即可使用玩剧积分助手', { exact: true }).waitFor();
    await editor.fill('Write wallet-proof.txt in this isolated project.');
    await page.locator('input[type=file][multiple]').setInputFiles(brief);
    await editor.press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: '创建并登录', exact: true }).waitFor();
    assert.equal(requests.length, 0);
    await page.getByRole('dialog').getByRole('textbox', { name: '玩剧账号', exact: true }).fill('wallet-creator');
    await page.getByLabel('密码', { exact: true }).fill('wallet-local-test-password');
    await page.getByRole('button', { name: '创建并登录', exact: true }).click();
    await page.getByLabel('充值卡密', { exact: true }).fill(recharge);
    await page.getByRole('button', { name: '充值', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="账户与权益"]')?.textContent.includes('1000点'));
    assert.equal(await page.getByRole('button', { name: '同意当前价格并启用', exact: true }).count(), 0);
    await page.getByText('已开通，按用量扣点', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await editor.innerText(), 'Write wallet-proof.txt in this isolated project.');
    await page.getByText('brief.txt', { exact: true }).first().waitFor();
    await panel.getByText('按玩剧积分结算', { exact: true }).waitFor();
    const project = await page.evaluate(async () => (await fetch(`/api/projects/${location.pathname.split('/')[2]}`).then((r) => r.json())).project);
    await editor.press('Enter');
    await page.getByText('Wallet flow completed.', { exact: true }).first().waitFor({ timeout: 60000 });
    const account = page.getByRole('button', { name: '账户与权益', exact: true });
    await page.waitForFunction(() => document.querySelector('[aria-label="账户与权益"]')?.textContent.includes('994点'), null, { timeout: 10000 });
    assert.match(await account.innerText(), /994点/);
    assert.equal(readFileSync(join(project.path, 'wallet-proof.txt'), 'utf8'), 'shared gateway tools work');
    assert.equal(requests.length, 2);
    assert.equal(gatewayRequests.length, 2);
    for (const path of gatewayRequests) assert.match(path, /^\/v1\/tier\/base\/[a-f0-9]{64}\/responses$/);
    const user = store.overview().users.find((item) => item.username === 'wallet-creator');
    const wallet = store.wallet(user.id);
    assert.equal(wallet.user.balance, 994);
    assert.equal(wallet.heldPoints, 0);
    assert.deepEqual(wallet.operations.map((op) => op.charged), [3, 3]);
    const choices = JSON.parse(readFileSync(join(directory, 'data/agents.json'), 'utf8'));
    assert.deepEqual(choices.byok.models.map((m) => m.model), ['wanju-creative']);
    assert.equal(JSON.stringify(choices).includes(supplierKey), false);
    await page.screenshot({ path: join(artifact, 'wallet-settled.png'), fullPage: true });

    // Refreshing prices retains access without submitting a model request.
    store.saveChat({ ...settings, inputPointsPerMillion: 1100 });
    await page.evaluate(() => window.openfilmNative.wanju.account.status());
    await panel.getByText('按玩剧积分结算', { exact: true }).waitFor();
    assert.equal(store.studentChat(user.id).authorized, true);
    assert.equal(await page.getByRole('button', { name: '同意当前价格并启用', exact: true }).count(), 0);
    assert.equal(requests.length, 2);
    await editor.fill('Keep this draft while switching tiers.');
    await page.getByRole('button', { name: '创作档位', exact: true }).click();
    const tiers = page.getByRole('dialog', { name: '选择创作档位', exact: true });
    assert.equal(await tiers.getByRole('button', { name: /确认并使用/ }).count(), 0);
    await tiers.getByRole('button', { name: '增强档', exact: true }).click();
    await page.getByRole('button', { name: '创作档位', exact: true }).getByText('增强档').waitFor();
    const selected = store.studentChat(user.id);
    assert.equal(selected.selectedTier, 'claude');
    assert.equal(selected.authorized, true);
    assert.equal(requests.length, 2, 'changing tiers does not send a paid request');
    assert.equal(await editor.innerText(), 'Keep this draft while switching tiers.');
    const afterTier = JSON.parse(readFileSync(join(directory, 'data/agents.json'), 'utf8'));
    assert.match(afterTier.byok.models[0].baseUrl, /\/v1\/tier\/claude\/[a-f0-9]{64}$/);
    await page.getByRole('button', { name: '创作档位', exact: true }).click();
    await page.screenshot({ path: join(artifact, 'tier-picker.png'), fullPage: true });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '账户与权益', exact: true }).click();
    await page.getByRole('combobox', { name: '创作档位', exact: true }).selectOption('base');
    await page.waitForFunction(() => window.openfilmNative.wanju.account.status().then((state) => state.chat.selectedTier === 'base'));
    assert.equal(await page.getByRole('button', { name: /确认并使用/ }).count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(store.studentChat(user.id).selectedTier, 'base');
    assert.equal(requests.length, 2);

    store.db.prepare('UPDATE users SET balance=0 WHERE id=?').run(user.id);
    await editor.fill('Keep this draft until I recharge.');
    await editor.press('Enter');
    await page.getByRole('alert').filter({ hasText: '玩剧点余额不足，本次请求未发送，请充值后继续。' }).waitFor();
    await page.getByRole('button', { name: '去充值', exact: true }).click();
    await page.getByRole('heading', { name: '云端账户与充值', exact: true }).waitFor();
    await page.getByText('余额不足，请充值', { exact: true }).first().waitFor();
    assert.equal(requests.length, 2, 'insufficient points must not contact the supplier');
    assert.equal(store.wallet(user.id).heldPoints, 0);
    assert.equal(store.wallet(user.id).operations.length, 2);
    await page.screenshot({ path: join(artifact, 'wallet-insufficient.png'), fullPage: true });
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    const result = { passed: true, initialBalance: 1000, finalBalance: 994, modelRequests: requests.length,
      pointsCharged: 6, heldPoints: 0, realLocalWrite: true, supplierKeyInClient: false,
      draftAndAttachmentPreserved: true, automaticActivation: true, priceRefreshWithoutConfirmation: true,
      tierSelectionOneClick: true, accountTierSelectionImmediate: true, insufficientPointsBlocked: true,
      tierChangeSentPaidRequests: false, externalPaidCalls: 0 };
    writeFileSync(join(artifact, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: join(artifact, 'failed.png'), fullPage: true }).catch(() => {});
      writeFileSync(join(artifact, 'failed.txt'), await page.locator('body').innerText().catch(() => 'Page closed'));
    }
    console.error(`Wallet artifacts: ${artifact}`);
    throw error;
  } finally {
    if (packagedChild && page && !page.isClosed()) await page.keyboard.press('Control+q').catch(() => {});
    await app?.close();
    if (packagedChild) {
      for (let i = 0; i < 12 && packagedChild.exitCode === null; i++) await new Promise((resolve) => setTimeout(resolve, 250));
      if (packagedChild.exitCode === null) {
        try { execFileSync('taskkill', ['/PID', String(packagedChild.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); }
        catch { packagedChild.kill(); }
      }
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});
