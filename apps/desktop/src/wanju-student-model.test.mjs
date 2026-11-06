import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoster, readChoices } from './agent-roster.mjs';
import { modelsJson } from './pi-config.mjs';

test('student model installs without a paid probe, preserves output cap after restart, and refresh is a no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wanju-roster-test-'));
  let probes = 0, closures = 0;
  const options = { dataDir: dir, localAgents: async () => [], openSignIn: async () => ({ ok: true }),
    closeSessions: () => closures++, seal: (text) => Buffer.from(`test:${text}`), unseal: (bytes) => bytes.toString().slice(5),
    onChange() {}, fetch: async () => { probes++; throw new Error('paid probes forbidden'); } };
  try {
    const model = { name: '玩剧创作助手', baseUrl: 'http://127.0.0.1:4890/v1', model: 'wanju-creative', key: 'wjs_test_student_token',
      context: 32000, maxOutputTokens: 4096 };
    const roster = createRoster(options);
    roster.installStudentModel(model);
    const configured = readChoices(dir).byok.models[0];
    assert.equal(configured.id, 'wanjustudent');
    assert.equal(configured.maxOutputTokens, 4096);
    assert.equal(closures, 1);
    roster.installStudentModel(model);
    assert.equal(closures, 1);
    const restarted = createRoster(options);
    restarted.installStudentModel(model);
    assert.equal(closures, 1);
    const harness = restarted.harness('byok');
    const definition = Object.values(modelsJson(harness.models).providers)[0].models[0];
    assert.equal(definition.maxTokens, 4096);
    assert.equal(probes, 0);
    assert.throws(() => restarted.installStudentModel({ ...model, format: 'unsupported' }), /protocol/);
    restarted.installStudentModel({ ...model, format: 'responses' });
    assert.equal(readChoices(dir).byok.models[0].format, 'responses');
    const responseModels = createRoster(options).harness('byok').models;
    assert.equal(responseModels[0].api, 'openai-responses');
    assert.deepEqual(responseModels[0].levels, ['auto']);
    assert.equal(responseModels[0].maxOutputTokens, 4096);
    assert.equal(probes, 0);
    restarted.removeOwnModel('wanjustudent');
    assert.equal(restarted.harness('byok'), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
