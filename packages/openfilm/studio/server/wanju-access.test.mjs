import test from 'node:test';
import assert from 'node:assert/strict';
import { setWanjuAccess, wanjuAccess, wanjuConfigDirectory } from './wanju-access.mjs';
import { generateOne } from './wanju-generation.mjs';

test('student media access fails closed, expires, and isolates user configuration folders', async () => {
  const edition = process.env.WANJU_STUDENT_EDITION;
  const directory = process.env.WANJU_CONFIG_DIR;
  process.env.WANJU_STUDENT_EDITION = '1';
  process.env.WANJU_CONFIG_DIR = 'C:/test/providers';
  try {
    setWanjuAccess({});
    assert.equal(wanjuAccess().localMediaAllowed, false);
    await assert.rejects(generateOne({}, {}, {}), /激活/);
    const state = { authenticated: true, ownMediaEnabled: true, expiresAt: Date.now() + 60000, userId: 'student-one' };
    setWanjuAccess(state);
    assert.equal(wanjuAccess().localMediaAllowed, true);
    const first = wanjuConfigDirectory();
    assert.doesNotMatch(first, /student-one/);
    setWanjuAccess({ ...state, userId: 'student-two' });
    assert.notEqual(wanjuConfigDirectory(), first);
    assert.equal(wanjuAccess(Date.now() + 120000).localMediaAllowed, false);
    setWanjuAccess({ ...state, ownMediaEnabled: false });
    assert.equal(wanjuConfigDirectory(), undefined);
    setWanjuAccess({ ...state, userId: '' });
    assert.equal(wanjuAccess().localMediaAllowed, false);
  } finally {
    if (edition === undefined) delete process.env.WANJU_STUDENT_EDITION; else process.env.WANJU_STUDENT_EDITION = edition;
    if (directory === undefined) delete process.env.WANJU_CONFIG_DIR; else process.env.WANJU_CONFIG_DIR = directory;
    setWanjuAccess({});
  }
});

test('unified accounts have equal local rights without activating legacy student gates', () => {
  const previous = { edition: process.env.WANJU_STUDENT_EDITION, mode: process.env.WANJU_ACCOUNT_MODE, config: process.env.WANJU_CONFIG_DIR };
  try {
    process.env.WANJU_STUDENT_EDITION = '1';
    process.env.WANJU_ACCOUNT_MODE = 'unified';
    process.env.WANJU_CONFIG_DIR = 'C:/local-test/providers';
    setWanjuAccess({});
    assert.equal(wanjuAccess().student, false);
    assert.equal(wanjuAccess().localMediaAllowed, true);
    assert.equal(wanjuConfigDirectory(), process.env.WANJU_CONFIG_DIR);
  } finally {
    for (const [name, value] of Object.entries({ WANJU_STUDENT_EDITION: previous.edition, WANJU_ACCOUNT_MODE: previous.mode, WANJU_CONFIG_DIR: previous.config })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    setWanjuAccess({});
  }
});
