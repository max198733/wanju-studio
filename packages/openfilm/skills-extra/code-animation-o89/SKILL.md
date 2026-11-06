---
name: code-animation-o89
description: O89 月光男孩：饱满的青绿、品红和月光蓝油画肖像，雕出来的头像再用顺着形体的笔触重新画一遍。直接照着片名那句「月光下，黑人男孩看起来是蓝色的」来画。
---

# O89 月光男孩

- 分类：O 奥斯卡 98 部 · 独立年代 2010–2019
- 长什么样：饱满的青绿、品红和月光蓝油画肖像，雕出来的头像再用顺着形体的笔触重新画一遍。直接照着片名那句「月光下，黑人男孩看起来是蓝色的」来画。
- 风格：月光蓝调油画肖像
- 关键词：2D
- 年份：2016

## 风格提示词

夜色油画肖像。平滑实心体积上，顺着形体用两遍短笔触重画，笔触反差小（明度 ±8%）：海、天、衣服用宽笔，约为画面宽度的 1/60；脸用细笔 1/150，保持平滑。按用途分色：天、海、远处陆地用中等明度的蓝紫 #32377a，约占画面六成；受月光的面和沙地提亮成淡薰衣草蓝；青绿 #128a91 用在水里和受光一侧；轮廓光用品红 #7a2f86；最深暗部 #07071c。任何肤色顶面都受蓝光、带湿亮高光，眼睛睁开有光。默认夜晚，唯一主光是满月，水面铺出碎光；品红只是远处光源的柔和轮廓光；其他小光源只是一小点青白光。颗粒 ±3%。招牌镜头：人物平静，约占画高三分之二。慢推。参照巴里·詹金斯《月光男孩》（2016）。避免：粗块笔触、石膏像小黑眼、发闷的近黑画面。

---

English:

Night oil portraiture: smooth volumes repainted in two passes of short, low-contrast (±8% value) form-following strokes: broad (1/60 of frame width) on water, sky and cloth, fine (1/150) on faces, which stay smooth. Palette by role: sky, sea and far land mid blue-violet #32377a, about 60% of the frame; moonlit planes and sand pale lavender-blue; teal #128a91 in water and lit sides; magenta #7a2f86 rim; deepest shadows #07071c. Any skin takes blue top planes and a wet highlight, eyes open and lit. Default night: one key, a full moon with a broken glitter path on water; magenta only as a soft rim from a distant glow; other small light sources stay cyan-white points. Grain ±3%. Signature shot: the figure calm, ~2/3 of frame height. Slow push-ins. Reference: Barry Jenkins, *Moonlight* (2016). Avoid: coarse dabs, small dark statue eyes, a murky frame.

## 补充

### 技法关键词

油画肖像笔触,青绿 / 品红 / 蓝紫双色调,半水上半水下的机位

### 导演说明

Clawd 扮小喀戎，不穿戏服：先在游泳课上被托在水面，再站在三张脸之间，最后坐在凯文身边的沙滩上。三个章节三个镜头硬切；海里和海滩两个镜头都慢慢推近，让安静延续下去。

### 成片里的分镜

1. 贴着碧绿海面的半水上半水下镜头：一个男人站在齐胸深的水里，用手掌托着 Clawd，水下能看见他的手；镜头慢推。（0.8s）
2. 切到并排的三张油画肖像，青绿、品红、蓝紫各一张；镜头重新取景，三张脸滑拼成一个楔形拼贴，Clawd 站在青绿那一块里。（0.8s）
3. 切到月光下的海滩：凯文和 Clawd 并排坐在蓝色沙滩上的双人镜头，满月在右上，浪花拍岸；镜头慢推。（0.9s）

### 参考出处

Barry Jenkins, Moonlight (2016),James Laxton (cinematography),Moonlight (2016) three-face poster

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
