import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isWanjuProduct } from '../chat/src/lib/wanju-product.ts';

const preload = readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8');

function exposedProductName(env) {
  let exposed;
  const electron = {
    contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value; } },
    ipcRenderer: { invoke() {}, on() {}, removeListener() {}, send() {} },
    webUtils: { getPathForFile: () => '' },
  };
  runInNewContext(preload, {
    process: { env, platform: 'win32' },
    require: (name) => {
      assert.equal(name, 'electron');
      return electron;
    },
  });
  return exposed.productName;
}

test('preload exposes each Wanju flavor and the chat recognizes them all', () => {
  const names = [
    exposedProductName({ WANJU_DESKTOP: '1' }),
    exposedProductName({ WANJU_DESKTOP: '1', WANJU_DEBUG: '1' }),
    exposedProductName({ WANJU_DESKTOP: '1', WANJU_STUDENT_EDITION: '1' }),
    exposedProductName({ WANJU_DESKTOP: '1', WANJU_STUDENT_EDITION: '1', WANJU_ACCOUNT_MODE: 'unified' }),
    exposedProductName({}),
  ];
  assert.deepEqual(names, ['玩剧', '玩剧调试版', '玩剧学员版', '玩剧', 'OpenFilm']);
  assert.deepEqual(names.map(isWanjuProduct), [true, true, true, true, false]);
});
