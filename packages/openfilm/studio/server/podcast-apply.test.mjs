import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps } from './ops.mjs';
import { podcastCutOps } from './podcast-apply.mjs';
import { clipFade } from '../../src/film-doc.mjs';

test('podcast cut ops rebuild one audio clip and ripple later clips on the same track', () => {
  const film = {
    stage: { w: 1920, h: 1080 },
    tracks: [{
      clips: [
        { id: 'voice', src: 'assets/voice.mp3', time: [0, 10] },
        { id: 'later', src: 'assets/later.mp3', at: 10 },
      ],
    }],
  };
  const result = podcastCutOps(film, 'assets/voice.mp3', [
    { startSec: 2, endSec: 3 },
    { startSec: 5, endSec: 5.5 },
  ], 10);
  assert.equal(result.clipId, 'voice');
  assert.equal(result.removedSec, 1.5);
  const next = applyOps(structuredClone(film), result.ops);
  assert.deepEqual(next.tracks[0].clips.map((clip) => ({
    id: clip.id, at: clip.at ?? 0, time: clip.time,
  })), [
    { id: 'voice-keep-1', at: 0, time: [0, 2] },
    { id: 'voice-keep-2', at: 2, time: [3, 5] },
    { id: 'voice-keep-3', at: 4, time: [5.5, 10] },
    { id: 'later', at: 8.5, time: undefined },
  ]);
});

test('podcast cut ops requires a clip when a recording is used more than once', () => {
  const film = { tracks: [{ clips: [
    { id: 'a', src: 'voice.mp3' }, { id: 'b', src: 'voice.mp3', at: 4 },
  ] }] };
  assert.throws(() => podcastCutOps(film, 'voice.mp3', [{ startSec: 1, endSec: 2 }], 8), /多个片段/);
});

test('podcast cuts keep fades at the outer ends and never reuse an existing clip id', () => {
  const film = { tracks: [{ clips: [
    { id: 'voice', src: 'voice.mp3', time: [0, 10], overrides: [{ fade: [0.5, 1] }] },
    { id: 'voice-keep-1', src: 'voice.mp3', time: [0, 1], at: 12 },
  ] }] };
  const result = podcastCutOps(film, 'voice.mp3', [
    { startSec: 2, endSec: 3 }, { startSec: 5, endSec: 6 },
  ], 10, 'voice');
  const next = applyOps(structuredClone(film), result.ops);
  assert.deepEqual(next.tracks[0].clips.map((clip) => clip.id),
    ['voice-keep-1-2', 'voice-keep-2', 'voice-keep-3', 'voice-keep-1']);
  assert.deepEqual(next.tracks[0].clips.map(clipFade), [[0.5, 0], null, [0, 1], null]);
  assert.deepEqual(film.tracks[0].clips[0].overrides, [{ fade: [0.5, 1] }], 'planning leaves the original clip untouched');
});

test('podcast cuts respect locked tracks and trimmed clips at playback speed', () => {
  const film = { tracks: [{ locked: true, clips: [
    { id: 'voice', src: 'voice.mp3', time: [2, 8], speed: 2, at: 4 },
    { id: 'later', src: 'later.mp3', at: 7 },
  ] }] };
  const cuts = [{ startSec: 0, endSec: 1 }, { startSec: 3, endSec: 5 }];
  assert.throws(() => podcastCutOps(film, 'voice.mp3', cuts, 10), /锁定/);
  delete film.tracks[0].locked;
  const result = podcastCutOps(film, 'voice.mp3', cuts, 10);
  assert.equal(result.removedSec, 1);
  const next = applyOps(structuredClone(film), result.ops);
  assert.deepEqual(next.tracks[0].clips.map((clip) => [clip.time, clip.at]),
    [[[2, 3], 4], [[5, 8], 4.5], [undefined, 6]]);
});

test('podcast cuts refuse to desynchronize linked clips on other tracks, including rippled followers', () => {
  const film = { tracks: [
    { clips: [
      { id: 'voice', src: 'voice.mp3', time: [0, 10], attrs: { 'data-link': 'voice-video' } },
      { id: 'later', src: 'later.mp3', at: 10, attrs: { 'data-link': 'later-video' } },
    ] },
    { clips: [
      { id: 'picture', src: 'voice.mp4', time: [0, 10], attrs: { 'data-link': 'voice-video' } },
      { id: 'later-picture', src: 'later.mp4', at: 10, attrs: { 'data-link': 'later-video' } },
    ] },
  ] };
  const cuts = [{ startSec: 2, endSec: 3 }];
  const before = structuredClone(film);
  assert.throws(() => podcastCutOps(film, 'voice.mp3', cuts, 10), /音画错位/);
  delete film.tracks[0].clips[0].attrs;
  assert.throws(() => podcastCutOps(film, 'voice.mp3', cuts, 10), /音画错位/, 'later linked clips must not ripple alone either');
  delete film.tracks[0].clips[1].attrs;
  assert.ok(podcastCutOps(film, 'voice.mp3', cuts, 10).ops.length > 0);
  assert.deepEqual(film.tracks[1], before.tracks[1]);
});
