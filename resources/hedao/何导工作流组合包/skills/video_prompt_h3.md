# H3视频提示词技能（h3-prompt-writing·MiniMax 官方规范）

> 技能键：`embedded_skills.video_generation_extension`　|　来源：何导工作流 v1.24.34
> 调用时机：**需要时才加载本文件**；工作流骨架只保留指针，不内联本文件正文。
> 单源规则：本文件是该技能的唯一真源；骨架、其它技能、闸门均只引用不复制。


## 最高优先规则：全量通读 · 禁止抽样（v1.24.38 / FPR-1）

> 本规则压过本技能其余一切写法要求。真源：`standards/full_pass_review_policy.json`。

写视频提示词时同样**逐镜全量、禁止抽样**，且必须回读**前后各 3 镜**：

1. 每镜的**时间与光影**必须与分镜卡该镜一致；转场落点之后整段换挡，不得沿用上一时间面的光线描述。
2. 每镜的**站位与层位**（谁在前景、谁在后景、谁在画面左、谁在画面右）必须与分镜卡逐字一致，不得因为写提示词而反转。
3. 每镜的**朝向与视线**必须继承：人物不看镜头，视线落点逐人写明。
4. 跨镜**动作接力**必须写「保持与上一镜一样的姿态——（手在哪、脚在哪、重心在哪）」，不许只写「动作持续」。
5. **服装形态**（CHxx_Cnn）与**道具**在同一场内必须连续，不得无故换装、换手。
6. 发现一镜与上下文矛盾，**回扫全卡同类问题**一起改；只改点名镜视为未完成。
7. 交付写「已全量检查 N/N 镜」。

## 三套视频提示词技能互斥说明

| 技能 | 文件 | 适用条件 |
|---|---|---|
| H3视频提示词技能（h3-prompt-writing） | `skills/video_prompt_h3.md` ← **本文件** | video_engine=H3（MiniMax 官方结构化提示词：Ref2VA 六段 / T2VA 三字段） |
| 通用视频提示词技能 | `skills/video_prompt_generic.md` | wan3.0 / grok / seedance2.0 / 其他非H3非seedance2.5引擎（分镜原文+多参） |
| seedance2.5视频提示词技能 | `skills/video_prompt_seedance25.md` | video_engine=seedance 且 seedance_model=seedance2.5（时间轴标记的镜头组原文+多参） |

> 同一项目只加载其中一套，由 `skills/video_prompt_router.md` 路由决定；三套**禁止相互调用**、禁止交叉引用字段。
> 三套共用同一套标准件（`standards/*.json`）与同一套分镜卡；台词时长规则一致：有台词镜 持续时长 ≥ ceil(字数÷5) 秒。

## skill_name

H3视频提示词技能（h3-prompt-writing·MiniMax 官方规范）

## applies_to

video_engine=H3（仅H3项目使用本套；其他引擎见 video_prompt_skill_generic 与 video_prompt_skill_seedance25，三套互斥、禁止相互调用）

## exclusive_load_rule

由 embedded_skills.video_prompt_skill_router 路由选中后才加载；加载前必须先读路由，禁止凭习惯默认用H3提示词技能。


## ONE-SHOT 生成纪律（v1.24.20，P0）

**每个镜头的图片与视频，各自只准生成一次。任何模式、任何环节都不得自动重跑。**

- **禁止自动重提**：生成链路上不得出现 `for/while` 重试循环、多层重试嵌套、子进程重跑、后台自动补跑。
  提交失败（超时、502、网关抖动、读超时、轮询超时、任务 FAILED、参考图未消费）一律**即停**，把原因交导演，
  不得自动再发一次。
- **提交前必须去重**：查 `13-工作流文档/生成台账.json`，同一 `shot_id` + 媒（image/video）已有任一条提交记录
  就禁止再提交；并发时用文件锁 + 唯一 task 文件保证单一在途。
- **AI 觉得不好 ≠ 可以自己重跑**：自检或闸门复核发现风格不符、画质不佳、构图不对时，**必须停下来询问导演**
  「这一镜我不满意，是否需要授权重做（会产生一次新的付费生成）」，得到授权才可重做。
- **二次生成唯一入口**：导演逐镜显式授权，登记到 `13-工作流文档/阶段状态.json` 的
  `regeneration_authorizations`（一次一镜一媒，用完即止），登记完成才允许发起下一次。
- **批量先报备**：≥2 镜/资产的批量生成，开跑前把预计请求数（＝待生成数，**不含**任何重试系数）报给导演确认；
  运行期实际请求数超报备数即立即熔断并上报。

唯一真源：`standards/one_shot_generation_policy.json`。

## 人物朝向硬规则（v1.24.19，P0）

**人物永远不要正对镜头——身子和面部都不要对着镜头。** 凡画面中出现人物：

- **身体**：至少侧转或背向镜头，禁止正面全身、正面半身、身体正对着镜头。
- **面部**：至少偏转 30°（推荐 45°~120°）或完全不入画；禁止正脸直视镜头。
- **机位**：含人物的镜头**禁用『正面机位』**，改用『左 45° 侧面机位』『右 45° 侧面机位』『背影视角机位』，
  或仰视／俯视机位配合侧向体位。『正面机位』只允许用于无人物空镜与场景交代镜。
- **每镜必写朝向**：『画面内容』必须写明人物的身体朝向与面部朝向，推荐句式
  『她侧身对着画面外，半侧脸朝向街口，视线落在画面之外的巷子里』。
- 局部特写镜写到『面部不入画』即可；无人物空镜不适用；角色资产定妆照（三视图）不受本规则约束。
- 唯一豁免：该镜已写明『（用户要求：允许直视镜头）』并在阶段状态记录授权。

唯一真源：`standards/character_facing_policy.json`；stage4 由 `STG4-C19` 机检。
本规则同时作用于 **分镜卡 / 分镜图提示词 / 视频提示词**——图片与视频两条链都必须命中。

## 空间与动作连续性三条继承规则（v1.24.35，P0）

视频提示词**逐字继承**分镜卡『画面内容』。分镜卡改好只是第一步，下面三条在改写/翻译（H3 英文 detailed_description、seedance 时间轴分段）之后必须仍然成立：

1. **站位与朝向锁定**：分镜卡里人物的朝向（身体朝向 / 面部朝向 / 视线落点）是场景锁定值。改写时**不得改变人物在场景中面朝哪一边**；正反打两镜只改机位方向（正打/反打），不得把同一角色写成反向站位、不得凭改写给他转身。分镜卡没写转身动作，视频里就不许转身。
2. **逐镜入画名单**：分镜卡开头的『画面内只有X、Y两人』名单必须**原样译入**画面描述，人数一个不能增、一个不能减；全景/远景镜不得少写在场的任何一人，也不得多出未入画的人物。ref_image / `<Subject N>` 的集合与该名单严格一致。
3. **动作接力显式继承**：分镜卡里的『保持与上一镜一样的姿态——（复述手/脚/重心/朝向）』必须译成明确的延续句（例：`keeps exactly the same stance as the previous shot: left arm extended forward, palm out, right arm raised back and up, right foot resting on the left leg`），**禁止只写 `unchanged` / `same as before` 或省略**。上一镜的结尾状态即本镜起始状态，`<scenetrans>` 前后不得矛盾。

真源：`standards/continuity_policy.json`（action_handoff_rule）、`standards/scene_blocking_policy.json`（facing_lock_rule）、`standards/scene_character_roster_policy.json`（per_shot_presence_declaration_rule）。

## 单幅画面继承规则（v1.24.37，P0）

视频提示词的 `detailed_description` 风格段同样必须带单幅画面硬要求（`single cinematic shot only; NOT a character sheet, NOT a turnaround, NOT a four-view or multi-angle collage, NOT a grid of panels`）。原因与 stage6 相同：`ref_image` 垫的角色资产图本身是四格三视图版式，三视图只提供身份（人脸/发型/体型/服装），**不提供构图**；构图唯一依据是分镜卡的机位／景别／画面内容／运镜方式。真源 `standards/single_frame_output_policy.json`。

## 技能正文（按原始结构逐项保留）

### cos_reference_image_format

```json
{
  "rule": "本技能所有 ref_image / 参考图入参指向的腾讯云COS 对象均为 **WebP**（content-type image/webp），由本地无损母版一次性转码而来（standards/asset_upload_format_policy.json）。提交时按 URL 原样传入即可，**禁止自行下载后转码或压缩**（再编码=二次压缩，只省约 3% 体积却多赔一代画质）；若发现某素材 URL 指向 .png/.jpg，说明上游未按契约转码，按 stage6.5 rehost_rule 用本地无损母版重转 WebP 重传后再提交。",
  "why": "COS 下行流量 = 单图体积 × 拉取次数；视频模型每次多参都会整张拉取参考图，故参考图体积是流量的直接乘数。"
}
```

### canonical_path_note

```json
"本对象的技能正文位于内层键 video_generation_extension.video_prompt_skill（历史上工作流其它章节曾误写为 embedded_skills.video_prompt_skill，该路径不存在，v1.21.16 已修正为经路由加载）。"
```

### video_prompt_skill_immutability_notice

```json
"本技能自 v1.21.20 起以 MiniMax 官方提示词规范为格式唯一依据（官方仓库 MiniMax-AI/MiniMax-H3 的 h3-prompt-writing 技能，以及 references/base-en.txt、references/ref-en.txt 两份 Prompt Writing Guide）；本版废止并覆盖旧版自拟「六段式填法」与本条款原有的冻结声明。此后不得再以自拟段落名、勾选式填空、中文改写或字段改名替换官方字段名与字段顺序；如需调整项目接口或执行规则，只能在本工作流其他章节（stage7 / api_integration）增加说明，不得改写 official_basis、standard_output_structure、reference_label_rules、core_output_rules 中的官方口径。"
```

### video_prompt_skill

```json
{
  "skill_name": "h3-prompt-writing",
  "skill_display_name": "MiniMax H3 官方提示词规范生成技能",
  "skill_description": "把分镜原文与多参资产引用，转换为严格符合 MiniMax H3 官方提示词规范的结构化提示词：字段名、字段顺序、章节语法、镜头标记、运镜词表、说话人与台词标签、声音字段边界全部按官方口径执行；支持 T2VA / I2VA / FL2VA / L2VA / Ref2VA 五种官方模式；输出可直接提交 H3 接口生成带原生立体声的视频。",
  "compatibility": "兼容所有可读取本地文件的 Agent 运行，无需外部 API 调用、专有运行时依赖或平台工具",
  "official_basis": {
    "authority_rule": "本技能的格式唯一依据是 MiniMax 官方提示词规范，不是本工作流自拟的段落填法。凡本技能与官方口径冲突处，一律以官方为准。",
    "official_repo": "https://github.com/MiniMax-AI/MiniMax-H3",
    "official_skill": "skills/h3-prompt-writing（官方随仓库分发的提示词技能，可 npx skills add 安装）",
    "official_guides": [
      "skills/h3-prompt-writing/references/base-en.txt —— Video Prompt Writing Guide（T2VA / I2VA / FL2VA / L2VA）",
      "skills/h3-prompt-writing/references/ref-en.txt —— Full-Reference Mode Rewrite Output Format Guide（Ref2VA）"
    ],
    "official_model_specs": {
      "output_duration": "1–15 秒（high_8 档）/ 1–10 秒（standard_4 档）",
      "output_aspect_ratio": "21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16",
      "output_resolution": "默认短边 768 px；2K 需 H3-Regenerate-2K 模块",
      "output_frame_rate": "24 FPS",
      "output_audio": "32 kHz 立体声（原生音画同生）",
      "stable_dialogue_languages": "阿拉伯语、中文、英语、法语、德语、意大利语、日语、韩语、葡萄牙语、俄语、西班牙语（共 11 种）"
    },
    "official_format_warning": "官方明确：字段名、字段顺序、章节结构是模型训练时见过的格式，缺失或改序等同于提交缺键的 JSON，产出会明显掉档。禁止把官方结构改写成自拟段落名或勾选式填空。",
    "v1_21_20_override_note": "自 v1.21.20 起废止旧版自拟「六段式填法」。旧版虽然沿用了官方字段名，但 summary 无任务类型前缀、retention_analysis 无固定保留标记、detailed_description 写成字段堆砌、无 [Shot N] 镜头标记、运镜无幅度速度维度，均不符合官方口径，本版按官方规范整体重写。"
  },
  "official_tips": {
    "source": "MiniMax 官方 skills/h3-prompt-writing/SKILL.md → Tips for Better Results（v1.21.32 逐条同步）",
    "duration_match": "描述的总时长必须与请求的视频时长匹配（官方 4–15 秒；本工作流按 H3 接口档位：high_8 单镜 1–15 秒、standard_4 单镜 1–10 秒，v1.24.5 起不再截到 10 秒）",
    "label_consistency": "参考标签（<Subject N> / <Picture N> / <Video N> / <Audio N>）在每一段中的含义必须完全一致，不得中途换号或改变指代",
    "concrete_over_abstract": "优先写具体的视觉与音频细节；**禁止用 cinematic / beautiful 这类抽象形容词充当描述**——抽象词会迫使模型自行填补空白，产出明显掉档；必须改写成可拍摄的具体元素（光线来源与色温、材质与纹理、构图方位、动作幅度与速度、声音质感与来源）",
    "keyframe_connection": "使用关键帧模式（I2VA / FL2VA / L2VA）时必须明确说明首帧／尾帧如何接入目标视频时间线（本工作流 stage7 禁用首尾帧模式，此处按官方规范保留定义）",
    "official_output_rules": [
      "英文写全部重写段落；仅对话、歌词与画面内可见文字保留原语言",
      "逐镜按 构图 / 主体 / 环境 / 动作 / 运镜 / 声音 / 引用内容生效的确切时点 描述",
      "避免写成剧情概括、避免留下未解析的引用标签、避免时间与请求时长不符"
    ]
  },
  "supported_generation_modes": [
    {
      "mode_id": "T2VA",
      "mode_name": "纯文本生成模式",
      "official_definition": "Builds a complete audiovisual timeline from text.",
      "usage_scenario": "无任何参考图 / 参考视频 / 参考音频素材，完全基于分镜文本构建完整音视频时间线",
      "instruction_line": "无对齐指令行，提示词直接以集成多模态描述字段开篇"
    },
    {
      "mode_id": "I2VA",
      "mode_name": "首帧锚定生成模式",
      "official_definition": "T2VA body + first-frame instruction + a visual path that develops forward from the first frame.",
      "usage_scenario": "以指定首帧画面为起点向前发展",
      "instruction_line": "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
      "workflow_availability": "本工作流 stage7 禁止使用（api_integration.video_api 禁首尾帧模式）；此处按官方规范保留定义备用"
    },
    {
      "mode_id": "FL2VA",
      "mode_name": "首尾帧锚定生成模式",
      "official_definition": "T2VA body + first-and-last-frame instruction + a continuous path from the first frame to the last frame.",
      "usage_scenario": "给定首帧与尾帧，生成中间自然过渡的连续路径；官方倾向单镜以便连续插值",
      "instruction_line": "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.",
      "workflow_availability": "本工作流 stage7 禁止使用；按官方规范保留定义备用"
    },
    {
      "mode_id": "L2VA",
      "mode_name": "尾帧锚定生成模式",
      "official_definition": "T2VA body + last-frame instruction + a path that converges from a plausible preceding state to the last frame.",
      "usage_scenario": "推断合理的前置状态，最终收敛到指定尾帧",
      "instruction_line": "How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.",
      "workflow_availability": "本工作流 stage7 禁止使用；按官方规范保留定义备用"
    },
    {
      "mode_id": "Ref2VA",
      "mode_name": "全参考素材生成模式",
      "official_definition": "Image, video, and audio references guide identity, products, motion, camera behavior, sound, or style.",
      "usage_scenario": "带入人物、道具、场景、分镜图等参考素材生成，保证画风、构图、动作、声线一致性——本工作流 stage7 固定使用本模式",
      "instruction_line": "无对齐指令行；提示词以 subject_definitions 六段结构开篇"
    }
  ],
  "mode_selection_rule": {
    "rule": "按该镜是否存在参考资产二选一，禁止自创第三种结构。",
    "no_reference_asset": "无参考资产 → T2VA 三字段（本工作流极少出现：分镜图本身即参考资产）",
    "with_reference_asset": "有参考资产 → Ref2VA 官方六段结构（本工作流 stage7 的固定路径）",
    "note": "官方 Ref2VA 本身即六段结构，段数与旧版相同，但每段内部语法全部按官方口径执行；不得因「段数没变」而沿用旧版填法。"
  },
  "standard_output_structure": {
    "basic_modes": [
      "T2VA",
      "I2VA",
      "FL2VA",
      "L2VA"
    ],
    "basic_fields_order": [
      "integrated_multimodal_description",
      "overall_soundscape",
      "non_diegetic_music"
    ],
    "basic_fields_syntax": {
      "integrated_multimodal_description": "Describes visuals, actions, shots, speakers, dialogue, singing, and diegetic audio along the timeline.",
      "overall_soundscape": "Summarizes ambient sound, physical action sounds, and non-verbal human sounds across the entire video.",
      "non_diegetic_music": "Describes background music that the characters cannot hear and only the audience can hear.",
      "separation": "字段之间以一个空行分隔；字段名后紧跟英文冒号与空格（integrated_multimodal_description: [Shot 1] …）"
    },
    "full_reference_mode": "Ref2VA",
    "full_reference_fields_order": [
      "subject_definitions",
      "summary",
      "retention_analysis",
      "detailed_description",
      "overall_soundscape",
      "non_diegetic_music"
    ],
    "full_reference_sections_syntax": {
      "separation": "字段之间以一个空行分隔；**段名后必须紧跟英文冒号**（subject_definitions: / summary: / retention_analysis: / detailed_description: / overall_soundscape: / non_diegetic_music:）——否则等同于缺段，闸门 h3_video_prompt_format_gate 的 H3FMT-C1 会判「六段全缺」（2026-09-22 实测 43 镜踩过）",
      "subject_definitions": "逐条定义被引用内容与其引用标签；每项独占一行",
      "summary": "一段短英文，以方括号任务类型前缀开头；不得引入新标签",
      "retention_analysis": "每个引用标签一行，使用官方固定英文保留标记；不得写 (Sx)",
      "detailed_description": "主体描述；风格用 1–2 句英文写在 [Shot 1] 之前；按播放顺序逐镜描述",
      "overall_soundscape": "概括全片环境音与物理音",
      "non_diegetic_music": "仅观众可闻的配乐；无配乐写 N/A"
    },
    "field_name_immutability": "字段名必须逐字照抄官方写法（全小写 + 下划线），禁止改名、翻译、缩写、加中文后缀、调序或省略。官方原文：Leaving them out is like submitting JSON with missing keys."
  },
  "keyframe_alignment_instruction": {
    "applies_to": "仅 I2VA / FL2VA / L2VA（本工作流 stage7 不使用；按官方规范保留）",
    "placement_rule": "该指令必须是最终提示词的第一行，其后空一行再接核心字段",
    "duration_format": "S.SS 为有效视频时长，必须保留两位小数（如 6.00 / 10.00）",
    "shot_index_rule": "N 为实际最后一个镜头的序号",
    "mode_templates": {
      "I2VA": "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
      "FL2VA": "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.",
      "L2VA": "How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video."
    },
    "keyframe_writing_structures": {
      "I2VA": "首帧锚定 → 动作起始 → 连续发展 → 结果或反应；先在 [Shot 1] 开头确立参考图的风格、主体、构图与场景锚点，人物身份、服装、色彩、关键道具、空间关系保持一致",
      "FL2VA": "首帧状态 → 可观察的中间变化 → 差异逐步收窄 → 尾帧状态；尾帧必须由最后一个 [Shot N] 在片尾抵达",
      "L2VA": "合理前置状态 → 明确动作与转换路径 → 末镜逐步收敛 → 落在尾帧"
    }
  },
  "shot_and_cut_rules": {
    "first_shot": "[Shot 1] 不带时间戳",
    "later_shots": "[Shot N] At MM:SS.mmm, …——切镜时间必须严格递增且落在视频时长内",
    "cut_verbs": "the camera cuts to / the shot cuts to / the shot transitions to / the shot changes to / the shot switches to",
    "special_transitions": "叠化、淡入淡出、划像仅在用户明确要求时使用",
    "cut_must_add_information": "切镜必须带来主体、空间、状态、视角或时间上的新信息",
    "prefer_camera_motion": "若只是改变景别或轻微角度，优先用运镜表达，不用切镜",
    "style_opening": {
      "base_modes": "写在 [Shot 1] 之后",
      "ref2va": "用 1–2 句英文写在 [Shot 1] 之前"
    },
    "official_style_vocabulary": [
      "Cinematic",
      "live-action",
      "2D-animated",
      "3D CG",
      "claymation",
      "watercolor",
      "vintage film"
    ]
  },
  "camera_motion_vocabulary": {
    "rule": "完整运镜表达 = 运动类型 + 幅度 + 速度；中等幅度与正常速度通常省略不写",
    "expression_rule": "运镜必须写成镜头内的自然英文动作句，禁止把标签堆在句尾。正面示例：The camera pushes in with small amplitude at slow speed toward the folded letter in her hands.",
    "motion_types": {
      "Zoom In": "机身不动，焦距变化（推近）",
      "Zoom Out": "机身不动，焦距变化（拉远）",
      "Push In": "机身向前推进",
      "Pull Out": "机身向后拉远",
      "Pan Left": "机身不动，镜头水平摇向左",
      "Pan Right": "机身不动，镜头水平摇向右",
      "Truck Left": "机身水平平移到左",
      "Truck Right": "机身水平平移到右",
      "Tilt Up": "机身不动，镜头垂直摇向上",
      "Tilt Down": "机身不动，镜头垂直摇向下",
      "Pedestal Up": "整个机位上升",
      "Pedestal Down": "整个机位下降",
      "Arc Shot": "绕主体弧线运动",
      "Tracking Shot": "跟随移动主体",
      "Static Shot": "机位与镜头全静止",
      "Shake Slightly": "轻微晃动",
      "Shake Strongly": "强烈晃动",
      "POV": "主体主观视角",
      "Roll Clockwise": "绕镜头轴顺时针滚转",
      "Roll Counterclockwise": "绕镜头轴逆时针滚转"
    },
    "amplitude": {
      "with small amplitude": "小范围变化",
      "with large amplitude": "大范围变化"
    },
    "speed": {
      "at slow speed": "慢速",
      "at fast speed": "快速"
    },
    "storyboard_motion_mapping": "分镜层六类运镜 → 本词表的英文表达映射（v1.22.0）：①固定机位 → Static Shot；②水平/垂直展示运镜 → Truck Left/Right 或 Pedestal Up/Down（挨个展现多个对象时写成连续的水平/垂直播扫句）；③拉近运镜 → Push In / Zoom In（第一帧是大空间、逐渐聚焦到一个小细节）；④拉远运镜 → Pull Out / Zoom Out（第一帧是细节特写、逐渐展示出整个空间）；⑤环绕运镜 → Arc Shot；⑥跟拍运镜 → Tracking Shot（须写明焦点是谁）。分镜『运镜方式』字段里写明的起点与终点必须落进英文运镜句（如 starts on the wide room and pushes in onto the crack on the ring）。",
    "native_api_bracket_commands_note": "MiniMax 原生开放平台另支持 [Push in] / [Static shot] 等 15 条方括号指令（同括号内为同时生效、最多 3 条；不同位置为顺序生效）。本工作流走 AutoDL ComfyUI 工作流，官方 Prompt Writing Guide 产出的是上述英文散文句式，故本技能一律使用散文句式，不写方括号指令。"
  },
  "speaker_dialogue_and_singing_rules": {
    "speaker_id": "说话 / 歌唱 / 发出画外人声的主体使用稳定 ID (S1)、(S2)；多个已编号说话人同时发声用复合 ID (S1,S2)；同一说话人跨镜头必须沿用同一 ID；从不发声的角色不给 ID",
    "first_appearance": "说话人首次出现须给出视觉与听觉上下文以确立稳定身份：角色类型、年龄、性别、是否在画面内、音高、音色、语速、口音",
    "dialogue_tag_outside": "<d> 之外写说话人识别短语、ID、动作与表演方式",
    "dialogue_tag_inside": "<d> 之内只写语言标签与用户提供的原始台词内容；原文与标点逐字保留，禁止翻译、禁止改写",
    "dialogue_example": "The young woman with a quiet, breathy voice (S1) says: <d>[English] I get off at the next station.</d>",
    "group_speech_example": "The two children (S1,S2) shout together, <d>[English] Wait for us!</d>",
    "voiceover": "画外音必须使用固定措辞 says in an off-screen voiceover，并在每个画外音 <d> 块紧接其后声明对应画面角色嘴唇闭合：while his lips remain completely closed",
    "dialogue_across_cut": "同一句台词 / 歌词跨越切镜时，在两个部分的连接点都写 <scenetrans>，并明确声明音频跨切镜连续",
    "dialogue_truncated": "台词被片尾截断写 <cutoff>",
    "continuity_phrases": "continues seamlessly across the cut / continues uninterrupted into the next shot / carries over from the previous shot / remains audible across the transition",
    "unclear_span": "听不清的片段写 [unclear]，禁止猜测或转述",
    "punctuation_normalization": "标点统一为 , . ? !；删除重复波浪号、emoji、项目符号与装饰性重复标点；完整陈述 / 疑问 / 感叹在 </d> 前分别以 . ? ! 收尾",
    "speaker_id_assignment": "(Sx) 按目标视频中实际发声事件的出现顺序分配一次，之后各处复用；retention_analysis 中禁止写 (Sx)"
  },
  "onscreen_text_rule": "真实出现在画面里的标语、招牌、标签、字幕、霓虹文字放入英文双引号，原文与标点逐字保留、不翻译。示例：A red neon sign reading \"营业中\" glows above the doorway.",
  "sound_field_rules": {
    "overall_soundscape": {
      "length": "1–4 句英文，单段连续",
      "content": "只写环境音、物理动作音与非语言人声（风声、雨声、车流、脚步、衣物摩擦、撞击、呼吸、笑、喘）",
      "exclusion": "不重复台词、歌唱、画面内有源音乐——那些写在集成多模态描述 / 详细描述里",
      "na_rule": "只有用户明确要求全片静音时才写 N/A"
    },
    "non_diegetic_music": {
      "length": "1–3 句英文",
      "content": "只写角色听不到、仅观众可闻的配乐；聚焦乐器编制、速度、节奏、力度变化",
      "forbidden": "禁止抽象情绪词，禁止解释配乐的情感功能",
      "diegetic_boundary": "角色能听到的歌唱、乐器、收音机、电视、手机音乐属于有源事件，写进集成多模态描述 / 详细描述",
      "na_rule": "无配乐写 N/A"
    },
    "reference_audio_split": "使用参考音频时，复制 / 参考关系只写在对应的可闻层：环境音与音效写 overall_soundscape，仅观众可闻的配乐写 non_diegetic_music；同一段音频同时提供两类内容时，两个字段分别写明"
  },
  "reference_label_rules": {
    "labels": {
      "<Subject N>": "从参考素材中抽象出的可见内容单元，可在目标视频中复用或修改（人物 / 动物 / 物体 / 场景 / 背景 / 环境 / 服装 / 道具 / 界面 / 特效 / 风格 / 动作 / 表情 / 姿态）",
      "<Picture N>": "作为具体目标帧或分镜锚点的参考图",
      "<Video N>": "提供剪辑源、续接起点或整片时间结构的参考视频",
      "<Audio N>": "被复制或参考的音频信号"
    },
    "consistency_rule": "标签一旦指派，在 subject_definitions、summary、retention_analysis、detailed_description 与音频章节中含义必须完全一致，不得中途换号",
    "subject_rule": "一个 Subject 可由多个素材定义；一个素材也可提供多个 Subject。同一主体来自多个素材时合并来源并写明各自提供什么",
    "subject_multi_source_example": "<Subject 1> is the woman whose appearance comes from <Picture 1> and whose walking motion comes from <Video 1>.",
    "picture_standalone_rule": "仅当该图本身就是某镜的首帧 / 关键帧 / 尾帧 / 编辑关键帧 / 构图锚点时才独立成 <Picture N> 行；若图片只用于定义角色、场景、服装或风格，不得单独开条目，而应在对应 <Subject N> 定义内以来源形式引用",
    "picture_storyboard_rule": "图片作为分镜参考时须写明它映射到哪些镜头及提供何种规划信息：<Picture 3> is a storyboard reference for [Shot 1] and [Shot 2], defining their viewpoint, subject placement, and shot order.",
    "video_rule": "<Video N> 仅用于整片级关系（编辑原片 / 从原片结尾续接 / 参考原片的运镜、剪辑、节奏或时间结构）；原片中的人物、物体、场景、动作、特效被复用为可见内容时仍归 <Subject N>",
    "audio_numbering_rule": "<Video N> 与 <Audio N> 独立编号，索引只表示各自类别内的顺序，不隐含配对；同一段参考视频可能对应 <Video 1> 和 <Audio 2>",
    "audio_auto_creation_rule": "普通参考视频不会因为文件带声音就自动产生 <Audio N>",
    "audio_speaker_binding": "当 <Audio N> 明确对应某个目标说话人时，复用该说话人的全局 ID：<Subject N> (Sx)。示例：<Audio 1> is the voice-timbre reference for <Subject 1> (S1).",
    "summary_task_type_prefix": {
      "keyframe completion": "图片作为目标视频的首帧 / 关键帧 / 尾帧 / 编辑关键帧或其他具体帧锚点",
      "reference generation": "图 / 视频 / 音频为角色、场景、风格、动作、运镜、分镜等提供生成引导，但不作为具体帧，也不是被编辑或被续接的源视频",
      "video editing": "直接修改既有源视频（编辑图片或在静帧关键帧之间生成不属于此类型）",
      "video continuation": "从既有源视频续写、延伸、恢复或过渡",
      "audio reuse": "同一音频信号被全部或部分复用",
      "audio reference": "不直接复制音频，只参考其音乐风格、音色、台词 / 歌词内容、音效质感、节拍或连续性",
      "combine_rule": "多类型用「 + 」连接且不重复，如 [video editing + reference generation + audio reuse]",
      "no_new_label_rule": "summary 不得引入新的引用标签",
      "video_editing_opening": "剪辑类任务在类型前缀之后必须以 The target video is an edited version of <Video 1>. 开头"
    },
    "retention_markers": {
      "visible_content": {
        "fully_preserved": "被引用内容的既定角色被完整保留",
        "partially_preserved": "仍在使用，但部分既定特征被改变或只部分保留",
        "attribute_transfer": "被引用特征迁移到另一个可识别的目标主体上",
        "strong_reference": "只保留风格、类别、构图或氛围上的宽泛相似"
      },
      "audio": {
        "fully_copy": "完整源音频作为目标视频的完整最终音轨",
        "partially_copy": "只复制部分时间线或部分音层，或复制后增删替换了其他声音",
        "reference": "不直接复制信号，只参考音色、节奏、音乐风格、台词内容或音效质感",
        "strong_reference": "只保留类别或氛围上的宽泛相似"
      },
      "entry_format": "<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - …；<Picture 2> ([Shot 1] first frame): fully_preserved - …；<Video 1> (cut and pacing structure): strong_reference - …；<Audio 1>: fully_copy - …；<Audio 2>: reference - …",
      "no_audio_marker_for_visible": "可见内容与音频两类标记不得混用",
      "new_addition_rule": "目标视频中新增的动作、背景或情节事件不算参考保真度损失"
    },
    "detailed_description_label_usage": {
      "first_appearance": "重要 <Subject N> 首次清晰出现时，在其可见范围内描述被引用的特征、画面位置与当前动作",
      "later_shots": "后续镜头继续使用同一标签，不再重新定义",
      "frame_anchor_phrasing": "the shot begins from <Picture 1> / the shot's keyframe corresponds to <Picture 2> / the shot ends on <Picture 3>",
      "audio_citation": "在与音频关系生效的镜头或语义阶段引用 <Audio N>，并说明是复制还是参考",
      "speaking_subject": "被引用主体实际发声时同时保留视觉引用标签与说话人 ID：<Subject 2> (S1) turns toward the woman and says, <d>[English] …</d>",
      "no_fake_speaker": "当台词只是直接复用 BGM 或完整音轨中的一句，且没有任何具体人物、角色、旁白或其他独立发声源实际发出时，以 <Audio N> 作为可闻来源，不得凭空发明 (Sx)"
    }
  },
  "length_rule": {
    "official_target": "生成类任务 detailed_description 通常 350–500 英文词；官方 Context-IR 自身输出的主描述约 350–450 词",
    "short_prompt_warning": "官方原文：A 40-word prompt leaves it filling gaps on its own。短提示词产出平淡",
    "dialogue_dense": "台词密集的内容优先容纳完整台词时间线，而非机械凑字数",
    "editing_task": "剪辑类描述按源片复杂度伸缩，不受 350–500 词区间约束",
    "single_shot_note": "单镜不自动意味着可以写短；按信息负载把细节分配到各镜",
    "duration_match": "描述的总时长必须与请求的视频时长严格匹配（官方 4–15 秒；本工作流 AutoDL 按 H3 接口档位：high_8 为 1–15 秒、standard_4 为 1–10 秒，v1.24.5 起取消 10 秒上限）"
  },
  "storyboard_field_mapping": {
    "layer_note": "【分镜 → 官方格式的唯一映射口径 v1.21.32】官方六段的每一段内容都必须能逐项追溯到该镜分镜卡的字段，不得自由发挥、不得引入分镜外内容。本表是「把分镜填进官方格式」的执行依据。",
    "mapping": {
      "镜号": "[Shot N] 标记：[Shot 1] 不带时间戳；后续镜头写 [Shot N] At MM:SS.mmm（MM:SS.mmm 取该镜在目标视频中的起始时间，由逐镜持续时长累加得出）",
      "持续时长": "切镜时间点与描述总时长；所有镜持续时长之和 = 请求的视频时长，描述覆盖的时间线必须与之严格匹配",
      "机位": "detailed_description 中的视角／构图句（自然英文）；正反打／过肩镜必须先写明拍摄面与面ID（正面 SCxx_F／背面 SCxx_B）及该面机位方向所见环境空间",
      "景别": "构图句中的取景范围（远景／全景／中景／近景／特写／大特写）；景别决定信息粒度，描述细节量必须与之匹配",
      "光影": "环境与光照描述（光源来源、色温、明暗对比、时间感），不得用抽象情绪词代替",
      "场景与人物": "① subject_definitions 的来源：人物建 <Subject N>（编号严格按本栏出场顺序）、场景与道具按需建 <Subject N>；② 首次清晰出现时在镜内描述其被引用特征与画面位置；③ 本栏是全片参考绑定的唯一数据源",
      "画面内容": "该镜在 detailed_description 中的主体描述（重写为英文，但信息必须逐项来自本字段：主体、动作、状态变化、可见细节），禁止压缩成剧情概括",
      "运镜方式": "自然英文运镜句，含运动类型 + 幅度 + 速度（如 slowly pushes in ／ pans left with a steady, unhurried pace）；**并须体现该镜运镜的起点与终点**——分镜『运镜方式』字段已写明起于什么、止于什么（v1.22.0），英文句必须一并译出（如 starts on the wide room and pushes in onto the crack on the ring）；**若该镜为转场镜，其画面内容里的 `转场镜：[类型]｜` 标记须原样保留在 detailed_description 对应镜内**（该镜在单镜内完成场景切换）；**（v1.24.0）分镜『画面内容』的 `承接：` 与 `尾帧：` 语义必须译进英文描述**——承接段译为本镜开头的连续状态句（与上一镜尾帧同义、须保持逐字对应关系），尾帧段译为本镜结尾的状态句，二者均不得省略。",
      "音效": "该镜的声音描述（环境音与动作音效）；全片层的环境与物理声汇总进 overall_soundscape，与具体镜同步的声事件留在 detailed_description 对应镜内",
      "台词": "说话人写 (Sx)、台词写 <d>[Language] 原文</d>；台词正文逐字保留原语言、标点收敛为标准书写符号；跨切镜用 <scenetrans>、被结尾截断用 <cutoff>"
    },
    "no_invention_rule": "**禁止新增分镜卡里没有的人物／场景／道具／动作／情节**；禁止把分镜外的剧情想象写进任何一段。产出与分镜的偏差只允许发生在两处——「语言」（中→英）与「结构」（九字段 → 官方六段），**不允许发生在「内容」**。",
    "traceability_rule": "生成后必须能逐段回答『这段信息来自该镜分镜卡的哪个字段』；任何一段无法溯源的内容即判为自由发挥，必须删除或改写为分镜内内容。",
    "multi_reference_anchor": "多参数据（@资产标签与 ref_image／ref_audio）同样以『场景与人物』栏为唯一来源：栏内出现的人物／场景／道具全部绑定，栏内没有的一律不绑；标签编号与 ref_image 字段编号顺序一一对应。"
  },
  "composition_enhancement_rule": {
    "layer_note": "本条是本工作流叠加层的内容要求，叠加在官方字段结构之上，不新增字段、不改字段顺序。",
    "rule_description": "强制将分镜原文中的「场景与人物」板块作为构图描述的核心组成部分，写入 detailed_description（无参考资产时写入 integrated_multimodal_description）的构图段落，保证空间关系与分镜原文零偏差",
    "required_composition_elements": [
      "空间参照物：明确场景内的固定参照物（如茶几、课桌、餐桌），所有人物站位均以此为基准描述",
      "人物站位分布：明确所有在场人物相对于参照物的方位（左侧 / 右侧 / 远侧 / 正中央）",
      "人物在场状态：明确当前镜头出镜人物与背景在场人物，不遗漏、不多余",
      "空间一致性：同场景跨镜头人物相对位置、视线轴线与分镜锁定站位保持完全一致"
    ],
    "standard_writing_template": "构图设定（原分镜场景与人物）：以【参照物名称】为空间参照物，【人物 1】位于画面【方位】，【人物 2】位于画面【方位】……；同场景其余人物按锁定站位处于画面边缘 / 背景 / 画外在场",
    "placement": "Ref2VA 下写在风格句之后、[Shot 1] 描述开篇；正反打 / 过肩镜先写明本镜所处场景拍摄面与面 ID（正面 SCxx_F / 背面 SCxx_B）及该面机位方向所见环境空间，再写参照物与全员站位",
    "boundary": "构图设定的人物对象只能是该镜『场景与人物』字段列出的出镜人物（逐一带 asset_id）；禁止把字段外的人物（含场景人物清单中在场但未入画者）写进构图设定、detailed_description 或任何 Subject"
  },
  "reference_input_binding_rule": {
    "layer_note": "本条是本工作流与接口层的绑定契约，叠加在官方标签规则之上。",
    "binding_order": "资产挂载顺序：人物 → 道具 → 分镜图（分镜图由资产合成、本身已包含场景与站位信息，固定作为 <Picture N> 置于 ref_image 末位）。【v1.24.12 起】场景资产图（@SCxx）不再进入 ref_image —— 场景一致性由分镜图承载。",
    "subject_to_field": "字段编号与提示词标签定义顺序一一对应：<Subject 1>→ref_image_0、<Subject 2>→ref_image_1……；本映射只覆盖人物与道具两类，场景资产图不参与映射（v1.24.12）。分镜图作为 <Picture N> 紧随全部资产之后写入 ref_image 末位",
    "subject_numbering": "Subject 编号顺序必须与该镜分镜脚本『场景与人物』字段中出场人物（角色正式名（asset_id））的书写顺序完全一致，= visible_character_asset_ids 顺序；每个 Subject 必须标注对应 asset_id，禁止只用角色名、简称或别名定义 Subject",
    "ref_image_contract": "ref_image_0~n 顺序必须与 subject_definitions 顺序完全对应；URL 只能按 asset_id 从 08-分镜公网URL/公网素材URL索引.json 精准提取，xem8k5_returned_url 优先；禁止本地路径、空值与未验证 URL",
    "ref_audio_contract": "ref_audio_0~n 顺序必须与本镜说话顺序一致；URL 只能按说话人 voice_id 取对应声线 MP3 的 voice_returned_url；无说话人镜头不传 ref_audio",
    "ref_audio_semantic_ban": "【v1.24.9 新增·P0】传入 ref_audio 的声线 MP3 严禁含可辨识语义。H3 音画同生：当镜头时长未被台词填满（典型如 1-2 字台词 + 4 秒镜头）时，模型会把 ref_audio 内的语音内容当作待补全语料复述出来，表现为『念出别处台词』。实测证据：S01_42 台词『撞。』(0.2s)、镜头 4s，输出复述出声线基准轨内的『明天…试镜』（该词在原提示词正文中零命中）。因此使用 ref_audio 前必须确认其来源声线轨满足 voice_bible_audio_policy.no_semantic_audio_rule；若声线轨含语义，该角色全部有台词镜一律阻断，回 stage5 重出无词声线轨，禁止在 stage7 侧补救。",
    "limits": "【v1.24.10 实测校正】ref_image 上限**按档位区分**：high_8（8分高质量档）单次最多 **6 张**；standard_4（4分低价档）单次最多 **9 张**。ref_audio 两档均为单次最多 **3 个**。ref_image 组成只允许三类：**人物（每镜 ≤3 人，见 stage4 单镜人数上限）→ 道具（≤2）→ 分镜图（1 张，固定末位）**；**场景资产图自 v1.24.12 起不再进入 ref_image**。原『统一 8 张』口径自本版起废止（2026-09-29 AutoDL 实测：high_8 传 ref_image_6 返回『存在未定义的参数』；standard_4 传 ref_image_9 返回同一错误；平台工作流名为『H3六图三音频生视频』『H3多图多音频生视频』）。",
    "ref_image_overlimit_trim_rule": "【v1.24.10 新增·P0 强制裁剪顺序；v1.24.12 组成修订】当本镜 ref_image 总数将超出所在档位上限（high_8 为 6、standard_4 为 9）时，**必须按以下优先级裁剪，且只允许裁道具**：① **人物参考图必进，一张都不能少**；② **分镜图（<Picture N>）必进**——它是构图锚点、同时承载场景与站位信息，固定占 ref_image 末位；③ **道具参考图是可裁剪项**：按道具在画面中的重要性由低到高依次删除，直到总数落入上限。禁止为避免超限而删除人物或分镜图；禁止删除人物/分镜图后保留道具。场景资产图本就不在 ref_image 中（v1.24.12），无需裁剪。若『人物 + 分镜图』本身就超过档位上限（high_8 需 >6、standard_4 需 >9），属真实超限，必须报错停下，不得自行取舍。裁剪后必须同步删除该道具在 subject_definitions / retention_analysis / detailed_description 中的全部引用（含 <Subject N> 定义行），保持标签与实际 ref_image 字段一一对应。",
    "no_text_only_rule": "禁止只把 @文本拼进 prompt 而省略 ref_image 字段；每个多参 @引用必须在请求体中有对应字段且携带同一张已验证公网图",
    "ledger": "每镜生成 subject_id→asset_id→speaker_id→voice_id→ref_image_url→ref_audio_url 对账表并写入 13-工作流文档/API任务索引.json"
  },
  "output_composition_rule": {
    "layer_note": "【最终 H3 提示词的构成 v1.21.32 明确】三者缺一不可：**分镜（内容源）+ 官方要求格式（结构）+ 多参数据（绑定）**。",
    "storyboard_layer": "内容层——全部内容逐字段来自该镜分镜卡九字段（镜号／持续时长／机位／景别／光影／场景与人物／画面内容／运镜方式／音效／台词），映射口径见 storyboard_field_mapping；禁止自由发挥。",
    "official_format_layer": "结构层——严格按官方 Ref2VA 六段顺序与语法（subject_definitions → summary → retention_analysis → detailed_description → overall_soundscape → non_diegetic_music）；字段名、段序、参考标签、时间记号逐字照官方口径，禁止自拟段落名或调换顺序。",
    "multi_reference_layer": "绑定层——@资产标签（@CHxx_角色资产图 ／ @PRPxx_道具资产图；场景资产 @SCxx_F_场景资产图 **自 v1.24.12 起不再参与本层**）与 ref_image_0~n ／ ref_audio_0~n 一一对应，URL 一律取资产索引中已验证的公网地址。",
    "render_order": "渲染顺序（自上而下）：① 本工作流叠加首行「[镜号] | 持续时长：X秒 | resolution: 项目锁定分辨率」（追溯用，位于官方结构之上）→ **②【v1.24.8 台词前置】第二行紧跟首行之下写入「台词：」台词块（该镜全部台词，按本镜说话顺序逐条列出；无台词镜写「台词：无」），让 H3 先读台词、再读其余内容** → ③ 官方六段正文 → ④ 多参绑定清单（@标签与对应 URL）。",
    "dialogue_front_block": "【v1.24.8 台词前置块·强制】首行追溯行的下一行必须以 `台词：` 起头，完整列出该镜所有台词（格式：`台词：{角色名}：{台词原文}`，多条用分号分隔；无台词镜写 `台词：无`）。此块位于官方六段结构之上、紧接首行，作用是让 H3 在读取画面与参数之前先锚定本镜要说的内容；六段正文内的台词规则（<d>[Language] 原文</d>、(Sx)、闭口句）保持不变、照常输出，两处台词内容必须逐字一致。",
    "acceptance": "验收口径三条：格式段可与官方指南逐条对上（六段齐全、顺序正确、标记合法）；内容段可逐句溯源到分镜卡字段；绑定段可与『场景与人物』栏逐位对上。任一不达标即该镜提示词不合格。"
  },
  "hard_requirements_overlay": {
    "layer_note": "本条是本工作流的强制叠加层，叠加在官方字段结构之上：不新增字段、不改字段顺序，只钉死内容完整性与声明项。",
    "R1_label_definition": {
      "rule": "提示词中出现的每一个参考标签（<Subject N> / <Picture N> / <Video N> / <Audio N>）都必须在 subject_definitions 段逐条定义后使用，禁止出现无归属标签。",
      "detail": "音频尤其容易漏：凡在 retention_analysis / detailed_description 里引用了 <Audio N>，就必须在 subject_definitions 里写出对应定义行。",
      "template": "<Audio N> is the voice-timbre reference for {角色名} of <Subject M> (Sx); its fixed voice as locked in the voice bible, 「{该角色 voice_setting 逐字}」.",
      "template_note": "【v1.24.9 删改】原文案结尾的『guides the delivery without copying the original signal』已删除。该句为官方推荐措辞，但实测被证伪——H3 为 CFG-distilled、无 negative prompt，此类『不要做 X』的自然语言声明无法生效；模型会照抄 ref_audio 内容。根治手段不在提示词声明，而在 ref_audio 本身不含语义（见 voice_bible_audio_policy.no_semantic_audio_rule）。",
      "gate_check": "H3FMT-C8"
    },
    "R2_dialogue_closing": {
      "rule": "有台词镜：每条台词 <d>…</d> 之后必须紧跟闭口声明。无台词镜：必须写全员闭口句。",
      "template_dialogue": "After delivering the line, the speaker closes the mouth.",
      "template_silent": "No character speaks in this shot; all visible mouths remain closed with no lip movement.",
      "reason": "H3 在画面内找不到说话人时会强行把口型安给画面内角色（S01_03/S01_04 狰幼崽误开口事故）；闭口句是逐条兜底。",
      "gate_check": "H3FMT-C9"
    },
    "R3_onscreen_text_declaration": {
      "rule": "提示词必须显式声明画面文字纪律：画面内一律不得出现可辨识文字。",
      "template": "The frame stays completely free of subtitles, captions, on-screen text and watermarks: no text is drawn anywhere over the image at any point in the shot.",
      "reason": "本项目匾额/长联/招牌一律只用空白面板或抽象笔触表示；生图阶段已用负面约束压住，视频阶段必须同样声明，否则 H3 会自行烧出乱码字。",
      "gate_check": "H3FMT-C10"
    },
    "R4_aspect_direction_in_body": {
      "rule": "提示词正文必须显式写出画幅方向，且与头部 resolution 行一致：横屏写 horizontal 16:9，竖屏写 vertical 9:16。",
      "detail": "对应 stage_workflow(8).self_checks(1)「提示词正文画面描述已体现对应画幅方向」的机检落地。",
      "gate_check": "H3FMT-C11"
    }
  },
  "workflow_overlay_rules": [
    "【v1.21.35 强制】标签归属/台词闭口句/画面文字纪律/画幅方向四项见 hard_requirements_overlay，机检 H3FMT-C8~C11。",
    "首行携带行：提示词最上方必须写 [镜号] | 持续时长：X秒 | resolution\": 项目锁定分辨率——本条为本工作流追溯用的叠加行，位于官方结构之上；镜号与持续时长严格取自该镜头分镜原文，不得改写。",
    "【v1.24.8 台词前置行·强制】首行携带行的**下一行**必须写台词块：有台词镜写 `台词：{角色名}：{台词原文}`（多条用分号分隔、按本镜说话顺序排列）；无台词镜写 `台词：无`。此块紧贴首行、位于官方六段之上，让 H3 先读台词再读其余内容；文本必须与该镜六段正文中 <d> 内的台词逐字一致，不得改写、增删或翻译。",
    "固定声线：台词行按 <Subject N> (Sx), with [固定声线描述], says with [当前语气]: <d>[Language] 台词原文</d> 组织；[固定声线描述] 必须从 02-角色/03-音色圣经与基准音轨/固定声线圣经.json 逐字读取，禁止 AI 自行编写或改写；固定声线跨镜逐字复用；<d> 内只放语言标签与台词原文；实际音色由该 voice_id 的声线 MP3 经 ref_audio 锁定，与文字声线描述保持一致。",
    "【v1.24.9 声线轨无词口径】本条与固定声线文字设定配套：stage5 锁定的声线 MP3 必须为『无词音色轨』（无词长元音／气息／轻咳／轻笑／简单拟声），不得承载任何台词或可辨识语义。固定声线文字设定（voice_setting）描述的是音色特征，不要求与音频内容逐字对应；音频只负责提供音色，不负责提供内容。",
    "【v1.24.9 短台词镜风险提示】台词极短（如单字、两字）而镜头时长明显长于台词实际时长的镜头，是 ref_audio 语义污染的高发场景——模型会用 ref_audio 内容补全未被台词填满的时长。此类镜头生成后必须复听确认无编造语音；若出现编造，先查该角色声线轨是否含语义，而非在提示词层面加声明（自然语言『不要念』等价声明在 H3 上无效）。",
    "画外音按画面为准（offscreen_dialogue_dropped_by_frame_rule）：说话人 asset_id 不在该镜 visible_character_asset_ids 中时，该台词不写入提示词、不创建 <Subject N>、不传其 ref_audio，该镜按无台词镜处理并记录丢弃明细；旁白（无对应画面角色）不受本条限制，走 off-screen narrator 句式。背景：H3 会把口型强行安给画面内角色，实测文字声明 no lip-sync 无效。",
    "无台词镜：明确写 No character speaks in this shot; all visible mouths remain closed with no lip movement，且不写任何 <d> 块、不传 ref_audio。",
    "禁止首尾帧模式：本工作流 stage7 不使用 I2VA / FL2VA / L2VA，也不使用 first_frame / last_frame 参数（见 api_integration.video_api.content_rules）。",
    "多参超限合成镜：镜头标记 multi_reference_overlimit_composite=true 时，视频请求只传该镜第二阶段最终分镜图 final_storyboard_url 作为唯一 ref_image，禁止垫加任何人物、场景、道具资产。",
    "【v1.24.10 常规超限与合成镜的区别】本规则的 multi_reference_overlimit_composite 仅适用于『必进项本身就超限』的极端合成镜（分镜图已把全部信息合成进去）。常规镜头若仅因道具多而超限，**必须走 reference_input_binding_rule.ref_image_overlimit_trim_rule 裁道具**，不得退化为只传分镜图——人物参考是身份一致性的保证，能进就必须进；**空间与场景一致性由分镜图承载**，自 v1.24.12 起不再传场景资产图。",
    "声音字段纪律：overall_soundscape 不重复对白；本项目全程无 BGM 时 non_diegetic_music 固定写 N/A。",
    "禁止脑补：禁止添加分镜中没有的人物入场、表情、物品、特效、冲突或台词；禁止只输出剧情梗概。"
  ],
  "core_output_rules": [
    "格式唯一依据是官方 MiniMax H3 提示词规范：字段名、字段顺序、章节结构逐字照抄官方写法，禁止改名、翻译、调序、省略，禁止自拟段落名或勾选式填空。",
    "描述主体统一使用英文；台词、歌词、画面内可见文字保留原始语言不变。",
    "有参考资产输出官方 Ref2VA 六段（subject_definitions / summary / retention_analysis / detailed_description / overall_soundscape / non_diegetic_music）；无参考资产输出官方 T2VA 三字段（integrated_multimodal_description / overall_soundscape / non_diegetic_music）。",
    "summary 必须以方括号任务类型前缀开头（reference generation 等），多类型用「 + 」连接且不重复，且不得引入新标签。",
    "retention_analysis 必须使用官方固定英文保留标记：可见内容 fully_preserved / partially_preserved / attribute_transfer / strong_reference；音频 fully_copy / partially_copy / reference / strong_reference；不得写中文、不得写 (Sx)。",
    "detailed_description 必须按播放顺序逐镜描述，含 [Shot N] 标记、切镜时间与 {风格 + 构图 + 主体 + 环境 + 动作 + 运镜 + 声音 + 台词} 完整要素；风格用 1–2 句英文写在 [Shot 1] 之前。",
    "运镜必须写成镜头内自然英文动作句并含运动类型（+ 需要时的幅度与速度），使用官方运镜词表；禁止只写中文运镜词、禁止把标签堆在句尾。",
    "参考标签先定义后使用：所有 <Subject N> / <Picture N> / <Video N> / <Audio N> 在全部章节中保持同一含义，不得中途换号、不得出现无归属标签。",
    "台词必须嵌入描述段内并用 <d>[Language] 原文</d> 标注；声线与语气写在 <d> 之外；原文逐字保留不翻译、不改写。",
    "每条 ref_image_0~n 与 ref_audio_0~n 必须实际携带已验证公网 URL，与提示词内标签定义顺序、说话顺序一一对应；禁止只写 @文本。",
    "无台词镜头必须明确标注全员唇部闭合、无口型动作；禁止自动生成脑补对白。",
    "overall_soundscape 仅总结环境音与动作音效，不重复任何台词；non_diegetic_music 无配乐时写 N/A；禁止在 non_diegetic_music 使用抽象情绪词。",
    "描述总时长必须与请求的视频时长严格匹配（官方 4–15 秒；本工作流按 H3 接口档位：high_8 为 1–15 秒、standard_4 为 1–10 秒）。",
    "禁止输出剧情梗概；每镜必须完整包含构图设定、人物动作、镜头运镜、环境音效与对应台词五大要素。"
  ],
  "standard_workflow": [
    "识别输入类型（有无参考资产）并判定生成模式：无参考资产 → T2VA 三字段；有参考资产 → Ref2VA 官方六段。",
    "读取对应模式的官方字段顺序与章节语法，逐字确认字段名与顺序未被改写。",
    "解析多参 @引用为官方标签：人物/道具资产 → <Subject N>（带 asset_id）、分镜图 → <Picture 1>；先定义后使用。",
    "写 subject_definitions：逐条一行定义被引用内容、其角色与主要特征，Subject 编号与『场景与人物』出场顺序一致。",
    "写 summary：以方括号任务类型前缀开篇，概括目标视频与引用关系，不引入新标签。",
    "写 retention_analysis：对每个引用标签给出一行官方保留标记与理由。",
    "写 detailed_description：先 1–2 句英文风格句，再写构图设定（照 composition_enhancement_rule），然后按播放顺序逐镜写画面、动作、运镜、声音与台词，运镜使用官方词表。",
    "写 overall_soundscape 与 non_diegetic_music，遵守两字段边界。",
    "校验字段顺序、字段名逐字一致、标签一致性、保留标记合法性、台词与 <d> 语法、时长匹配、（Sx）映射一致、ref_image/ref_audio 字段完整。",
    "输出最终标准 H3 提示词，并在最上方写入本工作流要求的 [镜号] | 持续时长：X秒 | resolution 追溯行。",
    "【v1.24.8 台词前置】在追溯行的下一行写入台词块（`台词：{角色名}：{台词原文}`，多条分号分隔；无台词镜写 `台词：无`），与六段正文 <d> 内台词逐字一致；台词块先于官方六段出现。"
  ]
}
```

⛔ 分镜图参考强制（v1.24.28，P0，全链路）：任何一次视频生成——首次生成 / 失败重发 / 抽卡 / 全路重做 / 单镜返工——
   该镜视频提示词的 ref_image 清单中**必须含有本镜自己的分镜图**（`@S0x_xx_分镜图`，URL 与 stage6.5 索引同源）。
   **只要有一镜缺分镜图，整批一律不得提交**：不是逐镜跳过、不是先发后补、不是事后补齐。
   提交前必须跑 `gates/h3_video_ref_binding_gate.py` 且 REFBIND-C1（每镜必含分镜图）与 REFBIND-C8（生成器入口护栏）PASS；
   生成脚本入口另有一道同判据的硬拒绝护栏（SBRM_GUARD），**两处独立成立、缺一不得提交**。
   分镜图一旦重出（内容改 / 资产换版 / 光照·场景修正），该镜旧视频一律作废、必须带新分镜图重出。
**⛔ 分镜图即场景参考（v1.24.31，P0）：本板块把『分镜图』当作场景参考使用**——场景一致性与空间关系由本镜分镜图承载，因此**场景资产图（@SCxx / SCxx_F / SCxx_B）不得进入 ref_image**；ref_image 组成只允许「人物 → 道具 → 分镜图」三类（分镜图固定末位）。提交前必须**逐镜全量**（不抽样）读取该镜分镜『场景与人物』栏作为唯一绑定来源：栏内人物 → `<Subject N>` + ref_image、栏内道具 → 道具资产图 + ref_image、场景由分镜图承担；栏内没有的一律不得参考。
   唯一真源：standards/storyboard_reference_mandatory_policy.json（SBRM-1）。

## 台词行的硬约束（v1.24.36 补充）
1. 提示词文件**除六段正文外，不得在开头或任何位置另起一行『台词：…』**——台词只出现在 detailed_description 的 `<Subject N> … says with …: <d>[Language] 台词原文</d>` 内，且与该镜分镜卡『台词』字段逐字一致。
2. `[固定声线描述]` **必须逐字取自 `02-角色/03-音色圣经与基准音轨/固定声线圣经.json`**；禁止 AI 自拟、概括或改写，禁止在声线描述里夹带人物设定（如国籍、年龄、身份），声线字段内只放声线本身。
3. [当前语气] 逐字取自分镜卡台词行括号内『丨』之后的语气词，不得改写、不得省略。

## 焦点转移镜头的画面描述标准写法（v1.24.37，导演 2026-10-20 口径）

**适用范围**：凡本镜存在焦点起点与焦点终点不同（移焦 / 跟焦 / 镜头横移带出新人 / 焦点先 A 后 B），一律按本式写。

**强制五段结构，顺序不得调换：**

1. **说话人声明**：首句一句点明「本镜说话的人是谁」，不放别的信息。
2. **时间段切分**：用 `1-2S`、`3-8S` 这类**秒数区间**把镜头切成阶段，**一个阶段只讲一件事**；时段加起来等于本镜持续时长。
3. **原焦点段（第一段）**：只写焦点上那**一个**主体的景别、位置（画面左/右/中）、身体动作、表情、以及**视线落点**（看画面外哪个方向）；本段**不得出现第二个主体**。
4. **焦点移动段（第二段）**：写清①镜头/焦点**怎么移**（"镜头开始右移"），②新主体**怎么入画**——必须给**入画路径**（例：先肩线 → 再侧脸 → 最后整张脸进画并停住），③入画后**停在哪里**。
5. **入画后的动作与视线顺序（第三段）**：按**先后顺序**逐条写——先看谁 → 说什么 → 头/身怎么转 → 再看谁 → 说完什么；**每换一个对象就重写一次视线落点**。

**硬性禁止：**
- 禁止开场就写"两人都在画面内"——焦点转移镜的起点只能有一个人。
- 禁止用"随后""接着"含糊过渡而不给**秒数区间**。
- 禁止用一句概括多个动作（如"她激动地反驳"），必须拆成可执行的动作序列。
- 新主体入画必须写**具体路径**，不许只写"她也出现了"。

**范例（S02_39，导演原文，作为标准样本）：**
> 本镜说话的人是我。1-2S开场画面里只有黑人大伯一人：中近景取他上半身，他站在柜台前画面左侧，一手捂嘴、肩膀抖着、噗嗤笑出来，眼睛弯着、视线看向画面右侧（画面右缘外）。3-8S镜头开始右移，我站在大伯右边，随着镜头右移逐渐把我露出来——先肩线、再侧脸，最后整张脸进画并停住；我先眼睛看着左侧大伯的脸、视线落在他的眼睛上，拧着眉冲他喊一句；接着头一甩、转向右侧画面外的店员小姐、眼睛看着她的脸，嗓门再拔高、连着喊完后面两句。
