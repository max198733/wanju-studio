---
name: code-animation-a4
description: A4 字的隧道：字排成一圈一圈，镜头往里钻。
---

# A4 字的隧道

- 分类：A–G 代码样片 · A 字
- 长什么样：字排成一圈一圈，镜头往里钻。
- 适合：想不通、越想越深
- 关键词：隧道、旋转、往里钻

## 风格提示词

用代码（Canvas 2D）画一段"字的隧道"的动画：字排成一圈一圈，镜头往里钻。
适合讲：想不通、越想越深
关键词：隧道、旋转、往里钻

下面是我们自己写的参考实现：一个绘制函数 S.A4(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.A4 = (c, w, h, t, s) => {
  c.fillStyle = '#04050a'; c.fillRect(0, 0, w, h);
  const N = 14, R = Math.hypot(w, h) * 0.5, txt = '为什么是我为什么不能说为什么';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < N; i++) {
    const p = ((i / N) + t * 0.08) % 1, r = R * (0.03 + Math.pow(p, 2.6) * 1.6), a = Math.sin(Math.PI * p) * .9;
    if (r < 3) continue;
    const n = 20, rot = i * .37 + t * .18 * (i % 2 ? 1 : -1), fs = r * 0.15;
    c.font = `500 ${fs}px ${SERIF}`; c.fillStyle = `rgba(${lerp(120, 230, p)},${lerp(140, 225, p)},${lerp(200, 240, p)},${a})`;
    for (let j = 0; j < n; j++) { const an = rot + j / n * TAU; c.save(); c.translate(w / 2 + Math.cos(an) * r, h / 2 + Math.sin(an) * r); c.rotate(an + Math.PI / 2); c.fillText(txt[(i * 3 + j) % txt.length], 0, 0); c.restore(); }
  }
  glowDot(c, w / 2, h / 2, Math.min(w, h) * .12, '#7f8fd6', .25);
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
