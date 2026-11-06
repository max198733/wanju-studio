---
name: code-animation-o56
description: O56 母女情深：摊开的家庭相册，里面是褪色的宝丽来和柯达快照：发青的黑、奶油色高光、白边。其中一张宝丽来活过来，变成海滩飞车的追拍照片。《母女情深》讲的是母女三十年。
---

# O56 母女情深

- 分类：O 奥斯卡 98 部 · 大片年代 1980–1989
- 长什么样：摊开的家庭相册，里面是褪色的宝丽来和柯达快照：发青的黑、奶油色高光、白边。其中一张宝丽来活过来，变成海滩飞车的追拍照片。《母女情深》讲的是母女三十年。
- 风格：家庭相册宝丽来
- 关键词：2D
- 年份：1983

## 风格提示词

70 到 80 年代的生活快照，摊开在相册里。照片已褪色：黑色抬成偏青的灰（约 #2F3A3A），高光柔和发奶油色，略暖、略过曝，偏软，细颗粒（±4%），饱和度约正常的六成。宝丽来白边、照相馆四连拍条、圆珠笔手写说明（用用户的语言）。相册铺满画面，奶油色页面，从正上方看，光柔和均匀，淡淡塑料膜反光。照片里有东西在动就用追拍：背景横向拖糊，主体清晰；静止主体用浅景深。人物像拍的不像画的：比例真实、明暗柔和、轻微虚焦、脸不大。镜头：俯拍推进一张照片直到铺满（约三秒），切进活起来的场景、颜色恢复，再拉出。对标宝丽来 SX-70 和柯达彩色照片。避免：平面卡通造型、干净的现代色彩、光束、饱和的照片。

---

English:

1970s–80s snapshots in an open album. Faded dyes: blacks lifted to teal grey about #2F3A3A, creamy rolled-off highlights, mild warm cast, slight overexposure, softness, fine grain (±4%), saturation about 60% of normal. White Polaroid borders, photo-booth strips (four frames stacked), ballpoint captions in the user's language. The album fills the frame, cream pages seen from above in soft, even light, a faint plastic sheen. In a photo, a moving subject gets a panning-shutter look (background smeared sideways, subject sharp); still subjects get shallow depth of field. People look photographed: real proportions, soft shading, slight blur, small faces. Camera: an overhead push into one photo until it fills the frame (about 3 s), a cut into the living scene as colour returns, then a pull-back. References: Polaroid SX-70, Kodacolor prints. Avoid: flat cartoon shapes, crisp modern colour, light shafts, saturated prints.

## 补充

### 技法关键词

SX-70 与宝丽来 600 相片,柯达彩色快照,70–80 年代磁性相册,追拍拖影

### 导演说明

Clawd 扮退役宇航员加勒特，戴金色飞行员墨镜，身边坐着大笑的奥罗拉。整体约 1.8 倍速。推进相册以后直接切进照片里，褪色的调子回暖成新鲜的颜色；颜色回来时它举起双臂，最后的近景落在张开双臂的样子上。

### 成片里的分镜

1. 俯拍胡桃木桌上摊开的相册，一路推进那张散放的加尔维斯顿宝丽来，直到照片铺满画面。（1.2s）
2. 宝丽来活了过来：红色科尔维特冲过浪花，副驾的奥罗拉挥着手，颜色慢慢回来；镜头拉开到更宽的海滩。（0.8s）
3. 近景：戴金色飞行员墨镜的 Clawd 扮加勒特，在座位后站起来张开双臂；镜头慢推。（0.5s）

### 参考出处

James L. Brooks, Terms of Endearment (1983),Terms of Endearment one-sheet (1983),Polaroid SX-70 and Kodacolor snapshots,1970s magnetic-page photo albums

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
