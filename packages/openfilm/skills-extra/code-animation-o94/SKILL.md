---
name: code-animation-o94
description: O94 健听女孩：橡木桌上一颗抛光的抹香鲸牙，刻着细密的黑线，点缀红、蓝、黄：格洛斯特的渔船、收网的一家人、船头唱歌的鲁比。这是影片所在的新英格兰海岸自己的民间工艺。
---

# O94 健听女孩

- 分类：O 奥斯卡 98 部 · 此时此刻 2020–2025
- 长什么样：橡木桌上一颗抛光的抹香鲸牙，刻着细密的黑线，点缀红、蓝、黄：格洛斯特的渔船、收网的一家人、船头唱歌的鲁比。这是影片所在的新英格兰海岸自己的民间工艺。
- 风格：鲸牙骨雕（Scrimshaw）
- 关键词：2D
- 年份：2021

## 风格提示词

19 世纪水手在抛光鲸牙上的针刻画。招牌镜头：宽而扁的鲸牙横躺在橡木桌上，占画面宽约 85%、高约 70%，墨水瓶和折刀在边上。用近黑墨 #17110c 刻：细针排线（线宽约画面宽的 1/800，线距约 1/500）、粗细起伏的轮廓线和点刻。刻线覆盖牙面约七成：海、主体和陆地密，天空轻排线；海是成排的程式化波浪。主角要大（约占牙面高三分之一）并上色；此外红 #9a2a22、蓝 #2b4a78、黄 #e9b526 只作点缀。暖象牙底、淡生长纹、抛光划痕、牙尖蜜黄。民间朴拙构图：绳纹边框、飘带题词、放射光芒的太阳、主体世界的图案。弧度靠边缘明暗和一道窗户反光，画面不变形。先拍整颗牙，推进后慢慢横移，波浪随之动起来。避免：粗线、实色填涂、细长的牛角形。

---

English:

Scrimshaw: 19th-century sailor's engraving on a whale tooth. Signature shot: a broad, flat-sided tooth lies horizontal on an oak table, about 85% of frame width and 70% of its height; ink bottle, jackknife beside. Engrave in near-black #17110c: needle hatching (lines 1/800 of frame width, spaced about 1/500), swelling outlines, stipple. Lines cover ~70% of the face, dense in sea, subject and land, sky lightly hatched; seas as rows of stylised waves. The hero is large (~1/3 of the tooth's height), coloured; otherwise red #9a2a22, blue #2b4a78, yellow #e9b526 only as small touches. Warm ivory, growth bands, scratches, honey tip. Folk layout: rope border, ribbon motto, rayed sun, motifs from the subject's world. Shade the edges, one gloss streak; don't warp the picture. Push in, then pan slowly as waves animate. Avoid: thick lines, solid fills, a slim horn.

## 补充

### 技法关键词

19 世纪捕鲸水手鲸骨雕,刻刀排线与点刻,桌面静物产品布光

### 导演说明

Clawd 扮鲁比，戴一顶黄色防水渔夫帽，站在船头的鱼箱上。只有一刀：从物件切进刻画，然后一次轻轻的横移，把视线从父亲的手语带到歌声上，五线谱跟着歌声展开。

### 成片里的分镜

1. 全景：刻好的鲸牙放在橡木桌上，旁边是折刀和墨水瓶；镜头推进，直到鲸牙铺满画面。（0.8s）
2. 切进刻画：渔船的中全景，镜头从左往右慢慢横移并轻推，从一边收网一边打出「我爱你」手语的弗兰克，移到船头唱歌的 Clawd，一行五线谱从它举起的手臂上展开。（1.7s）

### 参考出处

Siân Heder, CODA (2021),CODA (2021) poster,New Bedford Whaling Museum scrimshaw collection

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
