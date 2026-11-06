import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionDiagnostics } from './wanju-diagnostics.mjs';

test('diagnostics separates image delivery from provider time and excludes legacy timings and private payloads', () => {
  const tasks = [
    { id: 'one', provider: 'image', status: 'done', timing: { providerMs: 20000, downloadMs: 140000, totalMs: 160000 }, url: 'https://private.invalid/?key=secret', key: 'secret' },
    { id: 'two', provider: 'image', status: 'done' },
    { id: 'three', provider: 'h3', status: 'done', timing: { remoteWaitMs: 45000000 } },
  ];
  const result = productionDiagnostics({ id: 'p1', name: 'Current project', path: 'private path' }, { shots: [] }, tasks,
    { enabled: true, counts: { characters: 1 }, issues: [] });
  assert.equal(result.imageTiming.count, 1);
  assert.equal(result.imageTiming.bottleneck, 'download');
  assert.equal(result.imageTiming.downloadMs, 140000);
  assert.doesNotMatch(JSON.stringify(result), /secret|private\.invalid|private path/);
  assert.match(result.notes.join(' '), /关闭和轮询间隔/);
});
