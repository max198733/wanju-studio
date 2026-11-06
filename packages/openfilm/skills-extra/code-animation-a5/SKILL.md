---
name: code-animation-a5
description: A5 字散了再聚：一句话散成粒子，聚成另一句话。
---

# A5 字散了再聚

- 分类：A–G 代码样片 · A 字
- 长什么样：一句话散成粒子，聚成另一句话。
- 适合：转念、换一种理解
- 关键词：散开、聚成、变成

## 风格提示词

用代码（Canvas 2D）画一段"字散了再聚"的动画：一句话散成粒子，聚成另一句话。
适合讲：转念、换一种理解
关键词：散开、聚成、变成

下面是我们自己写的参考实现：一个绘制函数 S.A5(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.A5 = (c, w, h, t, s, dpr) => {
  if (!s.init) {
    s.init = 1; const P = ['都是我的错', '那不是我的错'], pts = [];
    for (const p of P) {
      const [oc, ox] = offscreen(w, h, 1), lines = h > w ? [p.slice(0, Math.ceil(p.length / 2)), p.slice(Math.ceil(p.length / 2))] : [p];
      const fs = Math.min(w * 0.82 / Math.max(...lines.map(l => l.length)), h * 0.34 / lines.length);
      ox.fillStyle = '#fff'; ox.font = `900 ${fs}px ${SERIF}`; ox.textAlign = 'center'; ox.textBaseline = 'middle';
      lines.forEach((l, i) => ox.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.15));
      const d = ox.getImageData(0, 0, oc.width, oc.height).data, st = Math.max(2, Math.round(fs / 26)), arr = [];
      for (let y = 0; y < oc.height; y += st) for (let x = 0; x < oc.width; x += st) if (d[(y * oc.width + x) * 4 + 3] > 128) arr.push([x, y]);
      pts.push(arr);
    }
    const r = rng(9), N = Math.min(1800, Math.max(pts[0].length, pts[1].length));
    s.p = []; for (let i = 0; i < N; i++) { const a = pts[0][Math.floor(r() * pts[0].length)], b = pts[1][Math.floor(r() * pts[1].length)], an = r() * TAU, rr = Math.sqrt(r()) * Math.min(w, h) * .55; s.p.push([a[0], a[1], b[0], b[1], w / 2 + Math.cos(an) * rr * 1.4, h / 2 + Math.sin(an) * rr, r()]); }
  }
  const q = t % 9; c.fillStyle = '#07070a'; c.fillRect(0, 0, w, h);
  let col;
  for (const p of s.p) {
    let x, y, k;
    if (q < 2) { x = p[0]; y = p[1]; k = 0; }
    else if (q < 3.3) { const e = eOut((q - 2) / 1.3); x = lerp(p[0], p[4], e); y = lerp(p[1], p[5], e); k = e * .5; }
    else if (q < 4.9) { const e = ss(0, 1, (q - 3.3) / 1.6 - p[6] * .15); x = lerp(p[4], p[2], e); y = lerp(p[5], p[3], e); k = .5 + e * .5; }
    else if (q < 7.4) { x = p[2]; y = p[3]; k = 1; }
    else { const e = ss(7.4, 9, q); x = lerp(p[2], p[0], e); y = lerp(p[3], p[1], e); k = 1 - e; }
    const j = 1.2; x += Math.sin(t * 2 + p[6] * 40) * j; y += Math.cos(t * 1.7 + p[6] * 30) * j;
    col = mixHex('#9aa9c4', '#f6be72', k); c.fillStyle = col; c.fillRect(x, y, 1.6, 1.6);
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
