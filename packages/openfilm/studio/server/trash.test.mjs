import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveToTrash } from './trash.mjs';

const linuxTrash = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'of-linux-trash-'));
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const kept = { XDG_DATA_HOME: process.env.XDG_DATA_HOME, OPENFILM_TRASH_DIR: process.env.OPENFILM_TRASH_DIR };
  Object.defineProperty(process, 'platform', { value: 'linux' });
  process.env.XDG_DATA_HOME = join(root, 'data');
  delete process.env.OPENFILM_TRASH_DIR;
  t.after(() => {
    Object.defineProperty(process, 'platform', platform);
    for (const [key, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });
  return { root, files: join(root, 'data', 'Trash', 'files'), info: join(root, 'data', 'Trash', 'info') };
};

test('concurrent moves of files with the same name keep both files and their original paths', async (t) => {
  const { root, files, info } = linuxTrash(t);
  const paths = ['one', 'two'].map((folder) => {
    mkdirSync(join(root, folder));
    const path = join(root, folder, 'take.wav');
    writeFileSync(path, folder);
    return path;
  });
  await Promise.all(paths.map(moveToTrash));
  const names = readdirSync(files).sort();
  assert.deepEqual(names, ['take 2.wav', 'take.wav']);
  assert.deepEqual(names.map((name) => readFileSync(join(files, name), 'utf8')).sort(), ['one', 'two']);
  assert.ok(paths.every((path) => !existsSync(path)));
  const originals = names.map((name) => decodeURI(readFileSync(join(info, `${name}.trashinfo`), 'utf8').match(/^Path=(.*)$/m)[1]));
  assert.deepEqual(originals.sort(), paths.sort());
});

test('an existing trash record is not overwritten even when its file is missing', async (t) => {
  const { root, files, info } = linuxTrash(t);
  mkdirSync(info, { recursive: true });
  writeFileSync(join(info, 'take.wav.trashinfo'), 'keep this record');
  const path = join(root, 'take.wav');
  writeFileSync(path, 'new recording');
  await moveToTrash(path);
  assert.equal(readFileSync(join(info, 'take.wav.trashinfo'), 'utf8'), 'keep this record');
  assert.equal(readFileSync(join(files, 'take 2.wav'), 'utf8'), 'new recording');
});

test('a failed move leaves no new trash record', async (t) => {
  const { root, files, info } = linuxTrash(t);
  await assert.rejects(moveToTrash(join(root, 'missing.wav')), (e) => e.code === 'ENOENT');
  assert.deepEqual(readdirSync(files), []);
  assert.deepEqual(readdirSync(info), []);
});
