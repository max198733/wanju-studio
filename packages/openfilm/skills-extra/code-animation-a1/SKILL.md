---
name: code-animation-a1
description: A1 字雨：话像雨一样落下来，越积越多。
---

# A1 字雨

- 分类：A–G 代码样片 · A 字
- 长什么样：话像雨一样落下来，越积越多。
- 适合：被说教、重复的话、压力
- 关键词：字雨、落下、堆积

## 风格提示词

用代码（Canvas 2D）画一段"字雨"的动画：话像雨一样落下来，越积越多。
适合讲：被说教、重复的话、压力
关键词：字雨、落下、堆积

下面是我们自己写的参考实现：一个绘制函数 S.A1(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.A1 = (c, w, h, t, s) => {
  if (!s.init) { s.init = 1; s.r = rng(3); s.drops = []; s.pile = []; for (let i = 0; i < 26; i++) s.drops.push(spawn(true)); }
  function spawn(first) { const r = s.r, base = Math.min(w, h) / 17, k = [0.55, 0.7, 0.9, 1.2, 1.7][Math.floor(r() * 5)]; return { txt: PARENT[Math.floor(r() * PARENT.length)], size: base * k, x: r() * w * 0.92 - w * 0.04, y: first ? -r() * h * 1.2 : -base * 2, v: (h / 300) * (36 + base * k * 3.2) }; }
  const dt = clamp(t - (s.lt ?? t), 0, .05); s.lt = t;
  c.fillStyle = vgrad(c, h, '#0b0e15', '#050608'); c.fillRect(0, 0, w, h);
  const ground = h - 10 - Math.min(s.pile.length, 60) * h * 0.004;
  c.textBaseline = 'alphabetic';
  for (const p of s.pile) { c.font = `${p.size}px ${SERIF}`; c.fillStyle = `rgba(150,164,190,${p.a})`; c.fillText(p.txt, p.x, p.y); }
  for (const d of s.drops) {
    d.y += d.v * dt;
    if (d.y >= ground) { s.pile.push({ txt: d.txt, size: d.size * 0.9, x: d.x, y: ground + s.r() * 8, a: .32 }); Object.assign(d, spawn(false)); }
    c.font = `${d.size}px ${SERIF}`; c.fillStyle = `rgba(214,224,242,${0.25 + d.size / (Math.min(w, h) / 17) * 0.35})`; c.fillText(d.txt, d.x, d.y);
  }
  if (s.pile.length > 70) s.pile.splice(0, 8);
  glowDot(c, w * 0.5, h - 14, 14, '#f1b25c', .55 + .35 * (Math.sin(t * 5) > 0 ? 1 : 0.2));
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
