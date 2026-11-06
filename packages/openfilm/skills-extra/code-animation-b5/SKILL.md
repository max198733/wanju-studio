---
name: code-animation-b5
description: B5 呼吸的圆：一团粒子跟着呼吸胀大、缩小。
---

# B5 呼吸的圆

- 分类：A–G 代码样片 · B 粒子
- 长什么样：一团粒子跟着呼吸胀大、缩小。
- 适合：安抚、慢下来、冥想
- 关键词：呼吸、胀缩、慢

## 风格提示词

用代码（Canvas 2D）画一段"呼吸的圆"的动画：一团粒子跟着呼吸胀大、缩小。
适合讲：安抚、慢下来、冥想
关键词：呼吸、胀缩、慢

下面是我们自己写的参考实现：一个绘制函数 S.B5(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.B5 = (c, w, h, t, s) => {
  if (!s.init) { s.init = 1; const r = rng(17); s.p = Array.from({ length: 750 }, () => [r() * TAU, Math.sqrt(r()), r()]); }
  const b = .5 - .5 * Math.cos(TAU * t / 8), R = Math.min(w, h) * .33 * (.55 + .45 * b);
  c.fillStyle = '#061213'; c.fillRect(0, 0, w, h);
  glowDot(c, w / 2, h / 2, R * 1.3, '#4fb7a8', .12 + .1 * b);
  c.fillStyle = mixHex('#5fbfb0', '#dff3ec', b);
  for (const p of s.p) { const a = p[0] + t * .05 * (p[2] - .5), rr = p[1] * R + Math.sin(t * 1.3 + p[2] * 50) * 2; c.fillRect(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr, 1.4, 1.4); }
  const rising = Math.sin(TAU * t / 8) > 0; c.font = `500 ${Math.min(w, h) / 20}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(220,240,235,.55)'; c.fillText(rising ? '吸气' : '呼气', w / 2, h / 2 + Math.min(w, h) * .42);
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
