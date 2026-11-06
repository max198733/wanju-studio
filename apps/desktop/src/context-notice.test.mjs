import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSuggestNewConversation } from '../chat/src/lib/context-notice.ts';

test('context suggestion dismissal survives serialization without affecting other agents or conversations', () => {
  const sessions = JSON.parse(JSON.stringify([
    { id: 'a', contextNoticeDismissed: { byok: true } },
    { id: 'b' },
  ]));
  const full = { used: 900, size: 1000 };
  assert.equal(shouldSuggestNewConversation(full, sessions[0].contextNoticeDismissed.byok), false);
  assert.equal(shouldSuggestNewConversation(full, sessions[0].contextNoticeDismissed.codex), true);
  assert.equal(shouldSuggestNewConversation(full, sessions[1].contextNoticeDismissed?.byok), true);
  for (const context of [null, { used: 84, size: 100 }, { used: Infinity, size: 100 }, { used: 90, size: 0 }]) {
    assert.equal(shouldSuggestNewConversation(context), false);
  }
  assert.equal(shouldSuggestNewConversation({ used: 85, size: 100 }), true);
});
