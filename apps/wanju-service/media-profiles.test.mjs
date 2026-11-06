import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaCatalog, mediaProfile, mediaAddress } from './media-profiles.mjs';

const profile = (overrides = {}) => ({
  id: 'image-main', category: 'image', adapter: 'openai-image', name: '图片主线路',
  baseUrl: 'https://image.example/v1', model: 'image-model', ...overrides,
});
test('media profiles validate protocol, category, endpoints and credentials', () => {
  assert.equal(mediaProfile(profile()).baseUrl, 'https://image.example/v1');
  assert.throws(() => mediaAddress('http://image.example'), /HTTPS/);
  assert.throws(() => mediaAddress('https://127.0.0.1'), /公网/);
  assert.throws(() => mediaProfile(profile({ adapter: 'seedance' })), /类别与接口协议/);
  assert.throws(() => mediaProfile(profile({ baseUrl: 'https://image.example/path' })), /基础地址/);
  assert.throws(() => mediaProfile(profile({ key: 'secret-key' })), /不能包含 API 密钥/);
  assert.equal(mediaProfile(profile({ key: 'supplier-key-123' }), { allowKey: true }).key, 'supplier-key-123');
  assert.equal(mediaProfile(profile({ note: 'POST /generate\n查询任务并保存结果。' })).note.includes('\n'), true);
  assert.throws(() => mediaProfile(profile({ auth: 'Authorization: Bearer {key}\nInjected: value' })), /认证请求头/);
});
test('media catalog enforces unique ids and category-matched defaults without keys', () => {
  const good = profile();
  assert.equal(mediaCatalog({ profiles: [good], defaults: { image: good.id } }).defaults.image, good.id);
  assert.throws(() => mediaCatalog({ profiles: [good, good] }), /重复/);
  assert.throws(() => mediaCatalog({ profiles: [good], defaults: { video: good.id } }), /类别不匹配/);
  assert.throws(() => mediaCatalog({ profiles: [{ ...good, key: 'supplier-key-123' }] }), /不能包含 API 密钥/);
});
