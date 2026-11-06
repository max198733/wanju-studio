---
name: code-animation-x1
description: X1 手绘：- 分类：X code-video · code-video
---

# X1 手绘

- 分类：X code-video · code-video
- 适合：讲解、记录

## 风格提示词

# Style: hand-drawn + 8-bit minis (default)

Warm empty paper, a thin ink horizon, and an 8-bit mascot that acts out the story, cut against dark title cards and arcade screens.

Reference frames from the original: `<skill>/docs/styles/handdrawn.jpg`.

## Signature
| # | Item |
|---|---|
| 1 | Plain warm off-white paper with no grid; one thin ink horizon with grass tufts; outline clouds |
| 2 | The logo mascot as an 8-bit sprite that acts out the beats: pushes, smashes, stands on top of the winning bar |
| 3 | A dark title card: small serif "Introducing", the name typing in a large serif, the accent part (version, product word) in the brand colour with a hand underline, a script subline |
| 4 | Level structure: a small mono `WORLD 1-1` tag in the top-left of each beat and one pixel-font "WORLD 2" interstitial card |
| 5 | Numbers as serif count-ups with a bold label and a script note; hatched-vs-solid bars; a pixel HI-SCORE board on a dark screen; a price tag struck through |
| 6 | One full-bleed brand-colour scene entered with a torn-paper transition |
| 7 | Ending: the logo mark and the serif name with its underline, a short "available now" line, a spaced list of where to get it, the mascot on the horizon |

## Look
- **Palette**: paper `#f4f2ee`, ink `#2b2a28`, dark `#1c1b1a`, plus the brand accent (Claude orange `#D97757` in the original). Nothing else is coloured.
- **Fonts**: Source Serif 4 (titles, numbers), Caveat (notes, sublines), Press Start 2P (HI-SCORE, WORLD cards), IBM Plex Mono (tags, small values), Geist (bold labels). For Korean use Nanum Myeongjo, Gaegu, Galmuri11, NanumGothicCoding, and Pretendard in the same roles (unicode-range pairs, see kit-api.md).
- **Lines**: thin (2–2.5 px) and calm, with a gentle wobble; this is pen on paper, not a marker.
- **Density**: one idea per beat, lots of empty paper.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
