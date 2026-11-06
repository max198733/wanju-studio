---
name: code-animation-d1
description: D1 雨窗：玻璃上的雨滴，后面是虚化的夜灯。
---

# D1 雨窗

- 分类：A–G 代码样片 · D 光与天气
- 长什么样：玻璃上的雨滴，后面是虚化的夜灯。
- 适合：等待、夜里、想念
- 关键词：雨窗、夜、虚化灯光

## 风格提示词

用代码（Canvas 2D）画一段"雨窗"的动画：玻璃上的雨滴，后面是虚化的夜灯。
适合讲：等待、夜里、想念
关键词：雨窗、夜、虚化灯光

下面是我们自己写的参考实现：一个绘制函数 S.D1(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.D1 = (c, w, h, t, s, dpr) => {
  if (!s.init) {
    s.init = 1; const r = rng(31); [s.bg, s.bx] = offscreen(w, h, dpr); const b = s.bx; b.fillStyle = vgrad(b, h, '#0b1020', '#05060b'); b.fillRect(0, 0, w, h);
    const cols = ['#ffb35c', '#ff6a4d', '#6fd1e0', '#fff1cf', '#ffd27a'];
    for (let i = 0; i < 46; i++) glowDot(b, r() * w, h * (.25 + r() * .7), (8 + r() * 36) * Math.min(w, h) / 300, cols[Math.floor(r() * cols.length)], .28 + r() * .25);
    s.dots = Array.from({ length: Math.round(w * h / 500) }, () => [r() * w, r() * h, .6 + r() * 2.2]);
    s.sl = Array.from({ length: 9 }, () => ({ x: r() * w, y: r() * h, v: 0, r: 2 + r() * 2.2, ph: r() * 10, tr: [] }));
  }
  const dt = clamp(t - (s.lt ?? t), 0, .05); s.lt = t;
  c.drawImage(s.bg, 0, 0, w, h);
  for (const [x, y, r] of s.dots) { c.fillStyle = 'rgba(190,210,235,.12)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - r * .3, y - r * .4, Math.max(.6, r * .35), Math.max(.6, r * .35)); }
  for (const d of s.sl) {
    const go = Math.sin(t * 1.3 + d.ph) > .2; d.v = lerp(d.v, go ? 60 * h / 300 : 2, .1); d.y += d.v * dt; d.x += Math.sin(t * 3 + d.ph) * .15;
    d.tr.push([d.x, d.y]); if (d.tr.length > 60) d.tr.shift();
    if (d.y > h + 10) { d.y = -10; d.x = Math.random() * w; d.tr = []; }
    c.strokeStyle = 'rgba(200,220,240,.12)'; c.lineWidth = d.r * .6; c.beginPath(); d.tr.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    const g = c.createLinearGradient(d.x, d.y - d.r, d.x, d.y + d.r); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(120,140,170,.2)'); c.fillStyle = g; c.beginPath(); c.ellipse(d.x, d.y, d.r, d.r * 1.25, 0, 0, TAU); c.fill();
  }
};
```

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
