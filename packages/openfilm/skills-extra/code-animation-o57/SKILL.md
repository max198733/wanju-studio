---
name: code-animation-o57
description: O57 莫扎特传：黑纸剪成的侧面人像镶着金边，坐满马蹄形的金色包厢和红丝绒，对着星空布景的舞台。《莫扎特传》的高光是首演之夜，一个画面装下乐池、舞台、观众和暗处的萨列里。
---

# O57 莫扎特传

- 分类：O 奥斯卡 98 部 · 大片年代 1980–1989
- 长什么样：黑纸剪成的侧面人像镶着金边，坐满马蹄形的金色包厢和红丝绒，对着星空布景的舞台。《莫扎特传》的高光是首演之夜，一个画面装下乐池、舞台、观众和暗处的萨列里。
- 风格：洛可可剪影 · 烛光金色歌剧院
- 关键词：2D
- 年份：1984

## 风格提示词

18 世纪剪纸剪影，放在烛光照亮的洛可可室内。每个人物是实心黑侧影 #0B0705，各有自己的剪纸细节（发型、鼻子、蕾丝镂空、物件），朝最近烛火的一侧描 2–3px（按 1920×1080）亮金边 #F7E3A0，顺衣褶勾几根细金线。金色浮雕 #B88A2E 和红丝绒 #6E0F14 像包厢一样框住画面；户外题材画成舞台上被照亮的布景，剪纸人物站在布景前。红与金占画面大半，夜蓝 #0C1A3A 只用于远处天空。只有主角侧影里的脸是画出来、有颜色的。烛火轻微跳动（亮度±5%），暖光晕约五个火苗宽，薄烟、暗角、细颗粒。招牌镜头：前景剪影框住远处亮着的舞台，慢横移再推进。对标剪影 Edouart、Miers，摄影师 Miroslav Ondříček（《莫扎特传》，1984）。避免：没有剪纸细节的黑块；复制粘贴的侧影；蓝色墙面；频闪的烛火。

---

English:

18th-century cut-paper silhouettes. Each figure: a solid black profile #0B0705 with its own cut detail (hair, nose, lace holes, props), a 2–3 px pale-gold rim #F7E3A0 (at 1920×1080) toward the nearest flame, and hairline gold lines along clothing folds. Gilt relief #B88A2E and red velvet #6E0F14 frame the scene like an opera box; an outdoor subject becomes a lit painted backdrop on a stage, cut-paper figures in front. Reds and golds fill most of the frame; night blue #0C1A3A only for the far sky. Only the hero gets a painted, coloured face. Candles flicker gently (±5%), warm halos about five flames wide; light haze, vignette, fine grain. Signature shot: silhouettes framing a bright stage far back; slow lateral glide, then push. References: silhouettists Edouart, Miers; cinematographer Miroslav Ondříček (*Amadeus*, 1984). Avoid: plain black blobs; copy-pasted profiles; blue walls; strobing flames.

## 补充

### 技法关键词

18 世纪剪影肖像,洛可可金色浮雕,烛光泛光,申克尔的星空布景

### 导演说明

Clawd 扮莫扎特：白色扑粉假发配粉色发带、蕾丝领巾，指挥棒跟着音乐打拍子。一个运镜从乐池升到舞台，正好落在夜后的高音上，然后硬切到暗处看着的萨列里。1:1 时间，不放慢。

### 成片里的分镜

1. 沿着烛光乐池横移到挥棒指挥的 Clawd，再越过它升起、后拉，落到星空舞台上，夜后抬臂唱高音。（1.6s）
2. 硬切到萨列里的暗包厢：一排剪影里只有他的脸是画出来的，被一支蜡烛从下面照亮；缓慢推进。Clawd 不在画面里。（0.9s）

### 参考出处

Miloš Forman, Amadeus (1984),Miroslav Ondříček (cinematography),Karl Friedrich Schinkel, Queen of the Night set (1815),Augustin Edouart,John Miers

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
