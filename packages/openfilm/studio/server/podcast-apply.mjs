// @ts-check
import { clipFade } from '../../src/film-doc.mjs';

/** @typedef {{ src: string, id: string, at?: number, time?: number[], speed?: number, overrides?: unknown[], attrs?: Record<string, string>, [field: string]: unknown }} Clip */
/** @typedef {{ clips: Clip[], locked?: boolean, hidden?: boolean, muted?: boolean }} Track */
/** @typedef {{ stage?: { w: number, h: number }, tracks: Track[] }} FilmValue */
/** @typedef {{ startSec: number, endSec: number, reason?: string, reasons?: string[], text?: string }} CutRange */
/** @typedef {{ op: 'remove', clip: string } | { op: 'insert', clip: Clip, track: number } | { op: 'move', clip: string, at: number }} PodcastOp */

/** @param {number} value */
const round = (value) => Math.round(value * 1000) / 1000;

/** @param {FilmValue} film @param {string} src @param {string|undefined} clipId */
function targetClip(film, src, clipId) {
  const matches = [];
  for (let track = 0; track < film.tracks.length; track++) {
    for (let index = 0; index < film.tracks[track].clips.length; index++) {
      const clip = film.tracks[track].clips[index];
      if (clip.src === src) matches.push({ track, index, clip });
    }
  }
  if (clipId) {
    const found = matches.find((entry) => entry.clip.id === clipId);
    if (!found) throw new Error(`时间线上找不到指定音频片段“${clipId}”。`);
    return found;
  }
  if (!matches.length) throw new Error('时间线上没有使用这份录音的音频片段。');
  if (matches.length > 1) throw new Error('这份录音在时间线上有多个片段，请先指定要应用的片段。');
  return matches[0];
}

/** @param {CutRange[]} cuts @param {number} start @param {number} end */
function retainedRanges(cuts, start, end) {
  const ordered = cuts
    .filter((cut) => Number.isFinite(cut.startSec) && Number.isFinite(cut.endSec))
    .map((cut) => /** @type {[number, number]} */ ([Math.max(start, cut.startSec), Math.min(end, cut.endSec)]))
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  /** @type {[number, number][]} */
  const merged = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (!previous || range[0] > previous[1]) merged.push(range);
    else previous[1] = Math.max(previous[1], range[1]);
  }
  const kept = [];
  let cursor = start;
  for (const [from, to] of merged) {
    if (from > cursor) kept.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) kept.push([cursor, end]);
  return { kept, removedSourceSec: Math.max(0, end - start - kept.reduce((sum, [from, to]) => sum + to - from, 0)) };
}

/**
 * Build one atomic Studio edit. It removes only the selected audio clip, recreates its kept source ranges,
 * and ripples clips that start after the original clip on the same track.
 * @param {FilmValue} film
 * @param {string} src
 * @param {CutRange[]} cuts
 * @param {number} durationSec
 * @param {string|undefined} clipId
 */
export function podcastCutOps(film, src, cuts, durationSec, clipId) {
  if (!film || !Array.isArray(film.tracks)) throw new Error('当前时间线无法读取，未应用口播剪辑。');
  if (!Array.isArray(cuts) || !cuts.length) return { ops: [], clipId: clipId ?? null, removedSec: 0, kept: [] };
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('录音时长无效，未应用口播剪辑。');
  const target = targetClip(film, src, clipId);
  if (film.tracks[target.track].locked) throw new Error('这条轨道已锁定，请先解锁后再应用口播剪辑。');
  const sourceStart = Array.isArray(target.clip.time) && Number.isFinite(target.clip.time[0]) ? target.clip.time[0] : 0;
  const sourceEnd = Array.isArray(target.clip.time) && Number.isFinite(target.clip.time[1])
    ? target.clip.time[1] : durationSec;
  const speed = typeof target.clip.speed === 'number' && target.clip.speed > 0 ? target.clip.speed : 1;
  if (!(sourceEnd > sourceStart) || sourceEnd > durationSec + 0.001) throw new Error('时间线片段的源范围超出录音时长，未应用口播剪辑。');
  const { kept, removedSourceSec } = retainedRanges(cuts, sourceStart, sourceEnd);
  if (!removedSourceSec) return { ops: [], clipId: target.clip.id, removedSec: 0, kept };
  const linkedIds = new Set(film.tracks[target.track].clips
    .filter((clip) => clip.id === target.clip.id || (clip.at ?? 0) >= (target.clip.at ?? 0) + (sourceEnd - sourceStart) / speed - 0.001)
    .map((clip) => clip.attrs?.['data-link']).filter(Boolean));
  if (film.tracks.some((track, index) => index !== target.track
    && track.clips.some((clip) => linkedIds.has(clip.attrs?.['data-link'])))) {
    throw new Error('本次剪辑会影响与其他轨道联动的片段，可能造成音画错位。请先解除相关联动或在时间线上同步剪辑。');
  }
  const originalAt = typeof target.clip.at === 'number' ? target.clip.at : 0;
  const originalDuration = (sourceEnd - sourceStart) / speed;
  const originalEndAt = originalAt + originalDuration;
  const removedTimelineSec = removedSourceSec / speed;
  /** @type {PodcastOp[]} */
  const ops = [{ op: 'remove', clip: target.clip.id }];
  const usedIds = new Set(film.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const fade = clipFade(target.clip);
  let outputAt = originalAt;
  for (const [segmentIndex, [from, to]] of kept.entries()) {
    const clip = structuredClone(target.clip);
    const suffix = `-keep-${segmentIndex + 1}`;
    const baseId = `${target.clip.id.slice(0, 64 - suffix.length)}${suffix}`;
    clip.id = baseId;
    for (let collision = 2; usedIds.has(clip.id); collision++) {
      const uniqueSuffix = `-${collision}`;
      clip.id = `${baseId.slice(0, 64 - uniqueSuffix.length)}${uniqueSuffix}`;
    }
    usedIds.add(clip.id);
    clip.time = [round(from), round(to)];
    if (fade) {
      const overrides = (clip.overrides ?? []).filter((entry) =>
        !(entry && typeof entry === 'object' && 'fade' in entry && !('at' in entry)));
      const segmentFade = [segmentIndex === 0 ? fade[0] : 0, segmentIndex === kept.length - 1 ? fade[1] : 0];
      if (segmentFade.some((value) => value > 0)) overrides.unshift({ fade: segmentFade });
      if (overrides.length) clip.overrides = overrides;
      else delete clip.overrides;
    }
    if (outputAt > 0) clip.at = round(outputAt);
    else delete clip.at;
    ops.push({ op: 'insert', clip, track: target.track });
    outputAt += (to - from) / speed;
  }
  for (const [trackIndex, track] of film.tracks.entries()) {
    if (trackIndex !== target.track) continue;
    for (const clip of track.clips) {
      if (clip.id === target.clip.id || typeof clip.at !== 'number' || clip.at < originalEndAt - 0.001) continue;
      ops.push({ op: 'move', clip: clip.id, at: round(clip.at - removedTimelineSec) });
    }
  }
  return { ops, clipId: target.clip.id, removedSec: removedTimelineSec, kept };
}
