---
name: code-animation-x30
description: X30 电影预告片：- 分类：X code-video · code-video
---

# X30 电影预告片

- 分类：X code-video · code-video
- 适合：下期预告、频道预告，11 段可以试

## 风格提示词

# Style: movie trailer

A prestige announcement trailer that reads like a luxury-watch or car-launch teaser borrowed for a tech reveal: an ultra-wide cinematic letterbox holds a near-black, warm vignette sky sprinkled with slow-drifting dust motes, and every idea — a question, then a date, then a run of benchmark numbers, then the product name, then a release date — gets its own held, centered, fully-faded screen. Nothing cuts hard; everything breathes in as a soft bloom of light, holds, and dissolves through black into the next. The mood is confident and expensive rather than energetic: hushed opening, a rhythmic pulse of swelling hits under the numbers, one big flare-and-impact at the name reveal, then a slow decrescendo fade-out.

## Signature
| Item | On screen |
|---|---|
| Background | Near-black warm umber/brown (~#150B09), soft radial vignette (darker at edges), faint floating dust/particle field (small soft specks, brightest near #FFFAF7) drifting almost imperceptibly |
| Frame / crop | The frame letterboxed to an ultra-wide ~2.6:1 window with thick pure-black bars top and bottom, held for the entire runtime |
| Palette (hex) | Near-white warm glow core #FFF9F0 / #FFFAE6 · champagne-gold #FBE6CB / #DDB59B · copper-amber accent #E5AF81 / #E2A882 · bronze divider #9A7562 · muted warm gray (secondary line) #B0A6A5 · dim gray (footer) #807F7D |
| Typography | Two-register serif system: a Western Didone/Times-like serif for big hero numerals and the English wordmark (bold, wide letter-spacing on the wordmark), and a softer Korean serif (myeongjo-style) for sentence lines; small caption/eyebrow words are set in slim, letter-spaced tracked caps |
| Hero-stat template | Every metric screen repeats the same layout: small tracked eyebrow label (amber) → giant glowing serif number/word, centered → thin horizontal bronze rule → one mid-size cream sentence → one smaller muted-gray comparison line beneath it |
| Glow / flare | A horizontal lens-flare hairline sits at vertical-center across the full width during bright moments, blooming into a soft radial halo behind hero text; on the biggest reveal the bloom visibly travels across the frame like a light sweep with slight motion blur |
| Footer citation | A small, dim gray source/citation line is anchored bottom-center/bottom-left and persists under nearly every card in the middle section |
| Composition | Always dead-center, single column, generous negative space, one statement or one number per screen — never more than a headline + two support lines at once |

## Direction
Design a static-camera announcement/reveal video in an ultra-wide cinematic letterbox (roughly 2.6:1) inside the frame, with thick permanent black bars top and bottom. Background: a near-black, warm dark-umber vignette sky with a sparse field of soft, slowly drifting dust/light particles — never fully empty, never busy. Build the video as a sequence of fully-centered, single-idea screens (one line of prose, one number, one name, one date) that each fade up from black, hold, and cross-fade back through black into the next — no hard cuts, no camera movement, no wipes. Open quietly with two or three short standalone sentences that build a question or a tension, fading in one at a time over the dust field. Resolve that tension into a bright, glowing reveal (a date, a season, a headline word) lit by a soft radial bloom and a thin horizontal lens-flare hairline across the frame's vertical center. Follow with a rapid-fire run of "hero stat" cards, each using an identical template: a small letter-spaced amber/copper eyebrow label, a giant glowing serif number or word in warm off-white with a soft outer glow, a thin bronze divider rule, one cream-colored sentence of context, and one smaller muted-gray comparison line beneath it — plus a small, dim citation/source line pinned near the bottom that persists across these cards. Give the product/subject name its own dedicated reveal: a wide-tracked serif wordmark (near-white at top of each letter blending to warm gold/champagne at the bottom) that a bright light sweep travels across horizontally before it settles into sharp focus, with a short tracked subtitle beneath it. Close on a final centered card (a release date or availability line, optionally a short list of where/how it's available), then fade the entire frame — including the letterbox bars — uniformly to black. Score it with rhythmic, percussive swells (sharp attack, quick decay) timed to land exactly on each screen change rather than a continuous underscore; keep most hits controlled/warm, reserve one full-spectrum, loudest hit for the name/logo reveal, and taper the loudness down through the closing card so the piece ends in near-silence rather than cutting off. Overall palette: warm near-black background, near-white/cream hero type, copper-amber accents and labels, champagne-gold highlights, muted warm grays for secondary text — a "gilded, hushed-prestige" look rather than a bright, saturated or high-energy one.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
