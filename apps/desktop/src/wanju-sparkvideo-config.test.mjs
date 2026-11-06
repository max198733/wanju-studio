import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSparkVideoSettings, saveSparkVideoKey } from './wanju-sparkvideo-config.mjs';
test('video settings save privately and return only configured status', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-spark-config-'));
  assert.deepEqual(await readSparkVideoSettings(directory), { configured: false });
  assert.deepEqual(await saveSparkVideoKey(directory, { key: ' mock-runninghub-private-key ' }), { configured: true });
  assert.deepEqual(await readSparkVideoSettings(directory), { configured: true });
  const file = join(directory, 'runninghub_sparkvideo_config.json');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).api_key, 'mock-runninghub-private-key');
  await assert.rejects(saveSparkVideoKey(directory, { key: 'bad key' }));
  await writeFile(file, '{broken');
  await assert.rejects(saveSparkVideoKey(directory, { key: 'new-private-key' }), /无法读取/);
  assert.equal(await readFile(file, 'utf8'), '{broken');
});
