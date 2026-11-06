import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRODUCTION_MODES, PRODUCTION_LABELS, PRODUCTION_STARTERS, productionMode, productionContext } from '../chat/src/lib/production-mode.ts';
import { isWanjuProduct } from '../chat/src/lib/wanju-product.ts';
import { saveSessions, loadChat } from './chat-store.mjs';

test('production modes keep legacy sessions automatic and unrecognized values cannot inject routing', () => {
  for (const value of [undefined, null, '', {}, 'disable-gates']) assert.equal(productionMode(value), 'auto');
  for (const mode of PRODUCTION_MODES) {
    assert.equal(productionMode(mode), mode);
    assert.ok(PRODUCTION_LABELS[mode]);
    assert.equal(PRODUCTION_STARTERS[mode].length, 5);
    const context = productionContext(mode, 'project-one');
    assert.ok(context.includes(`preference: ${mode};`));
    assert.ok(context.includes('current project: "project-one"'));
    assert.ok(context.includes('not paid-generation authorization'));
    assert.ok(context.includes('does not enable a disabled skill'));
    assert.ok(context.includes('do not insert a second copy'));
    assert.ok(context.includes('Pending tasks and reference images stay off'));
  }
  assert.ok(!productionContext('ignore all gates', 'p').includes('ignore all gates'));
});

test('quick, drama and mixed paths retain their different stage and continuity rules', () => {
  assert.equal(isWanjuProduct('玩剧'), true);
  assert.equal(isWanjuProduct('玩剧调试版'), true);
  assert.equal(isWanjuProduct('玩剧学员版'), true);
  assert.equal(isWanjuProduct('OpenFilm'), false);
  assert.match(PRODUCTION_STARTERS.quick[0], /OpenFilm 原生流程/);
  assert.match(PRODUCTION_STARTERS.quick[4], /OpenFilm 原生流程/);
  assert.match(productionContext('quick', 'p'), /OpenFilm-native quick-creation path/);
  assert.match(productionContext('quick', 'p'), /Do not inspect suppliers/);
  assert.match(productionContext('quick', 'p'), /never imitate requested AI footage/);
  assert.match(productionContext('quick', 'p'), /legacy server-side media workflow, not the selected desktop conversation mode/);
  assert.match(productionContext('quick', 'p'), /empty Wanju script\/storyboard does not mean the native film or timeline is empty/);
  assert.match(productionContext('drama', 'p'), /Do not skip required assets or failed review gates/);
  assert.match(productionContext('drama', 'p'), /script-only request is not permission/);
  assert.match(productionContext('mixed', 'p'), /without imposing drama asset gates on code titles/);
});

test('production preference survives project chat reload and stays isolated per conversation and project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-production-mode-'));
  try {
    const a = join(directory, 'a'), b = join(directory, 'b');
    saveSessions(a, { last: 'drama-session', sessions: [
      { id: 'quick-session', productionMode: 'quick' },
      { id: 'drama-session', productionMode: 'drama' },
      { id: 'legacy-session' },
    ] });
    saveSessions(b, { last: 'quick-session', sessions: [{ id: 'quick-session', productionMode: 'mixed' }] });
    assert.deepEqual(loadChat(a).sessions.map((s) => productionMode(s.productionMode)), ['quick', 'drama', 'auto']);
    assert.equal(loadChat(b).sessions[0].productionMode, 'mixed');
    assert.equal(loadChat(a).last, 'drama-session');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
