---
name: code-animation-x21
description: X21 突发新闻：- 分类：X code-video · code-video
---

# X21 突发新闻

- 分类：X code-video · code-video
- 适合：快讯开场

## 风格提示词

# Style: breaking-news broadcast

This clip resembles a cable-news "breaking news" graphics package — the kind of template a 24-hour news channel uses to announce a major story. It opens on a slowly-revealed rotating-globe title card, sweeps a diagonal tri-color ribbon across the screen for the headline stinger, cuts to a flat-vector illustrated news anchor at a desk with a persistent lower-third and scrolling ticker, pushes into a zooming world map (globe → country → city → geolocation pin), then alternates between data/stat cards and the anchor before closing on a minimal logo card. The feeling is urgent, corporate-broadcast, and info-dense: deep navy blues, hard red accents, bold condensed numerals, and a constant on-screen HUD (live clock, channel bug, ticker) that never disappears, evoking authority and immediacy rather than warmth.

## Signature
| Item | On screen |
|---|---|
| Background | Deep navy-blue field throughout, `#030e29`–`#051129`, with a faint rectangular grid overlay and soft diagonal light-ray streaks radiating from top corners (visible clearly in the globe intro) |
| Panel / card fill | Slightly lighter navy blue boxes for graphic panels and stat cards, `#0c2151`–`#112e72`, edged with a thin bright cyan-blue top border `#36b5fe` |
| Primary accent (alert) | Saturated red `#d6121c` used for the "속보"/breaking tag, lower-third bar, ticker background, and logo block |
| Secondary accent | Gold/amber `#ffc02f` used as a thin underline stripe beneath the red lower-third and in the diagonal ribbon band |
| Text | Pure white `#ffffff` for headlines and big numerals; muted blue-gray `#4e576e` for secondary/subtitle captions |
| Font feel | Bold, geometric sans-serif for both Korean and Latin/numeral text (weight and spacing suggest something like Noto Sans KR Bold / a Spoqa Han Sans-style face, unconfirmed) — headlines are large and heavy, captions and source lines are small and medium-weight |
| Layout / composition | Classic broadcast-chrome template: top-left channel bug (red logo box + pulsing "LIVE" dot), top-right live date/time readout that ticks in real time, a persistent bottom scrolling ticker (red bar of rotating headlines), and a lower-third headline bar (red tab + white/light bar + gold underline) that appears whenever a new fact is introduced |
| Signature visual moves | (1) radar-style concentric dashed rings pulsing around the intro globe; (2) a diagonal three-stripe ribbon (white / red / gold) sweeping across the frame as a scene-change stinger; (3) a map push-in sequence that zooms from full globe to country to city with a pulsing red geolocation pin and radar rings; (4) stat cards where a number appears, then a comparison value shows struck-through with a red percentage-change delta badge; (5) horizontal benchmark bars that read as pre-filled |

## Direction
Create a mock TV-news 'breaking news' broadcast package, generic-network style (no real logos or people). Background is a deep navy-blue field (~#04102a) with a very subtle grid texture and soft diagonal light rays bleeding in from the top corners. Open (0-1s) on a stylized wireframe globe centered in frame, rendered in mid-blue line-art on the navy background, ringed by pulsing concentric dashed arcs like a radar sweep. At ~1s, wipe a diagonal three-stripe ribbon across the full frame — thin white stripe, thick saturated red stripe, thin gold stripe — carrying a large bold all-caps headline word and a short white subhead beneath it. Cut to a flat, minimal vector-illustrated news anchor (simple geometric human silhouette, business attire, no facial animation needed) seated at a glossy desk in front of a softly lit studio backdrop, with a labeled graphic panel floating top-right (navy card, thin bright cyan-blue top border, bold white/gold headline text). Maintain a persistent broadcast HUD throughout every scene: a small red channel-bug box top-left with a pulsing 'LIVE' dot, a live-updating date/time readout top-right, a red lower-third bar with a bold headline and a thin gold underline, and a continuously scrolling red ticker strip along the very bottom feeding short rotating fact snippets. Around the middle third, push the camera from a full world map down through a country outline to a specific city, ending on a pulsing red geolocation pin with expanding radar rings, holding each zoom level 2-3 seconds. Follow with a sequence of dark navy stat cards: bold oversized white numerals as headline figures, a smaller muted comparison value shown struck-through beside a red percentage-change pill, and horizontal progress/benchmark bars with rounded caps in bright blue filling to different lengths. Close on a plain navy card with a small red-and-white logo lockup centered and a short muted-gray closing line beneath it, ticker and audio fading to silence. Underscore the entire piece with a continuous, evenly-spaced percussive ticking/clicking bed (no melody), swelling slightly louder every ~8 seconds around transitions and fading out completely in the final 1-2 seconds. Typography throughout is bold, heavy, geometric sans-serif; color palette is strictly navy blue, white, saturated red, and gold, with one bright cyan-blue accent line for panel borders.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
