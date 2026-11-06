---
name: code-animation-x19
description: X19 纪录片：- 分类：X code-video · code-video
---

# X19 纪录片

- 分类：X code-video · code-video
- 适合：认真讲一件事

## 风格提示词

# Style: documentary case file

A piece that reads like a serious investigative-documentary case file rather than a marketing reel: a near-black canvas holding a slowly turning low-poly "network sphere" emblem, chaptered like folder tabs ("Chapter 1 — ...", "Chapter 2 — ..."), with aged paper "evidence cards" laid under a desk lamp, minimal data-journalism bar charts, and one dramatized "witness testimony" segment shot as a backlit, explicitly-labeled graphic silhouette. Everything moves slowly and settles rather than snaps; captions build up phrase by phrase like narration being typed out; a hushed, low ambient bed with a slow recurring pluck tone underscores the whole thing, broken only by a hard opening hit and a bright closing chime. The net effect is hushed, credible, forensic — closer to a true-crime/60-Minutes case-file open than a tech-hype trailer.

## Signature
| Item | On screen |
|---|---|
| Backdrop | Pure black canvas (`#000000`) scattered with faint pinpoint "stars" and dim warm embers; a soft diagonal light-wedge/vignette appears only in the reenactment scene, along with a few out-of-focus glowing bokeh orbs (dust-in-a-spotlight look) |
| Emblem | A translucent low-poly sphere made of thin connecting lines and node-dots ("network globe"), rendered in dim bronze/amber, recurring at the open and close as a logo/chapter device |
| Palette | Near-black ground; ivory/cream display type (`#E8DED2`); warm coral-terracotta accent used for dates, the current/highlighted data point, and stamps of emphasis (`#D07152`); muted brick-red "correction ink" used only for strike-through of an old number and a circular rubber stamp (`#96473C`); aged, grain-textured cream paper for evidence cards (`#D5CAB4`); charcoal gray for inactive/comparison bars (`#403D38`) |
| Typography | Large numerals and section headlines set in a high-contrast serif with bracketed serifs (old-book / editorial feel); dates and percentages set in tabular, fixed-width digits; the chapter tag and bottom-left source line set in a small, letter-spaced sans-serif |
| Evidence cards | Flat rectangles of photographed, grain-textured paper that drop in at a slight perspective tilt (as if just placed on a desk under a lamp) and settle flat over about half a second, divided by thin hairline rules, with a hand-drawn-style red line striking an old figure, an arrow pointing to the replacement, and a round ink stamp sealing the change |
| Charts | Minimal horizontal bar charts directly on the black canvas: faint dotted vertical gridlines, one bar picked out in the coral accent while the rest stay charcoal gray, bar length and its number counting up together as it reveals |
| Chapter/citation system | Every scene carries a tracked-out "chapter N — title" tag top-left (like a case-file folder tab) and a small citation/source line bottom-left, exactly like a documentary lower-third footnote |
| Reenactment device | For the "testimony" chapter, a deliberately abstract, backlit human silhouette (not photographic) stands inside the light-wedge with a small on-screen disclaimer that it is a graphic reconstruction, plus a lower-third name/title card and a quote building up in quotation marks |

## Direction
Produce a dark documentary/case-file explainer. Canvas is near-black throughout, with a slowly rotating low-poly "network sphere" made of thin connected lines and glowing node-dots as a recurring logo/chapter device, plus faint pinpoint stars and warm embers drifting in the background. Structure the piece as numbered chapters (a small tracked-out "Chapter N — title" tag top-left on every scene, a small source/citation line bottom-left), each chapter cross-dissolving into the next — never a hard cut — with the outgoing scene ghosting under the incoming one for about half a second. Use a warm, restrained palette: near-black ground, ivory/cream serif display type for big numbers and headlines, tabular/monospaced digits for dates and stats, one warm coral-terracotta accent color reserved for the current data point or emphasis, a muted brick-red reserved only for "correction" marks (a strike-through line, a circular ink stamp), and charcoal gray for de-emphasized/comparison elements. Build at least one scene as a flat "evidence card" — an aged, grain-textured paper rectangle that drops in on a slight tilt and settles flat, showing a simple labeled table or figure with an old value struck through in red and a new value beside it. Build at least one scene as a minimal horizontal bar chart directly on the dark canvas, with faint dotted gridlines and exactly one bar in the accent color while the rest stay neutral gray, the bar length and its number counting up together on reveal. Build one "testimony" scene using a deliberately non-photographic, backlit human silhouette in a soft diagonal light-wedge, with a small disclaimer that the figure is a graphic reconstruction, a lower-third name/title card, and a quote that builds up phrase by phrase in quotation marks. Bottom-of-frame narration captions should also build up progressively, clause by clause, holding briefly before being replaced. Score it with a hushed ambient bed (roughly -20 to -25dB, well below dialogue/caption level) carrying a soft plucked/mallet tone with a short ascending harmonic ring that repeats roughly every 1.2-1.5 seconds — a slow, deliberate, heartbeat-like pulse, not a dance beat — plus a sharp low hit at the very open and a brighter swell or chime at the close when the logo returns. Keep the whole thing measured and unhurried: soft fades and settles rather than snaps, generous holds on each data point, and a serious, forensic, credible tone throughout.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
