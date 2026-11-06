import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { root } from './client.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('legacy MCP hosts can initialize and discover the same tools', { timeout: 20000 }, async () => {
  const child = spawn(process.execPath, [join(root, 'integrations/agent/server.mjs')], {
    cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const messages = createInterface({ input: child.stdout });
  const waiter = new Map();
  messages.on('line', (line) => {
    const message = JSON.parse(line);
    if (message.id !== undefined) { waiter.get(message.id)?.(message); waiter.delete(message.id); }
  });
  const send = (id, method, params) => new Promise((resolve) => {
    waiter.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    const result = await send(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy-host-check', version: '1.0.0' } });
    assert.equal(result.result.protocolVersion, '2025-11-25');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const tools = await send(2, 'tools/list', {});
    const names = new Set(tools.result.tools.map((tool) => tool.name));
    for (const name of ['wanju_create', 'wanju_assemble', 'wanju_open', 'wanju_read_guide']) assert.ok(names.has(name), `missing ${name}`);
    assert.ok(tools.result.tools.length >= 14);
    const tool = (name) => tools.result.tools.find((entry) => entry.name === `wanju_${name}`);
    assert.equal(tool('list').annotations.readOnlyHint, true);
    assert.equal(tool('list').annotations.idempotentHint, true);
    for (const name of ['save', 'save_assets', 'enable_workflow', 'query_task']) {
      assert.equal(tool(name).annotations.readOnlyHint, false);
      assert.equal(tool(name).annotations.destructiveHint, true);
    }
    assert.equal(tool('assemble').annotations.destructiveHint, false);
    assert.equal(tool('generate_video').annotations.openWorldHint, true);
    const required = tool('save').inputSchema.properties.state.properties.shots.items.required;
    assert.ok(required.includes('duration'));
    assert.ok(!required.includes('media'), 'an ungenerated shot may omit media');
    const episodeSchema = tool('save_story').inputSchema.properties.episodes.items;
    assert.equal(episodeSchema.properties.archived.type, 'boolean');
    assert.ok(!episodeSchema.required.includes('archived'), 'existing episode payloads remain compatible');
    assert.match(tool('open').description, /desktop app/);
  } finally {
    child.stdin.end();
    const killTimer = setTimeout(() => child.kill(), 3000);
    try { await exited; } finally { clearTimeout(killTimer); messages.close(); }
  }
});

test('workflow guide loads only the selected phase and named policy', { timeout: 20000 }, async () => {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [join(root, 'integrations/agent/server.mjs')], cwd: root,
  });
  const client = new Client({ name: 'workflow-guide-check', version: '0.1.0' });
  try {
    await client.connect(transport);
    const read = async (args) => {
      const result = await client.callTool({ name: 'wanju_read_guide', arguments: args });
      assert.ok(!result.isError, result.content[0].text);
      return JSON.parse(result.content[0].text);
    };
    const summary = await read({ guide: 'S3' });
    assert.equal(summary.phases.length, 3);
    assert.ok(summary.phases.every((phase) => !phase.rules));
    const phase = await read({ guide: 'S3', phase: '3a' });
    assert.equal(phase.phases.length, 1);
    assert.equal(phase.phases[0].phase_id, '3a');
    assert.ok(phase.phases[0].rules.length > 0);
    const policy = await read({ guide: 'S3', policy: summary.policy_keys[0] });
    assert.ok(policy.content);
    const invalid = await client.callTool({ name: 'wanju_read_guide', arguments: { guide: 'S3', phase: '7a' } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); await transport.close(); }
});

test('real MCP conversation tools persist a storyboard, assemble and export local media', { timeout: 240000 }, async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'wanju-mcp-media-'));
  const transport = new StdioClientTransport({
    command: process.execPath, args: [join(root, 'integrations/agent/server.mjs')], cwd: root, stderr: 'pipe',
    env: { ...process.env, WANJU_DATA_DIR: join(fixtureDir, 'state'), WANJU_CONFIG_DIR: join(fixtureDir, 'providers'),
      OPENFILM_HOME: join(fixtureDir, 'state/home'), OPENFILM_SHARED_HOME: join(fixtureDir, 'state/home'),
      OPENFILM_LIBRARY: join(fixtureDir, 'projects'), OPENFILM_EXPORTS: join(fixtureDir, 'exports'),
      OPENFILM_SAVED: join(fixtureDir, 'saved') },
  });
  let errors = '';
  transport.stderr.on('data', (chunk) => { errors += chunk; });
  const client = new Client({ name: 'wanju-integration-check', version: '0.1.0' });
  const ffmpeg = join(root, '.local/tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe');
  const videoFiles = ['red', 'blue'].map((color) => join(fixtureDir, `${color}.mp4`));
  const call = async (action, args = {}) => {
    const result = await client.callTool({ name: `wanju_${action}`, arguments: args });
    assert.ok(!result.isError, result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
  };
  try {
    for (const [index, color] of ['red', 'blue'].entries()) {
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
        `color=c=${color}:s=320x240:r=25:d=2`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', '-y', videoFiles[index]], { stdio: 'pipe' });
    }
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.length >= 14);
    assert.match(tools.tools.find((tool) => tool.name === 'wanju_assemble')?.description ?? '', /ONLY when the person explicitly requests/i);
    const guide = await client.readResource({ uri: 'wanju://creator' });
    assert.match(guide.contents[0].text, /The user is a creator/);
    const prompt = await client.getPrompt({ name: 'create-video', arguments: { idea: '用现有图片做一个4秒验收片，不调用付费接口。' } });
    assert.match(prompt.messages[0].content.text, /4秒验收片/);
    const workflow = await client.callTool({ name: 'wanju_read_guide', arguments: { guide: 'workflow_contract' } });
    assert.ok(!workflow.isError);
    const supportIndex = await client.callTool({ name: 'wanju_read_guide', arguments: { guide: 'workflow_support' } });
    assert.ok(!supportIndex.isError);
    const support = JSON.parse(supportIndex.content[0].text);
    assert.ok(support.by_stage.project_layout);
    assert.ok(support.sections.project_layout);
    assert.equal(JSON.stringify(support).includes('"content":'), false);
    const supportSection = await client.callTool({
      name: 'wanju_read_guide',
      arguments: { guide: 'workflow_support', section: 'local_execution_environment' },
    });
    assert.ok(!supportSection.isError, supportSection.content[0].text);
    const selectedSupport = JSON.parse(supportSection.content[0].text);
    assert.equal(selectedSupport.section, 'local_execution_environment');
    assert.ok(selectedSupport.content);
    assert.equal(selectedSupport.by_stage, undefined);
    const status = await call('status');
    assert.equal(status.paid_calls_require_confirmation, true);
    const noSpend = await client.callTool({
      name: 'wanju_generate_image', arguments: { project_id: 'not-called', revision: 'not-called', shot_id: 'S001', confirm_spend: false },
    });
    assert.equal(noSpend.isError, true);
    const created = await call('create', { name: '对话工具验收 · 本地素材', ratio: '16:9' });
    const id = created.project.id;
    const first = await call('import', { project_id: id, file: videoFiles[0] });
    const second = await call('import', { project_id: id, file: videoFiles[1] });
    assert.notEqual(first.path, second.path);
    assert.equal(second.state.shots.length, 2);
    const state = { ...second.state, script: '工具验收：AGI 可保存真实剧本和分镜，使用现有素材建立初剪并导出。不是 AI 生成短剧。' };
    state.shots = state.shots.map((shot, i) => ({
      ...shot, title: i ? '蓝色收尾' : '红色开场', duration: 2,
      description: i ? '本地生成的蓝色测试片段，收尾。' : '本地生成的红色测试片段，开场。',
    }));
    const saved = await call('save', { project_id: id, revision: second.rev, state });
    const conflict = await client.callTool({
      name: 'wanju_save', arguments: { project_id: id, revision: second.rev, state: { ...state, title: 'must not overwrite' } },
    });
    assert.equal(conflict.isError, true);
    assert.equal(JSON.parse(conflict.content[0].text).status, 409);
    const persisted = await call('get', { project_id: id });
    assert.equal(persisted.rev, saved.rev);
    assert.equal(persisted.state.script, state.script);
    const cut = await call('assemble', { project_id: id, revision: saved.rev });
    assert.notEqual(cut.project.id, id);
    const exported = await call('export', { project_id: cut.project.id });
    let job = exported.export;
    for (let i = 0; i < 180 && ['waiting', 'running'].includes(job.status); i++) {
      await delay(1000);
      const jobs = await call('exports', { project_id: cut.project.id });
      job = jobs.exports.find((entry) => entry.id === job.id);
      assert.ok(job);
    }
    assert.equal(job.status, 'done', job.error);
    assert.ok((await stat(job.out)).size > 1000);
    assert.ok(!(await call('get', { project_id: id })).tasks.length);
    const session = (await readFile(join(fixtureDir, 'state/home/key'), 'utf8')).trim();
    assert.ok(!JSON.stringify(persisted).includes(session));
    assert.equal(errors, '');
    const folder = join(root, 'work/verification');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'agent-result.json'), JSON.stringify({
      passed: true, checkedAt: new Date().toISOString(), tools: tools.tools.length, sourceProject: id,
      cutProject: cut.project.id, out: job.out, paidGenerationCalls: 0,
      checks: ['MCP stdio handshake', 'tools list', 'creator resource', 'creative prompt', 'workflow reference',
        'fee refusal', 'create', 'import', 'save', '409 preservation', 'read persistence', 'assemble new cut', 'actual MP4 export', 'no session-key output'],
    }, null, 2));
  } finally {
    await client.close();
    await transport.close();
    try {
      const run = JSON.parse(await readFile(join(fixtureDir, 'state/wanju-run.json'), 'utf8'));
      if (Number.isInteger(run.pid) && run.pid > 0) process.kill(run.pid);
    } catch { /* The isolated server may already have closed. */ }
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
