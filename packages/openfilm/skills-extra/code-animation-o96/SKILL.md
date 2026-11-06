---
name: code-animation-o96
description: O96 奥本海默：用实时 3D 重建黎明前的三位一体试验场：约 72 万粒子的火球、轨道和波组成的量子幻象，深蓝夜色对橙金火光，加 IMAX 式颗粒。《奥本海默》就围着这一道光展开。
---

# O96 奥本海默

- 分类：O 奥斯卡 98 部 · 此时此刻 2020–2025
- 长什么样：用实时 3D 重建黎明前的三位一体试验场：约 72 万粒子的火球、轨道和波组成的量子幻象，深蓝夜色对橙金火光，加 IMAX 式颗粒。《奥本海默》就围着这一道光展开。
- 风格：3D 粒子火球 · IMAX 颗粒
- 关键词：3D
- 年份：2023

## 风格提示词

实时 3D 夜景，主角光是一场巨大的粒子事件：几十万粒子的火球（或照明弹、火山喷发、山火），形状随时间走：白闪（0.5 秒），1 秒成翻滚的斑驳穹顶，再卷成环，尘墙外扫。在主体正后方像光环，约占画面四成：核心白金，大部分是有纹理的亮橙金火团 #ff9a50，黑烟只做细暗纹和顶边，不超一成半。火光照亮全场：暖色 #ffd8a0 铺满地面和云底，主体有热轮廓光，脸上仍有半强度暖光；长影子朝镜头拖来，火星飘飞。其余是黎明前的深蓝 #2a3654 和暗土 #16120e。只让核心过曝。IMAX 拷贝调色：细颗粒（±3%）、暖色光晕溢出、暗角、轻微片门晃动。低机位广角，主体居中，慢推。参照克里斯托弗·诺兰《奥本海默》（2023）。避免：光滑的 CG 光球、被黑烟裹住的火。

---

English:

Real-time 3D night lit by one huge particle event: a ~500k-particle fireball (or flare, eruption, wildfire) whose shape follows time: white flash (0.5 s), billowing dome by 1 s, a rolling toroid, a dust wall sweeping out. Right behind the subject like a halo, ~40% of the frame: white-gold core, bright orange-gold billows #ff9a50 with visible texture, black smoke only as thin veins and the top edge (under 15%). Its glow fills everything: warm #ffd8a0 on ground and cloud undersides, a hot rim on the subject, faces lit warm at half strength; long shadows toward camera. The rest is pre-dawn blue #2a3654 and dark earth #16120e. Clip only the core. IMAX grade: grain ±3%, warm halation, vignette, slight gate weave. Low wide angle, subject centred, slow push-ins. Reference: Christopher Nolan, *Oppenheimer* (2023). Avoid: a smooth CG ball, smoke-shrouded fire.

## 补充

### 技法关键词

实时 3D（three.js）,GPU 粒子模拟,IMAX 65mm 印片调色,三位一体试验高速照片

### 导演说明

Clawd 扮奥本海默：一顶浅驼色平顶软呢帽，手里一只冒烟的石楠烟斗。五个镜头硬切，垒出倒计时：铁塔、装置、幻象，白闪正好落在切进观察者的那一刀上；音乐不停，最后一秒火球在 Clawd 身后膨胀。

### 成片里的分镜

1. 黎明前低机位仰拍被探照灯照亮的钢塔，倒计时的信号灯在闪，镜头慢推。（0.6s）
2. 切到波纹铁皮小屋里的炸弹：缠满电缆的螺栓球体，暖色工作灯；固定机位。（0.4s）
3. 切到黑底上的量子幻象：围绕核心的发光轨道、下方的干涉波、一颗坍缩的恒星。（0.4s）
4. 一道白闪，接反打：戴帽子的观察者举着焊接玻璃，脸被火光照亮，Clawd 戴平顶软呢帽、拿着烟斗站在中间；固定机位。（0.8s）
5. 低机位全景：Clawd 站在路中间，身后的火球像光环一样升起，火星在空中飘；镜头慢推。（1s）

### 参考出处

Christopher Nolan, Oppenheimer (2023),Hoyte van Hoytema (IMAX cinematography),Berlyn Brixner, Trinity test photographs (1945),Oppenheimer (2023) poster

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
