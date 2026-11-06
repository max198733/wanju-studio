---
name: code-animation-d3
description: D3 雪与火星：雪往下落，几点火星往上飘。
---

# D3 雪与火星

- 分类：A–G 代码样片 · D 光与天气
- 长什么样：雪往下落，几点火星往上飘。
- 适合：告别、结束、冷里的一点热
- 关键词：雪、火星、往上飘

## 风格提示词

用代码（Canvas 2D）画一段"雪与火星"的动画：雪往下落，几点火星往上飘。
适合讲：告别、结束、冷里的一点热
关键词：雪、火星、往上飘

下面是我们自己写的参考实现：一个绘制函数 S.D3(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.D3 = (c, w, h, t, s) => {
  if (!s.init) { s.init = 1; const r = rng(41); s.f = Array.from({ length: 170 }, () => [r() * w, r() * h, r(), r() * TAU]); s.e = Array.from({ length: 14 }, () => [r() * w, r() * h, r(), r() * TAU]); }
  c.fillStyle = vgrad(c, h, '#0e1627', '#04060b'); c.fillRect(0, 0, w, h); const m = Math.min(w, h) / 300;
  for (const [x0, y0, z, ph] of s.f) { const y = (y0 + t * (8 + z * 26) * m) % (h + 10), x = x0 + Math.sin(t * .6 + ph) * 10 * m; c.fillStyle = `rgba(235,242,255,${.35 + z * .55})`; c.beginPath(); c.arc(x, y, (.6 + z * 2.4) * m, 0, TAU); c.fill(); }
  c.globalCompositeOperation = 'lighter';
  for (const [x0, y0, z, ph] of s.e) { const y = h - ((h - y0 + t * (20 + z * 30) * m) % (h + 20)), x = x0 + Math.sin(t * 1.4 + ph) * 14 * m, fl = .5 + .5 * Math.sin(t * 9 + ph * 5); glowDot(c, x, y, 7 * m, '#ff9a3d', .45 * fl * (y / h)); c.fillStyle = `rgba(255,214,150,${fl * (y / h)})`; c.fillRect(x - .8, y - .8, 1.6, 1.6); }
  c.globalCompositeOperation = 'source-over';
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
