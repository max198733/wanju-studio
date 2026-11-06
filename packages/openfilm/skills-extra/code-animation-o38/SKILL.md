---
name: code-animation-o38
description: O38 音乐之声：绘本感的 3D 程序阿尔卑斯：饱和的翠绿、钴蓝、雪白，雕塑感的山脊，棉花团积云，风吹过草地的草浪。重演开场的直升机航拍，最后落到山顶转圈的玛丽亚。
---

# O38 音乐之声

- 分类：O 奥斯卡 98 部 · 摇摆年代 1960–1969
- 长什么样：绘本感的 3D 程序阿尔卑斯：饱和的翠绿、钴蓝、雪白，雕塑感的山脊，棉花团积云，风吹过草地的草浪。重演开场的直升机航拍，最后落到山顶转圈的玛丽亚。
- 风格：绘本感 3D 阿尔卑斯航拍
- 关键词：3D
- 年份：1965

## 风格提示词

绘本感的 3D 风景，60 年代宽银幕的饱和色，形体圆润光滑有雕塑感，不写实也不做低多边形。默认光：太阳高挂、略在镜头身后，大地满色：翠绿草地 #3FA33A、钴蓝天空 #2F6FD0、干净的白雪白云。风化山脊圆润，雪线顺坡，岩层暖灰赭，有云影。空气透视只加在最远的山脊，约两成半淡紫。积云是受光的白色棉花团。前景是齐膝密草和野花，随阵风弯伏。太阳低时只拉长影子、让云边变暖；其他场景也用这些颜色。一个连续镜头：前两秒高空飞越，再两秒降到草坡，之后贴草低机位环绕主体（每秒约 20°，主体约占画面高四分之一）。对标摄影师 Ted McCord（《音乐之声》，1965）和宫崎骏的草地。避免：泛紫、针尖山峰、写实灰岩、不动的草。

---

English:

Storybook 3D landscape in saturated 1960s widescreen colour: smooth sculpted forms, not low-poly or photoreal. Default light: bright sun high, a little behind the camera: emerald grass #3FA33A, cobalt sky #2F6FD0, clean white snow and clouds. Rounded ridges, snow lines following slope, grey-ochre rock bands, cloud shadows. Haze only on the farthest ridges, about 25% lilac. Cumulus are lit white cotton puffs. Knee-high grass and wildflowers fill the foreground, bending in gusts. A lower sun lengthens shadows and warms only cloud edges; other settings keep these colours. Camera: one continuous move: 0–2 s high flight, 2–4 s descent, then a low orbit through the grass around the subject (about 20° per second, subject about 1/4 of frame height). References: cinematographer Ted McCord (*The Sound of Music*, 1965); Miyazaki's meadows. Avoid: violet wash, needle peaks, grey photoreal rock, static grass.

## 补充

### 技法关键词

程序生成 3D 地形（three.js）,托德宽银幕色彩,Ted McCord 直升机开场,宫崎骏的草原

### 导演说明

Clawd 扮玛丽亚：头顶一朵雪绒花和一个小头巾结，照海报一手拎条纹毯包、一手拎吉他琴盒。转圈是一条贯穿三个镜头的连续曲线，每一刀都切在转到一半的时候；最后一拍双臂高举。

### 成片里的分镜

1. 画面从上一部的两个望远镜圆圈里打开到全屏：高空航拍，穿过棉花团积云掠过雪峰。（0.7s）
2. 下降逼近山顶草坡：Clawd 小小地在画面正中，已经甩着毯包和琴盒转起来，远处是森林和田地拼块；镜头朝它降下去。（0.8s）
3. 贴着草的低机位，镜头环绕转了一整圈的 Clawd，毯包和琴盒甩开，身后是雪峰和积云；最后它双臂高举。（1s）

### 参考出处

Robert Wise, 1965,Ted McCord (cinematography),Howard Terpning (1965 poster),Hayao Miyazaki (meadows)

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
