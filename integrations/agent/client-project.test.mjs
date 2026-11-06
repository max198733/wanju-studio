import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from './client.mjs';

test('creating a desktop story opens the same project without mixing earlier timelines', async () => {
  const previous = process.env.WANJU_DESKTOP;
  process.env.WANJU_DESKTOP = '1';
  try {
    const calls = [];
    const api = async (path, options) => {
      calls.push({ path, options });
      if (path === '/api/wanju/projects') return { project: { id: 'new-story', path: 'C:/Films/NewStory' }, state: { shots: [] } };
      assert.equal(path, '/api/open');
      return { url: 'http://127.0.0.1:4858/open?key=never-show' };
    };
    const result = await execute('create', { name: '悬疑新故事', workflow: 'hedao' }, { api, start: async () => {} });
    assert.equal(result.opened, true);
    assert.equal(calls[1].options.body.path, 'C:/Films/NewStory');
    assert.doesNotMatch(JSON.stringify(result), /never-show/);
    let creates = 0;
    const partial = await execute('create', { name: 'another' }, { start: async () => {}, api: async (path) => {
      if (path === '/api/wanju/projects') { creates++; return { project: { id: 'already-created', path: 'C:/Films/Created' } }; }
      throw new Error('no visible window');
    } });
    assert.equal(partial.opened, false);
    assert.equal(partial.project.id, 'already-created');
    assert.equal(creates, 1);
    assert.match(partial.warning, /不要再次创建/);
  } finally { if (previous === undefined) delete process.env.WANJU_DESKTOP; else process.env.WANJU_DESKTOP = previous; }
});
