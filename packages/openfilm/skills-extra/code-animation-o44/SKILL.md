---
name: code-animation-o44
description: O44 法国贩毒网：整条布鲁克林高架铁下的大街用 3D 建出来，再调成粗颗粒 16mm：冷灰、暗部偏青、高反差、片门抖动。这部片最有名的就是高架铁下的追车，3D 才拍得出那种速度。
---

# O44 法国贩毒网

- 分类：O 奥斯卡 98 部 · 新好莱坞 1970–1979
- 长什么样：整条布鲁克林高架铁下的大街用 3D 建出来，再调成粗颗粒 16mm：冷灰、暗部偏青、高反差、片门抖动。这部片最有名的就是高架铁下的追车，3D 才拍得出那种速度。
- 风格：高架铁下追车 · 16mm 颗粒 3D
- 关键词：3D
- 年份：1971

## 风格提示词

70 年代初粗粝的纪实感，放在细致的 3D 世界里，按增感冲洗的 16mm 收尾。调色：低饱和、高反差；中性冷灰 #7A7C7A、带青的暗部 #1E2A2C，砖、木头、车辆保持暖棕 #6E4A34，至少占四分之一画面，绝不整体泛蓝；唯一的主角（比如橙 #D97757）保持饱和。默认阴天，天空亮到近白，任何时段都一样；阳光穿过头顶格栅（轨道、桥、栈桥）落成硬边条纹。颗粒成团，约画面宽的 1/700，亮度 ±8%；片门晃动、闪烁、灰尘，亮处偶有淡重影。杂物多且符合地点。手持机位跟着动作走：18 到 25mm 低机位向前冲，重复物体频闪掠过；回看主体的跟拍机位；墙角广角。对标 William Friedkin《法国贩毒网》（1971）和摄影师 Owen Roizman。避免：干净的 CG 反光、整体泛蓝、空荡的方块场景、颗粒糊成一片。

---

English:

Gritty early-1970s documentary look in a detailed 3D world, finished as pushed 16mm. Grade: low saturation, high contrast; neutral-cold greys #7A7C7A, cyan shadows #1E2A2C, warm-brown mid-tones #6E4A34 in brick, wood, vehicles (at least a quarter of the frame), never an overall blue; the one hero (e.g. #D97757) stays saturated. Default overcast, sky near-white, at any time of day; sun through any overhead grid (track, bridge, pier) falls in hard stripes. Grain clumps about 1/700 of frame width, ±8% brightness; gate weave, flicker, dust, occasional faint ghosts of bright lights. Dense clutter fitting the place. Handheld cameras ride the action: a low 18–25 mm lens rushing forward as repeated objects strobe past, a rig looking back at the subject, a corner wide. References: William Friedkin, *The French Connection* (1971); cinematographer Owen Roizman. Avoid: clean CG shine, blue tint, empty places, mushy grain.

## 补充

### 技法关键词

three.js 3D 街景,16mm 纪录片颗粒,暗部偏青的冷灰印片调色

### 导演说明

Clawd 扮“大力水手”道尔：猪肉派帽、怒眼、双手握方向盘。追车的场景时间比屏幕时间跑得快得多，加速看起来就是车更快。三个硬切：路口甩尾 → 保险杠狂冲 → 驾驶员，中间不停。

### 成片里的分镜

1. 路口全景：列车从头顶驶过，棕色庞蒂亚克甩尾冲上大街，后轮冒烟；镜头视角慢慢放宽。（0.8s）
2. 片中有名的保险杠机位：超低机位带着运动模糊往前冲，高架铁的柱子一根根闪过。（0.8s）
3. 中景，从车外透过摇下的车窗看 Clawd 扮的道尔：猪肉派帽、咬牙握着方向盘，身后高架铁和店面滑过，带车载抖动。（0.9s）

### 参考出处

William Friedkin, The French Connection (1971),Owen Roizman (cinematography),The French Connection one-sheet (1971)

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
