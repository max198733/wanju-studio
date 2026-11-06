---
name: code-animation-f3
description: F3 分屏对比：左边以前，右边现在，中间一条线。
---

# F3 分屏对比

- 分类：A–G 代码样片 · F 讲解
- 长什么样：左边以前，右边现在，中间一条线。
- 适合：以前和现在、父母和孩子
- 关键词：分屏、对比、左右

## 风格提示词

用代码（Canvas 2D）画一段"分屏对比"的动画：左边以前，右边现在，中间一条线。
适合讲：以前和现在、父母和孩子
关键词：分屏、对比、左右

下面是我们自己写的参考实现：一个绘制函数 S.F3(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.F3 = (c, w, h, t, s) => {
  if (!s.init) { s.init = 1; const r = rng(53); s.rain = Array.from({ length: 90 }, () => [r(), r(), .5 + r()]); s.lit = Array.from({ length: 40 }, () => [r(), r(), r() * TAU, r()]); }
  const dx = w * .5 + Math.sin(t * .6) * w * .04, m = Math.min(w, h), fs = Math.max(11, m / 16);
  c.save(); c.beginPath(); c.rect(0, 0, dx, h); c.clip(); c.fillStyle = vgrad(c, h, '#1a1e26', '#0b0d11'); c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(170,185,205,.35)'; c.lineWidth = 1; for (const [x, y, v] of s.rain) { const yy = ((y * h + t * 220 * v) % (h + 20)) - 10, xx = x * w; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx - 2, yy + 12 * v); c.stroke(); }
  c.fillStyle = 'rgba(210,218,230,.85)'; c.font = `700 ${fs}px ${SERIF}`; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('以前', m * .06, m * .06); c.restore();
  c.save(); c.beginPath(); c.rect(dx, 0, w - dx, h); c.clip(); const g = c.createRadialGradient(w * .75, h * .6, 0, w * .75, h * .6, w * .6); g.addColorStop(0, '#3a2410'); g.addColorStop(1, '#120b05'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter'; for (const [x, y, ph, z] of s.lit) { const yy = ((y * h - t * (8 + z * 14)) % h + h) % h; glowDot(c, x * w, yy, 3 + z * 9, '#ffb664', .4 + .3 * Math.sin(t * 2 + ph)); } c.globalCompositeOperation = 'source-over';
  c.fillStyle = 'rgba(255,226,180,.92)'; c.font = `700 ${fs}px ${SERIF}`; c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText('现在', w - m * .06, m * .06); c.restore();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(dx - .5, 0, 1, h);
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
