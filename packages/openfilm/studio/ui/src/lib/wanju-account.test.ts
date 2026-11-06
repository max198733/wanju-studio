import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudChatAccess, pointsRateAsYuan, type StudentAccount } from './wanju-account.ts';

const account: StudentAccount = { configured: true, authenticated: true, user: { id: 'one', username: 'student', balance: 50 },
  chat: { enabled: true, authorized: true, displayName: '创作助手', priceVersion: 'one', inputPointsPerMillion: 100, outputPointsPerMillion: 200, reservePoints: 50 } };
test('cloud assistant access requires login, sufficient balance and fresh status without price confirmation', () => {
  assert.equal(cloudChatAccess(account).ready, true);
  assert.equal(cloudChatAccess(account, false).ready, false);
  assert.equal(cloudChatAccess({ ...account, authenticated: false }).ready, false);
  assert.equal(cloudChatAccess({ ...account, user: { ...account.user!, balance: 49 } }).ready, false);
  assert.equal(cloudChatAccess({ ...account, chat: { ...account.chat!, authorized: false } }).ready, true);
  assert.equal(cloudChatAccess({ ...account, chat: { ...account.chat!, authorized: undefined } }).ready, true);
  assert.equal(cloudChatAccess({ ...account, chat: { ...account.chat!, enabled: false } }).ready, false);
});
test('account messages do not imply different teacher and student local rights', () => {
  const states = [null, { ...account, configured: false }, { ...account, authenticated: false },
    { ...account, chat: { ...account.chat!, enabled: false } }];
  for (const state of states) assert.doesNotMatch(cloudChatAccess(state).label, /老师|学员|激活/);
});
test('included default assistant needs a valid login but not a wallet balance or price consent', () => {
  const included = { ...account, user: { ...account.user!, balance: 0 },
    chat: { ...account.chat!, billingMode: 'included' as const, authorized: true, reservePoints: 0 } };
  assert.equal(cloudChatAccess(included).ready, true);
  assert.match(cloudChatAccess(included).label, /不扣钱包/);
  assert.equal(cloudChatAccess(included, false).ready, false);
  assert.equal(cloudChatAccess({ ...included, authenticated: false }).ready, false);
  assert.equal(cloudChatAccess({ ...included, chat: { ...included.chat, enabled: false } }).ready, false);
});
test('token rates preserve fractional point prices without changing wallet units', () => {
  assert.equal(pointsRateAsYuan(18.2), '0.182');
  assert.equal(pointsRateAsYuan(50.2), '0.502');
  assert.equal(pointsRateAsYuan(455), '4.55');
  assert.equal(pointsRateAsYuan(364), '3.64');
  assert.equal(pointsRateAsYuan(0), '0.00');
});
