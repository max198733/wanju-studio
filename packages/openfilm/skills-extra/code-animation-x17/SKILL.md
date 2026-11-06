---
name: code-animation-x17
description: X17 蓝图：- 分类：X code-video · code-video
---

# X17 蓝图

- 分类：X code-video · code-video
- 适合：讲结构

## 风格提示词

# Style: blueprint

A cyanotype engineering drawing: white linework on blueprint blue, dimension lines, numbered balloons, and a title block, as if the product were being specified on a drafting table.

## Signature
| Item | On screen |
|---|---|
| Sheet | Blueprint blue `#17508c` with a faint grid and a thin border; lines in near-white, construction lines faint |
| Type | IBM Plex Mono and Nanum Gothic Coding in capitals, like drafting lettering; yellow `#ffd166` for the highlight |
| Title block | A title block in the lower right with the drawing number, sheet name, and date |
| Opening | NOTE lines with dashed underlines |
| Title | The name with a dimension line carrying the tagline |
| Steps | Process boxes joined by arrows, each tagged with a numbered balloon |
| Numbers | A huge value dimensioned by its label |
| Ending | A release sheet with a stamp |

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
