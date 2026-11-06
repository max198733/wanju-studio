---
name: code-animation-x2
description: X2 品牌动态图形：- 分类：X code-video · code-video
---

# X2 品牌动态图形

- 分类：X code-video · code-video
- 适合：频道片头

## 风格提示词

# Style: brand motion graphics

A clean explainer that looks like an official brand asset: one dark field, thin white hand-drawn line art, bold type with a single accent, scribbled emphasis, and a persuasion arc from pain to call to action. Silent.

Reference frames from the original: `<skill>/docs/styles/motion.jpg`.

## Signature
| # | Item |
|---|---|
| 1 | One dark field for the whole video (no light scenes), one accent colour, pain words in red |
| 2 | Thin white hand-drawn line illustrations of everyday objects that draw themselves on (faucet, manual, clock, eye, wallet, camera, mic) |
| 3 | Bold geometric sans headlines that pop in word by word, the key word in the accent |
| 4 | Hand-drawn emphasis on type: a scribbled oval around a key word, a swoosh under a phrase |
| 5 | A thin "frustration" gauge that climbs across the pain beats |
| 6 | Proof drawn as line art: a bar chart with hatched pain bars and one tiny accent bar; a big accent number; a cloud of outline pill tags with one filled |
| 7 | The product shown working: a line-art phone with camera corners, the question in an outline bubble with a mic and a live waveform, the answer in a filled accent bubble |
| 8 | Ending: the wordmark with an accent full stop and swoosh, a glowing pill CTA that the cursor clicks, the free-to-try line and URL |

## Look
- **Palette**: background `#0c0b1d`, ink `#f2f1f7`, dim `#8f8da8`, pain `#ff5d5d`, camera cyan `#38d6e6`, and the brand's accent (read it from the site CSS or logo pixels; the original used its purple `#7c5cff`). If the brand is light-themed, still keep the dark field and carry the brand in the accent and logo.
- **Fonts**: Poppins SemiBold/Bold (or the brand's geometric sans), IBM Plex Mono for tiny labels. Korean: Pretendard in the same roles.
- **Lines**: white, 2.5–3 px, a slight wobble: a steady hand, not a sketch.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
