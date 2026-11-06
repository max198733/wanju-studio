---
name: code-animation-o54
description: O54 烈火战车：仿 Jean Droit 1924 巴黎奥运海报的四色石印：古典人体、有限油墨、成团的石版颗粒、参差套色。《烈火战车》讲的是 1924 年奥运，海滩长跑像那张海报活了过来。
---

# O54 烈火战车

- 分类：O 奥斯卡 98 部 · 大片年代 1980–1989
- 长什么样：仿 Jean Droit 1924 巴黎奥运海报的四色石印：古典人体、有限油墨、成团的石版颗粒、参差套色。《烈火战车》讲的是 1924 年奥运，海滩长跑像那张海报活了过来。
- 风格：1924 巴黎奥运石印海报
- 关键词：2D
- 年份：1981

## 风格提示词

20 年代石版印刷海报，四色：海蓝 #245A8C、赭黄 #D49640、深棕 #40271B、暖红 #E47E62，印在泛旧的奶油纸 #F1E7D1 上，每色错位约画面宽的 1/700。所有色调都由油墨颗粒组成，不平涂：颗粒约画面宽的 1/1000，聚成软团，浅色区覆盖两到四成，中间调五到八成，实色几乎满版、留针孔；空白纸上不能有零散孤点。分工：蓝给天空、水和冷阴影；赭黄给地面和皮肤；深棕给轮廓、暗部和衣服；红少量点缀。明暗安静偏浅。人物古典：受光侧赭黄，四肢顺一道深棕明暗交界线，头约身高八分之一；多人排成横列。动作慢，靠水花、尘土、头发、布料带出。镜头：长焦正面、贴地低机位；可加衬线字标题横带。对标 Jean Droit 的 1924 年巴黎奥运海报。避免：粗噪点、象形小人、矢量平涂。

---

English:

1920s stone lithograph poster in four inks: sea blue #245A8C, ochre #D49640, deep brown #40271B, warm red #E47E62, on aged cream #F1E7D1, misregistered about 1/700 of frame width. Every tone is ink grain, never a flat fill: specks about 1/1000 of frame width in soft clumps, covering 20–40% of pale areas, 50–80% of mid-tones, nearly all of solids (with pinholes); no stray specks on bare paper. Roles: blue for sky, water, cool shadow; ochre for ground and skin; brown for outlines, darks, clothes; red sparingly. Values calm and pale. Classical figures: ochre lit side, brown core-shadow line down each limb, head 1/8 of body; groups in a row. Slow motion carried by spray, dust, hair, cloth. Camera: long-lens front views, ground-level shots; optional serif title band. Reference: Jean Droit, 1924 Paris Olympics poster. Avoid: coarse speckle, pictogram figures, vector fills.

## 补充

### 技法关键词

四版石印,Jean Droit 的 1924 奥运海报,古典解剖人体

### 导演说明

Clawd 跑在队伍里：白头带、胸前别着 98 号码布。跑步按 1 倍速，看起来就是原片的慢镜头。四个硬切：面孔、脚、利德尔仰头的跑姿、侧面整队；最后一镜印上海报字框，把这场戏变成 1924 年的海报。

### 成片里的分镜

1. 长焦正面：跑者队伍沿着浪边迎面跑来，Clawd 在其中，戴白头带、别着 98 号码布；镜头略微拉开。（0.7s）
2. 贴地近景：赤脚踩进浅水溅起水花，湿沙上有倒影；镜头横向滑动。（0.6s）
3. 利德尔的近景：仰头张嘴，亚伯拉罕斯在他身后；镜头略微拉开。（0.5s）
4. 侧面看整队跑者，Clawd 在中间；镜头拉开时，“JEUX DE LA VIIIe OLYMPIADE · PARIS 1924”的海报字框印上画面。（0.8s）

### 参考出处

Hugh Hudson, Chariots of Fire (1981),Jean Droit, Jeux de la VIIIe Olympiade, Paris 1924 (poster),Chariots of Fire one-sheet (1981),Vangelis (score)

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
