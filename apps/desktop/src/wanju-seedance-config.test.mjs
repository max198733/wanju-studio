import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSeedanceSettings, saveSeedanceKey } from './wanju-seedance-config.mjs';

test('Seedance saves only in its own config, preserves fields, and never returns a key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-ark-config-'));
  const file = join(directory, 'seedance_video_config.json');
  const legacyFile = join(directory, 'runninghub_sparkvideo_config.json');
  await writeFile(file, JSON.stringify({ region: 'cn-beijing', model: 'old-model' }));
  const legacy = JSON.stringify({ api_key: 'old-provider-key' });
  await writeFile(legacyFile, legacy);
  assert.equal((await readSeedanceSettings(directory)).configured, false);
  const result = await saveSeedanceKey(directory, { key: ' mock-ark-private-key ' });
  assert.deepEqual(result, { configured: true, model: 'doubao-seedance-2-0-260128' });
  const stored = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(stored.api_key, 'mock-ark-private-key');
  assert.equal(stored.region, 'cn-beijing');
  assert.equal(stored.model, result.model);
  assert.equal(await readFile(legacyFile, 'utf8'), legacy);
  assert.doesNotMatch(JSON.stringify(await readSeedanceSettings(directory)), /mock-ark-private-key|old-provider-key/);
  for (const key of ['bad key', 'Bearer mock-ark-private-key', 'short']) {
    await assert.rejects(saveSeedanceKey(directory, { key }));
  }
  await writeFile(file, '{broken');
  await assert.rejects(saveSeedanceKey(directory, { key: 'another-private-key' }), /无法读取/);
  assert.equal(await readFile(file, 'utf8'), '{broken');
});
