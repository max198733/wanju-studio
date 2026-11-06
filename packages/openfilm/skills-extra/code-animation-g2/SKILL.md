---
name: code-animation-g2
description: G2 信号故障：画面错位、颜色分离，突然闪一下。
---

# G2 信号故障

- 分类：A–G 代码样片 · G 质感
- 长什么样：画面错位、颜色分离，突然闪一下。
- 适合：崩溃、混乱、话被打断
- 关键词：故障、错位、干扰

## 风格提示词

用代码（Canvas 2D）画一段"信号故障"的动画：画面错位、颜色分离，突然闪一下。
适合讲：崩溃、混乱、话被打断
关键词：故障、错位、干扰

下面是我们自己写的参考实现：一个绘制函数 S.G2(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.G2 = (c, w, h, t, s) => {
  const tm = t % 5, burst = (tm > 1.2 && tm < 1.7) || (tm > 3.1 && tm < 3.3) || (tm > 3.6 && tm < 4.2), m = Math.min(w, h), fs = Math.min(w / 4.6, h / 3.2);
  c.fillStyle = '#060607'; c.fillRect(0, 0, w, h); const dx = burst ? 4 + Math.random() * 10 : 1.2;
  c.font = `900 ${fs}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalCompositeOperation = 'lighter';
  c.fillStyle = '#ff2b2b'; c.fillText('我没事。', w / 2 - dx, h / 2); c.fillStyle = '#00e1ff'; c.fillText('我没事。', w / 2 + dx, h / 2);
  c.globalCompositeOperation = 'source-over';
  if (burst) { for (let k = 0; k < 7; k++) { const y = Math.random() * h, sh = 4 + Math.random() * h * .08, off = (Math.random() - .5) * w * .12; c.drawImage(c.canvas, 0, y * (c.canvas.height / h), c.canvas.width, sh * (c.canvas.height / h), off, y, w, sh); } c.fillStyle = 'rgba(230,230,235,.8)'; c.font = `400 ${fs * .22}px ${SANS}`; c.fillText('（其实不是）', w / 2 + (Math.random() - .5) * 8, h / 2 + fs * .78); }
  c.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
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
