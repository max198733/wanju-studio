import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readImageSettings, saveImageKey } from './wanju-image-config.mjs';

test('key updates preserve the image model, routing and workflow settings without exposing credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-image-key-'));
  try {
    const file = join(directory, 'xem8k5_gpt_image_config.json');
    const original = {
      base_url: 'https://image.xem8k5.top', model: 'existing-model', api_key: 'OLD_TEST_KEY',
      create_endpoint: '/v1/images/generations', routing_guard: 'keep existing routing', note: 'keep workflow note',
    };
    await writeFile(file, JSON.stringify(original));
    assert.doesNotMatch(JSON.stringify(await readImageSettings(directory)), /OLD_TEST_KEY|api_key/);
    const saved = await saveImageKey(directory, { key: '  NEW_TEST_KEY  ' });
    assert.equal(saved.configured, true);
    assert.doesNotMatch(JSON.stringify(saved), /NEW_TEST_KEY|api_key/);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { ...original, api_key: 'NEW_TEST_KEY' });
    assert.deepEqual(await readdir(directory), ['xem8k5_gpt_image_config.json']);
    for (const input of [{ key: '' }, { key: 'bad' }, { key: 'TEST KEY WITH SPACES' }, {}, null]) {
      await assert.rejects(saveImageKey(directory, input), /有效的图片 API 密钥/);
    }
    assert.equal(JSON.parse(await readFile(file, 'utf8')).api_key, 'NEW_TEST_KEY');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing settings have safe defaults and malformed settings are preserved', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-image-key-'));
  try {
    const settings = await readImageSettings(directory);
    assert.equal(settings.configured, false);
    assert.equal(settings.baseUrl, 'https://image.xem8k5.top');
    const file = join(directory, 'xem8k5_gpt_image_config.json');
    await writeFile(file, '{broken');
    await assert.rejects(saveImageKey(directory, { key: 'NEW_TEST_KEY' }), /无法读取/);
    assert.equal(await readFile(file, 'utf8'), '{broken');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('image delivery mode changes preserve the stored key and reject unsupported formats', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanju-image-mode-'));
  try {
    await assert.rejects(saveImageKey(directory, { key: '', responseFormat: 'url' }), /先配置/);
    await saveImageKey(directory, { key: 'TEST_ONLY_KEY', responseFormat: 'b64_json' });
    const value = await saveImageKey(directory, { key: '', responseFormat: 'url' });
    assert.equal(value.responseFormat, 'url');
    assert.doesNotMatch(JSON.stringify(value), /TEST_ONLY_KEY/);
    const file = join(directory, 'xem8k5_gpt_image_config.json');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).api_key, 'TEST_ONLY_KEY');
    await assert.rejects(saveImageKey(directory, { key: '', responseFormat: 'unknown' }));
    assert.equal((await readImageSettings(directory)).responseFormat, 'url');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
