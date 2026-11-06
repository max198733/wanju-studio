---
name: code-animation-a3
description: A3 大字冲击：一个词一个词砸进画面，跟着节拍。
---

# A3 大字冲击

- 分类：A–G 代码样片 · A 字
- 长什么样：一个词一个词砸进画面，跟着节拍。
- 适合：情绪爆发、金句、MV 副歌
- 关键词：大字、砸下来、跟节拍

## 风格提示词

用代码（Canvas 2D）画一段"大字冲击"的动画：一个词一个词砸进画面，跟着节拍。
适合讲：情绪爆发、金句、MV 副歌
关键词：大字、砸下来、跟节拍

下面是我们自己写的参考实现：一个绘制函数 S.A3(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.A3 = (c, w, h, t, s) => {
  const L = [["你", .17, .33, .30, 0], ["懂", .40, .30, .22, 0], ["什么", .70, .33, .17, 0], ["我", .19, .64, .20, 0], ["都是", .43, .62, .14, 0], ["为你好", .63, .84, .16, 1], ["听话", .80, .60, .13, 0], ["！", .90, .84, .22, 1]];
  const beat = .4, len = L.length * beat + 1.4, tm = t % len, k = Math.floor(tm / beat), age = tm - k * beat;
  const m = Math.min(w, h), hit = k < L.length ? Math.exp(-age * 9) : 0;
  c.fillStyle = mixHex('#08080a', '#2a2a2e', hit * .5); c.fillRect(0, 0, w, h);
  const sx = (Math.sin(t * 91) * 6) * hit, sy = (Math.cos(t * 77) * 6) * hit;
  c.save(); c.translate(sx, sy); c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i <= Math.min(k, L.length - 1); i++) {
    const [txt, fx0, fy, fz, red] = L[i], newest = i === k, port = h > w, fx = port ? .5 + (fx0 - .5) * .85 : fx0;
    const sc = newest ? 1 + .9 * Math.exp(-age * 16) : 1;
    c.font = `900 ${fz * m * (port ? .95 : 1.45) * sc}px ${SANS}`;
    c.fillStyle = red ? (newest ? '#ff4a32' : '#a3392a') : (newest ? '#ffffff' : '#55565c');
    c.fillText(txt, fx * w, fy * h);
  }
  c.restore();
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
