import assert from 'node:assert/strict';
import test from 'node:test';
import { WANJU_ACTIVE_MEDIA, WANJU_SUPPORTED_PROVIDERS, wanjuProviderDescription, wanjuProviderLabel } from './wanju-provider-labels.ts';

test('Wanju provider labels show service categories without upstream provider names', () => {
    assert.equal(wanjuProviderLabel('image'), '图片生成');
    assert.equal(wanjuProviderLabel('grok'), '视频扩展（尚未接入）');
    assert.equal(wanjuProviderLabel('cos'), '素材存储');
    assert.equal(wanjuProviderLabel('unknown'), '其他服务');
    assert.doesNotMatch(Object.values({
      image: wanjuProviderLabel('image'), h3: wanjuProviderLabel('h3'),
      wan: wanjuProviderLabel('wan'), grok: wanjuProviderLabel('grok'),
      seedance: wanjuProviderLabel('seedance'), music: wanjuProviderLabel('music'),
      cos: wanjuProviderLabel('cos'),
    }).join(' '), /xem|grok|seedance|mxapi|cos/i);
});

test('Wanju provider descriptions do not present key presence as a successful connection', () => {
    assert.match(wanjuProviderDescription(true), /尚未验证/);
    assert.equal(wanjuProviderDescription(false), '尚未配置');
});
test('active choices are unique, supported and distinguish their purpose', () => {
  const names = WANJU_ACTIVE_MEDIA.map(wanjuProviderLabel);
  assert.equal(new Set(names).size, 3);
  for (const id of WANJU_ACTIVE_MEDIA) assert.ok(WANJU_SUPPORTED_PROVIDERS.has(id));
  assert.ok(!WANJU_SUPPORTED_PROVIDERS.has('grok'));
  assert.ok(!WANJU_SUPPORTED_PROVIDERS.has('music'));
});
