---
name: code-animation-o58
description: O58 走出非洲：实时 3D 的低空飞行：铬黄色双翼机掠过苏打湖，上万只火烈鸟惊起，琥珀色薄雾光。这部片最被记住的就是丹尼斯带凯伦飞越肯尼亚，和她向后座伸出的那只手。
---

# O58 走出非洲

- 分类：O 奥斯卡 98 部 · 大片年代 1980–1989
- 长什么样：实时 3D 的低空飞行：铬黄色双翼机掠过苏打湖，上万只火烈鸟惊起，琥珀色薄雾光。这部片最被记住的就是丹尼斯带凯伦飞越肯尼亚，和她向后座伸出的那只手。
- 风格：3D 双翼机飞越东非裂谷
- 关键词：3D
- 年份：1985

## 风格提示词

实时 3D，像 80 年代宽银幕实景摄影：模型按真实比例、细节到位（如支柱、拉线、铆钉）；地形平滑，不要低多边形碎面。默认光：从镜头看，低斜的太阳在主角身后（逆光），奶油色淡天空，琥珀薄雾，远山分三四层渐淡，赭黄大地上长长的柔影。整体明亮：七成画面在中高调，阴影暖灰不深褐；近白不超过五分之一。胶片曲线、低饱和、细颗粒、轻暗角。上千只实例化的鸟或动物（如粉 #F3B3AE 配深红 #DF3F55），主角经过时一波波错开起飞或散开。招牌镜头：越过移动中主角的肩膀看远景；其次是离地 10–20 米的追拍和一个对着太阳的逆光镜头。对标摄影师 David Watkin（《走出非洲》，1985）。避免：冷而干净的 CG 日光；发暗的棕褐调；整齐划一的鸟群。

---

English:

Real-time 3D like 1980s widescreen location photography: true-scale models with fine detail (e.g. struts, wires, rivets); smooth terrain, not low-poly. Default light: late-afternoon sun low behind the hero as seen from camera, pale cream sky, amber haze, distant ridges in 3–4 paler layers, ochre ground with long soft shadows. Pale overall: about 70% of the frame in light mid-tones, shadows warm grey, not deep brown; under a fifth near-white. Grade: filmic curve, low saturation, light grain, soft vignette. Thousands of instanced birds or animals (e.g. pink #F3B3AE with crimson #DF3F55) lift or scatter in staggered waves as the hero passes. Signature shot: over the moving hero's shoulder across open land; then a high chase 10–20 m up and one shot into the sun. Reference: cinematographer David Watkin (*Out of Africa*, 1985). Avoid: cold clean CG daylight; dark sepia; lockstep flocks.

## 补充

### 技法关键词

three.js 实时 3D,David Watkin 的航拍,暖调胶片调色,实例化的火烈鸟群

### 导演说明

Clawd 坐在凯伦的前座：皮飞行帽、黄铜护目镜、白丝巾。两个外景镜头硬切，交代火烈鸟湖上的速度和空间；最后的座舱镜头留给片中那个动作：Clawd 转身向后伸手，丹尼斯握住，落在最后几拍。飞行时间是屏幕时间的 1.5–1.6 倍。

### 成片里的分镜

1. 贴着湖面仰拍追机：黄色双翼机从头顶掠过，Clawd 小小地坐在前座探身往外看，火烈鸟从水面腾起掠过镜头。（0.8s）
2. 硬切到正对太阳的逆光全景：飞机迎面飞来，两侧是正在升起的粉色鸟群。（0.7s）
3. 从后座往前的机上镜头：戴皮飞行帽、黄铜护目镜、白丝巾在风里飘的 Clawd 转身向后伸手，丹尼斯戴手套的手握住它。（1s）

### 参考出处

Sydney Pollack, Out of Africa (1985),David Watkin (cinematography),Out of Africa (1985) poster,de Havilland DH.60G Gipsy Moth G-ABAK

---

## 用这一种做片

- 上面 `{{ }}` 里是要你填的内容；填掉它，保住形成这个风格的核心视觉特征（配色、运动节奏、构图逻辑）。
- 画面是时间 t 的纯函数：同一个 t 每次画出来一样。随机数固定种子，不要用 `Math.random`，不要在帧之间累积状态。
- 一般用原生 HTML + Canvas／SVG／CSS；需要复杂空间镜头时才引 Three.js。一个页面没有声音。
- 用户给的数字、事实、品牌原样用，不编造；图表形状要跟数值对得上。
- 成品留在项目里，文字、颜色、节奏都要能再改：常改的参数集中在一处。
- 做完打开看首帧、中段、尾帧：字体、溢出、黑帧、字幕可读性。用户要 MP4 就真渲染，缺依赖就说清没导出。

素材由哔哩哔哩 **俯仰观照** 整理分享，技能封装来自 [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)。免费使用、免费分享；不要把这个合集包装成收费课程或付费技能出售。
