---
name: code-animation-o36
description: O36 汤姆·琼斯：乔治王时代的讽刺版画：霍加斯式粗细变化的刻线和有方向的排线，上面刷罗兰森式鲜艳的手工淡彩，稍稍出线，再加一个对白气泡。电影本身就在模仿霍加斯笔下的 18 世纪英国。
---

# O36 汤姆·琼斯

- 分类：O 奥斯卡 98 部 · 摇摆年代 1960–1969
- 长什么样：乔治王时代的讽刺版画：霍加斯式粗细变化的刻线和有方向的排线，上面刷罗兰森式鲜艳的手工淡彩，稍稍出线，再加一个对白气泡。电影本身就在模仿霍加斯笔下的 18 世纪英国。
- 风格：手工上色讽刺铜版画
- 关键词：2D
- 年份：1963

## 风格提示词

乔治王时代讽刺版画：先刻铜版，印完再手工上色。墨只有棕黑色的线：雕刀轮廓约画面宽的 1/400，起伏鼓胀，背光一侧更粗；排线顺形体走、铺满每个面（线距约画面宽的 1/250），只在暗部交叉，平面用直尺排线。颜色几乎铺满整幅，清透但饱满：水色溢出墨线几像素，用酒红 #B3262E、黄铜 #D8A93A、肉色 #F0C4A4、石板蓝 #6D8AA6，大面用暖赭和棕褐。浅棕褐帘纹纸，淡霉点，版框印痕，刻线边框。按 William Hogarth 的方式布置：大鼻子的漫画人物，主体身边是旁观者或搞笑的道具、动物；一个手写斜体对话气泡，用用户的语言。镜头：全幅停两秒，急推，横滑到另一处细节，再给近景。避免：机械均匀的排线、大片空白纸、颜色严丝合缝填在线里、颜色发脏。

---

English:

Georgian satirical print: a copperplate engraving, hand-coloured. Brown-black line only: swelling burin outlines about 1/400 of frame width, heavier on the shadow side; hatching follows each form and covers every surface (spacing about 1/250 of frame width), cross-hatched in the darks, ruled on flat areas. Colour covers nearly the whole picture, clear but strong: washes spilling a few pixels off the line in claret #B3262E, brass #D8A93A, flesh #F0C4A4, slate blue #6D8AA6, warm ochre and umber on large surfaces. Sepia laid paper, foxing, plate mark, engraved border. Stage it like William Hogarth: big-nosed caricatures, bystanders or comic props and animals around the subject; one slanted handwritten speech balloon in the user's language. Camera: hold the full plate 2 s, whip in, glide to another detail, close-up. Avoid: even mechanical hatching, blank paper, colour exactly inside lines, muddy colour.

## 补充

### 技法关键词

霍加斯铜版线刻,罗兰森/吉尔雷式手工上色,讽刺画对白气泡

### 导演说明

Clawd 扮汤姆·琼斯：金边三角帽、脸上一个口红唇印、手拿鸡腿。不用正反打，用一次横滑：从隔桌的双人镜头滑到沃特斯夫人眨眼、冒出对白气泡。再切近景：心形眼、陶醉一晃，摘下三角帽扣向镜头，画面全黑，下一部从黑里开场。

### 成片里的分镜

1. 从左边甩进隔着满桌菜的双人镜头，Clawd（汤姆）大口啃鸡腿；镜头横滑过桌面落到沃特斯夫人，她冒出对白气泡（Another Leg, Mr Jones?）并眨了一下眼。（1.3s）
2. Clawd 近景：眼睛变成心形，陶醉地一晃，又啃一小口，然后摘下三角帽扣向镜头，画面变黑；缓慢推近。（1.2s）

### 参考出处

Tony Richardson, 1963,William Hogarth, A Rake's Progress / Marriage A-la-Mode,Thomas Rowlandson,James Gillray

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
