---
name: code-animation-x10
description: X10 粒子：- 分类：X code-video · code-video
---

# X10 粒子

- 分类：X code-video · code-video
- 适合：氛围

## 风格提示词

# Style: particles

Thousands of glowing particles drift on a flow field, gather into words, logos, and numbers, then scatter and re-form. The purest "drawn in code" look.

## Signature
| # | Item |
|---|---|
| 1 | A near-black field with thousands of short glowing streaks drifting on a smooth flow |
| 2 | Words and numbers that form out of the drift and hold with a gentle shimmer |
| 3 | The logo or a symbol formed from particles (sampled from the logo image or a path) |
| 4 | Morphs from one shape straight into the next |
| 5 | A burst that scatters everything before the next idea |
| 6 | Bloom on everything |
| 7 | A crisp caption under each formed shape |

## Look
- **Palette**: background `#05060b`; particles in cyan, violet, white, and pink, with the brand colours among them.
- **Fonts**: Geist (heavy weights sample best) for particle text; Pretendard Black for Hangul.

## Rules
- Keep particle text at 150–260 px so the particles read as letters.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
