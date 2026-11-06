---
name: code-animation-x25
description: X25 天气预报：- 分类：X code-video · code-video
---

# X25 天气预报

- 分类：X code-video · code-video
- 适合：用天气讲情绪，感受讲解很合适

## 风格提示词

# Style: TV weather forecast

A short data video styled as a Korean TV nightly-weather-report broadcast graphics package repurposed for a status update. It opens with a satellite/radar-style storm-spiral animation, then cuts through a sequence of "forecast card" scenes — a temperature-style map, thermometers, wind/speed gauges, a multi-day forecast strip, and a sunny sign-off — each dressed with real broadcast chrome: a channel logo pill, a live date badge, and a scrolling breaking-news ticker along the bottom. The screen stays locked-off and flat; all motion lives inside the graphics (falling snow, twinkling stars, drifting wind lines, a fast diagonal wipe between scenes). A bright, plucky instrumental loop runs under it with an accented musical hit landing on every scene change, giving the whole thing a polished, on-air, slightly playful newsroom feel.

## Signature
| Item | On screen |
|---|---|
| Background | Vertical navy gradient, lighter blue near the top (`#09316b`/`#0a326e`) fading to near-black at the bottom (`#031433`/`#051530`) — same gradient in every scene |
| Cards / panels | Solid-fill rounded-rectangle panels (`#092348`), no stroke, soft drop shadow, one stat or graphic per card |
| Palette | Navy bg `#09316b`→`#031433`, panel `#092348`, alert/ticker red `#dd2222`–`#df2122` with a brighter dot `#fe4544`, accent yellow `#fdd118`, sun gradient `#fef2a4`(center)→`#fdaf23`/`#fe9d18`(rim), off-white text `#f7ffff`/`#dee4e7` |
| Typography | Heavy, rounded geometric sans (bold Korean UI/dashboard face); oversized bold stat numbers in yellow/blue/white; smaller muted gray-blue captions and source lines |
| Iconography | Flat vector weather icons with a soft gradient + drop shadow (sun, cloud, snowflake, thermometer, wind compass, speedometer gauge, umbrella) — a rounded "fluent"/2.5D icon look |
| Fixed chrome | Top-left pill logo (circular spiral emblem + wordmark) and top-right rounded status badge with a glowing dot, present unchanged in every scene; full-width ticker bar at the very bottom (colored label block + continuously scrolling headline text, thin bright top border) |
| Layout rhythm | Title block anchored upper-left: bold headline next to a thin vertical accent bar, plus a smaller subhead; 1–3 card panels laid out horizontally below it; a small citation line bottom-left above the ticker |

## Direction
Build a locked-off "broadcast weather report" data video. Open on a rotating storm-spiral animation made of soft glowing dots over a faint grid backdrop, resolving into a title card. Cut through a sequence of scenes styled as on-air weather-graphics: a fixed top bar with a circular-emblem logo pill on the left and a rounded status/date badge with a glowing dot on the right, present in every scene; a title block at upper-left with a bold headline beside a thin vertical accent bar and a smaller subhead; below it, one to three solid-fill rounded card panels, each holding a single stat or icon graphic (thermometer, gauge, compass, multi-day forecast strip, etc.) drawn in a soft, flat-with-shadow icon style; a small citation line bottom-left; and a full-width ticker bar along the very bottom (colored label block plus continuously scrolling headline text, thin bright top border). Use a deep navy vertical gradient background (lighter/blue near the top, near-black at the bottom) throughout, one saturated accent color (warm yellow) for accent bars, wipes, and highlighted numbers, a saturated red reserved for alert/ticker chrome, and warm sun-gradient colors for a positive/clear payoff scene. Layer mood-appropriate ambient particles at low opacity behind each scene's cards (e.g. falling snow, twinkling stars, drifting streak lines) to match that scene's subject. Cut between scenes with a fast diagonal wipe (bright leading edge) roughly every 4–9 seconds. End on a single centered glowing icon with a short sign-off headline, then fade to black. Score it with a continuous, bright plucked/mallet-style melodic loop over a soft pad, a steady quick pulse, quiet and even overall level that fades in and out at the edges, plus one clearly louder accented musical hit synced to each wipe transition as a broadcast stinger.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
