---
name: code-animation-x4
description: X4 歌词 MV：- 分类：X code-video · code-video
---

# X4 歌词 MV

- 分类：X code-video · code-video
- 适合：金句、配乐段

## 风格提示词

# Style: lyric music video

An educational music video that reads like a technical explainer set to a song: a dark grid, a section label in the corner, one diagram per lyric line, and the sung line at the bottom. The engine makes the instrumental; the lyrics are on screen, not sung.

Reference frames from the original: `<skill>/docs/styles/lyric.jpg`.

## Signature
| # | Item |
|---|---|
| 1 | A dark navy field with a faint grid and vignette in every scene |
| 2 | The song section in a small mono label top-left (`VERSE 1 · how Jev differs from a chat model`), the title top-right, a thin progress line along the top |
| 3 | The sung line at the bottom under a hairline: sung words bright, the rest dim |
| 4 | One diagram per line, centred: node boxes joined by connectors with a travelling pulse, JSON/code cards, probability bars, a stopwatch or a big glowing value, a crossing-curves chart |
| 5 | The chorus repeats the same diagram with a new accent each time it returns (cyan, pink, yellow, green) |
| 6 | Intro and outro: the name in a glowing ring, the subtitle in the accent, "an educational music video", the about line, the song title between ♪ marks |

## Look
- **Palette**: bg `#0b0f1e`, ink `#e9edf6`, dim `#5e6886`, cards `#121832`, accents cyan `#35d0e6`, pink `#ff5cc8`, yellow `#ffc53a`, green `#4ade80`. If the brand has a strong colour, make it the first accent.
- **Fonts**: IBM Plex Sans (semibold/bold) and IBM Plex Mono. Korean: Pretendard and NanumGothicCoding.
- **Diagrams**: flat, precise, thin 2 px borders, 10 px radius; no hand-drawn wobble, no illustrations of scenery. Each diagram builds on the line's first beat and holds while the line is sung.

## Rules
- Every lyric line is one researched fact with its own diagram.
- The lyrics are on screen, not sung: do not claim the video has vocals.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
