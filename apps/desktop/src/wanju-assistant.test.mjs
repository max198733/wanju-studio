import test from 'node:test';
import assert from 'node:assert/strict';
import { WANJU_ASSISTANT, wanjuAssistantState, wanjuDefaultAssistant } from '../chat/src/lib/wanju-assistant.ts';

const own = { id: 'own', name: 'Own model', model: 'supplier-model' };
const cloud = { id: WANJU_ASSISTANT, name: 'Cloud assistant', model: 'wanju-creative', billingMode: 'wallet' };
const roster = (models, extra = {}) => [{ id: 'byok', name: 'Own key', shown: true, status: 'ready', byok: { models }, ...extra }];

test('new Wanju accounts default to the prepaid assistant without a supplier key', () => {
  const state = wanjuDefaultAssistant();
  assert.equal(state.picked, 'byok');
  assert.equal(state.prefs.byok.model, WANJU_ASSISTANT);
  assert.equal(wanjuAssistantState('byok', null, WANJU_ASSISTANT).checking, true);
});

test('an unavailable prepaid selection cannot be reported ready by another configured model', () => {
  for (const models of [[], [own]]) {
    const state = wanjuAssistantState('byok', roster(models), WANJU_ASSISTANT);
    assert.equal(state.ready, false);
    assert.equal(state.cloud, true);
  }
});

test('billing origin follows the selected model, including legacy names and included accounts', () => {
  assert.equal(wanjuAssistantState('byok', roster([cloud, own]), 'own').billing, '自有密钥 · 供应商计费');
  assert.equal(wanjuAssistantState('byok', roster([cloud, own]), 'supplier-model').cloud, false);
  assert.equal(wanjuAssistantState('byok', roster([cloud, own]), WANJU_ASSISTANT).billing, '按玩剧积分结算');
  assert.equal(wanjuAssistantState('byok', roster([{ ...cloud, billingMode: 'included' }]), WANJU_ASSISTANT).billing, '平台承担费用');
  assert.equal(wanjuAssistantState('codex', [{ id: 'codex', name: 'Codex', shown: true, status: 'ready' }]).billing, '自有账号 · 供应商计费');
});

test('a previous quota error permits retry after recharge and does not disable another configured model', () => {
  assert.equal(wanjuAssistantState('byok', roster([cloud, own], {
    connectionIssue: { kind: 'quota', message: 'previous request' }, problem: 'previous request',
  }), 'own').ready, true);
});
