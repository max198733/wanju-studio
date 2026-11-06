---
name: code-animation-o85
description: O85 逃离德黑兰：摊在制片桌上的 70 年代柯比漫画：粗墨线、柯比能量泡、泛黄新闻纸上的四色网点。片中那部假科幻片用的正是柯比画的概念图，所以漫画从假史诗一路翻到真实的跑道出逃。
---

# O85 逃离德黑兰

- 分类：O 奥斯卡 98 部 · 独立年代 2010–2019
- 长什么样：摊在制片桌上的 70 年代柯比漫画：粗墨线、柯比能量泡、泛黄新闻纸上的四色网点。片中那部假科幻片用的正是柯比画的概念图，所以漫画从假史诗一路翻到真实的跑道出逃。
- 风格：杰克·柯比 70 年代漫画页
- 关键词：2D
- 年份：2012

## 风格提示词

70 年代杰克·柯比漫画页。粗细变化的毛笔墨线，大块涂黑，透视夸张，黑色柯比能量泡，方块拟声字，手写对白框。CMYK 平涂用 45° 网点印出：青 #1696CD、品红 #DE2C70、黄 #FFD616、黑 #1C161A，泛黄新闻纸 #EEE2C2，色版错位 1 像素，纸有纤维和中缝阴影。分格叙事，镜头在格间推进、横移，推近时网点放大成波普圆点。避免：顺滑数码渐变、雪白的纸、僵硬的管状机械。

---

English:

1970s Jack Kirby comic page. Heavy tapered brush contours, feathered spot blacks, exaggerated perspective, Kirby Krackle energy bubbles, block sound effects, hand-lettered balloons and yellow captions. CMYK flats printed as 45° Ben-Day dots: cyan #1696CD, magenta #DE2C70, yellow #FFD616, black #1C161A on aged newsprint #EEE2C2, colour plates 1 px off register. Paper grain, browned edges, a gutter fold shadow, warm lamp falloff. Lay the story out in panels and move between them: push into the splash, pan along a strip. Dots stay round and grow into pop-art dots on push-ins. Avoid: smooth digital gradients, clean white paper, stiff tube-like machines.

## 补充

### 技法关键词

杰克·柯比宇宙漫画,Ben-Day 四色网点印刷,泛黄新闻纸,《光之王》概念图

### 导演说明

Clawd 扮漫画里的太空英雄：红里子高领、蓝披风、金护腕，手拿柯比式光枪。第一拍内光束开火，然后两刀硬切把书页从假史诗翻到真实出逃，最后 Clawd 卸下戏服，成了舷窗后的一名乘客。2.5 秒三格，像在读漫画。

### 成片里的分镜

1. 宇宙跨页大格的中景，缓慢推进：披风太空英雄 Clawd 站在岩架上开光枪，光束打爆机器人的反应堆，「KRAKA-THOOM」。（0.9s）
2. 硬切到红色胶片条那一格：航站楼里的几位人质和旁白「THE MOVIE WAS FAKE. THE MISSION WAS REAL.」，镜头轻微右移。（0.8s）
3. 硬切到钢蓝色的夜间跑道格，从左往右横移，掠过追来的卡车和吉普，停在离地的客机；角上的舷窗小格里 Clawd 坐在窗后回望。（0.8s）

### 参考出处

Ben Affleck, Argo (2012),Jack Kirby, Lord of Light concept art (1979),Jack Kirby, New Gods / Eternals (1970s),Rodrigo Prieto (cinematography)

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
