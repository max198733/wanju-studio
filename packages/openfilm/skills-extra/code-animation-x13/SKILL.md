---
name: code-animation-x13
description: X13 16-bit 街机：- 分类：X code-video · code-video
---

# X13 16-bit 街机

- 分类：X code-video · code-video
- 适合：游戏感

## 风格提示词

# Style: 16-bit arcade

A 16-bit console game come to life: a starry violet night, pixel sprites, CRT scanlines, and game UI that turns the story into a run from INSERT COIN to GAME CLEAR.

## Signature
| Item | On screen |
|---|---|
| Stage | A deep violet night sky (`#10081f` → `#1b0f3a` → `#5a2a6e`) with twinkling pixel stars and faint CRT scanlines over everything |
| Type | Press Start 2P for Latin and Galmuri11 Bold for Hangul, kept crisp at multiples of 8 px and 11 px; gold `#ffd23f` titles, white text, soft lilac `#d9ccff` sublines |
| Opening | INSERT COIN, then the lines drop in with a small screen shake |
| Title | The game title, a hero sprite, and a blinking PRESS START |
| Steps | A STAGE SELECT map where the hero hops from node to node, each node a step or feature, labels on a dark plate |
| Numbers | HIGH SCORE: the value counts up under its label |
| Ending | GAME CLEAR with a dialog box carrying the call to action |

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
