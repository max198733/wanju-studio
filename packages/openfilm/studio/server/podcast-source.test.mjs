import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { podcastSourceVersion, readPodcastSource, writePodcastSource } from './podcast-source.mjs';

test('original word ends are cached separately and the local CLI never edits the film or transcript', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'podcast-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets/voice.mp3'), 'isolated mock recording');
  await writeFile(join(root, 'film.html'), 'keep this film');
  await writeFile(join(root, 'assets/voice.vtt'), 'WEBVTT\n');
  const words = [{ token: '嗯', startSec: 0.4, endSec: 0.6 }, { token: '开场', startSec: 1.2, endSec: 1.5 }];
  assert.equal(await writePodcastSource(root, 'assets/voice.mp3', words), true);
  const saved = await readPodcastSource(root, 'assets/voice.mp3');
  assert.deepEqual(saved, [{ token: '嗯', start: 0.4, end: 0.6 }, { token: '开场', start: 1.2, end: 1.5 }]);
  const cli = join(import.meta.dirname, '../../bin/podcast-cut.mjs');
  const result = JSON.parse(execFileSync(process.execPath, [cli, '--project', root, '--src', 'assets/voice.mp3', '--duration', '2'], { encoding: 'utf8', windowsHide: true }));
  assert.ok(result.cuts.some((cut) => cut.reason === 'filler'));
  assert.equal(result.reviewRequired, true);
  assert.equal(await readFile(join(root, 'film.html'), 'utf8'), 'keep this film');
  assert.equal(await readFile(join(root, 'assets/voice.vtt'), 'utf8'), 'WEBVTT\n');
  await writeFile(join(root, 'assets/voice.mp3'), 'a changed mock recording');
  await assert.rejects(readPodcastSource(root, 'assets/voice.mp3'), /已过期/);
});

test('missing end times or old VTT do not silently become exact cut points', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'podcast-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets/voice.mp3'), 'mock');
  assert.equal(await writePodcastSource(root, 'assets/voice.mp3', [{ token: '我', startSec: 0.1 }]), false);
  await assert.rejects(readPodcastSource(root, 'assets/voice.mp3'), /VTT 不含真实词结束时间/);
  const cli = join(import.meta.dirname, '../../bin/podcast-cut.mjs');
  const json = join(root, 'word-times.json');
  await writeFile(json, JSON.stringify({ durationSec: 1, words: [{ token: '你好', start: 0.1, end: 0.3 }] }));
  const result = JSON.parse(execFileSync(process.execPath, [cli, json], { encoding: 'utf8', windowsHide: true }));
  assert.equal(result.durationSec, 1);
  assert.equal(result.reviewRequired, true);
});

test('replaced audio cannot reuse word times even when its size and modification time match', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'podcast-replaced-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  const recording = join(root, 'assets/voice.mp3');
  await writeFile(recording, 'first recording');
  await utimes(recording, 1000, 1000);
  const before = await stat(recording);
  await writePodcastSource(root, 'assets/voice.mp3', [{ token: '我', startSec: 0.1, endSec: 0.3 }]);
  await writeFile(recording, 'other recording');
  await utimes(recording, 1000, 1000);
  const after = await stat(recording);
  assert.equal(before.size, after.size);
  assert.equal(before.mtimeMs, after.mtimeMs);
  await assert.rejects(readPodcastSource(root, 'assets/voice.mp3'), /已过期/);
});

test('word timings remain bound to the recording version captured before recognition', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'podcast-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  const recording = join(root, 'assets/voice.mp3');
  await writeFile(recording, 'first recording');
  const version = await podcastSourceVersion(root, 'assets/voice.mp3');
  const words = [{ token: '我', startSec: 0.1, endSec: 0.3 }];
  assert.equal(await writePodcastSource(root, 'assets/voice.mp3', words, version), true);
  await writeFile(recording, 'changed recording');
  assert.equal(await writePodcastSource(root, 'assets/voice.mp3', words, version), false);
  await assert.rejects(readPodcastSource(root, 'assets/voice.mp3'), /没有可用的原始逐词时间/);
});
