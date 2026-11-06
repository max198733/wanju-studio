/**
 * 代码动画风格库 · 独立浏览页
 * 直接读 packages/openfilm/skills-extra，跟打包产物无关：改完素材刷新就生效。
 *
 *   node style-gallery/server.mjs            http://127.0.0.1:4900
 */
import { createServer } from 'node:http';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* 本文件在 <仓库>/tools/style-gallery/，往前两级就是仓库根 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.OPENFILM_EXTRA_SKILLS || join(REPO, 'packages', 'openfilm', 'skills-extra');
const PORT = Number(process.env.PORT || 4900);

/** 系列显示名，按编号排 */
const SERIES = [
  ['AG', 'A–G 代码样片'], ['M', 'M 动态风格'], ['K', 'K 卡通画风'], ['Z', 'Z 中国风'],
  ['H', 'H 现成版式'], ['L', 'L Lemo-Opuscar'], ['V', 'V mg-styles-15'],
  ['X', 'X code-video'], ['R', 'R 照参考学来的'], ['O', 'O 奥斯卡 98 部'],
];
const SERIES_LABEL = Object.fromEntries(SERIES);

/** 一次读进内存：341 个小文件，几十毫秒 */
function load() {
  if (!existsSync(ROOT)) {
    console.error(`找不到风格目录：${ROOT}`);
    console.error('先跑一次素材生成脚本，或把它放在 packages/openfilm/skills-extra。');
    process.exit(1);
  }
  const out = [];
  for (const dir of readdirSync(ROOT)) {
    if (!dir.startsWith('code-animation-')) continue;
    const folder = join(ROOT, dir);
    let meta;
    try { meta = JSON.parse(readFileSync(join(folder, 'openfilm.json'), 'utf8')); } catch { continue; }
    const title = meta.title?.['zh-CN'] ?? dir;
    const id = title.split(' ')[0];
    /* A–G 是同一系列（catalog 里 series 就叫 AG），首字母 A 到 G 都归它 */
    const series = /^[A-G]\d/.test(id) ? 'AG' : id.replace(/\d+$/, '');
    out.push({
      name: dir,
      id,
      title,
      nameZh: title.slice(id.length).trim(),
      series,
      seriesLabel: SERIES_LABEL[series] ?? series,
      summary: meta.summary?.['zh-CN'] ?? '',
      details: meta.details?.['zh-CN'] ?? '',
      order: meta.order ?? 9999,
      cover: existsSync(join(folder, 'cover.jpg')) ? `/cover/${encodeURIComponent(dir)}` : null,
      prompt: join(folder, 'SKILL.md'),
    });
  }
  const rank = Object.fromEntries(SERIES.map(([k], i) => [k, i]));
  return out.sort((a, b) => (rank[a.series] ?? 99) - (rank[b.series] ?? 99)
    || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

const skills = load();
const byName = new Map(skills.map((s) => [s.name, s]));
console.log(`加载 ${skills.length} 个风格，有封面 ${skills.filter((s) => s.cover).length} 个`);

const listPayload = skills.map(({ prompt, ...rest }) => rest);

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>代码动画风格库 · ${skills.length}</title>
<style>
  :root{--bg:#0a0b0f;--surface:#12141a;--surface2:#171a22;--line:#232733;--text:#e8ecf4;--dim:#98a1b3;--faint:#5d6678;--accent:#f1b25c}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 "PingFang SC","Microsoft YaHei",system-ui,sans-serif}
  header{position:sticky;top:0;z-index:20;background:rgba(10,11,15,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);padding:18px 28px 14px}
  .top{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  h1{margin:0;font-size:17px;font-weight:600;letter-spacing:.01em}
  .sub{color:var(--faint);font-size:12.5px}
  .bar{display:flex;gap:10px;margin-top:14px;align-items:center;flex-wrap:wrap}
  input{flex:1;min-width:220px;max-width:380px;height:36px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--surface2);color:var(--text);font-size:13px;outline:none}
  input:focus{border-color:#333a4a}
  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip{height:30px;padding:0 11px;border-radius:8px;border:1px solid transparent;background:var(--surface2);color:var(--dim);font-size:12.5px;cursor:pointer}
  .chip:hover{color:var(--text)}
  .chip.on{background:#232733;color:var(--text);border-color:#333a4a;font-weight:500}
  main{padding:22px 28px 80px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:22px 20px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:11px;overflow:hidden;cursor:pointer;transition:transform .16s,border-color .16s}
  .card:hover{transform:translateY(-2px);border-color:#3a4152}
  .thumb{aspect-ratio:16/9;background:var(--surface2);display:grid;place-items:center;overflow:hidden;position:relative}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .thumb .mark{color:var(--faint);font-size:22px;font-weight:600;letter-spacing:.04em}
  .body{padding:10px 12px 12px}
  .t{font-size:13.5px;font-weight:500;margin-bottom:2px;display:flex;gap:7px;align-items:baseline}
  .t b{color:var(--accent);font-weight:600;font-variant-numeric:tabular-nums;font-size:12.5px;flex:none}
  .s{color:var(--dim);font-size:12.5px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .empty{padding:80px 0;text-align:center;color:var(--faint)}
  /* 详情 */
  .sheet{position:fixed;inset:0;z-index:40;display:none}
  .sheet.on{display:block}
  .mask{position:absolute;inset:0;background:rgba(0,0,0,.55)}
  .panel{position:absolute;top:0;right:0;bottom:0;width:min(720px,94vw);background:var(--surface);border-left:1px solid var(--line);display:flex;flex-direction:column}
  .phead{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;gap:14px;align-items:flex-start}
  .phead .cv{width:150px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:var(--surface2);flex:none}
  .phead .cv img{width:100%;height:100%;object-fit:cover}
  .phead h2{margin:0 0 4px;font-size:16px}
  .phead .meta{color:var(--faint);font-size:12.5px}
  .phead .x{margin-left:auto;background:none;border:0;color:var(--faint);font-size:22px;cursor:pointer;line-height:1}
  .pbody{flex:1;overflow:auto;padding:18px 22px 32px}
  .det{color:var(--dim);font-size:13px;white-space:pre-wrap;margin-bottom:16px}
  pre{margin:0;padding:14px 16px;background:#0d0f14;border:1px solid var(--line);border-radius:10px;color:#c9d3e4;font:12.5px/1.75 ui-monospace,"Cascadia Code",Consolas,monospace;white-space:pre-wrap;word-break:break-word}
  .acts{display:flex;gap:10px;margin:14px 0 0}
  button.b{height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--surface2);color:var(--text);font-size:13px;cursor:pointer}
  button.b:hover{background:#232733}
  button.b.pri{background:var(--text);color:var(--bg);border-color:transparent;font-weight:500}
  .toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:#e8ecf4;color:#0a0b0f;padding:9px 16px;border-radius:9px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:60}
  .toast.on{opacity:1}
</style></head>
<body>
<header>
  <div class="top">
    <h1>代码动画风格库</h1>
    <span class="sub">${skills.length} 种风格 · 读源码目录，与打包无关</span>
  </div>
  <div class="bar">
    <input id="q" placeholder="搜编号、名称或气质…  例如 水墨 / 粒子 / B3" autocomplete="off">
    <div class="chips" id="chips"></div>
  </div>
</header>
<main><div class="grid" id="grid"></div><div class="empty" id="empty" style="display:none">没有匹配的风格</div></main>

<div class="sheet" id="sheet">
  <div class="mask" onclick="closeSheet()"></div>
  <div class="panel">
    <div class="phead">
      <div class="cv" id="s-cv"></div>
      <div style="min-width:0">
        <h2 id="s-title"></h2>
        <div class="meta" id="s-meta"></div>
      </div>
      <button class="x" onclick="closeSheet()" aria-label="关闭">&times;</button>
    </div>
    <div class="pbody">
      <div class="det" id="s-det"></div>
      <div class="acts">
        <button class="b pri" onclick="copyPrompt()">复制完整提示词</button>
        <button class="b" onclick="copyName()">复制 skill 名</button>
      </div>
      <pre id="s-prompt"></pre>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const SKILLS = ${JSON.stringify(listPayload)};
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const q = document.getElementById('q');
const chips = document.getElementById('chips');
let series = 'ALL', current = null;

const seriesList = [...new Set(SKILLS.map(s => s.series))];
function buildChips() {
  const items = [['ALL', '全部'], ...seriesList.map(k => [k, (SKILLS.find(s => s.series === k) || {}).seriesLabel || k])];
  chips.innerHTML = items.map(([k, label]) =>
    '<button class="chip' + (k === series ? ' on' : '') + '" data-k="' + k + '">' + label + '</button>').join('');
  chips.querySelectorAll('.chip').forEach(el => el.onclick = () => { series = el.dataset.k; buildChips(); render(); });
}

function render() {
  const w = q.value.trim().toLowerCase();
  const shown = SKILLS.filter(s => (series === 'ALL' || s.series === series)
    && (!w || (s.id + ' ' + s.title + ' ' + s.summary + ' ' + s.details).toLowerCase().includes(w)));
  empty.style.display = shown.length ? 'none' : 'block';
  grid.innerHTML = shown.map(s => \`
    <div class="card" data-n="\${s.name}">
      <div class="thumb">\${s.cover ? '<img loading="lazy" src="' + s.cover + '" alt="">' : '<span class="mark">' + s.id + '</span>'}</div>
      <div class="body">
        <div class="t"><b>\${s.id}</b><span>\${s.nameZh}</span></div>
        <div class="s">\${s.summary}</div>
      </div>
    </div>\`).join('');
  grid.querySelectorAll('.card').forEach(el => el.onclick = () => openSheet(el.dataset.n));
}

async function openSheet(name) {
  const s = SKILLS.find(x => x.name === name);
  if (!s) return;
  current = s;
  document.getElementById('s-title').textContent = s.title;
  document.getElementById('s-meta').textContent = s.seriesLabel;
  document.getElementById('s-det').textContent = s.details;
  document.getElementById('s-cv').innerHTML = s.cover ? '<img src="' + s.cover + '" alt="">' : '';
  document.getElementById('s-prompt').textContent = '读取中…';
  document.getElementById('sheet').classList.add('on');
  const r = await fetch('/prompt/' + encodeURIComponent(name));
  document.getElementById('s-prompt').textContent = await r.text();
}

function closeSheet() { document.getElementById('sheet').classList.remove('on'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1600);
}
async function copyPrompt() {
  const txt = document.getElementById('s-prompt').textContent;
  await navigator.clipboard.writeText(txt).catch(() => {});
  toast('提示词已复制');
}
async function copyName() {
  if (!current) return;
  await navigator.clipboard.writeText(current.name).catch(() => {});
  toast('已复制：' + current.name);
}

q.addEventListener('input', render);
buildChips(); render();
</script>
</body></html>`;

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (path === '/api/skills') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ total: skills.length, skills: listPayload }));
    return;
  }
  const cover = path.match(/^\/cover\/(.+)$/);
  if (cover) {
    const s = byName.get(cover[1]);
    const file = s && join(ROOT, s.name, 'cover.jpg');
    if (!file || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' });
    res.end(readFileSync(file));
    return;
  }
  const prompt = path.match(/^\/prompt\/(.+)$/);
  if (prompt) {
    const s = byName.get(prompt[1]);
    if (!s) { res.writeHead(404); res.end('没有这个风格'); return; }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(readFileSync(s.prompt, 'utf8'));
    return;
  }
  res.writeHead(404); res.end('not found');
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`端口 ${PORT} 已被占用，可能风格库已经开着了：http://127.0.0.1:${PORT}`);
  else console.error(e.message);
  process.exit(1);
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`风格库已启动  ${url}`);
  console.log('关掉这个窗口就停止。');
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    import('node:child_process').then(({ exec }) => exec(cmd, () => {}));
  }
});
