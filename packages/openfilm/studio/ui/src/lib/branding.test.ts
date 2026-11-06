import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brandUiText, isWanju } from './branding.ts';

test('Wanju display branding works in desktop and browser without changing upstream', () => {
  for (const scope of [
    { openfilmNative: { productName: '玩剧' } },
    { openfilmNative: { wanju: {} } },
    { openfilmHost: { name: '玩剧' } },
    { document: { documentElement: { dataset: { wanju: '1' } } } },
  ]) {
    assert.equal(isWanju(scope), true);
    assert.equal(brandUiText('来自 OpenFilm / OpenFilm could not start', scope), '来自 玩剧 / 玩剧 could not start');
    assert.equal(brandUiText('openfilm doctor / MyOpenFilmProject', scope), 'openfilm doctor / MyOpenFilmProject');
  }
  assert.equal(isWanju({}), false);
  assert.equal(brandUiText('OpenFilm', { openfilmNative: { productName: 'OpenFilm' } }), 'OpenFilm');
});
