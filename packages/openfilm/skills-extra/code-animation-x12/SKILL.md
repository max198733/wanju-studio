---
name: code-animation-x12
description: X12 霓虹灯牌：- 分类：X code-video · code-video
---

# X12 霓虹灯牌

- 分类：X code-video · code-video
- 适合：金句

## 风格提示词

# Style: neon sign

Glass tubes on a dark brick wall that buzz and flicker on, glow onto the wall, and reflect on a wet floor.

## Signature
| # | Item |
|---|---|
| 1 | A dark brick wall with a wet floor |
| 2 | Words as neon tubes: coloured halo, glow, white-hot core |
| 3 | Tubes flicker and buzz on before they hold steady; unlit tubes show as dark glass |
| 4 | Icons, arrows, and frames bent from tube |
| 5 | Light spilling onto the wall and a reflection in the floor |
| 6 | The buzz: a click on each flicker |

## Look
- **Palette**: wall `#1b1417`; tubes pink `#ff4fa3`, cyan `#3ff0ff`, yellow `#ffe45c`, green `#6bff8a`, orange `#ff8a3d`, violet `#b56bff`. Make the brand colour the main tube.
- **Fonts**: Tilt Neon for Latin; Pretendard (light weights) for Hangul, drawn as strokes.
- **Composition**: one sign per scene, centred or offset like a shop sign; at most three tube colours at once.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
