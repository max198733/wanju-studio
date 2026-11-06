---
name: code-animation-x5
description: X5 卡点素材剪辑：- 分类：X code-video · code-video
---

# X5 卡点素材剪辑

- 分类：X code-video · code-video
- 适合：快剪

## 风格提示词

# Style: beat-synced footage

A high-end, minimal promo cut to a song: a hook that lands word by word on a light stage, the product UI, then real clips on a dark stage as a scanned wall, a 3D carousel, and a phone next to a campaign panel, with stats on push cuts and every cut on a beat.

Reference frames from the original: `<skill>/docs/styles/beat.jpg`.

## Inputs to ask for
- 8 to 20 clips the user owns (vertical works best), plus 3 to 5 product or UI moments to show
- a song the user may use commercially (their own, or a library track whose licence allows it); if there is none, synthesize one with `audio.py`
- the product name, the one-line promise, one accent colour, and the numbers to show (from the research or the user, never invented)

## Signature
| # | Item |
|---|---|
| 1 | The hook lands word by word on the beats on a warm light stage, with one word hidden as an accent block |
| 2 | The product UI: the masked block grows into a clean window where a cursor types an input and clicks the button |
| 3 | The drop into a near-black stage with a warm floor glow |
| 4 | A wall of real vertical clips scanned by a light bar, all but three winners dimmed, winners framed with a score tag |
| 5 | The key output as big type or ranked rows with scores |
| 6 | A 3D carousel of clips with floor reflections that whips onto one hero clip |
| 7 | The hero clip in a phone next to a settings panel: toggles switch on, the button turns green, the panel flips into results |
| 8 | Big stats on push cuts with motion blur, a three-word ticker with the last word in the accent, then the logo |

## Look
- **Palette**: light stage `#f7f3ef` with peach glows `#ffd9c4`, dark stage `#0b0b0c` with an orange floor glow, ink `#151515` / `#f4f4f4`, one accent (the brand's; the original used orange `#ff5a1f`), success green `#22c55e` for the button only.
- **Type**: one clean sans with tight tracking (Geist or Inter), a mono for tiny labels. Korean: Pretendard. No full stops in on-screen text.

## Rules
- Every cut lands on a downbeat, every UI hit on a beat.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
