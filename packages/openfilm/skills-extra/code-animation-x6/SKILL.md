---
name: code-animation-x6
description: X6 界面形变：- 分类：X code-video · code-video
---

# X6 界面形变

- 分类：X code-video · code-video
- 适合：演示工具

## 风格提示词

# Style: UI morph

One interface element that never cuts: a button becomes a loader, a player, a slider, tabs, a chart, a command palette, a toast, and finally the button again, so the video loops. A cursor clicks and drags to cause every change, on the beat. Reference frames are in `docs/styles/uimorph.jpg`.

## Signature
| # | Item |
|---|---|
| 1 | A single shape, never cut: every state is the same element changing size, corner radius, and fill |
| 2 | Content swaps inside it with a short blur, entering and leaving on its own timing |
| 3 | A cursor causes every change with real clicks and drags; dragged values follow it and spring back on release |
| 4 | Spring motion with at most a tiny overshoot; tab indicators and knobs stretch because their edges ride different springs |
| 5 | Real UI states the subject would have (its buttons, player, sliders, tabs, chart, command palette, toast), in black and white on a light warm grey, one clean UI font |
| 6 | Something happens on every beat; the camera zooms so each state fills the frame |
| 7 | The last frame is the first frame, cursor included, so it loops |

## Look
- **Palette**: canvas `#ecebe7`, ink `#0b0b0b`, cards `#ffffff`, secondary text `#8d8c88`. Colour appears only in content such as album art or the subject's own accent; no gradients or glows on the UI itself.
- **Fonts**: Geist (Pretendard for Hangul), Geist Mono for times and shortcuts.
- **Motion**: springs everywhere; no bouncy easing, particles, or dead time.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
