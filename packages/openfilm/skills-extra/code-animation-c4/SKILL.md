---
name: code-animation-c4
description: C4 涟漪：一滴落下，一圈圈荡开。
---

# C4 涟漪

- 分类：A–G 代码样片 · C 线与墨
- 长什么样：一滴落下，一圈圈荡开。
- 适合：一句话的影响、余波
- 关键词：涟漪、水滴、扩散

## 风格提示词

用代码（Canvas 2D）画一段"涟漪"的动画：一滴落下，一圈圈荡开。
适合讲：一句话的影响、余波
关键词：涟漪、水滴、扩散

下面是我们自己写的参考实现：一个绘制函数 S.C4(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.C4 = (c, w, h, t, s) => {
  c.fillStyle = vgrad(c, h, '#082027', '#020708'); c.fillRect(0, 0, w, h);
  const r = rng(29), per = 1.15, k = Math.floor(t / per), m = Math.min(w, h); c.lineWidth = 1;
  for (let i = k - 4; i <= k; i++) {
    if (i < 0) continue; const rr = rng(i * 7 + 1), x = (.12 + rr() * .76) * w, y = (.25 + rr() * .6) * h, age = t - i * per;
    for (let j = 0; j < 4; j++) { const a = age - j * .2; if (a <= 0) continue; const R = a * m * .17, al = Math.max(0, 1 - age / 4.4) * (1 - j * .2) * .75; c.strokeStyle = `rgba(170,225,230,${al})`; c.beginPath(); c.ellipse(x, y, R, R * .42, 0, 0, TAU); c.stroke(); }
    if (age < .25) glowDot(c, x, y, 10, '#cdf3f5', (1 - age / .25) * .8);
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
