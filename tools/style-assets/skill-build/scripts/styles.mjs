#!/usr/bin/env node
/**
 * 341 种代码动画风格的检索：先查索引，再读选中的那一份，不要一次加载全部提示词。
 *
 *   node scripts/styles.mjs search 水墨               按关键词找（名称、标签、说明、适合、编号）
 *   node scripts/styles.mjs search 粒子 --series AG   限定系列
 *   node scripts/styles.mjs show B3                   打印 B3 的完整提示词
 *   node scripts/styles.mjs list --series Z           列出一个系列
 *   node scripts/styles.mjs series                    列出全部系列与条目数
 *
 * 索引是 references/catalog.json，路径相对于本技能的根目录。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'references', 'catalog.json'), 'utf8'));

const argv = process.argv.slice(2);
const command = argv[0] ?? 'series';
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const words = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1]?.startsWith('--')));
const series = (flag('--series') ?? '').toUpperCase();

/** 一句话里放得下的说明：太长就截断，没有「适合」就不写 */
const clip = (text, max = 70) => { const s = String(text ?? '').trim(); return s.length > max ? `${s.slice(0, max)}…` : s; };
const LINE = (e) => {
  const fit = String(e.fit ?? '').trim();
  return `${e.id}  ${e.name}${e.image ? '' : '（仅文字）'}\n      ${clip(e.description)}${fit ? `｜适合：${clip(fit, 40)}` : ''}`;
};

/** 一个条目里可以被找到的字 */
const hay = (e) => [e.id, e.name, e.description, e.fit, e.category, ...(e.tags ?? [])].join(' ').toLowerCase();

function search() {
  const q = words.join(' ');
  const found = catalog.entries.filter((e) => (!series || e.series === series) && (!q || hay(e).includes(q.toLowerCase())));
  if (!found.length) { console.log(`没有匹配「${q}」的风格${series ? `（系列 ${series}）` : ''}。可用 node scripts/styles.mjs series 看全部系列。`); return; }
  console.log(`${found.length} 个匹配${q ? `「${q}」` : ''}：\n`);
  for (const e of found.slice(0, 40)) console.log(LINE(e));
  if (found.length > 40) console.log(`\n…还有 ${found.length - 40} 个，收窄关键词或加上 --series。`);
  console.log('\n读完整提示词：node scripts/styles.mjs show <编号>');
}

function show() {
  const id = (words[0] ?? '').toUpperCase();
  const entry = catalog.entries.find((e) => e.id.toUpperCase() === id);
  if (!entry) { console.log(`没有编号 ${id} 的风格。用 search 找编号。`); process.exitCode = 1; return; }
  console.log(readFileSync(join(ROOT, entry.file), 'utf8'));
  if (entry.image) console.log(`\n参考静帧：${join(ROOT, entry.image)}`);
  else console.log('\n（这一条没有静帧，只有文字参考：不要虚构截图。）');
}

function list() {
  const found = catalog.entries.filter((e) => !series || e.series === series);
  console.log(`${found.length} 个${series ? `（系列 ${series}）` : ''}：\n`);
  for (const e of found) console.log(`${e.id.padEnd(5)}${e.name}${e.image ? '' : '（仅文字）'}`);
}

function listSeries() {
  console.log(`共 ${catalog.total} 个风格，其中 ${catalog.with_still} 个有参考静帧：\n`);
  for (const s of catalog.series) {
    const names = catalog.entries.filter((e) => e.series === s.id).slice(0, 4).map((e) => e.name).join('、');
    console.log(`${s.id.padEnd(3)} ${s.name}　${s.count} 个　如 ${names}…`);
  }
  console.log('\nnode scripts/styles.mjs list --series Z');
}

({ search, show, list, series: listSeries }[command] ?? listSeries)();
