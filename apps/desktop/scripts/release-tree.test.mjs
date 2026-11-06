import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseTreeManifest, replaceReleaseTree } from './release-tree.mjs';

test('release tree replaces old chunks, keeps all current chunks and leaves dependencies intact', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'wanju-release-tree-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'source'), stage = join(directory, 'stage'), target = join(stage, 'shell/dist');
  mkdirSync(join(source, 'assets'), { recursive: true });
  mkdirSync(join(target, 'assets'), { recursive: true });
  mkdirSync(join(stage, 'node_modules'), { recursive: true });
  writeFileSync(join(source, 'index.html'), '<script src="assets/index-new.js"></script>');
  for (const name of ['index-new.js', 'index-dynamic.js', 'font.woff2']) writeFileSync(join(source, 'assets', name), name);
  writeFileSync(join(source, 'excluded.test.mjs'), 'test');
  writeFileSync(join(target, 'assets/index-old.js'), 'obsolete');
  writeFileSync(join(stage, 'node_modules/keep'), 'dependency');
  const filter = (path) => !path.endsWith('.test.mjs');
  assert.deepEqual(replaceReleaseTree(source, target, stage, { filter }), { files: 4 });
  assert.deepEqual(releaseTreeManifest(target), releaseTreeManifest(source, filter));
  assert.equal(readFileSync(join(stage, 'node_modules/keep'), 'utf8'), 'dependency');
  assert.throws(() => replaceReleaseTree(source, source, stage), /staging root/);
  assert.throws(() => replaceReleaseTree(source, directory, stage), /staging root/);
});
