---
name: code-animation-o47
description: O47 教父2：世纪之交的调色银盐照片，手工刷色：棕褐调、柔焦、银盐颗粒、霉斑、裂角，局部淡淡的红、蓝、铜绿。画的是 1901 年少年维托抵达埃利斯岛，像 Lewis Hine 的照片。
---

# O47 教父2

- 分类：O 奥斯卡 98 部 · 新好莱坞 1970–1979
- 长什么样：世纪之交的调色银盐照片，手工刷色：棕褐调、柔焦、银盐颗粒、霉斑、裂角，局部淡淡的红、蓝、铜绿。画的是 1901 年少年维托抵达埃利斯岛，像 Lewis Hine 的照片。
- 风格：手工上色棕褐老照片
- 关键词：2.5D
- 年份：1974

## 风格提示词

1900 年前后手工上色的棕褐银盐照片。先做受光的立体形体，柔光从左上来，再“印”出来：柔焦带轻微光晕，颗粒在中间调最重（±5%）；棕褐调从 #281A12 经 #987048 到 #EEE0C2 完整铺开，至少五分之一画面落到最深一端，任何光线下都一样。人物比例真实（头约七分之一身高），明暗柔和。透明颜料松松地刷，溢出边缘：唯一的主角最重（比如橙红 #D97757，不透明度六到八成），一两件道具轻点；颜色进暗部就被吞掉。做旧要轻：暗角、边缘银化（靠边暗部泛灰蓝金属光）、几个小霉点、细划痕，最多一个裂角。构图正面、纪实，人物静立面对镜头。镜头缓慢横摇扫过人脸。对标 Lewis Hine、Augustus Sherman 的埃利斯岛照片。避免：积木人物、数码填色、低反差雾灰、大片霉斑。

---

English:

A hand-coloured toned silver print from about 1900. Build lit 3D forms, soft key from upper left, then 'print' them: soft focus, light halation, grain heaviest in mid-tones (±5%), full sepia range #281A12, #987048, #EEE0C2; at least a fifth of the frame reaches the dark end, in any light. Figures: real proportions (head 1/7 of body), soft shading. Transparent dyes brushed loosely past edges: the one hero subject strongly (e.g. orange-red #D97757 at 60–80% opacity), a faint touch on one or two props; dyes die in shadow. Light ageing: vignette, silvered edges (grey-blue sheen in border darks), small foxing spots, fine scratches, at most one cracked corner. Frontal, documentary: figures stand still facing the lens. Camera: slow pan across faces. References: Lewis Hine; Augustus Sherman (Ellis Island). Avoid: toy figures, digital fill colour, low-contrast fog, big mould blotches.

## 补充

### 技法关键词

调色银盐照片,Lewis Hine 的埃利斯岛照片,手工刷色,光线步进的 3D 人物

### 导演说明

Clawd 扮少年维托：灰色粗花呢鸭舌帽，脖子上挂着纸名牌，夹在大人中间显得很小。平均 1.3 倍速，自由女神那一镜是 1 倍。三个硬切：人群 → 雕像（主观）→ 反应；最后的表演点是低头看自己的新名字，再抬头望向新的国家。

### 成片里的分镜

1. 横摇扫过甲板上仰头的移民群像，画面随船身起伏。（0.8s）
2. Clawd 的主观视角：自由女神从港口的雾里显出来，带一点铜绿色；镜头慢推。（0.7s）
3. 近景：戴粗花呢鸭舌帽的少年维托（Clawd），胸前挂着“VITO ANDOLINI”名牌；它低头看名牌，又抬头踮脚；镜头略微拉开。（0.9s）

### 参考出处

Francis Ford Coppola, The Godfather Part II (1974),Gordon Willis (cinematography),Lewis Hine, Ellis Island photographs,Augustus Sherman, Ellis Island portraits

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
