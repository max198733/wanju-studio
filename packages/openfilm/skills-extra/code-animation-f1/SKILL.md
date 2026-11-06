---
name: code-animation-f1
description: F1 图表生长：柱子一根根长出来，数字跳动，再连成线。
---

# F1 图表生长

- 分类：A–G 代码样片 · F 讲解
- 长什么样：柱子一根根长出来，数字跳动，再连成线。
- 适合：讲数据、研究结论
- 关键词：图表、数字、生长

## 风格提示词

用代码（Canvas 2D）画一段"图表生长"的动画：柱子一根根长出来，数字跳动，再连成线。
适合讲：讲数据、研究结论
关键词：图表、数字、生长

下面是我们自己写的参考实现：一个绘制函数 S.F1(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.F1 = (c, w, h, t, s) => {
  const tm = t % 8.5, V = [12, 19, 27, 33, 41, 58], N = ['小学', '初中', '高中', '大学', '工作', '现在'], fade = 1 - ss(7.6, 8.5, tm);
  c.fillStyle = '#0f1418'; c.fillRect(0, 0, w, h); c.globalAlpha = fade;
  const l = w * .1, r = w * .94, top = h * .2, bot = h * .8, fs = Math.max(9, Math.min(w, h) / 24);
  c.fillStyle = '#8f9aa5'; c.font = `500 ${fs}px ${SANS}`; c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillText('示例数据：心里那句话想说出口的次数', l, h * .11);
  c.strokeStyle = '#2c3640'; c.lineWidth = 1; for (let k = 0; k <= 3; k++) { const y = lerp(bot, top, k / 3); c.beginPath(); c.moveTo(l, y); c.lineTo(r, y); c.stroke(); }
  const bw = (r - l) / V.length, pts = [];
  V.forEach((v, i) => {
    const e = eOut((tm - .2 - i * .25) / .8), bh = (bot - top) * v / 60 * e, x = l + bw * i + bw * .22, ww = bw * .56;
    c.fillStyle = i === V.length - 1 ? '#f1b25c' : '#5d7fa3'; c.fillRect(x, bot - bh, ww, bh);
    c.fillStyle = '#e8ecef'; c.textAlign = 'center'; c.font = `500 ${fs}px ${MONO}`; if (e > 0) c.fillText(Math.round(v * e), x + ww / 2, bot - bh - fs * .5);
    c.fillStyle = '#8f9aa5'; c.font = `400 ${fs * .9}px ${SANS}`; c.fillText(N[i], x + ww / 2, bot + fs * 1.4);
    pts.push([x + ww / 2, bot - (bot - top) * v / 60]);
  });
  const lp = clamp((tm - 2.6) / 1.4, 0, 1); if (lp > 0) { c.strokeStyle = '#f1b25c'; c.lineWidth = 2; c.beginPath(); const n = lp * (pts.length - 1); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i <= Math.floor(n); i++) c.lineTo(pts[i][0], pts[i][1]); const fi = Math.floor(n); if (fi < pts.length - 1) c.lineTo(lerp(pts[fi][0], pts[fi + 1][0], n - fi), lerp(pts[fi][1], pts[fi + 1][1], n - fi)); c.stroke(); }
  c.globalAlpha = 1;
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
