---
name: code-animation-o74
description: O74 美丽心灵：两种表面上的手写数学：哥特式图书馆窗玻璃上的白色油性笔、黑板上的粉笔，数字亮起，被金线连起来。这是片中纳什看见规律的方式：是他脑中的光，不是电脑界面。
---

# O74 美丽心灵

- 分类：O 奥斯卡 98 部 · 新千年 2000–2009
- 长什么样：两种表面上的手写数学：哥特式图书馆窗玻璃上的白色油性笔、黑板上的粉笔，数字亮起，被金线连起来。这是片中纳什看见规律的方式：是他脑中的光，不是电脑界面。
- 风格：窗上公式与黑板粉笔 + 金色连线
- 关键词：2D
- 年份：2001

## 风格提示词

手写就是画面：半透明白色蜡笔 #F1EFE6（笔画宽约画宽 1/300）在方格铅条窗玻璃上一笔笔写出来，写的是与题材有关的公式、数字或笔记，几小块字只占玻璃约四分之一。窗外是题材的世界，柔焦虚化，中间调、暖中性（阴天里的秋黄和柔和的绿），亮度不能超过字迹。暖色室内框住窗子：书架、绿罩台灯、琥珀灯光。关键时刻，选中的符号变亮，柔和的金线在它们之间连成星形或多边形，小光点沿线走。变体：深绿石板粉笔，带残影。配色：石板绿 #2F3E35、粉笔白 #F1EFE6、灯光琥珀 #E0A050、柔金 #D9B45A。镜头缓推，每次切换都离字更近。对标摄影师 Roger Deakins（《美丽心灵》，2001）。避免：HUD 或科幻界面；打字字体；字铺满玻璃；冷蓝色的窗外。

---

English:

Handwriting as the image: translucent white wax-marker strokes (about 1/300 of frame width) appear stroke by stroke on a window of square leaded panes: formulas, figures or notes about the subject, in small blocks on a quarter of the glass. Outside, the subject's world, soft-focus, mid-toned and warm (overcast gold, muted green), never brighter than the writing. A warm interior (shelves, green-shaded lamp, amber light) frames the window. At the key moment, chosen symbols brighten and soft gold lines join them into a star or polygon, lights running along. Variant: chalk on green slate with ghost writing. Palette: slate green #2F3E35, chalk white #F1EFE6, lamp amber #E0A050, soft gold #D9B45A. Camera: slow push-ins, each cut closer to the writing. Reference: cinematographer Roger Deakins (*A Beautiful Mind*, 2001). Avoid: HUD graphics; typed fonts; writing filling the glass; cold blue outside.

## 补充

### 技法关键词

玻璃上的白色油性笔,黑板粉笔,发光的金色连线,迪金斯式窗光

### 导演说明

Clawd 扮纳什：领口敞开的衬衫领、松着的针织领带，窗前拿一支油性笔。第一个镜头在写，后两个镜头是光；每次硬切都离数字更近，最后 Clawd 出画，只剩图案。

### 成片里的分镜

1. 中全景：哥特式图书馆窗前，Clawd 扮纳什站在窗座上，用白色油性笔在玻璃上写博弈论公式，窗外是秋天的方院；镜头慢推。（1s）
2. 近景：玻璃上的字迹，窗外虚焦，左下角露出 Clawd 的笔；字符亮起，金线把它们连成一颗星；镜头略推。（0.8s）
3. 近景：黑板上五位一组的密码数字，数字一个个亮起，金色的七角星图案自己画出来；镜头略推。没有 Clawd。（0.8s）

### 参考出处

Ron Howard, 2001,Roger Deakins (cinematography),A Beautiful Mind 2001 poster

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
