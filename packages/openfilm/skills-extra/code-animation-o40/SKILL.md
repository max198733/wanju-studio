---
name: code-animation-o40
description: O40 炎热的夜晚：三色 Risograph 印刷：深蓝、海报橙红、荧光粉，带网点、颗粒和套色错位；光是用「少上墨」印出来的。呼应 1967 年海报的橙红热浪底和黑色剪影。
---

# O40 炎热的夜晚

- 分类：O 奥斯卡 98 部 · 摇摆年代 1960–1969
- 长什么样：三色 Risograph 印刷：深蓝、海报橙红、荧光粉，带网点、颗粒和套色错位；光是用「少上墨」印出来的。呼应 1967 年海报的橙红热浪底和黑色剪影。
- 风格：三色 Risograph 夜景
- 关键词：2D
- 年份：1967

## 风格提示词

三色专色 Risograph 印刷：橙红 #EC5032 是主场（约占画面六成，带竖向流淌痕），深蓝 #162C76 给剪影和阴影，荧光粉 #FF48B0 只给轮廓光和光晕，印在暖白纸 #F7F2E7 上。每色是各自网角的半调，点径约画面宽的 1/300，版间错位二到四像素；有墨粒、针孔，逐帧轻微抖动。蓝剪影底下挖掉橙色，印成纯蓝；只有最暗处两色叠成近黑。光就是没有墨：光束、灯和被照亮的地面露出纸白，外圈一道粉。人物是带粉色边缘光的蓝剪影，肤色用三到六成橙色网点加一级蓝暗部。时间偏冷时仍保留红场，只让蓝色升到天空顶部。镜头：手持跟在提着光源的人身后，一个反打近景，一次缓推。避免：蓝色占满画面、平滑渐变、第四种墨、套印太准。

---

English:

Three-ink Risograph: orange-red #EC5032 as the dominant field (about 60%, with drip streaks), deep blue #162C76 for silhouettes and shadows, fluorescent pink #FF48B0 only for rims and halos, on warm paper #F7F2E7. Each ink is halftoned at its own angle, dots 1/300 of frame width, plates misregistered 2–4 px; grain, pinholes, slight boil. Knock orange out under blue silhouettes so they print pure blue; only the darkest accents overprint to near-black. Light is the absence of ink: beams, lamps and lit ground show bare paper, ringed in pink. Figures: blue silhouettes, pink rims; skin is 30–60% orange with a blue shadow step. At cooler times keep the red field; blue rises only into the top of the sky. Camera: handheld behind someone carrying a light, a reverse close-up, a push. Avoid: blue-dominated frames, smooth gradients, a fourth ink, clean registration.

## 补充

### 技法关键词

Risograph 叠印,1967 海报橙红,Haskell Wexler 夜景,剪影式调度

### 导演说明

Clawd 扮维吉尔·蒂布斯：白衬衫领尖、深色窄领带、袖口，脚边一只手提箱。上一部熄灭的烛光把夜带进来。三个镜头堆出对峙：手电找到它、警长停下嚼口香糖、它挺直腰板，像在说「They call me MISTER Tibbs!」

### 成片里的分镜

1. 黑暗中的手持手电主观镜头：副警长的光束扫过车站站台，找到手提箱旁的 Clawd（蒂布斯）；它抬头睁大眼，其他几束手电随即亮起。（0.8s）
2. 反打警长吉莱斯皮近景：大檐帽、飞行员墨镜，嚼着口香糖，然后停住；缓慢推近。（0.5s）
3. 对峙中全景：Clawd 站在副警长和警长之间，几束手电光交叉打在它身上，身后是蓝色警车和斯巴达镇水塔；它挺直身子、端平肩膀，镜头推近。（1.2s）

### 参考出处

Norman Jewison, 1967,Haskell Wexler (cinematography),1967 original poster,Tom Haugomat

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
