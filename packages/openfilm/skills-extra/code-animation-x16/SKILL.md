---
name: code-animation-x16
description: X16 地铁线路图：- 分类：X code-video · code-video
---

# X16 地铁线路图

- 分类：X code-video · code-video
- 适合：讲一路怎么走过来的，适合 04 段

## 风格提示词

# Style: transit map

A transit map and station signage: coloured lines are drawn across cream paper, stations light up one by one, a train runs the line, and the ending is the terminus sign.

## Signature
| Item | On screen |
|---|---|
| Ground | Cream map paper `#f4f0e6`, ink `#1d1d22`, muted `#6f6a60` for small print |
| Lines | Thick rounded route lines in the line colours (terracotta `#d9774f`, navy `#23408e`) with white-ringed station dots and 45° bends |
| Signage | Navy station signs `#1f2a44` with white Pretendard (Regular, Bold, Black) text |
| Opening | A station sign board carrying the opening lines |
| Title | A logo, the name, and a line drawn across the frame |
| Steps | A line with numbered stations and a train moving from station to station |
| Numbers | The value in a badge in the line colour |
| Ending | The terminus sign and a ticket with the call to action |

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
