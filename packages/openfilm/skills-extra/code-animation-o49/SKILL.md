---
name: code-animation-o49
description: O49 洛奇：清晨的费城整个做成 3D，从肉库到博物馆 72 级台阶，调成 70 年代 35mm：冷蓝天、低低的金色太阳、长影子、薄雾、细颗粒。跑上台阶和顶上的环绕升镜是这部片的记忆点。
---

# O49 洛奇

- 分类：O 奥斯卡 98 部 · 新好莱坞 1970–1979
- 长什么样：清晨的费城整个做成 3D，从肉库到博物馆 72 级台阶，调成 70 年代 35mm：冷蓝天、低低的金色太阳、长影子、薄雾、细颗粒。跑上台阶和顶上的环绕升镜是这部片的记忆点。
- 风格：费城台阶日出 3D · 35mm 调色
- 关键词：3D
- 年份：1976

## 风格提示词

70 年代 35mm 写实，放在细致的 3D 世界里，默认日出（日落同理）。太阳离地平线五到十度，暖橙 #F0A060，从侧面或前侧方照亮主角，让受光的身体和拉过地面的长影看得清；不要完全逆光。天空冷蓝 #7FA3CF，云底染粉 #E6B2AE；雾朝太阳一侧发金、背光一侧发蓝紫。调色：细颗粒（±3%），暗部偏冷、高光偏暖，不过曝；只有太阳入画时才有光晕和鬼影。镜头：低机位斯坦尼康从背后跟着主角爬上一段坡或台阶，到最高处接一个连续环绕，边转边升边退，六到八秒，转到受光的脸，直到整个地方在下面铺开。对标 John G. Avildsen《洛奇》（1976）、斯坦尼康操作者 Garrett Brown。避免：正午平光、没细节的剪影、高潮时机位不动、塑料感反光。

---

English:

1970s 35mm realism in a detailed 3D world, sunrise by default (sunset the same). Sun 5–10° up, warm orange #F0A060, lighting the hero from the side or three-quarter front so the lit body and long ground shadows read; no full backlight. Cool blue sky #7FA3CF, pink cloud undersides #E6B2AE; haze golden toward the sun, blue-violet away. Grade: fine grain (±3%), cool shadows, warm highlights, nothing clipped; flare and ghosts only with the sun in frame. Camera: a low Steadicam following the hero from behind up an ascent, then at the top one continuous orbit that circles, rises and pulls back over 6–8 s, showing the lit face, until the place spreads out below. References: John G. Avildsen, *Rocky* (1976); Steadicam operator Garrett Brown. Avoid: flat noon light, detail-less silhouettes, a static climax, plastic CG shine.

## 补充

### 技法关键词

three.js 3D 城市,70 年代 35mm 胶片调色,斯坦尼康跟拍与环绕升镜

### 导演说明

Clawd 扮洛奇：灰色卫衣兜帽戴起，肩上搭一条白毛巾。训练蒙太奇三个快切，约 1.7 倍速；上台阶以后回到 1 倍。硬切进斯坦尼康跟跑，之后不再切：跑到顶直接接环绕升镜，举臂一跳正好落在镜头开始升起的时候。

### 成片里的分镜

1. 肉库中景，定机位：戴灰色兜帽的 Clawd 对着挂着的牛肉出拳，白瓷砖、裸灯泡。（0.4s）
2. 更近一些，定机位：拳头打在牛肉上，牛肉晃荡。（0.4s）
3. 黎明前的意大利市场，定机位：Clawd 迎着镜头慢跑，经过油桶火、果蔬摊和还亮着的路灯。（0.6s）
4. 低机位斯坦尼康从背后追着 Clawd 跑上 72 级台阶，前方是博物馆的立柱。（1.5s）
5. 到顶，Clawd 双臂举成 V 字一跳；镜头绕着它转、上升、后退，直到整条大道和城市在日出里铺开。（2.1s）

### 参考出处

John G. Avildsen, Rocky (1976),Garrett Brown (Steadicam),James Crabe (cinematography),Philadelphia Museum of Art, east façade

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
