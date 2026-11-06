# 视频提示词技能路由

> 技能键：`embedded_skills.video_prompt_skill_router`　|　来源：何导工作流 v1.24.34
> 调用时机：**需要时才加载本文件**；工作流骨架只保留指针，不内联本文件正文。
> 单源规则：本文件是该技能的唯一真源；骨架、其它技能、闸门均只引用不复制。

## 三套视频提示词技能互斥说明

| 技能 | 文件 | 适用条件 |
|---|---|---|
| H3视频提示词技能（h3-prompt-writing） | `skills/video_prompt_h3.md` | video_engine=H3（MiniMax 官方结构化提示词：Ref2VA 六段 / T2VA 三字段） |
| 通用视频提示词技能 | `skills/video_prompt_generic.md` | wan3.0 / grok / seedance2.0 / 其他非H3非seedance2.5引擎（分镜原文+多参） |
| seedance2.5视频提示词技能 | `skills/video_prompt_seedance25.md` | video_engine=seedance 且 seedance_model=seedance2.5（时间轴标记的镜头组原文+多参） |

> 同一项目只加载其中一套，由 `skills/video_prompt_router.md` 路由决定；三套**禁止相互调用**、禁止交叉引用字段。
> 三套共用同一套标准件（`standards/*.json`）与同一套分镜卡；台词时长规则一致：有台词镜 持续时长 ≥ ceil(字数÷5) 秒。

## skill_name

视频提示词技能路由


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

## 技能正文（按原始结构逐项保留）

### purpose

```json
"stage7 生成提示词前，按运行配置选择唯一一套视频提示词技能；三套互斥，禁止混用、禁止相互调用。"
```

### read_rule

```json
"stage7 第一步先读本路由，再只加载被选中的那一套技能；未被选中的两套不得读取其规则、不得引用其字段。"
```

### routing

```json
[
  {
    "condition": "video_engine=H3",
    "skill": "embedded_skills.video_generation_extension",
    "skill_file_hint": "skills/video_prompt_h3.md",
    "display_name": "H3视频提示词技能（h3-prompt-writing，MiniMax 官方结构化提示词：Ref2VA 六段 / T2VA 三字段）"
  },
  {
    "condition": "video_engine=seedance 且 seedance_model=seedance2.5",
    "skill": "embedded_skills.video_prompt_skill_seedance25",
    "skill_file_hint": "skills/video_prompt_seedance25.md",
    "display_name": "seedance2.5视频提示词技能（时间轴标记的镜头组原文+多参）"
  },
  {
    "condition": "其他全部情况（wan3.0 / grok / seedance 且 seedance_model=seedance2.0 / 后续新增引擎）",
    "skill": "embedded_skills.video_prompt_skill_generic",
    "skill_file_hint": "skills/video_prompt_generic.md",
    "display_name": "通用视频提示词技能（分镜原文+多参）"
  }
]
```

### priority_note

```json
"判断顺序自上而下、命中即停：先判 H3，再判 seedance2.5，其余一律走通用视频提示词技能。"
```

### exclusive_rule

```json
"三套技能之间不得相互调用、不得交叉引用字段；同一项目只加载并只执行其中一套。"
```

### record_rule

```json
"路由结果（命中条件与选中技能名）必须写入 13-工作流文档/阶段状态.json 的 stage7 记录，便于回溯。"
```

### three_way_summary

```json
{
  "共用参考图格式契约": "三套视频技能共用同一份 COS 上传图像格式契约（standards/asset_upload_format_policy.json）：ref_image 指向的 COS 对象均为 WebP，由本地无损母版一次性转码而来，绝不二次压缩；身份锚点保原生分辨率、普通参考按档降分辨率。",
  "H3": "MiniMax 官方结构化提示词（有参考资产=官方 Ref2VA 六段；无参考资产=官方 T2VA 三字段；字段名/顺序/章节语法以官方 Prompt Writing Guide 为准）；单镜为视频单元",
  "通用": "分镜原文+多参数据（不转句式、不英文改写、不套 H3 结构）；单镜为视频单元",
  "seedance2.5": "时间轴标记的镜头组原文+多参数据（每镜前带「第S-第E秒」，一组一视频）；组为视频单元；**组内各镜的切换不再单独描述，只靠时间区间标注交给模型掌控**，禁止自造衔接词/过渡语；**整组只有一条组级总体运镜**，以焦点迁移路径引导镜头移动，组内各镜不逐镜写『运镜方式』；**组总时长 ≤28 秒**（v1.22.0）；每段运镜属六类闭集（固定 / 水平·垂直展示 / 拉近 / 拉远 / 环绕 / 跟拍）"
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
