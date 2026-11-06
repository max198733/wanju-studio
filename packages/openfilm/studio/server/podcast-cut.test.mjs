import test from 'node:test';
import assert from 'node:assert/strict';
import { fillerCuts, pauseCuts, podcastCuts, repeatCuts } from './podcast-cut.mjs';

const word = (token, start, end) => ({ token, start, end });

test('single-character fillers need boundaries on both sides; embedded phrase words are preserved', () => {
  const words = [
    word('我', 0, 0.18), word('嗯', 0.4, 0.55), word('觉得', 0.8, 1.1),
    word('这个', 1.2, 1.45), word('人', 1.46, 1.6),
    word('，', 1.7, 1.7), word('然后', 1.9, 2.15), word('走了', 2.4, 2.7),
    word('啊', 3.1, 3.2), word('！', 3.21, 3.21),
  ];
  const cuts = fillerCuts(words);
  assert.deepEqual(cuts.map(({ text }) => text), ['嗯', '然后', '啊']);
  assert.deepEqual(cuts[0], { startSec: 0.4, endSec: 0.55, reason: 'filler', reasons: ['filler'], text: '嗯' });
});

test('lexical fillers at sentence start and supplementary characters remain intact', () => {
  assert.deepEqual(fillerCuts([word('这个', 0, 0.2), word('人', 0.2, 0.4)]), []);
  assert.deepEqual(fillerCuts([word('𠮷', 0, 0.2), word('嗯', 0.4, 0.55), word('你好', 0.8, 1.1)])
    .map((range) => range.text), ['嗯']);
  assert.deepEqual(fillerCuts([word('这个人', 0, 0.6)]), []);
});

test('long pauses keep a margin around speech and include head and tail silence', () => {
  const cuts = pauseCuts([
    word('开场', 0.8, 1.1),
    word('中间', 2, 2.3),
  ], 3.2);
  assert.deepEqual(cuts.map(({ startSec, endSec }) => [Number(startSec.toFixed(3)), Number(endSec.toFixed(3))]), [
    [0, 0.62], [1.28, 1.82], [2.48, 3.2],
  ]);
  assert.deepEqual(pauseCuts([word('a', 0.1, 0.2), word('b', 0.55, 0.6)], 0.7), []);
  assert.throws(() => pauseCuts([word('a', 0.1, 0.2)], 0.15), /after durationSec/);
});

test('repeat detection removes earlier consecutive words and short phrases only', () => {
  const cuts = repeatCuts([
    word('我', 0, 0.1), word('我', 0.2, 0.3),
    word('想', 0.45, 0.55), word('去', 0.6, 0.7),
    word('想', 0.9, 1), word('去', 1.05, 1.15),
    word('家', 1.4, 1.55),
  ]);
  assert.deepEqual(cuts.map(({ startSec, endSec, text }) => [startSec, endSec, text]), [
    [0, 0.1, '我（重复 2 次，保留最后一次）'],
    [0.45, 0.7, '想去（重复 2 次，保留最后一次）'],
  ]);
  assert.deepEqual(repeatCuts([
    word('很', 0, 0.1), word('很', 1, 1.1),
  ]), []);
});

test('combined suggestions merge overlaps while retaining every reason', () => {
  const cuts = podcastCuts([
    word('嗯', 0.4, 0.6), word('我', 1.2, 1.4),
  ], 1.8, { minPauseSec: 0.45, keepPauseEdgeSec: 0 });
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].reason, 'filler');
  assert.deepEqual(cuts[0].reasons, ['filler', 'pause']);
  assert.equal(cuts[0].startSec, 0.4);
  assert.equal(cuts[0].endSec, 1.2);
});

test('word input must carry ordered, finite seconds and cut ranges are deterministic', () => {
  assert.throws(() => fillerCuts([word('我', 1, 1.2), word('你', 0.5, 0.7)]), /out-of-order/);
  assert.throws(() => repeatCuts([word('我', 0, Number.NaN)]), /timestamps/);
  const input = [word('我', 0, 0.1), word('我', 0.2, 0.3), word('好', 0.8, 1)];
  assert.deepEqual(podcastCuts(input, 1.2), podcastCuts(input, 1.2));
});

test('empty transcripts and overlapping speech never imply a removable silent recording', () => {
  assert.deepEqual(podcastCuts([], 600), []);
  const input = [word('第一人', 0, 4), word('第二人', 1, 1.5), word('交谈', 3, 4.5)];
  assert.deepEqual(pauseCuts(input, 4.5), []);
  assert.throws(() => podcastCuts([word('较长', 0, 5), word('结尾', 1, 2)], 4), /after durationSec/);
});

test('repeated groups are bounded by real pauses and keep the final copy', () => {
  assert.deepEqual(repeatCuts([word('我们', 0, 0.3), word('我们', 0.4, 0.7), word('我们', 0.8, 1.1)])
    .map((range) => [range.startSec, range.endSec]), [[0, 0.7]]);
  assert.deepEqual(repeatCuts([
    word('今天', 0, 0.2), word('去', 5, 5.2), word('今天', 5.3, 5.5), word('去', 10, 10.2),
  ]), []);
});

test('four or six repeated copies keep only the final word or phrase', () => {
  for (const count of [4, 6]) {
    const words = Array.from({ length: count }, (_, index) => word('我', index * 0.2, index * 0.2 + 0.1));
    assert.deepEqual(repeatCuts(words).map((range) => [range.startSec, range.endSec]),
      [[0, words[count - 2].end]]);
  }
  const words = Array.from({ length: 4 }, (_, index) => [
    word('今天', index, index + 0.2), word('出发', index + 0.3, index + 0.6),
  ]).flat();
  assert.deepEqual(repeatCuts(words).map((range) => [range.startSec, range.endSec]), [[0, 2.6]]);
});

test('filler and repetition suggestions never remove another overlapping voice', () => {
  const words = [
    word('主持人持续讲话', 0, 4), word('嘉宾', 0.2, 0.4),
    word('嗯', 1, 1.2), word('继续', 2, 2.3),
  ];
  assert.deepEqual(fillerCuts(words), []);
  assert.deepEqual(repeatCuts([
    word('主持人持续讲话', 0, 4), word('嘉宾', 0.2, 0.4),
    word('我', 1, 1.1), word('我', 1.2, 1.3),
  ]), []);
  assert.deepEqual(fillerCuts([
    word('这', 0, 1), word('个', 0.3, 0.5), word('继续', 2, 2.3),
  ]), []);
});
