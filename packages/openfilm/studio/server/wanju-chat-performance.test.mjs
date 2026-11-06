import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readChatPerformance } from './wanju-chat-performance.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wanju-chat-time-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, '.film', 'logs');
  await mkdir(dir, { recursive: true });
  return { root, dir };
}
const jsonl = (rows) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';

test('reports actual model, effort and request timing without returning private transcript content', async (t) => {
  const { root, dir } = await fixture(t);
  await writeFile(join(dir, 'turn-one.jsonl'), jsonl([
    { t: 1000, kind: 'prompt', agent: 'codex', text: 'private-script',
      session: { models: { currentModelId: 'test-model[xhigh]' } } },
    { t: 1500, kind: 'update', update: { sessionUpdate: 'tool_call', rawInput: 'secret-key' } },
    { t: 2000, kind: 'update', update: { sessionUpdate: 'usage_update', used: 91000, size: 200000 } },
    { t: 10000, kind: 'done', ok: true },
  ]));
  await writeFile(join(dir, 'turn-one.model.jsonl'), jsonl([
    { startedAt: 1000, ms: 4000, prefix: 0, messages: [{ content: 'private-script' }],
      systemPrompt: 'https://secret.invalid/token', answer: { responseModel: 'test-model', thinkingLevel: 'xhigh',
        usage: { input: 2000, cacheRead: 90000, output: 300 } } },
    { startedAt: 3000, ms: 5000, prefix: 1, answer: { usage: { input: 3000, cacheRead: 90000, output: 200 } } },
  ]));
  const result = await readChatPerformance(root);
  const turn = result.turns[0];
  assert.deepEqual(turn.models, ['test-model']);
  assert.deepEqual(turn.efforts, ['xhigh']);
  assert.equal(turn.modelMs, 9000);
  assert.equal(turn.modelWallMs, 7000);
  assert.equal(turn.observedMs, 9000);
  assert.equal(turn.maxInputTokens, 93000);
  assert.equal(turn.currentContextTokens, 91000);
  assert.equal(turn.outputTokens, 500);
  assert.equal(turn.tools, 1);
  assert.deepEqual(turn.warnings, ['long-context', 'high-reasoning-effort']);
  assert.doesNotMatch(JSON.stringify(result), /private-script|secret-key|secret\.invalid/);
});

test('does not interpret missing model logs or an unfinished turn as zero latency', async (t) => {
  const { root, dir } = await fixture(t);
  await writeFile(join(dir, 'running.jsonl'), jsonl([
    { t: 1000, kind: 'prompt', agent: 'byok' },
    { t: 5000, kind: 'update', update: { sessionUpdate: 'usage_update', used: 12345 } },
  ]) + '{"t":');
  const result = await readChatPerformance(root);
  assert.equal(result.turns[0].status, 'incomplete');
  assert.equal(result.turns[0].requests, 0);
  assert.equal(result.turns[0].medianModelMs, null);
  assert.equal(result.turns[0].modelWallMs, null);
  assert.equal(result.turns[0].observedMs, 4000);
});

test('bounded reads tolerate oversized, corrupt and absent logs', async (t) => {
  const { root, dir } = await fixture(t);
  await writeFile(join(dir, 'large.jsonl'), jsonl([{ t: 1, kind: 'prompt', agent: 'codex' }]));
  await writeFile(join(dir, 'large.model.jsonl'), jsonl([{ ms: 50, messages: ['x'.repeat(2048)] }]));
  const result = await readChatPerformance(root, { maxBytes: 256 });
  assert.equal(result.turns[0].partial, true);
  assert.equal(result.turns[0].requests, 0);
  assert.deepEqual((await readChatPerformance(join(root, 'missing'))).turns, []);
});

test('invalid labels and invalid numeric usage cannot leak values or distort totals', async (t) => {
  const { root, dir } = await fixture(t);
  await writeFile(join(dir, 'invalid.jsonl'), jsonl([{ t: 1000, kind: 'prompt', agent: 'https://secret.invalid' }]));
  await writeFile(join(dir, 'invalid.model.jsonl'), jsonl([
    { ms: -10, answer: { usage: { input: 500000 } } },
    { ms: 100, answer: { responseModel: 'https://secret.invalid', thinkingLevel: 'secret value',
      usage: { input: -100, cacheRead: '1234', output: 1 } } },
  ]));
  const turn = (await readChatPerformance(root)).turns[0];
  assert.equal(turn.agent, null);
  assert.deepEqual(turn.models, []);
  assert.deepEqual(turn.efforts, []);
  assert.equal(turn.maxInputTokens, 0);
  assert.equal(turn.requests, 1);
});
