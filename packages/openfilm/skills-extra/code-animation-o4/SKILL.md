---
name: code-animation-o4
description: O4 壮志千秋：1889 年的金调色蛋白印相全景：柔焦、轻微的横向拖影、奶油高光和暖褐暗部、银盐颗粒，只有 Clawd 手工上色。片子开场就是 1889 年俄克拉何马圈地狂奔，用那一年的照片质感来拍，这一章也保持单色。
---

# O4 壮志千秋

- 分类：O 奥斯卡 98 部 · 默片与有声 1927–1938
- 长什么样：1889 年的金调色蛋白印相全景：柔焦、轻微的横向拖影、奶油高光和暖褐暗部、银盐颗粒，只有 Clawd 手工上色。片子开场就是 1889 年俄克拉何马圈地狂奔，用那一年的照片质感来拍，这一章也保持单色。
- 风格：1889 棕褐蛋白印相全景
- 关键词：2D·Sepia
- 年份：1930/31

## 风格提示词

会动的 1880 年代金调色蛋白照片。先画边缘柔和的平涂形，按亮度分：主体深（15%–30%），地面 50%–60%，天空约 90%；物面和草丛有看得见的排线（线宽约画幅宽 1/300）。再“印”：转灰度，轻柔焦（约画幅宽 1/800），三层横向错开的淡影随运镜拉长，乘奶油色 #F2DCB4，黑位抬成暖褐 #2E1C0F，显影不匀（±5%），暗角压到 #785634，每帧刷新颗粒（±4%），稀疏灰尘划痕。只给故事围绕的那个主角手工上色（如 #D97757），像透明染料，蒙版羽化 2–3 像素；灯光仍是棕褐。横向全景，中间一条带排满重复小元素：人物、动物、车辆，题材冷清就用篱笆、木桩、树；别让一整块大面占满画面。天空默认发白。运镜：从主角近景 4–5 秒缓出拉到全景。避免：硬墨线、主角以外的颜色、干净的数码天空、发灰的印相。

---

English:

A moving 1880s gold-toned albumen photograph. Paint soft-edged flat shapes by brightness: main subjects dark (15-30%), ground 50-60%, sky about 90%; visible hatching and grass tufts (lines ~1/300 of frame width). Then print: grayscale, slight blur (~1/800 of frame width), a faint smear of three horizontal offset copies growing with camera speed, multiply cream #F2DCB4, lift blacks to umber #2E1C0F, blotchy development (±5%), vignette to #785634, per-frame grain (±4%), dust, scratches. Hand-tint only the hero the story centres on (e.g. #D97757) as transparent dye, mask feathered 2-3 px; lamps stay sepia. Wide panorama: the middle band packed with repeated small elements (figures, animals, vehicles; for a lone subject fences, posts, trees), no big plane dominating. Camera: one 4-5 s ease-out pull back from the hero to the panorama. Avoid: hard ink outlines, colour beyond the hero, a flat grey print.

## 补充

### 技法关键词

金调色蛋白印相,西部全景老照片,人物手工上色

### 导演说明

Clawd 扮扬西·克拉瓦特：白色宽边牛仔帽、领巾，骑黑马冲在最前。整段按 1.1 倍跑。先拉远看到更多的马，再一刀切回近景，第 5 拍拔枪朝天开火。

### 成片里的分镜

1. 从骑黑马冲在最前的 Clawd 近景开始，一路拉到全景：篷车、驿站马车、尘土里一大片骑手。（1.5s）
2. 切到 Clawd 骑马的近景：举起左轮朝天开枪，画面随着后坐力一震；轻推。（1s）

### 参考出处

Wesley Ruggles, 1931,Gold-toned albumen prints, 1880s,Currier & Ives (the flying gallop)

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
