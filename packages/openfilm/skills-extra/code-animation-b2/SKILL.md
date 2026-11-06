---
name: code-animation-b2
description: B2 萤火光尘：暖色光点慢慢往上飘，有远有近。
---

# B2 萤火光尘

- 分类：A–G 代码样片 · B 粒子
- 长什么样：暖色光点慢慢往上飘，有远有近。
- 适合：温暖、回忆、找回光
- 关键词：萤火、光尘、暖

## 风格提示词

用代码（Canvas 2D）画一段"萤火光尘"的动画：暖色光点慢慢往上飘，有远有近。
适合讲：温暖、回忆、找回光
关键词：萤火、光尘、暖

下面是我们自己写的参考实现：一个绘制函数 S.B2(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.B2 = (c, w, h, t, s) => {
  if (!s.init) { s.init = 1; const r = rng(7); s.p = []; for (let i = 0; i < 70; i++) s.p.push({ x: r() * w, y: r() * h, z: r(), ph: r() * TAU, f: .5 + r() * 1.5 }); }
  const g = c.createRadialGradient(w * .5, h * .7, 0, w * .5, h * .7, Math.hypot(w, h) * .7); g.addColorStop(0, '#231409'); g.addColorStop(1, '#060403'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter'; const m = Math.min(w, h) / 300;
  for (const p of s.p) {
    const z = p.z, size = (1.2 + z * z * 24) * m, vy = (5 + z * 16) * m;
    const y = ((p.y - t * vy) % (h + 60) + h + 60) % (h + 60) - 30, x = p.x + Math.sin(t * .4 * p.f + p.ph) * 18 * m;
    const fl = .55 + .45 * Math.sin(t * p.f * 2.2 + p.ph), a = (z > .8 ? .13 : .55) * fl;
    glowDot(c, x, y, size * (z > .8 ? 1.6 : 1), z > .5 ? '#ffb664' : '#ffd79a', a);
    if (z < .8) { c.fillStyle = `rgba(255,236,200,${.8 * fl})`; c.beginPath(); c.arc(x, y, Math.max(.6, size * .12), 0, TAU); c.fill(); }
  }
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
