---
name: code-animation-x14
description: X14 CRT 终端：- 分类：X code-video · code-video
---

# X14 CRT 终端

- 分类：X code-video · code-video
- 适合：讲代码、讲 AI

## 风格提示词

# Style: CRT terminal

A green phosphor terminal on an old CRT: commands type themselves out, logs scroll, progress bars fill, and big block-letter banners glow for the name and the numbers.

## Signature
| Item | On screen |
|---|---|
| Screen | Near-black green glass (`#031208`) with phosphor text `#46ff8a`, a soft glow, scanlines, and a slight curvature vignette |
| Type | Nanum Gothic Coding (regular and bold) for every line, prompt `user@studio:~$`; amber `#ffc24a` for highlights |
| Opening | A boot line, then the opening lines typed at the prompt with a blinking block cursor |
| Title | `./intro` runs and prints the name as a large block-letter banner |
| Steps | A `make` style log where each step ends in an `[ OK ]` tag, with a progress bar filling underneath |
| Numbers | A `stats` command prints the value as a block-letter banner with its label |
| Ending | The call to action typed as a command, the URL, and `exit` |

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
