---
name: code-animation-x27
description: X27 体育直播：- 分类：X code-video · code-video
---

# X27 体育直播

- 分类：X code-video · code-video
- 适合：解说感

## 风格提示词

# Style: sports broadcast

The clip reads like a cable-TV live-sports broadcast package — a night-match stadium open with floodlights and an LED-dot crowd, cut with the on-screen graphics package a network overlays during a match (score bug, "LIVE" badge, lower-third source ticker) — repurposed to walk through a head-to-head stat comparison instead of a game. Motion is entirely 2D broadcast-graphics motion (nothing pans or dollies; text counts up, bars fill, cards slide and glow) cut into short hard-cut chapters every few seconds. The audio is a rhythmic, plucked/percussive pulse that tightens and loosens with the on-screen drama — quieter during the analytical stat-sheet beat, swelling into a bright, confetti-timed climax at the finale — which together with the broadcast chrome gives it the feel of a TV "match highlights" reel rather than a slide deck.

## Signature

| Item | On screen |
|---|---|
| Backdrop | Two modes: (1) a night stadium establishing shot — dark navy sky, crossed floodlight beams, a dot-matrix grid of crowd/scoreboard lights, a green turf pitch with center circle at the bottom edge; (2) flat deep-navy card panels with a faint diagonal pinstripe/chevron texture (like jersey fabric) behind data content |
| Broadcast chrome | Persistent top-left mini score bug (event name + running score), top-right red "LIVE" pill + league/season badge, and a bottom-edge scrolling ticker bar citing the data source — all classic sports-broadcast overlay furniture that stays fixed while the content behind it changes |
| Cards & data viz | Rounded dark cards with a bold solid-color header bar coding the two sides (warm orange vs. cool slate-blue), oversized tabular numerals for the headline stat, thin horizontal comparison bars, a trading-card-style "player card" (jersey silhouette, numbered stat rows), and a lane-track "race" diagram with motion-trail ghost dots standing in for a speed comparison |
| Palette | Deep navy `#0f172f` (base/panels); darker navy `#0b1224`/`#091330` (backgrounds); pitch green `#0b3318`/`#16442a`; primary orange accent `#fd772c`; burnt-orange gradient `#cc5a28`; muted slate-blue `#586b8b`; muted brick red `#5d1117` (LIVE badge); amber/gold callout `#fec83d`; bright gold `#ffd136` (star badge); white `#ffffff` for numerals/labels |
| Type | Bold, condensed, all-caps sans-serif for headlines and card titles; blocky tabular numerals styled like a digital scoreboard for every stat; small tracked-out caps for kicker labels and the ticker |
| Layout | Header row (score bug + LIVE badge) is locked in place across the whole runtime; the frame beneath it swaps between full-bleed stadium shots and dark card panels; a ticker bar anchors the bottom edge once the data section begins |
| Transitions | No crossfades between chapters — each new "scene" (title card → scorecard → replay/race graphic → player card + stat sheet → pricing banner → final/MVP shot) is a hard cut; a diagonal color-block wipe was observed sliding a panel in from one edge at one cut. Within a scene, elements enter by fade-up, slide, or count-up rather than by cutting |
| Signature move | Headline numbers animate from 0.0 up to their final value as a counting ticker; the winning card then gets a glowing highlighted border, a circled/arrowed delta callout, and a small yellow "lead" pill — the visual grammar of a broadcast graphic revealing who's ahead |

## Direction
Design a motion-graphics short that borrows the visual grammar of a live TV sports broadcast to present a head-to-head comparison. Open and close on a night-stadium establishing shot: deep navy sky, crossed floodlight beams, a dot-matrix grid of distant crowd/scoreboard lights, and a turf-green playing surface with a center line/circle at the bottom edge. Keep a persistent broadcast "score bug" locked in the top-left corner and a red "LIVE" pill plus event/season badge locked in the top-right, unchanged across every cut; once data appears, add a scrolling lower-third ticker bar along the bottom citing the source.

Cut hard between short chapters (title card, scorecard, a "replay" comparison graphic, a trading-card-style profile with stat rows, a season-stat sheet, a pricing/cost banner, and a final "MVP" celebration with confetti) roughly every 3–8 seconds — never crossfade between chapters, but animate freely within one: fade/slide elements in, fill horizontal bars, and count numerals up from zero to their final value. Code the two sides being compared with a warm bright-orange header/accent against a cool muted slate-blue one, on a deep-navy base with a faint diagonal pinstripe texture; reserve a bright gold/amber for "lead" callouts and a star-shaped MVP badge. Use bold, condensed, all-caps type with blocky tabular numerals that read like a digital scoreboard. Whichever side is winning a given stat gets a glowing highlighted border, an arrowed or circled delta callout, and a small colored "lead" pill — make the graphics themselves narrate who is ahead.

Score it with a rhythmic, percussive/plucked pulse rather than a sustained melody: keep it dense and driving under the intro and headline comparisons, let it thin out and go quieter under any slower, more analytical/data-dense screen, then build back into a bright full-spectrum swell timed exactly to the climax (trophy/MVP/confetti moment), and let it fade to near-silence at the very end. Layer in a sparse, irregular high-frequency tick or shimmer texture throughout for broadcast-graphic polish, but keep the piece instrumental — no vocals.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
