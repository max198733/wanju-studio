---
name: code-animation-o81
description: O81 贫民窟的百万富翁：蓝紫色加金色高光的电视演播室，摇头灯光束、镜头光斑；然后切到饱和橙青色的孟买屋顶。影片本身就在答题节目的最后一题和贾马尔出身的贫民窟之间来回切。
---

# O81 贫民窟的百万富翁

- 分类：O 奥斯卡 98 部 · 新千年 2000–2009
- 长什么样：蓝紫色加金色高光的电视演播室，摇头灯光束、镜头光斑；然后切到饱和橙青色的孟买屋顶。影片本身就在答题节目的最后一题和贾马尔出身的贫民窟之间来回切。
- 风格：答题节目演播室 + 孟买橙青
- 关键词：2D
- 年份：2008

## 风格提示词

两种画面。主画面约占七成：光鲜的插画式答题演播室，明亮饱满，略俯的四分之三视角：底光玻璃圆台和一圈圈蓝光环，背后坐满观众，摇头灯在烟雾里打出蓝紫光束 #5A3FD0，大屏上长六角形答案框，一个锁成琥珀色 #F0A020；加泛光和横向光斑；越紧张四周越暗，最多暗到一半，不全黑。人物圆润干净，柔和明暗。第二种画面约占三成，整屏硬切：主题所在地方的黄金时刻景象，饱和橙青，密而热闹（比如铁皮屋顶、晾衣绳、人群）。点缀：洋红 #E2206B、青 #0F7C7A、橘黄 #F06A14。镜头推向大屏和座位，光束收到一人身上；其余慢摇。对标摄影师 Anthony Dod Mantle（《贫民窟的百万富翁》，2008）。避免：真实节目 logo；大片漆黑的演播室；平均打光；灰暗空荡的场景。

---

English:

Two registers. Primary, about 70%: a glossy illustrated quiz-show studio, bright and full, seen three-quarter from slightly above: a glass stage lit from below with concentric blue rings, a packed audience behind, moving-head beams cutting blue-violet #5A3FD0 through haze, a big screen of elongated-hexagon answers, one locked in amber #F0A020; bloom and horizontal flares; as tension rises the edges dim to about half, never black. Characters rounded, softly shaded. Second register, about 30%, as full-frame hard cuts: golden-hour views of the subject's home ground, saturated orange and teal, busy (e.g. tin roofs, washing lines, crowds). Accents: magenta #E2206B, teal #0F7C7A, tangerine #F06A14. Camera: push in on screen and hot seat as beams close on one person; elsewhere slow pans. Reference: cinematographer Anthony Dod Mantle (*Slumdog Millionaire*, 2008). Avoid: real show logos; a mostly black studio; even lighting; grey, empty places.

## 补充

### 技法关键词

电视答题节目的灯光,蓝紫光束与镜头光斑,Anthony Dod Mantle 的橙青色调

### 导演说明

Clawd 扮贾马尔：浅蓝细格衬衫领加一只领夹麦。答案从第一帧就锁定；第二个镜头把全场压暗、收到热座上，答案变绿时放开；然后硬切到孟买屋顶，画面一下打开到整座城市。

### 成片里的分镜

1. 近景：大屏上的最后一题，四个答案框，A: ARAMIS 锁定成琥珀色；镜头略推。没有 Clawd。（0.8s）
2. 舞台全景：主持人坐在凳子上，Clawd 扮贾马尔坐在热座上；全场暗下来，光束收拢到 Clawd 身上，接着答案闪成绿色，观众欢呼；镜头慢推。（1s）
3. 全景：黄金时刻的达拉维屋顶，Clawd 站在铁皮屋顶上，身后高架上一列挤满人的火车开过；镜头慢慢往右摇。（0.8s）

### 参考出处

Danny Boyle, 2008,Anthony Dod Mantle (cinematography),Slumdog Millionaire 2008 poster

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
