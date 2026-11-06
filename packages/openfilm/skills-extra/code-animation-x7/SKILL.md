---
name: code-animation-x7
description: X7 英雄漫画：- 分类：X code-video · code-video
---

# X7 英雄漫画

- 分类：X code-video · code-video
- 适合：热血、转折

## 风格提示词

# Style: hero comic

A superhero comic book come to life: newsprint pages, thick ink panels, Ben-Day halftone, yellow narration boxes, speech balloons, burst lettering, and a red title slab over flipping pages.

## Signature
| # | Item |
|---|---|
| 1 | Pages of panels with thick ink borders and white gutters on newsprint; slanted panels for action beats |
| 2 | Ben-Day halftone for shading, skies, and backgrounds |
| 3 | Yellow narration boxes in uppercase comic lettering |
| 4 | Speech or thought balloons with tails |
| 5 | Sound effects in burst shapes (POW!, ZAP!, BOOM!) on impact beats |
| 6 | Focus lines behind the hero moment |
| 7 | Opening: pages flip past under a red title slab; scene changes turn the page |

## Look
- **Palette**: newsprint `#f4ecd6`, ink `#141414`, comic red `#e23b2e`, yellow `#ffd43b`, blue `#2a6fdb`, cyan `#59c3e8`; put the brand colour on the hero's costume or the title slab.
- **Fonts**: Bangers for Latin; pair it with Do Hyeon (or Black Han Sans) for Hangul through `unicode-range`.
- **Characters**: flat bold shapes with 7–9 px ink outlines and halftone shading. A logo mascot can be the hero; a pixel mini drawn large with an ink outline also works.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
