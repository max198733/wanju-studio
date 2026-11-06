---
name: code-animation-x15
description: X15 热敏小票：- 分类：X code-video · code-video
---

# X15 热敏小票

- 分类：X code-video · code-video
- 适合：清单、"算一笔账"

## 风格提示词

# Style: thermal receipt

A thermal receipt printer on a teal desk: every scene prints a fresh slip that rises out of the printer, gets stamped, and is torn off. Works in 16:9 and 9:16.

## Signature
| Item | On screen |
|---|---|
| Desk | A teal tabletop (`#2e5b5f` / `#3c7277`) with a dark printer at the bottom edge |
| Slip | Off-white thermal paper `#f6f3ea` with dark ink `#2c3038`, a zigzag torn edge, dashed rules, and a barcode; the slip grows up out of the printer line by line |
| Type | Nanum Gothic Coding for the receipt lines and Black Han Sans for large headings |
| Opening | A NOTICE slip with the opening lines |
| Title | A slip with the name printed large |
| Steps | An ORDER slip with checkboxes ticked one by one |
| Numbers | A TOTAL slip with the value as the total |
| Ending | A thank-you slip with a red stamp `#d23a3a`, then the slip is torn off |

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
