// @ts-check
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeAtomic } from './atomic.mjs';
import { readable } from './files.mjs';
import { pauseCuts } from './podcast-cut.mjs';

/** @typedef {{token:string,startSec:number,endSec?:number}} SpeechWord */
/** @typedef {{bytes:number,mtimeMs:number,ctimeMs:number,sha256:string}} SourceVersion */

/** @param {import('node:fs').Stats} info */
const sourceMetadata = (info) => ({ bytes: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs });

/** @param {string} root @param {string} src @returns {Promise<SourceVersion>} */
export async function podcastSourceVersion(root, src) {
  const media = readable(root, src);
  const before = sourceMetadata(await stat(media));
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(media)) hash.update(chunk);
  const after = sourceMetadata(await stat(media));
  if (before.bytes !== after.bytes || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
    throw new Error('录音在读取期间发生变化，请确认原文件后再试。');
  }
  return { ...after, sha256: hash.digest('hex') };
}

/** @param {SourceVersion | undefined} saved @param {SourceVersion} current */
function sameSource(saved, current) {
  return saved?.bytes === current.bytes && saved.mtimeMs === current.mtimeMs
    && saved.ctimeMs === current.ctimeMs && saved.sha256 === current.sha256;
}

/** @param {string} root @param {string} src @param {SourceVersion} version */
export async function podcastSourceIsCurrent(root, src, version) {
  return sameSource(version, await podcastSourceVersion(root, src));
}

/** @param {string} root @param {string} src */
async function paths(root, src) {
  const media = readable(root, src);
  const id = createHash('sha256').update(src).digest('hex');
  const directory = join(root, '.film', 'podcast-word-times');
  const cache = join(directory, `${id}.json`);
  for (const target of [join(root, '.film'), directory, cache]) {
    const info = await lstat(target).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (info?.isSymbolicLink()) throw new Error('逐词时间缓存不能通过符号链接读写。');
  }
  return { media, cache };
}

/**
 * Keep actual provider word ends; WebVTT marks only retain word starts. Incomplete timings are not invented.
 * @param {string} root @param {string} src @param {SpeechWord[]} words @param {SourceVersion} [expectedSource]
 */
export async function writePodcastSource(root, src, words, expectedSource) {
  const { media, cache } = await paths(root, src);
  if (!words.length || words.some((word) => word.endSec === undefined)) {
    await rm(cache, { force: true });
    return false;
  }
  const source = expectedSource ?? await podcastSourceVersion(root, src);
  // The caller already checked the digest after ASR; retain that digest rather than hashing a third time.
  const current = { ...sourceMetadata(await stat(media)), sha256: source.sha256 };
  if (!sameSource(source, current)) {
    await rm(cache, { force: true });
    return false;
  }
  const saved = words.map((word) => ({ token: word.token, start: word.startSec, end: /** @type {number} */ (word.endSec) }));
  const through = saved.reduce((end, word) => Math.max(end, word.end), 0);
  // Use the same validation as detection before persisting possibly unusable timestamps.
  try { pauseCuts(saved, Math.max(through, 0.001)); }
  catch {
    await rm(cache, { force: true });
    return false;
  }
  await mkdir(dirname(cache), { recursive: true });
  await writeAtomic(cache, `${JSON.stringify({
    version: 1, src, source, words: saved,
  })}\n`);
  return true;
}

/**
 * Read original timings only while their recording is unchanged. Never calls ASR or estimates ends from VTT.
 * @param {string} root @param {string} src
 * @returns {Promise<Array<{token:string,start:number,end:number}>>}
 */
export async function readPodcastSource(root, src) {
  const { cache } = await paths(root, src);
  let value;
  try { value = JSON.parse(await readFile(cache, 'utf8')); }
  catch { throw new Error('没有可用的原始逐词时间。现有 VTT 不含真实词结束时间；请先确认识别服务与费用，再重新转写。'); }
  if (value?.version !== 1 || value.src !== src || !Array.isArray(value.words)
    || !sameSource(value.source, await podcastSourceVersion(root, src))) {
    throw new Error('录音已更改，原始逐词时间已过期。请确认后重新转写，不要沿用旧剪点。');
  }
  return value.words;
}
