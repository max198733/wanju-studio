import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { wanjuReleaseOptions } from './wanju-release-options.mjs';

test('release options preserve explicit candidate versions and spaced output directories', () => {
  for (const args of [
    ['--version=0.1.13-rc.2', '--output=C:/Builds/Wanju candidate', '--skip-ui-build'],
    ['--version', '0.1.13-rc.2', '--output', 'C:/Builds/Wanju candidate', '--skip-ui-build'],
  ]) {
    assert.deepEqual(wanjuReleaseOptions(args, 'unused'), {
      version: '0.1.13-rc.2', output: resolve('C:/Builds/Wanju candidate'), skipUiBuild: true, bundleBrowser: false, signing: 'none',
    });
  }
});

test('invalid and unknown build arguments stop instead of silently changing a release', () => {
  for (const args of [
    ['--version'], ['--version='], ['--version=1.2'], ['--version=1.2.70000'],
    ['--output'], ['--output='], ['--verison=0.1.13-rc.2'], ['--unexpected'],
    ['--signing=unknown'], ['--signing'],
  ]) assert.throws(() => wanjuReleaseOptions(args, 'unused'));
});

test('the 2.1.0 build defaults to unsigned preparation and accepts an explicit signing provider', () => {
  assert.equal(wanjuReleaseOptions([], 'builds').version, '2.1.0');
  assert.equal(wanjuReleaseOptions([], 'builds').signing, 'none');
  assert.equal(wanjuReleaseOptions(['--signing=signpath'], 'builds').signing, 'signpath');
});
