import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, usagePoints } from './store.mjs';
const secret = 'test-administrator-secret-never-for-real-accounts';
const fixture = () => openStore(':memory:', secret);
const activate = (s, username = 'student1', points = 1000) => {
  const a = s.activate({ username, password: 'test-password-123', code: s.createCodes({ kind: 'activation', count: 1, points })[0].code });
  return a;
};
const config = { enabled: true, baseUrl: 'http://127.0.0.1:9999/v1', model: 'test-model',
  key: 'test-upstream-key-not-a-real-secret', visionVerified: true,
  inputPointsPerMillion: 1000, outputPointsPerMillion: 2000, reservePoints: 50 };

test('activation and recharge are atomic, one time, and recoverable by login', () => {
  const s = fixture();
  try {
    const code = s.createCodes({ kind: 'activation', count: 1, points: 100 })[0].code;
    const input = { username: 'student1', password: 'test-password-123', code };
    const a = s.activate(input);
    assert.equal(a.user.balance, 100);
    assert.throws(() => s.activate({ ...input, username: 'student2' }), /已经使用/);
    assert.equal(s.overview().totals.users, 1);
    assert.equal(s.login(input).user.id, a.user.id);
    const b = activate(s, 'student2');
    const recharge = s.createCodes({ kind: 'recharge', count: 1, points: 9900 })[0].code;
    assert.equal(s.redeem(a.user.id, recharge).user.balance, 10000);
    assert.equal(s.redeem(a.user.id, recharge).user.balance, 10000);
    assert.throws(() => s.redeem(b.user.id, recharge), /已经使用/);
    assert.equal(s.wallet(a.user.id).ledger.length, 2);
  } finally { s.close(); }
});

test('void cards and wrong passwords cannot grant access, reset revokes sessions', () => {
  const s = fixture();
  try {
    const code = s.createCodes({ kind: 'activation', count: 1, points: 0 })[0];
    s.voidCode(code.id);
    assert.throws(() => s.activate({ code: code.code, username: 'someone', password: 'long-test-password' }), /无效/);
    const a = activate(s);
    assert.equal(s.authenticate(a.token).id, a.user.id);
    assert.throws(() => s.login({ username: 'student1', password: 'wrong-password' }), /不正确/);
    s.changeUser(a.user.id, { password: 'new-long-test-password' });
    assert.throws(() => s.authenticate(a.token), /过期/);
    const fresh = s.login({ username: 'student1', password: 'new-long-test-password' });
    s.changeUser(a.user.id, { status: 'suspended' });
    assert.throws(() => s.authenticate(fresh.token), /暂停/);
  } finally { s.close(); }
});

test('reservations prevent overspend and charge once using a fixed price snapshot', () => {
  const s = fixture();
  try {
    s.saveChat(config);
    const a = activate(s, 'student1', 75);
    const op = s.reserve(a.user.id, 'request1', 'fingerprint');
    assert.equal(s.wallet(a.user.id).user.balance, 25);
    assert.equal(s.wallet(a.user.id).heldPoints, 50);
    assert.throws(() => s.reserve(a.user.id, 'request2', 'fingerprint'), /余额不足/);
    assert.throws(() => s.reserve(a.user.id, 'request1', 'fingerprint'), /已经提交/);
    assert.throws(() => s.reserve(a.user.id, 'request1', 'different'), /不同内容/);
    s.saveChat({ ...config, inputPointsPerMillion: 2, outputPointsPerMillion: 2, reservePoints: 1 });
    const next = s.reserve(a.user.id, 'new-price-request', 'fp');
    assert.equal(next.rates.inputPointsPerMillion, 2);
    s.settle(next.id, 0);
    const points = usagePoints({ prompt_tokens: 1000, completion_tokens: 1000 }, op.rates);
    assert.equal(points, 3);
    s.settle(op.id, points, 'tested');
    s.settle(op.id, points, 'duplicate callback');
    assert.equal(s.wallet(a.user.id).user.balance, 72);
    assert.equal(s.wallet(a.user.id).heldPoints, 0);
    assert.throws(() => s.settle(op.id, 4), /金额不同/);
    assert.equal(s.db.prepare('SELECT SUM(delta) AS n FROM ledger WHERE user_id=?').get(a.user.id).n, 72);
    assert.doesNotMatch(s.db.prepare('SELECT rates FROM operations').get().rates, /test-upstream-key|9999/);
  } finally { s.close(); }
});

test('uncertain requests keep funds held; only bounded, audited manual settlement is allowed', () => {
  const s = fixture();
  try {
    s.saveChat(config);
    const a = activate(s);
    const op = s.reserve(a.user.id, 'request1', 'fp');
    assert.throws(() => s.settle(op.id, 5, 'manual', null, true), /待核对/);
    s.review(op.id, '模拟网络中断');
    assert.equal(s.wallet(a.user.id).heldPoints, 50);
    assert.throws(() => s.settle(op.id, 51, 'manual', null, true), /范围/);
    s.settle(op.id, 0, '已核对上游未计费', null, true);
    assert.equal(s.wallet(a.user.id).user.balance, 1000);
  } finally { s.close(); }
});

test('legacy operations migrate and retain allowlisted diagnostics across restarts without leaking them into the wallet', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wanju-chat-diagnostic-'));
  const path = join(directory, 'wallet.sqlite');
  let s = openStore(path, secret);
  try {
    s.saveChat(config);
    const a = activate(s, 'diagnostic-persistence');
    const op = s.reserve(a.user.id, 'local-test-request', 'local-test-fingerprint');
    s.review(op.id, 'Test-only interrupted response.');
    s.db.exec('ALTER TABLE operations DROP COLUMN diagnostic');
    s.close();
    s = openStore(path, secret);
    s.recordChatDiagnostic(op.id, { category: 'stream_incomplete', phase: 'stream', elapsedMs: 2000,
      upstreamStatus: 200, errorCode: 'not-allowlisted-credential', model: 'test-model', host: 'supplier.example',
      prompt: 'private prompt', headers: { authorization: config.key }, message: config.key });
    s.close();
    s = openStore(path, secret);
    const item = s.operationDiagnostic(op.id);
    assert.equal(item.status, 'review');
    assert.equal(item.diagnostic.category, 'stream_incomplete');
    assert.equal(item.diagnostic.errorCode, '');
    assert.equal(item.diagnostic.elapsedMs, 2000);
    assert.doesNotMatch(JSON.stringify(item), /private prompt|authorization|test-upstream-key/);
    const wallet = s.wallet(a.user.id);
    assert.equal(wallet.heldPoints, 50);
    assert.equal(wallet.user.balance, 950);
    assert.doesNotMatch(JSON.stringify(wallet), /supplier\.example|"diagnostic":/);
  } finally {
    s.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('upstream secrets are encrypted, hidden from admin reads, and pricing defaults disabled', () => {
  const s = fixture();
  try {
    assert.equal(s.publicChat().enabled, false);
    assert.throws(() => s.saveChat({ ...config, reservePoints: 1 }), /至少/);
    s.saveChat(config);
    assert.doesNotMatch(s.db.prepare('SELECT sealed FROM settings').get().sealed, /test-upstream-key/);
    assert.equal(s.chat().key, config.key);
    assert.equal(s.adminChat().key, undefined);
    assert.equal(s.publicChat().baseUrl, undefined);
    s.saveChat({ displayName: '新的助手', key: '' });
    assert.equal(s.chat().key, config.key);
  } finally { s.close(); }
});
