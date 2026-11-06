---
name: code-animation-x3
description: X3 沙画：- 分类：X code-video · code-video
---

# X3 沙画

- 分类：X code-video · code-video
- 适合：回忆、情绪，感受讲解很合适

## 风格提示词

# Style: sand art chronicle

Scenes poured in dark sand on a glowing light table, lit by sunbursts and night skies, that break into grains and blow away between eras. Music and sound effects. Suits stories told through time.

Reference frames from the original: `<skill>/docs/styles/sand.jpg`.

## Signature
| # | Item |
|---|---|
| 1 | A parchment light table with visible grain everywhere, dark brown sand with grainy soft edges |
| 2 | Silhouettes, not outlines: buildings, vehicles, people, landscapes as solid shapes, often moving (a train crossing, a plane flying) |
| 3 | The year in an old-style serif in a top corner with a short italic caption under it; no heavy sans captions |
| 4 | Scene changes where the picture breaks into grains and blows away, or is swept off by hand, then the next is poured in |
| 5 | Lighting that changes with the story: a sunburst with rays, a glowing sun, a night sky with a moon and stars cut out of the sand, fireworks |
| 6 | Grain as material: smoke, crowds, water, and dust drawn as scattered specks, not flat fills |
| 7 | Title and ending built from a ring of stars or an emblem around one big serif number or name, with the dates in serif |

## Look
- **Palette**: table `#f3dcae` → `#9b7648`, sand `#2e2014`. Sand is one colour; the brand shows only in the final logo card and, at most, one accent.
- **Fonts**: Cormorant (medium) for years and titles, Cormorant Italic for captions. Korean: Nanum Myeongjo for both. Captions stay small (22–30 px) and elegant; the picture carries the scene.

## Rules
- Keep captions and years on a clear patch of the table; grain behind text makes it hard to read.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
