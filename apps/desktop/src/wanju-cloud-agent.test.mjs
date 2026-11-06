import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentSession } from './agents.mjs';
import { createStudentService } from '../../wanju-service/server.mjs';

test('the real local assistant executes a Responses function call through the account gateway and returns its result', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-cloud-agent-'));
  const requests = [];
  const service = createStudentService({
    adminSecret: 'isolated-cloud-assistant-test-secret-only',
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.authorization, 'Bearer supplier-key-only-in-test-server');
      const body = JSON.parse(init.body);
      requests.push(body);
      const first = requests.length === 1;
      const probe = requests.length === 2;
      assert.equal(body.model, 'gpt-6.1-sol');
      const item = first
        ? { id: 'fc_write', type: 'function_call', call_id: 'call_write', name: 'write',
          arguments: JSON.stringify({ path: 'draft.txt', content: 'native code workflow test' }), status: 'completed' }
        : probe ? { id: 'fc_bash', type: 'function_call', call_id: 'call_bash', name: 'bash',
          arguments: JSON.stringify({ command: 'node -p "JSON.stringify({exposed:Object.keys(process.env).some(k=>k.startsWith(\'OPENFILM_BYOK_KEY_\')),preserved:process.env.WANJU_TEST_SHELL_VALUE===\'kept\'})"' }),
          status: 'completed' }
        : { id: 'msg_done', type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: '完成', annotations: [] }] };
      const toolCall = first || probe;
      const events = [
        { type: 'response.created', response: { id: `r${requests.length}`, status: 'in_progress', model: body.model } },
        { type: 'response.output_item.added', output_index: 0,
          item: toolCall ? { ...item, arguments: '' } : { ...item, content: [] } },
        ...(toolCall
          ? [{ type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: item.arguments }]
          : [{ type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] } },
          { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: '完成' }]),
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `r${requests.length}`, status: 'completed', model: body.model,
          output: [item], usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20,
            input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
      ];
      return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  service.store.saveChat({ enabled: true, baseUrl: 'https://supplier.example/v1', key: 'supplier-key-only-in-test-server',
    model: 'gpt-6.1-sol', format: 'responses', billingMode: 'included', visionVerified: true });
  const account = service.store.register({ username: 'internal-creator', password: 'local-test-password' });
  service.server.listen(0, '127.0.0.1'); await once(service.server, 'listening');
  const session = new AgentSession({
    agent: 'byok', cwd: directory,
    onPermission: async ({ options }) => options.find((option) => option.kind === 'allow_once')?.optionId,
    harness: {
      home: join(directory, 'agent-home'),
      models: [{ id: 'cloud', name: '玩剧创作助手', api: 'openai-responses',
        baseUrl: `http://127.0.0.1:${service.server.address().port}/v1`, keyEnv: 'OPENFILM_BYOK_KEY_cloud',
        model: 'wanju-creative', context: 32000, maxOutputTokens: 4096, levels: ['auto'], effort: 'auto' }],
      model: 'cloud', env: { OPENFILM_BYOK_KEY_cloud: account.token, WANJU_TEST_SHELL_VALUE: 'kept' },
    },
  });
  try {
    await session.start();
    await session.prompt([{ type: 'text', text: 'Write draft.txt in this test folder.' }]);
    assert.equal(await readFile(join(directory, 'draft.txt'), 'utf8'), 'native code workflow test');
    assert.equal(requests.length, 3);
    assert.ok(requests[1].input.some((item) => item.type === 'function_call_output' && item.call_id === 'call_write'));
    const probe = requests[2].input.find((item) => item.type === 'function_call_output' && item.call_id === 'call_bash');
    assert.ok(probe, 'the command result must return through the real gateway');
    assert.match(probe.output, /"exposed":false/);
    assert.match(probe.output, /"preserved":true/);
    assert.ok(!JSON.stringify(requests).includes(account.token), 'the account credential must never enter model context');
    assert.ok(!(await readFile(join(directory, 'agent-home', 'models.json'), 'utf8')).includes(account.token));
    assert.ok(!(await readFile(join(directory, 'agent-home', 'auth.json'), 'utf8')).includes(account.token));
    assert.equal(service.store.wallet(account.user.id).user.balance, 0);
    assert.ok(service.store.wallet(account.user.id).operations.every((operation) => operation.charged === 0));
  } finally {
    session.close();
    service.server.closeAllConnections(); await new Promise((done) => service.server.close(done)); service.store.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
