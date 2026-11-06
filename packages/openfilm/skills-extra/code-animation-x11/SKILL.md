---
name: code-animation-x11
description: X11 翻牌显示板：- 分类：X code-video · code-video
---

# X11 翻牌显示板

- 分类：X code-video · code-video
- 适合：机场那种翻牌，适合标题和数字

## 风格提示词

# Style: split-flap board

A railway departures board: tiles clatter through the alphabet onto each message, amber lamps blink, and a station clock ticks.

## Signature
| # | Item |
|---|---|
| 1 | A dark board of individual flap tiles with a hinge line and a split between halves |
| 2 | Messages land by flipping through characters, column after column |
| 3 | A departures table: time, destination, gate or code, status |
| 4 | Status lamps in amber, green, red; one blinks (BOARDING, NEW, NOW) |
| 5 | A header with the board title and a clock |
| 6 | The clatter: flap clicks placed on the flips |

## Look
- **Palette**: board `#0f0f10`, tiles `#232326`, characters `#f1ede2`, amber `#ffb000`, green `#39d353`, red `#ff5a4f`. The brand shows in one status colour and the final message.
- **Fonts**: Roboto Mono (bold) for Latin; Pretendard Bold for Hangul (Hangul tiles flip through a few letters, then land).
- **Messages**: uppercase, short (tiles are wide); one idea per board change.

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
