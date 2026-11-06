import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = join(root, 'tools/style-assets/skill-build');
const defaultOverrides = join(root, 'tools/style-assets/overrides');
const defaultOutput = join(root, 'packages/openfilm/skills-extra');
const series = {
  AG: { icon: 'shapes' }, M: { icon: 'monitor' }, K: { icon: 'shapes' },
  Z: { icon: 'pen' }, H: { icon: 'layers' }, L: { icon: 'presentation' },
  V: { icon: 'shapes' }, X: { icon: 'film' }, R: { icon: 'film' }, O: { icon: 'film' },
};
const seriesOrder = Object.keys(series);
const coverColors = {
  AG: ['#17374b', '#55b7ad'], M: ['#283d42', '#e7a44d'], K: ['#354b43', '#e58c69'],
  Z: ['#5b302c', '#d89b5b'], H: ['#37485a', '#8bc0b5'], L: ['#432f3d', '#d77b67'],
  V: ['#364553', '#9ab38c'], X: ['#303a48', '#d08058'], R: ['#3d4351', '#8dc0bd'], O: ['#49443d', '#d3a65c'],
};
const rules = `## 用这一种做片

- 上面 \`{{ }}\` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 \`Math.random\`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。`;

function inside(parent, target) {
  const rel = relative(parent, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function sourceFile(sourceRoot, value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) throw new Error(`Invalid source path: ${value}`);
  const file = resolve(sourceRoot, value);
  if (!inside(sourceRoot, file)) throw new Error(`Source path escapes the asset snapshot: ${value}`);
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`Missing style source file: ${value}`);
  return file;
}

function xmlText(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function sampleSummary(body, fallback) {
  const first = body.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('#'));
  return String(first || fallback || '按参考文字中的视觉方向进行动画创作。').replace(/\s+/g, ' ').slice(0, 180);
}

function placeholderCover(entry, name, summary) {
  const [background, accent] = coverColors[entry.series] ?? ['#34434a', '#61b7ac'];
  const title = xmlText(`${entry.id} ${name}`);
  const description = xmlText(summary.length > 46 ? `${summary.slice(0, 45)}…` : summary);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-labelledby="title desc">
<title id="title">${title}</title><desc id="desc">${description}</desc>
<rect width="640" height="360" fill="${background}"/>
<path d="M0 276H640" stroke="${accent}" stroke-width="2"/>
<rect x="34" y="34" width="8" height="292" fill="${accent}"/>
<text x="62" y="86" fill="${accent}" font-family="sans-serif" font-size="18">${xmlText(entry.series)} STYLE</text>
<text x="62" y="174" fill="#fff" font-family="sans-serif" font-size="44" font-weight="700">${title}</text>
<text x="62" y="226" fill="#d5e0df" font-family="sans-serif" font-size="20">${description}</text>
<text x="62" y="314" fill="#b7c8c8" font-family="sans-serif" font-size="15">目录示意 · 非真实样片</text>
</svg>
`;
}

function noticeFiles(sourceRoot) {
  return [
    ['LICENSE.md', 'THIRD_PARTY/LICENSE.md'],
    ['references/attribution.md', 'THIRD_PARTY/references/attribution.md'],
    ['assets/library/说明.md', 'THIRD_PARTY/assets/library/说明.md'],
    ['assets/library/许可与来源.md', 'THIRD_PARTY/assets/library/许可与来源.md'],
    ['assets/library/第三方许可/Lemo-Opuscar_LICENSE.txt', 'THIRD_PARTY/assets/library/第三方许可/Lemo-Opuscar_LICENSE.txt'],
    ['assets/library/第三方许可/mg-styles-15_LICENSE.txt', 'THIRD_PARTY/assets/library/第三方许可/mg-styles-15_LICENSE.txt'],
    ['assets/library/第三方许可/code-video_LICENSE.txt', 'THIRD_PARTY/assets/library/第三方许可/code-video_LICENSE.txt'],
  ].map(([from, to]) => ({ input: sourceFile(sourceRoot, from), to }));
}

export function buildStyles({
  sourceDir = process.env.WANJU_STYLE_SOURCE_DIR || defaultSource,
  overrideDir = process.env.WANJU_STYLE_OVERRIDE_DIR || defaultOverrides,
  outputDir = process.env.WANJU_STYLE_OUTPUT_DIR || defaultOutput,
} = {}) {
  const sourceRoot = resolve(sourceDir);
  const overrideRoot = resolve(overrideDir);
  const outputRoot = resolve(outputDir);
  const catalogFile = sourceFile(sourceRoot, 'references/catalog.json');
  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
  if (!Array.isArray(catalog.entries) || !catalog.entries.length) throw new Error('The style catalog has no entries.');

  const seen = new Set();
  const ordered = [...catalog.entries].sort((a, b) => {
    const aSeries = seriesOrder.indexOf(a.series), bSeries = seriesOrder.indexOf(b.series);
    if (aSeries < 0 || bSeries < 0) throw new Error(`Unknown style series: ${a.series ?? b.series}`);
    return aSeries - bSeries || String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  });
  const notices = noticeFiles(sourceRoot);
  const incomplete = [];
  const jobs = ordered.map((entry, index) => {
    if (!/^[A-Z]\d{1,3}$/.test(entry.id) || typeof entry.file !== 'string' || !series[entry.series]) {
      throw new Error(`Invalid style catalog entry at index ${index}.`);
    }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : entry.id;
    const fit = String(entry.fit ?? '').trim();
    const category = typeof entry.category === 'string' ? entry.category.trim() : '';
    const body = readFileSync(sourceFile(sourceRoot, entry.file), 'utf8').replace(/^#[^\r\n]*\r?\n+/, '').trim();
    const descriptionText = typeof entry.description === 'string' ? entry.description : '';
    const slug = `code-animation-${entry.id.toLowerCase()}`;
    if (seen.has(slug)) throw new Error(`Duplicate style id: ${slug}`);
    seen.add(slug);
    const summaryText = sampleSummary(descriptionText ? '' : body, descriptionText || fit || category);
    const description = `${entry.id} ${name}：${summaryText}`.replace(/\n/g, ' ');
    if (!entry.name?.trim?.() || !descriptionText.trim()) incomplete.push(entry.id);
    let coverFile;
    if (entry.image) coverFile = sourceFile(sourceRoot, entry.image);
    else {
      const override = join(overrideRoot, slug, 'cover.jpg');
      if (existsSync(override)) {
        if (!statSync(override).isFile()) throw new Error(`Style cover override is not a file: ${slug}`);
        coverFile = override;
      }
    }
    const helper = entry.series === 'AG'
      ? sourceFile(sourceRoot, 'assets/library/风格提示词/A-G_代码样片/_公共函数.js') : null;
    return { entry, index, name, summaryText, slug, body, description, fit, coverFile, helper };
  });

  mkdirSync(outputRoot, { recursive: true });
  let withCover = 0;
  let generatedCovers = 0;
  jobs.forEach(({ entry, index, name, summaryText, slug, body, description, fit, coverFile, helper }) => {
    const folder = join(outputRoot, slug);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'SKILL.md'), `---
name: ${slug}
description: ${description}
---

# ${entry.id} ${name}

${body}

---

${rules}
`);

    const cover = coverFile ? 'cover.jpg' : 'cover.svg';
    if (coverFile) {
      copyFileSync(coverFile, join(folder, 'cover.jpg'));
      rmSync(join(folder, 'cover.svg'), { force: true });
    } else {
      writeFileSync(join(folder, 'cover.svg'), placeholderCover(entry, name, summaryText));
      rmSync(join(folder, 'cover.jpg'), { force: true });
      generatedCovers++;
    }
    if (helper) copyFileSync(helper, join(folder, '_公共函数.js'));
    else rmSync(join(folder, '_公共函数.js'), { force: true });

    const details = [
      fit ? `适合：${fit}` : null,
      entry.category ? `分类：${entry.category}` : null,
      coverFile ? '带来源参考静帧；不代表最终生成效果。' : '此封面为目录示意图，不是来源样片或最终生成效果。',
    ].filter(Boolean).join('\n');
    writeFileSync(join(folder, 'openfilm.json'), `${JSON.stringify({
      version: '0.1.0',
      repository: 'https://github.com/XiaoyeCodes/code-animation-prompts',
      kind: 'style',
      order: 11 + index,
      icon: series[entry.series].icon,
      ...(cover ? { cover } : {}),
      title: { 'zh-CN': `${entry.id} ${name}`, en: `${entry.id} ${name}` },
      summary: { 'zh-CN': summaryText, en: summaryText },
      details: { 'zh-CN': details, en: details },
    }, null, 2)}\n`);
    if (cover) withCover++;
  });

  for (const { input, to } of notices) {
    const output = join(outputRoot, to);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(input, output);
  }
  return { count: ordered.length, withCover, withoutCover: ordered.length - withCover, generatedCovers, incomplete, outputDir: outputRoot };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildStyles();
  console.log(`生成 ${result.count} 个风格 skill，封面 ${result.withCover} 个（示意封面 ${result.generatedCovers} 个）`);
  if (result.incomplete.length) console.warn(`有 ${result.incomplete.length} 个源条目使用了名称或摘要兜底：${result.incomplete.join(', ')}`);
}
