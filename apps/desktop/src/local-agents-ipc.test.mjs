import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLog } from './chat-store.mjs';
import { agentProblem, registerLocalAgentIpc, sentError, turnModel } from './local-agents-ipc.mjs';

test("a start that fails is written in the log of the turn it was for, with why", async () => {
  const handlers = new Map();
  registerLocalAgentIpc({ handle: (channel, fn) => handlers.set(channel, fn) }, { trusted: () => true });
  const project = mkdtempSync(join(tmpdir(), 'openfilm-ipc-'));
  const event = { sender: { once() {}, isDestroyed: () => false, send() {} } };
  /* the own key with no models set up: refused before anything starts */
  const r = await handlers.get('desktop:local-agents:start')(event, { agent: 'byok', cwd: project, meta: { turnId: 'local:startfail1' } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not-ready');
  let start;
  const deadline = Date.now() + 3000;
  while (!start && Date.now() < deadline) {
    start = readLog(project, 'local:startfail1')?.events.find((e) => e.kind === 'start');
    if (!start) await new Promise((done) => setTimeout(done, 10));
  }
  assert.ok(start, 'the turn has a log');
  assert.equal(start.ok, false);
  assert.equal(start.error, r.error);
  assert.equal(start.agent, 'byok');
  assert.equal(start.meta.turnId, 'local:startfail1');
});

test('an agent that failed, as its problem is kept: its name, why, the step, the last of its stderr and its turn\'s log', () => {
  const session = { stderr: 'a\nb\nc\nd\ne\nError: write EPIPE\n' };
  const e = Object.assign(new Error('ACP connection closed'), { code: -32603 });
  assert.deepEqual(agentProblem({ agent: 'codex', cwd: '/p/Film', session }, 'prompt', e, 'local:abc'), {
    area: 'agent', agent: 'Codex', agentId: 'codex', what: 'ACP connection closed', step: 'prompt', code: '-32603',
    project: '/p/Film', log: join('/p/Film', '.film', 'logs', 'local-abc.jsonl'), stderr: 'b\nc\nd\ne\nError: write EPIPE',
  });
  /* a session that says how it failed (agents.mjs `failure()`): its step, program and own logs */
  const told = { failure: () => ({ step: 'session/new', program: '/x/codex', stderr: '', ownLogs: '/h/.codex' }) };
  assert.deepEqual(agentProblem({ agent: 'codex', cwd: '/p/Film', session: told }, 'start', new Error('Internal error')), {
    area: 'agent', agent: 'Codex', agentId: 'codex', what: 'Internal error', step: 'session/new', project: '/p/Film', program: '/x/codex', ownLogs: '/h/.codex',
  });
  assert.equal(agentProblem({ agent: 'byok', cwd: '/p' }, 'start', 'no models').agent, 'Own key');
});

test('the error as the agent sent it, under any rewording on the way; none when it sent none', () => {
  const sent = Object.assign(new Error('Internal error'), { code: -32603, data: { details: 'stream closed' } });
  const reworded = new Error('Codex stopped while answering without saying why.', { cause: new Error('stream closed', { cause: sent }) });
  assert.deepEqual(sentError(reworded), { code: -32603, message: 'Internal error', data: { details: 'stream closed' } });
  assert.equal(sentError(new Error('not installed')), null);
});

test("a Copilot turn's model, read once its usage record has reached the file; another agent's turn doesn't wait", async () => {
  const home = mkdtempSync(join(tmpdir(), 'openfilm-copilot-'));
  mkdirSync(join(home, 'session-state', 'cop-24680'), { recursive: true });
  const file = join(home, 'session-state', 'cop-24680', 'events.jsonl');
  const from = Date.now();
  const at = (ms) => new Date(from + ms).toISOString();
  writeFileSync(file, `${JSON.stringify({ type: 'user.message', data: { content: 'Make a title' }, timestamp: at(0) })}
`);
  /* a one-request turn: Copilot writes the request's usage record a moment after the prompt has answered */
  const usage = { type: 'session.usage_record', timestamp: at(50), data: { usage: { model: 'gpt-6-luna', modelDisplayName: 'GPT-6 Luna', apiCallId: 'a1' } } };
  setTimeout(() => appendFileSync(file, `${JSON.stringify(usage)}
`), 200);
  const env = { COPILOT_HOME: home };
  assert.equal(await turnModel({ agent: 'copilot', sessionId: 'cop-24680', from, env }), 'GPT-6 Luna');

  const started = Date.now();
  assert.equal(await turnModel({ agent: 'claude', sessionId: 'cop-24680', from, env }), null);
  assert.ok(Date.now() - started < 100, 'not waited for');
});
