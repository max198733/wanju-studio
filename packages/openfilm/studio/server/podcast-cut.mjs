// @ts-check

export const MIN_PAUSE_SEC = 0.45;
export const FILLER_WORDS = Object.freeze(['嗯', '呃', '啊', '哦', '唉', '这个', '那个', '就是', '然后', '所以说', '其实']);
export const DEFAULT_OPTIONS = Object.freeze({
  minPauseSec: MIN_PAUSE_SEC,
  keepPauseEdgeSec: 0.18,
  singleFillerBoundarySec: 0.12,
  phraseFillerBoundarySec: 0.12,
  maxRepeatGapSec: 0.45,
  maxRepeatWords: 6,
  minRepeatCharacters: 1,
});

/** @typedef {'filler'|'pause'|'repeat'} CutReason */
/** @typedef {{ token:string, start?:number, end?:number, startSec?:number, endSec?:number }} InputWord */
/** @typedef {{ token:string, text:string, start:number, end:number, beforeEnd:number }} Word */
/** @typedef {{ startSec:number, endSec:number, reason:CutReason, reasons:CutReason[], text:string }} CutRange */
/** @typedef {{ minPauseSec?:number, keepPauseEdgeSec?:number, singleFillerBoundarySec?:number,
 * phraseFillerBoundarySec?:number, maxRepeatGapSec?:number, maxRepeatWords?:number, minRepeatCharacters?:number }} Options */

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const EDGE_MARKS = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

/** @param {unknown} words @returns {Word[]} */
function checkedWords(words) {
  if (!Array.isArray(words)) throw new TypeError('words must be an array.');
  let previousStart = -1;
  let previousEnd = -Infinity;
  return words.map((word, index) => {
    if (!word || typeof word !== 'object' || typeof word.token !== 'string' || !word.token.trim()) {
      throw new TypeError(`words[${index}].token must be a nonempty string.`);
    }
    const start = word.start ?? word.startSec;
    const end = word.end ?? word.endSec;
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)
      || start < 0 || end < start || start < previousStart) {
      throw new TypeError(`words[${index}] has invalid or out-of-order second timestamps.`);
    }
    previousStart = start;
    const beforeEnd = previousEnd;
    previousEnd = Math.max(previousEnd, end);
    return { token: word.token.trim(), text: word.token.trim().replace(EDGE_MARKS, ''), start, end, beforeEnd };
  });
}

/** @param {Options} options @param {keyof typeof DEFAULT_OPTIONS} key @param {number} [min] */
function option(options, key, min = 0) {
  const value = options[key] ?? DEFAULT_OPTIONS[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new TypeError(`${key} must be a finite number greater than or equal to ${min}.`);
  }
  return value;
}

/** @param {number} startSec @param {number} endSec @param {CutReason} reason @param {string} text @returns {CutRange} */
function cut(startSec, endSec, reason, text) {
  return { startSec, endSec, reason, reasons: [reason], text };
}

/** @param {Word[]} words @param {number} first @param {number} last @param {number} boundary */
function isolated(words, first, last, boundary) {
  const next = words[last + 1];
  const before = words[first].start - words[first].beforeEnd >= boundary;
  const after = !next || next.start - words[last].end >= boundary;
  return before && after;
}

/**
 * Uses whole word boundaries only. Pauses on both sides protect lexical uses such as "这个人" and "那个地方".
 * Punctuation alone is not evidence of silence.
 * @param {InputWord[]} words @param {Options} [options] @returns {CutRange[]}
 */
export function fillerCuts(words, options = {}) {
  const checked = checkedWords(words).filter((word) => word.text);
  const singleBoundary = option(options, 'singleFillerBoundarySec');
  const phraseBoundary = option(options, 'phraseFillerBoundarySec');
  const cuts = [];
  for (let first = 0; first < checked.length; first++) {
    for (const phrase of FILLER_WORDS) {
      let text = '', last = first;
      for (; last < checked.length && text.length < phrase.length; last++) {
        const gap = last > first ? checked[last].start - checked[last - 1].end : 0;
        if (gap < 0 || gap > 0.2) break;
        text += checked[last].text;
      }
      if (text !== phrase) continue;
      last--;
      const threshold = phrase.length === 1 ? singleBoundary : phraseBoundary;
      if (isolated(checked, first, last, threshold) && checked[last].end > checked[first].start) {
        cuts.push(cut(checked[first].start, checked[last].end, 'filler', phrase));
        first = last;
        break;
      }
    }
  }
  return cuts;
}

/**
 * Keeps a margin on each side of an interior pause, including real head/tail silence. Empty ASR is not silence.
 * @param {InputWord[]} words @param {number} durationSec @param {Options} [options] @returns {CutRange[]}
 */
export function pauseCuts(words, durationSec, options = {}) {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    throw new TypeError('durationSec must be a positive finite number.');
  }
  const checked = checkedWords(words);
  if (checked.some((word) => word.end > durationSec)) throw new TypeError('A word ends after durationSec.');
  const spoken = checked.filter((word) => word.text);
  const minPause = option(options, 'minPauseSec');
  const keep = option(options, 'keepPauseEdgeSec');
  if (!spoken.length) return [];
  /** @type {CutRange[]} */
  const cuts = [];
  /** @param {number} start @param {number} end @param {string} text */
  const add = (start, end, text) => {
    if (end - start > 0.02) cuts.push(cut(start, end, 'pause', text));
  };
  if (spoken[0].start >= minPause) add(0, Math.max(0, spoken[0].start - keep), '片头停顿');
  let frontier = 0;
  for (const word of spoken) {
    if (frontier > 0 && word.start - frontier >= minPause) {
      add(frontier + keep, word.start - keep, `停顿 ${(word.start - frontier).toFixed(2)}s`);
    }
    frontier = Math.max(frontier, word.end);
  }
  if (durationSec - frontier >= minPause) add(frontier + keep, durationSec, '片尾停顿');
  return cuts;
}

/** @param {Word[]} words @param {number} left @param {number} right @param {number} length */
function samePhrase(words, left, right, length) {
  for (let offset = 0; offset < length; offset++) {
    if (words[left + offset]?.text !== words[right + offset]?.text) return false;
  }
  return true;
}

/** @param {string[]} tokens */
function joinTokens(tokens) {
  let result = '';
  for (const token of tokens) {
    result += result && !CJK.test(result.slice(-1)) && !CJK.test(token.slice(0, 1)) ? ` ${token}` : token;
  }
  return result;
}

/** @param {Word[]} words @param {number} from @param {number} to @param {number} maxGap */
function continuous(words, from, to, maxGap) {
  for (let index = from + 1; index < to; index++) {
    const gap = words[index].start - words[index - 1].end;
    if (gap < 0 || gap > maxGap) return false;
  }
  return true;
}

/**
 * Suggests removing earlier consecutive copies. Intentional emphasis still needs listening and human review.
 * @param {InputWord[]} words @param {Options} [options] @returns {CutRange[]}
 */
export function repeatCuts(words, options = {}) {
  const checked = checkedWords(words).filter((word) => word.text);
  const maxGap = option(options, 'maxRepeatGapSec');
  const maxWords = Math.floor(option(options, 'maxRepeatWords', 1));
  const minCharacters = Math.floor(option(options, 'minRepeatCharacters', 1));
  /** @type {CutRange[]} */
  const cuts = [];
  let at = 0;
  while (at < checked.length) {
    if (checked[at].beforeEnd > checked[at].start) { at++; continue; }
    let consumed = 0;
    const limit = Math.min(maxWords, Math.floor((checked.length - at) / 2));
    // The shortest period keeps one copy even when the same word was repeated four or six times.
    for (let length = 1; length <= limit; length++) {
      const phrase = checked.slice(at, at + length);
      if (phrase.reduce((sum, word) => sum + [...word.text].length, 0) < minCharacters) continue;
      if (!samePhrase(checked, at, at + length, length) || !continuous(checked, at, at + 2 * length, maxGap)) continue;
      let repetitions = 2;
      while (at + (repetitions + 1) * length <= checked.length) {
        const next = at + repetitions * length;
        if (!continuous(checked, next - 1, next + length, maxGap) || !samePhrase(checked, at, next, length)) break;
        repetitions++;
      }
      const endSec = checked[at + (repetitions - 1) * length - 1].end;
      if (endSec > checked[at].start) cuts.push(cut(checked[at].start, endSec, 'repeat',
        `${joinTokens(phrase.map((word) => word.text))}（重复 ${repetitions} 次，保留最后一次）`));
      consumed = repetitions * length;
      break;
    }
    at += consumed || 1;
  }
  return cuts;
}

/** @param {CutRange[]} cuts @returns {CutRange[]} */
function mergeCuts(cuts) {
  const ordered = cuts.filter((range) => range.endSec > range.startSec)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  /** @type {CutRange[]} */
  const merged = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (!previous || range.startSec > previous.endSec) {
      merged.push({ ...range, reasons: [...range.reasons] });
      continue;
    }
    previous.endSec = Math.max(previous.endSec, range.endSec);
    for (const reason of range.reasons) if (!previous.reasons.includes(reason)) previous.reasons.push(reason);
    if (range.text && !previous.text.includes(range.text)) previous.text = `${previous.text}; ${range.text}`;
  }
  return merged;
}

/**
 * Only produces review suggestions; never edits a project, media or transcript.
 * @param {InputWord[]} words @param {number} durationSec @param {Options} [options] @returns {CutRange[]}
 */
export function podcastCuts(words, durationSec, options = {}) {
  return mergeCuts([
    ...pauseCuts(words, durationSec, options),
    ...fillerCuts(words, options),
    ...repeatCuts(words, options),
  ]);
}
