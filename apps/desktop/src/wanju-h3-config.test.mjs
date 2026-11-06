import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readH3Settings, saveH3Key } from './wanju-h3-config.mjs';

test('single-frame key updates preserve existing settings and never return a key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanju-h3-config-'));
  try {
    assert.equal((await readH3Settings(root)).configured, false);
    const file = join(root, 'minimax_h3_config.json');
    await writeFile(file, JSON.stringify({ api_key: 'TEST_OLD_KEY', note: 'retain routing' }));
    const saved = await saveH3Key(root, { key: ' TEST_NEW_KEY ' });
    assert.equal(saved.configured, true);
    assert.doesNotMatch(JSON.stringify(saved), /TEST_NEW_KEY|api_key/);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { api_key: 'TEST_NEW_KEY', note: 'retain routing' });
    await assert.rejects(saveH3Key(root, { key: 'with space' }), /有效/);
    await writeFile(file, '{broken');
    await assert.rejects(saveH3Key(root, { key: 'TEST_NEXT_KEY' }), /无法读取/);
    assert.equal(await readFile(file, 'utf8'), '{broken');
  } finally { await rm(root, { recursive: true, force: true }); }
});
