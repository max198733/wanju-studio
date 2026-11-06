---
name: code-animation-b1
description: B1 流动的丝线：无数细线跟着看不见的风流动。
---

# B1 流动的丝线

- 分类：A–G 代码样片 · B 粒子
- 长什么样：无数细线跟着看不见的风流动。
- 适合：思绪、情绪在流、平静下来
- 关键词：流动、丝线、风

## 风格提示词

用代码（Canvas 2D）画一段"流动的丝线"的动画：无数细线跟着看不见的风流动。
适合讲：思绪、情绪在流、平静下来
关键词：流动、丝线、风

下面是我们自己写的参考实现：一个绘制函数 S.B1(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.B1 = (c, w, h, t, s, dpr) => {
  if (!s.init) { s.init = 1; [s.bc, s.bx] = offscreen(w, h, dpr); s.bx.fillStyle = '#05080d'; s.bx.fillRect(0, 0, w, h); const r = rng(5); s.r = r; s.p = []; for (let i = 0; i < 800; i++) s.p.push([r() * w, r() * h, r() * 200, r()]); }
  const b = s.bx, sc = 3.2 / Math.min(w, h); b.fillStyle = 'rgba(5,8,13,.07)'; b.fillRect(0, 0, w, h); b.lineWidth = .8;
  for (const p of s.p) {
    const a = nz(p[0] * sc, p[1] * sc, t * .12) * Math.PI, sp = Math.min(w, h) / 260;
    const nx = p[0] + Math.cos(a) * sp, ny = p[1] + Math.sin(a) * sp;
    b.strokeStyle = `hsla(${195 + p[3] * 40},60%,${62 + p[3] * 25}%,.4)`; b.beginPath(); b.moveTo(p[0], p[1]); b.lineTo(nx, ny); b.stroke();
    p[0] = nx; p[1] = ny; p[2]--;
    if (p[2] < 0 || nx < 0 || nx > w || ny < 0 || ny > h) { p[0] = s.r() * w; p[1] = s.r() * h; p[2] = 80 + s.r() * 200; }
  }
  c.drawImage(s.bc, 0, 0, w, h);
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
