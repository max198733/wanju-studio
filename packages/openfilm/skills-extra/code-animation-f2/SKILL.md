---
name: code-animation-f2
description: F2 关系图：人和人之间的箭头一条条画出来，箭头上写着那句话。
---

# F2 关系图

- 分类：A–G 代码样片 · F 讲解
- 长什么样：人和人之间的箭头一条条画出来，箭头上写着那句话。
- 适合：家里的关系、因果
- 关键词：节点、箭头、关系图

## 风格提示词

用代码（Canvas 2D）画一段"关系图"的动画：人和人之间的箭头一条条画出来，箭头上写着那句话。
适合讲：家里的关系、因果
关键词：节点、箭头、关系图

下面是我们自己写的参考实现：一个绘制函数 S.F2(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.F2 = (c, w, h, t, s) => {
  const tm = t % 10, fade = 1 - ss(9, 10, tm), m = Math.min(w, h), fs = Math.max(10, m / 20);
  const Nd = { 我: [.5, .55], 爸爸: [.22, .3], 妈妈: [.78, .3], 奶奶: [.5, .12], 学校: [.2, .82], 工作: [.8, .82] };
  const E = [['爸爸', '我', '为你好', 1], ['妈妈', '我', '听话', 1.8], ['奶奶', '爸爸', '吃苦', 2.6], ['我', '学校', '要争气', 3.4], ['我', '工作', '不能软弱', 4.2], ['我', '妈妈', '说不出口', 5.2]];
  c.fillStyle = '#0e1116'; c.fillRect(0, 0, w, h); c.globalAlpha = fade;
  const R = m * .075, at = k => [Nd[k][0] * w, Nd[k][1] * h];
  for (const [a, b, lab, t0] of E) {
    const p = eOut((tm - t0) / .7); if (p <= 0) continue; const A = at(a), B = at(b), an = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const sx = A[0] + Math.cos(an) * R, sy = A[1] + Math.sin(an) * R, ex = B[0] - Math.cos(an) * R, ey = B[1] - Math.sin(an) * R, cx = lerp(sx, ex, p), cy = lerp(sy, ey, p);
    const warm = lab === '说不出口'; c.strokeStyle = warm ? '#f1b25c' : '#7c8798'; c.lineWidth = 1.4; if (warm) c.setLineDash([5, 5]); c.beginPath(); c.moveTo(sx, sy); c.lineTo(cx, cy); c.stroke(); c.setLineDash([]);
    c.fillStyle = c.strokeStyle; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - Math.cos(an - .4) * 9, cy - Math.sin(an - .4) * 9); c.lineTo(cx - Math.cos(an + .4) * 9, cy - Math.sin(an + .4) * 9); c.fill();
    c.font = `400 ${fs * .8}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = warm ? '#f1b25c' : '#aab3c0'; c.globalAlpha = fade * p; c.fillText(lab, (sx + ex) / 2 - Math.sin(an) * fs * .8, (sy + ey) / 2 + Math.cos(an) * fs * .8); c.globalAlpha = fade;
  }
  Object.keys(Nd).forEach((k, i) => {
    const p = eBack((tm - i * .12) / .5); if (p <= 0) return; const [x, y] = at(k); const me = k === '我';
    c.fillStyle = me ? '#f1b25c' : '#161b23'; c.strokeStyle = me ? '#f1b25c' : '#cfd6e0'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, R * p, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = me ? '#14100a' : '#e6e9ee'; c.font = `500 ${fs * .85 * p}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(k, x, y);
  });
  c.globalAlpha = 1;
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
