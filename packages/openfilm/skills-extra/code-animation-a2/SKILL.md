---
name: code-animation-a2
description: A2 光标打字：黑底一个光标，一字一字打，打了又删。
---

# A2 光标打字

- 分类：A–G 代码样片 · A 字
- 长什么样：黑底一个光标，一字一字打，打了又删。
- 适合：说不出口的话、心里的独白
- 关键词：打字、光标、删掉

## 风格提示词

用代码（Canvas 2D）画一段"光标打字"的动画：黑底一个光标，一字一字打，打了又删。
适合讲：说不出口的话、心里的独白
关键词：打字、光标、删掉

下面是我们自己写的参考实现：一个绘制函数 S.A2(c, w, h, t, s)，c 是 canvas 的 2D context，w/h 是宽高，t 是秒，s 是给这个函数存状态用的空对象。公共的小工具函数在同一文件夹的 _公共函数.js 里。

```js
S.A2 = (c, w, h, t, s) => {
  if (!s.init) {
    s.init = 1; let tt = 0, str = ''; const st = [[0, '']];
    const ops = [['type', '我其实一直想跟你说'], ['wait', 1.1], ['del', 6], ['wait', .5], ['type', '没事。'], ['wait', 1.6], ['del', 3], ['wait', .4], ['type', '……'], ['wait', 1.6], ['clear']];
    for (const [k, v] of ops) {
      if (k === 'type') for (const ch of v) { tt += .17; str += ch; st.push([tt, str]); }
      else if (k === 'wait') tt += v;
      else if (k === 'del') for (let i = 0; i < v; i++) { tt += .07; str = str.slice(0, -1); st.push([tt, str]); }
      else { tt += .4; str = ''; st.push([tt, str]); }
    }
    s.st = st; s.len = tt + .8;
  }
  const tm = t % s.len; let i = 0; while (i + 1 < s.st.length && s.st[i + 1][0] <= tm) i++;
  const str = s.st[i][1], since = tm - s.st[i][0];
  c.fillStyle = '#0b0b0c'; c.fillRect(0, 0, w, h);
  const fs = Math.min(w / 10.5, h / 7); c.font = `500 ${fs}px ${SERIF}`; c.textBaseline = 'middle';
  const x0 = w * 0.1, y0 = h * 0.5; c.fillStyle = '#ece8df'; c.fillText(str, x0, y0);
  const cx = x0 + c.measureText(str).width + fs * 0.12;
  const on = since < .45 || Math.floor(tm * 1.8) % 2 === 0;
  if (on) { c.fillStyle = '#f1b25c'; c.fillRect(cx, y0 - fs * 0.55, Math.max(2, fs * 0.07), fs * 1.1); glowDot(c, cx, y0, fs * 0.9, '#f1b25c', .18); }
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
