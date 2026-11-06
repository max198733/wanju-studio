---
name: code-animation-o66
description: O66 辛德勒的名单：冷灰、高反差的黑白，粗颗粒，高光晕开；只有小女孩的红大衣和 Clawd 的橙色有颜色。这正是斯皮尔伯格的手法：红大衣和安息日烛火是全片仅有的彩色。
---

# O66 辛德勒的名单

- 分类：O 奥斯卡 98 部 · 世纪末 1990–1999
- 长什么样：冷灰、高反差的黑白，粗颗粒，高光晕开；只有小女孩的红大衣和 Clawd 的橙色有颜色。这正是斯皮尔伯格的手法：红大衣和安息日烛火是全片仅有的彩色。
- 风格：黑白胶片 · 唯一的红大衣
- 关键词：2D·B&W
- 年份：1993

## 风格提示词

黑白电影质感：冷中性灰，强 S 曲线（黑接近 #111，白接近 #EEE），高光在雾里泛光晕，略软的老镜头，逐帧变化的银盐颗粒（±6%），轻微闪烁，偶有灰尘，暗角。全画面是灰的，只有故事围绕的那个主角是饱和色，以衣服为主（如陶土橙 #D97757）；可再有一个红色故事道具（#A3241F–#C9463C）。灯和火保持灰色，除非“火苗先灰后转暖”是剧情节点。长焦压缩空间，前景虚焦树枝；有人群时，体型、衣色和步态人人不同。默认阴天中间调，暗部不死黑。招牌镜头：长焦俯看许多走动的小人，带色的那个在其中；没有人群就让主角很小地落在大片灰里。对标摄影师 Janusz Kamiński（《辛德勒的名单》，1993）。避免：棕褐或偏蓝调色；无颗粒的干净灰；超过两样有颜色的东西。

---

English:

Black-and-white film look: cold neutral greys, a strong S-curve (blacks near #111, whites near #EEE), highlights haloing in haze, a soft old lens, silver grain re-rolled every frame (±6%), slight flicker, rare dust, vignette. Everything is grey except the one hero the story centres on, saturated, mainly clothing (e.g. terracotta #D97757); optionally one red story object (#A3241F–#C9463C). Lamps and fires stay grey, unless a flame turning from grey to warm is the story beat. Long-lens compression, soft foreground branches; in a crowd, no two people alike in build, tone or gait. Default: overcast mid-key, shadows open. Signature shot: high long-lens view of many small walking figures, the coloured one among them; without a crowd, the hero tiny in wide grey space. Reference: cinematographer Janusz Kamiński (*Schindler's List*, 1993). Avoid: sepia or blue toning; grain-free greys; more than two coloured things.

## 补充

### 技法关键词

高反差黑白胶片,粗颗粒银盐,局部留色,Janusz Kamiński

### 导演说明

Clawd 扮辛德勒：灰色软呢帽、手握缰绳，坐在马上往下看。四个硬切跟着他的目光走：山坡、长焦主观镜头、街面，最后收在蜡烛上，每个镜头约一拍半。全程克制：人只是在走，不出现任何暴力。

### 成片里的分镜

1. 山坡上骑着深色马的 Clawd（辛德勒），坡下的街道挤满被驱赶的人群，人群里有一个红点；镜头轻推。（0.7s）
2. 硬切到辛德勒的长焦主观镜头，跟住独自走在人群空当里的红大衣小女孩。（0.6s）
3. 硬切到街面：横移镜头和小女孩同速，三排人从店铺前往左走，一件虚焦的大衣从镜头前掠过。（0.6s）
4. 硬切到黑暗里的两支安息日蜡烛：火苗先亮成灰白，再变成彩色；缓慢推进。Clawd 不在画面里。（0.6s）

### 参考出处

Steven Spielberg, Schindler's List (1993),Janusz Kamiński (cinematography),Schindler's List (1993) poster

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
