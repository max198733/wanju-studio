---
name: code-animation-o33
description: O33 桃色公寓：Saul Bass 式的白线在黑底上滑入，搭出电影最有名的一点透视无尽办公大厅，再填上灰调。本片片头就是 Bass 做的；全画面唯一的暖色是 Clawd 和钥匙牌。
---

# O33 桃色公寓

- 分类：O 奥斯卡 98 部 · 摇摆年代 1960–1969
- 长什么样：Saul Bass 式的白线在黑底上滑入，搭出电影最有名的一点透视无尽办公大厅，再填上灰调。本片片头就是 Bass 做的；全画面唯一的暖色是 Clawd 和钥匙牌。
- 风格：Saul Bass 线条片头 · 黑白
- 关键词：2D·B&W
- 年份：1960

## 风格提示词

把 Saul Bass 片头的线条做成布景，黑白加一个暖色。镜头从全黑开始：细白线（约画面宽的 1/800）滑入、向纵深长成网格；两三秒内灰面填满，灯一排排亮起。之后完成态停约三秒：中到浅灰，从 #140F0D 到 #F4F1E8 均匀分四五级平涂，每个形体有约画面宽 1/600 的深色轮廓。严格一点透视，灭点居中；一样的东西重复排向纵深（有人群时是桌子和人，单人时是柱子、路灯、窗格）。人物是两色平涂。唯一的暖色是橙红 #E2472A，只给唯一的主角和一件道具；所有光都是白的。轻颗粒、柔暗角。镜头：急推到主角，硬切到正上方俯视，网格变成图案。避免：草稿感的线、渐变、颜色渗入、透视歪、没填色的暗线框。

---

English:

Saul Bass title lines turned into a set. A shot opens on black: thin white lines (about 1/800 of frame width) slide in and grow into a grid; by 2–3 s grey planes fill in and lights switch on row by row. Then hold the finished frame 3 s: mid-to-light grey, flat fills in 4–5 even steps from #140F0D to #F4F1E8, every shape outlined in dark line about 1/600 of frame width. Strict one-point perspective, centred vanishing point; identical elements repeat into depth (desks and people, or posts, lamps, windows). Figures: flat two-tone shapes. The only warm colour is orange-red #E2472A, for the one hero subject and one prop; all light stays white. Camera: a fast push to the hero, a hard cut to top-down, the grid becoming pattern. Avoid: sketchy lines, gradients, colour leaks, skewed perspective, unfilled wireframe.

## 补充

### 技法关键词

Saul Bass 片头设计,一点透视办公大厅,黑白胶片颗粒,唯一的暖色

### 导演说明

Clawd 扮 C.C. 巴克斯特：圆顶礼帽、挂着橙红牌子（51 W 67）的公寓钥匙，坐在前排桌沿。办公大厅一根线一根线画出来，第 2 拍举钥匙、镜头急推；最后切到俯视的桌阵网格，和下一部开场俯拍的曼哈顿街区网格做图形匹配。

### 成片里的分镜

1. 一镜到底：白线从全黑里搭出无尽的办公大厅，灰调和天花灯一排排亮起；坐在前排桌沿的 Clawd（巴克斯特）在第 2 拍举起公寓钥匙，镜头急推过去。（1.9s）
2. 硬切到正上方俯视：桌子排成一张网格，Clawd 仰面躺在自己桌上，手里是钥匙和牌子；缓慢推近。（0.6s）

### 参考出处

Billy Wilder, 1960,Saul Bass (title sequence),Joseph LaShelle (cinematography),Alexandre Trauner (production design)

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
