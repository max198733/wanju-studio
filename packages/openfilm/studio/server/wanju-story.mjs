// @ts-check
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import mammoth from 'mammoth';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { writeAtomic } from './atomic.mjs';
import { inside, importFile, cleanName } from './files.mjs';
import { WanjuError } from './wanju-model.mjs';

const PDFJS_BUILD = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs');
GlobalWorkerOptions.workerSrc = new URL(
  './pdf.worker.mjs',
  PDFJS_BUILD,
).href;

export const STORY_SOURCE_LIMIT = 20 * 1024 * 1024;
export const STORY_PAGE_LIMIT = 12_000;
const STORY_FILE = '.film/wanju-story.json';
const PLAN_BYTES_LIMIT = 6 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const STORY_FORMATS = new Set(['.txt', '.md', '.docx', '.pdf']);

/**
 * @typedef {{ id: string, name: string, description: string }} StoryEntity
 * @typedef {{ number: number, title: string, summary: string, hook: string }} StoryOutline
 * @typedef {{ format: 'series'|'short', title: string, logline: string, synopsis: string, adaptationNotes: string,
 * style: string, ratio: '9:16'|'16:9'|'1:1', targetEpisodeSeconds: number|null, plannedEpisodes: number|null,
 * characters: StoryEntity[], scenes: StoryEntity[], props: StoryEntity[], episodeOutlines: StoryOutline[] }} StoryPlan
 * @typedef {{ number: number, title: string, script: string, projectId?: string, archived?: boolean }} StoryEpisode
 * @typedef {{ version: 1, seriesId?: string, sources: Array<Record<string, any>>, plan: StoryPlan|null, episodes: StoryEpisode[] }} StoryData
 * @typedef {{ number: number, projectId: string }} ProjectLink
 * @typedef {{ seriesId?: string, projectLink?: ProjectLink }} SaveStoryOptions
 */

/** @param {string|Buffer} value */
const digest = (value) => createHash('sha256').update(value).digest('hex');

/** @returns {StoryData} */
export function blankStory() {
  return { version: /** @type {const} */ (1), sources: [], plan: null, episodes: [] };
}

/** @param {StoryData} story */
export function storyRevision(story) {
  return digest(JSON.stringify(story)).slice(0, 32);
}

/** @param {string} text */
function chapterIndex(text) {
  const chapters = [];
  let count = 0;
  let line = 1;
  let cursor = 0;
  const pattern = /^(?:第[0-9０-９一二三四五六七八九十百千万零〇两]+[章节回卷部篇集][^\r\n]{0,100}|Chapter\s+\d+\b[^\r\n]{0,100})\s*$/gim;
  for (const match of text.matchAll(pattern)) {
    const offset = match.index ?? 0;
    while (cursor < offset) {
      if (text.charCodeAt(cursor) === 10) line++;
      cursor++;
    }
    count++;
    if (chapters.length < 300) chapters.push({
      title: match[0].trim(),
      offset,
      line,
    });
  }
  return { chapters, count };
}

/** @param {Buffer} bytes */
async function docxText(bytes) {
  try {
    const result = await mammoth.extractRawText({ buffer: bytes });
    const text = result.value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
    if (!text) throw new Error('empty document');
    return text;
  } catch {
    throw new WanjuError('DOCX 正文无法解析，请重新导出为标准 DOCX 并确认文档包含文字。', 422);
  }
}

/** @param {Buffer} bytes */
async function pdfText(bytes) {
  const loading = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    cMapUrl: new URL('../../cmaps/', PDFJS_BUILD).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('../../standard_fonts/', PDFJS_BUILD).href,
  });
  try {
    const document = await loading.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      let line = '';
      /** @type {{ dir: string, transform: number[], width: number }|null} */
      let previous = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        if (previous && item.str && !/\s$/u.test(line) && !/^\s/u.test(item.str)) {
          const fontSize = Math.hypot(item.transform[0], item.transform[1]);
          const previousEnd = previous.transform[4] + (previous.dir === 'rtl' ? -previous.width : previous.width);
          const gap = item.dir === 'rtl' ? previous.transform[4] - item.transform[4] - previous.width
            : item.transform[4] - previousEnd;
          if (gap > Math.max(1, fontSize * 0.25)) line += ' ';
        }
        line += item.str;
        if (item.hasEOL) {
          if (line.trim()) lines.push(line.trimEnd());
          line = '';
          previous = null;
        } else {
          previous = { dir: item.dir, transform: item.transform, width: item.width };
        }
      }
      if (line.trim()) lines.push(line.trimEnd());
      pages.push(lines.join('\n'));
    }
    const text = pages.map((page) => page.trim()).filter(Boolean).join('\n\n').trim();
    if (!text) throw new WanjuError('PDF 没有可直接提取的文字；扫描版请先 OCR 或另存为 TXT。', 422);
    return text;
  } catch (error) {
    if (error instanceof WanjuError) throw error;
    throw new WanjuError('PDF 文件结构或正文无法解析；扫描版请先 OCR 或另存为 TXT。', 422);
  } finally {
    await loading.destroy();
  }
}

/** @param {Buffer} bytes */
function decodePlainText(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > STORY_SOURCE_LIMIT) throw new WanjuError('小说文件不能超过 20 MiB。', 413);
  if (!bytes.length) throw new WanjuError('小说文件为空。', 422);

  let encoding = 'utf-8';
  let payload = bytes;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) payload = bytes.subarray(3);
  else if (bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    encoding = 'utf-16le';
    payload = bytes.subarray(2);
  } else if (bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    encoding = 'utf-16be';
    payload = bytes.subarray(2);
  }

  let text;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(payload); }
  catch {
    if (encoding !== 'utf-8') throw new WanjuError('小说文本编码无法识别，请另存为 UTF-8 或 GB18030。', 422);
    try {
      encoding = 'gb18030';
      text = new TextDecoder(encoding, { fatal: true }).decode(payload);
    } catch { throw new WanjuError('小说文本编码无法识别，请另存为 UTF-8 或 GB18030。', 422); }
  }

  text = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  if (!text.trim()) throw new WanjuError('小说文件没有可读取的正文。', 422);
  let characters = 0;
  for (const _character of text) characters++;
  return {
    text,
    encoding,
    characters,
    ...chapterIndex(text),
  };
}

/** @param {Buffer} bytes @param {string} [name] */
export async function decodeStorySource(bytes, name = '') {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > STORY_SOURCE_LIMIT) throw new WanjuError('小说文件不能超过 20 MiB。', 413);
  if (!bytes.length) throw new WanjuError('小说文件为空。', 422);
  const extension = extname(name).toLowerCase();
  let text;
  let encoding;
  if (extension === '.docx') {
    text = await docxText(bytes);
    encoding = 'docx';
  } else if (extension === '.pdf') {
    text = await pdfText(bytes);
    encoding = 'pdf';
  } else {
    return decodePlainText(bytes);
  }
  if (!text) throw new WanjuError('小说文件没有可读取的正文。', 422);
  let characters = 0;
  for (const _character of text) characters++;
  return { text, encoding, characters, ...chapterIndex(text) };
}

/** @param {AsyncIterable<Buffer>} stream */
export async function readStoryUpload(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > STORY_SOURCE_LIMIT) throw new WanjuError('小说文件不能超过 20 MiB。', 413);
    chunks.push(chunk);
  }
  if (!size) throw new WanjuError('小说文件为空。', 422);
  return Buffer.concat(chunks, size);
}

/** @param {StoryPlan|null} plan @param {StoryEpisode[]} [episodes] @returns {{ plan: StoryPlan, episodes: StoryEpisode[] }|null} */
export function validateStoryPlan(plan, episodes = []) {
  if (!Array.isArray(episodes)) throw new WanjuError('分集剧本列表格式无效。');
  if (plan === null) {
    if (episodes.length) throw new WanjuError('没有策划方案时不能保存分集剧本。');
    return null;
  }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new WanjuError('策划方案格式无效。');
  /** @param {unknown} value @param {string} name @param {number} max @param {{required?: boolean}} [options] */
  const text = (value, name, max, { required = false } = {}) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
      throw new WanjuError(`${name}格式无效。`);
    }
    return value.trim();
  };
  /** @param {number|null} value @param {string} name @param {number} min @param {number} max */
  const integer = (value, name, min, max) => {
    if (value !== null && (!Number.isInteger(value) || value < min || value > max)) {
      throw new WanjuError(`${name}超出允许范围。`);
    }
    return value;
  };
  /** @template T @param {unknown} value @param {string} name @param {number} max @param {(entry: any) => T} item @returns {T[]} */
  const list = (value, name, max, item) => {
    if (!Array.isArray(value) || value.length > max) throw new WanjuError(`${name}列表格式无效。`);
    return value.map(item);
  };
  /** @param {unknown} value @param {string} name @param {number} max */
  const namedItems = (value, name, max) => list(value, name, max, (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !ID.test(entry.id ?? '')) {
      throw new WanjuError(`${name}条目格式无效。`);
    }
    return {
      id: entry.id,
      name: text(entry.name, `${name}名称`, 200, { required: true }),
      description: text(entry.description, `${name}说明`, 8000),
    };
  });
  if (!['series', 'short'].includes(plan.format)) throw new WanjuError('作品形式必须是 series 或 short。');
  if (!['9:16', '16:9', '1:1'].includes(plan.ratio)) throw new WanjuError('画幅格式无效。');

  const checked = {
    format: plan.format,
    title: text(plan.title, '项目名称', 200, { required: true }),
    logline: text(plan.logline, '故事梗概', 5000),
    synopsis: text(plan.synopsis, '全剧梗概', 30000),
    adaptationNotes: text(plan.adaptationNotes, '改编说明', 20000),
    style: text(plan.style, '风格说明', 2000),
    ratio: plan.ratio,
    targetEpisodeSeconds: integer(plan.targetEpisodeSeconds, '单集时长', 15, 3600),
    plannedEpisodes: integer(plan.plannedEpisodes, '计划集数', 1, 1000),
    characters: namedItems(plan.characters, '人物', 100),
    scenes: namedItems(plan.scenes, '场景', 100),
    props: namedItems(plan.props, '道具', 200),
    episodeOutlines: list(plan.episodeOutlines, '分集大纲', 200, (entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || !Number.isInteger(entry.number) || entry.number < 1 || entry.number > 1000) {
        throw new WanjuError('分集大纲条目格式无效。');
      }
      return {
        number: entry.number,
        title: text(entry.title, '分集标题', 200, { required: true }),
        summary: text(entry.summary, '分集梗概', 8000),
        hook: text(entry.hook, '分集结尾钩子', 3000),
      };
    }),
  };
  const checkedEpisodes = list(episodes, '分集剧本', 200, (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || !Number.isInteger(entry.number) || entry.number < 1 || entry.number > 1000) {
      throw new WanjuError('分集剧本条目格式无效。');
    }
    if (entry.projectId !== undefined && (typeof entry.projectId !== 'string' || !ID.test(entry.projectId))) {
      throw new WanjuError('分集工程编号无效。');
    }
    const script = text(entry.script, '分集剧本', 150000);
    if (entry.archived !== undefined && typeof entry.archived !== 'boolean') {
      throw new WanjuError('分集归档状态无效。');
    }
    if (entry.archived === true && !script) throw new WanjuError('没有已保存剧本的分集不能归档。');
    return {
      number: entry.number,
      title: text(entry.title, '分集标题', 200, { required: true }),
      script,
      ...(entry.projectId === undefined ? {} : { projectId: entry.projectId }),
      ...(entry.archived === true ? { archived: true } : {}),
    };
  });
  const numbers = checkedEpisodes.map((episode) => episode.number);
  if (new Set(numbers).size !== numbers.length) throw new WanjuError('同一集不能重复保存。');
  const result = { plan: checked, episodes: checkedEpisodes };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > PLAN_BYTES_LIMIT) {
    throw new WanjuError('策划和分集剧本总量不能超过 6 MiB。', 413);
  }
  return result;
}

/** @param {string} root @returns {Promise<{story: StoryData, revision: string}>} */
export async function readStory(root) {
  try {
    const story = JSON.parse(await readFile(join(root, STORY_FILE), 'utf8'));
    if (story?.version !== 1 || !Array.isArray(story.sources) || !Array.isArray(story.episodes)) {
      throw new Error('invalid story metadata');
    }
    return { story: /** @type {StoryData} */ (story), revision: storyRevision(story) };
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw new WanjuError('小说工作区资料无法读取，请保留 .film/wanju-story.json 并检查格式。', 422);
    const story = blankStory();
    return { story, revision: storyRevision(story) };
  }
}

/**
 * @param {string} root @param {string} base @param {StoryPlan|null} plan @param {StoryEpisode[]} [episodes]
 * @param {SaveStoryOptions} [options]
 */
export async function saveStory(root, base, plan, episodes = [], options = {}) {
  const current = await readStory(root);
  if (base !== current.revision) throw new WanjuError('小说策划已更新，请重新读取后再保存。', 409);
  const checked = validateStoryPlan(plan, episodes);
  const previousLinks = new Map(current.story.episodes
    .filter((episode) => episode.projectId)
    .map((episode) => [episode.number, episode.projectId]));
  const linkedNumber = options.projectLink?.number ?? -1;
  const linkedProjectId = options.projectLink?.projectId;
  const seriesId = options.seriesId ?? current.story.seriesId ?? randomUUID();
  if (typeof seriesId !== 'string' || !ID.test(seriesId)) throw new WanjuError('系列工程编号无效。');
  if (options.projectLink && (!Number.isInteger(linkedNumber) || linkedNumber < 1
    || typeof linkedProjectId !== 'string' || !ID.test(linkedProjectId))) {
    throw new WanjuError('分集剪辑工程关联无效。');
  }
  const savedEpisodes = checked?.episodes.map((/** @type {StoryEpisode} */ episode) => {
    const projectId = episode.number === linkedNumber
      ? linkedProjectId
      : previousLinks.get(episode.number);
    return projectId ? { ...episode, projectId } : episode;
  }) ?? [];
  const story = /** @type {StoryData} */ ({
    version: 1,
    seriesId,
    sources: current.story.sources,
    plan: checked?.plan ?? null,
    episodes: savedEpisodes,
  });
  await mkdir(join(root, '.film'), { recursive: true });
  await writeAtomic(join(root, STORY_FILE), JSON.stringify(story, null, 2) + '\n');
  return { story, revision: storyRevision(story) };
}

/** @param {string} root @param {string} base @param {string} name @param {Buffer} bytes */
export async function importStorySource(root, base, name, bytes) {
  const current = await readStory(root);
  if (base !== current.revision) throw new WanjuError('小说工作区已更新，请重新读取后再导入。', 409);
  const clean = cleanName(basename(name));
  if (!clean || !STORY_FORMATS.has(extname(clean).toLowerCase())) {
    throw new WanjuError('小说原文支持 TXT、Markdown、DOCX 和 PDF 文件。');
  }
  const decoded = await decodeStorySource(bytes, clean);
  const id = digest(bytes);
  const existing = current.story.sources.find((source) => source.id === id);
  if (existing) return {
    revision: current.revision, source: existing, reused: true, preview: decoded.text.slice(0, 1200),
  };
  if (current.story.sources.length >= 30) throw new WanjuError('每个项目最多保存 30 份小说或剧本原文。');

  const rel = `剧本资料/原著/${id}-${clean}`;
  const imported = await importFile(root, rel, Readable.from([bytes]));
  const source = {
    id,
    name: clean,
    path: imported.path,
    bytes: bytes.length,
    format: extname(clean).slice(1).toLowerCase(),
    encoding: decoded.encoding,
    characters: decoded.characters,
    chapterCount: decoded.count,
    chapters: decoded.chapters,
    importedAt: new Date().toISOString(),
  };
  const story = { ...current.story, sources: [...current.story.sources, source] };
  await mkdir(join(root, '.film'), { recursive: true });
  await writeAtomic(join(root, STORY_FILE), JSON.stringify(story, null, 2) + '\n');
  return {
    revision: storyRevision(story), source, reused: imported.reused,
    preview: decoded.text.slice(0, 1200),
  };
}

/** @param {string} root @param {string} sourceId @param {number} [offset] @param {number} [limit] */
export async function readStorySource(root, sourceId, offset = 0, limit = STORY_PAGE_LIMIT) {
  if (!/^[a-f0-9]{64}$/.test(sourceId)) throw new WanjuError('小说来源编号无效。');
  if (!Number.isSafeInteger(offset) || offset < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > STORY_PAGE_LIMIT) {
    throw new WanjuError('正文分页参数无效。');
  }
  const { story } = await readStory(root);
  const source = story.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new WanjuError('找不到这份小说原文。', 404);
  let bytes;
  try { bytes = await readFile(inside(root, source.path)); }
  catch { throw new WanjuError('小说原文文件缺失或无法读取；原有策划仍已保留。', 404); }
  if (digest(bytes) !== source.id) throw new WanjuError('小说原文与导入时不同，请重新导入后再继续。', 409);
  const decoded = await decodeStorySource(bytes, source.name);
  const content = decoded.text.slice(offset, offset + limit);
  const nextOffset = offset + content.length;
  return {
    source: { id: source.id, name: source.name, characters: decoded.characters, chapterCount: source.chapterCount },
    ...(offset === 0 ? { chapters: source.chapters } : {}),
    offset,
    content,
    nextOffset: nextOffset < decoded.text.length ? nextOffset : null,
    done: nextOffset >= decoded.text.length,
  };
}
