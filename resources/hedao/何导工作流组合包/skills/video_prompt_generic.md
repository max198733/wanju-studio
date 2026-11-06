# 通用视频提示词技能

> 技能键：`embedded_skills.video_prompt_skill_generic`　|　来源：何导工作流 v1.24.34
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
| H3视频提示词技能（h3-prompt-writing） | `skills/video_prompt_h3.md` | video_engine=H3（MiniMax 官方结构化提示词：Ref2VA 六段 / T2VA 三字段） |
| 通用视频提示词技能 | `skills/video_prompt_generic.md` ← **本文件** | wan3.0 / grok / seedance2.0 / 其他非H3非seedance2.5引擎（分镜原文+多参） |
| seedance2.5视频提示词技能 | `skills/video_prompt_seedance25.md` | video_engine=seedance 且 seedance_model=seedance2.5（时间轴标记的镜头组原文+多参） |

> 同一项目只加载其中一套，由 `skills/video_prompt_router.md` 路由决定；三套**禁止相互调用**、禁止交叉引用字段。
> 三套共用同一套标准件（`standards/*.json`）与同一套分镜卡；台词时长规则一致：有台词镜 持续时长 ≥ ceil(字数÷5) 秒。

## skill_name

通用视频提示词技能

## applies_to

video_engine=wan3.0 / grok / seedance（且 seedance_model=seedance2.0）/ 后续新增的任何非H3、非seedance2.5引擎

## skill_description

把分镜脚本原文与多参数据直接转成视频提示词：不改写、不翻译、不套用任何引擎专属结构，只加分辨率行与多参@引用。


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

## 技能正文（按原始结构逐项保留）

### cos_reference_image_format

```json
{
  "rule": "本技能所有 ref_image / 参考图入参指向的腾讯云COS 对象均为 **WebP**（content-type image/webp），由本地无损母版一次性转码而来（standards/asset_upload_format_policy.json）。提交时按 URL 原样传入即可，**禁止自行下载后转码或压缩**（再编码=二次压缩，只省约 3% 体积却多赔一代画质）；若发现某素材 URL 指向 .png/.jpg，说明上游未按契约转码，按 stage6.5 rehost_rule 用本地无损母版重转 WebP 重传后再提交。",
  "why": "COS 下行流量 = 单图体积 × 拉取次数；视频模型每次多参都会整张拉取参考图，故参考图体积是流量的直接乘数。"
}
```

### definition_site_note

```json
"本技能是通用提示词规则 generic_engine_prompt_rule 的唯一真源；工作流其它章节（stage7 process / self_checks / engine_routing_policy、各接口节 create_request）只引用该规则名，不再重复定义正文。"
```

### generic_engine_prompt_rule

```json
"每镜视频提示词直接由分镜脚本原文构成：逐字保留该镜镜号、持续时长、机位、景别、光影、场景与人物、画面内容、运镜方式、音效与台词原文；禁止改写、禁止翻译为英文、禁止转换为 H3 官方结构（T2VA 三字段 / Ref2VA 六段）；提示词最上方写 `[镜号] | 持续时长：X秒 | resolution: <运行配置project_resolution原值>` 行；多参@引用（**@asset_id_角色资产图 → @asset_id_道具资产图 → @分镜图**；【v1.24.13】场景资产图不再参与，与 H3 口径一致）与对应公网URL标注按该镜 image_bindings 顺序原样附在提示词内；除分镜原文、分辨率行与多参引用外不得新增任何约束段落。"
```

### structure

```json
[
  "第1行：`[镜号] | 持续时长：X秒 | resolution: <项目锁定分辨率>`",
  "第2段起：该镜分镜原文逐字（镜号 / 持续时长 / 机位 / 景别 / 光影 / 场景与人物 / 画面内容 / 运镜方式 / 音效 / 台词）",
  "末段：多参@引用与公网URL标注（按 image_bindings 顺序）"
]
```

### dialogue_rule

```json
"台词保持分镜台词格式原文 `XXX（固定声线丨语气）台词：[正文]`，不做任何句式转换、不改写、不翻译。"
```

### time_unit

```json
"以单镜为视频单元（一镜一视频一提示词）；不使用镜头组级提示词、不使用时间轴标注。"
```

### forbidden

```json
[
  "改写、缩写、概括分镜原文",
  "翻译为英文或转换为 H3 三字段/Ref2VA 六段结构",
  "只保留@文本而不携带公网URL",
  "新增分镜原文以外的约束段落或风格描述",
  "以镜头组为单位提交（该粒度仅 seedance2.5 使用）"
]
```

### per_engine_body_map

```json
{
  "wan3.0": "input.prompt=提示词全文；input.img_url=该镜分镜图公网URL；不传 ref_audio",
  "grok": "prompt=提示词全文；aspect_ratio=运行配置project_resolution；quality=720p（固定）；duration=该镜持续时长；image_urls=[该镜分镜图公网URL]；oversea=false；不传 ref_audio",
  "seedance2.0": "model=doubao-seedance-2-0-260128；content[0]={type:text,text:提示词全文}；content[1..n]={type:image_url,image_url:{url:资产图公网URL（人物→道具→分镜图）},role=reference_image}；ratio=运行配置seedance_aspect；resolution=运行配置seedance_resolution小写；duration=该镜持续时长；watermark=false；不传 ref_audio",
  "后续新增引擎": "按其接口字段映射写入同一份提示词全文"
}
```

### self_check_additions

```json
[
  "每镜提示词=分镜脚本原文逐字保留（镜号/持续时长/机位/景别/光影/场景与人物/画面内容/运镜方式/音效/台词齐全）+最上方分辨率行+多参@引用与公网URL标注；无英文改写、无缩写概括、无额外约束段落",
  "运镜方式字段逐字保留其运镜起点与终点（固定运镜写『固定运镜』即可；其余五类写清起于什么、止于什么，跟拍写明焦点是谁），未做改写（v1.22.0）",
  "若该镜为转场镜，其『画面内容』开头的 `转场镜：[类型]｜` 标记已随分镜原文原样保留，未删改（v1.22.0）",
  "未调用任何引擎专属结构（无 H3 官方结构、无时间轴分组标注）",
  "提示词文字部分与该镜分镜卡逐字一致（可机检：去掉分辨率行与多参标注后，正文应能在分镜卡中找到）"
]
```

⛔ 分镜图参考强制（v1.24.28，P0，全链路）：任何一次视频生成——首次生成 / 失败重发 / 抽卡 / 全路重做 / 单镜返工——
   该镜视频提示词的 ref_image 清单中**必须含有本镜自己的分镜图**（`@S0x_xx_分镜图`，URL 与 stage6.5 索引同源）。
   **只要有一镜缺分镜图，整批一律不得提交**：不是逐镜跳过、不是先发后补、不是事后补齐。
   提交前必须跑 `gates/h3_video_ref_binding_gate.py` 且 REFBIND-C1（每镜必含分镜图）与 REFBIND-C8（生成器入口护栏）PASS；
   生成脚本入口另有一道同判据的硬拒绝护栏（SBRM_GUARD），**两处独立成立、缺一不得提交**。
   分镜图一旦重出（内容改 / 资产换版 / 光照·场景修正），该镜旧视频一律作废、必须带新分镜图重出。
**⛔ 分镜图即场景参考（v1.24.31，P0）：本板块把『分镜图』当作场景参考使用**——场景一致性与空间关系由本镜分镜图承载，因此**场景资产图（@SCxx / SCxx_F / SCxx_B）不得进入 ref_image**；ref_image 组成只允许「人物 → 道具 → 分镜图」三类（分镜图固定末位）。提交前必须**逐镜全量**（不抽样）读取该镜分镜『场景与人物』栏作为唯一绑定来源：栏内人物 → `<Subject N>` + ref_image、栏内道具 → 道具资产图 + ref_image、场景由分镜图承担；栏内没有的一律不得参考。
   唯一真源：standards/storyboard_reference_mandatory_policy.json（SBRM-1）。
