---
name: code-animation-x9
description: X9 撕纸拼贴：- 分类：X code-video · code-video
---

# X9 撕纸拼贴

- 分类：X code-video · code-video
- 适合：回忆、拼凑

## 风格提示词

# Style: torn-paper collage

Pictures built from torn scraps of watercolour-tinted paper, laid one by one on a sheet of cold-press paper: skies and seas in long strips, rocks and crowds in small shards, a sun as a torn disc. Calm, handmade, and warm.

## Signature
| # | Item |
|---|---|
| 1 | A cold-press paper sheet as the ground, never a flat fill |
| 2 | Every shape is torn paper: a jagged edge with a white fibre rim and a soft shadow; no clean vector shapes |
| 3 | Colour as washed, muted tints with visible blotches, like watercolour on paper |
| 4 | Pictures assemble scrap by scrap, back to front: strips for sky, water, and fields; shards for textured masses |
| 5 | The subject's logo or product rebuilt from torn scraps |
| 6 | Words set in serif ink, each on its own torn strip, landing one after another |
| 7 | Scene changes as a fresh sheet with a torn edge sliding over, or scraps peeling off |

## Look
- **Palette**: paper `#f1ece1`, ink `#3a3833`, and muted tints (sky `#b8c9da`, sea `#6f8dab`, sand `#e2cfa8`, sun `#efc25c`, stone `#8e8b85`, slate `#5f6570`, moss `#8b8d5c`, rust `#c7684e`). Bring the brand in as one or two washed tints and the rebuilt logo; keep everything a little desaturated.
- **Fonts**: Source Serif 4 / Nanum Myeongjo for words on strips, Caveat / Gaegu for a pencil note.
- **Composition**: one picture per scene, filling about two-thirds of the frame with a margin of bare paper around it. Pictures are simple and flat, like a children's book, with pieces that overlap and overshoot their outlines a little. Use scraps a hand could tear: strips 40–90 px tall, shards 60–140 px.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
