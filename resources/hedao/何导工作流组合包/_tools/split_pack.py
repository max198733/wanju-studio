# -*- coding: utf-8 -*-
"""何导工作流组合包 环节化拆分器 v2.1.0

背景：源单文件 md 已失效（C:\\黛西\\技能组\\ 仅剩 config），pack_build.py 无法运行。
     现唯一真源 = workflow.skeleton.json（1.5.36）。本脚本把单体骨架切成环节化结构。

产物：
  core/00-core.json        红线层：违反即报废的贯穿规则（每环节必读，约 21K）
  core/01-support.json     支撑层：运行配置/闸门总则/目录结构/执行环境/引用索引（用到才读）
  core/02-contracts.json   环节间交接契约（每环节必读本环节 in/out）
  stages/S1..S7-*.json     7 份环节骨架：core 锚点 + 本环节正文 + 本环节专属 gate_refs
  manifest.json            per-skeleton sha256 + 聚合 hash
  index.json               指向新文件
  README.md                环节化说明

设计取舍（v2.1.0 相对 v2.0.0）：
  v2.0.0 把完整 core 内联进 7 份骨架 → 每份背 61.5K 冗余，S2 剧本从 2.6K 虚胖到 77K。
  v2.1.0 改为：core 独立成文件，骨架只带 core_anchor（sha256 + 必读章节清单）。
  原因：贯穿规则的目的是「不能漏」，不是「必须物理复制」。用强制首读 + sha 校验同样不漏，且不产生 7 倍冗余。
  若导演坚持物理内联，把 INLINE_CORE 置 True 即可（体积会回到 v2.0.0 的量级）。

原则：内容逐字搬运。唯一改写是 stage7 P34（原文指向已砍掉的 stage8）。
"""
import json, hashlib, os, datetime, re, shutil

ROOT = r"F:\何导工作流组合包"
# 源快照移出根目录：根目录曾放一个 413K 的 workflow.skeleton.json，执行体容易误当现行骨架读
SOURCE_DIR = os.path.join(ROOT, "_source")
SOURCE_NAME = "workflow-v1.5.36-source.json"
SKEL = os.path.join(SOURCE_DIR, SOURCE_NAME)
PACK_VERSION = "2.1.1"
GENERATED = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
INLINE_CORE = False   # True = 把红线层全文内联进每份骨架（导演要求物理复制时改这里）

d = json.load(open(SKEL, encoding="utf-8"))

# 已废弃闸门：stage8 返工环节被导演砍掉，该 gate 不再属于任何环节
DEPRECATED_GATES = {"stage_8_interaction_gate.py"}


def kb(n):
    return round(n / 1024, 1)


def jbytes(o):
    return len(json.dumps(o, ensure_ascii=False).encode())


def sha(o):
    return hashlib.sha256(json.dumps(o, ensure_ascii=False, sort_keys=True).encode()).hexdigest().upper()


def wjson(path, obj):
    p = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    return p


def by_num(n):
    for s in d["stage_workflow"]:
        if float(s["stage_number"]) == float(n):
            return s
    raise KeyError(f"stage {n} not found")


GE = d.get("gate_enforcement", {})

# ---------------------------------------------------------------- 1. core 红线层
REDLINE_KEYS = [
    ("scope", "适用范围与来源边界"),
    ("execution_discipline", "执行纪律：不许自创、不许静默简化、不许事后合规"),
    ("global_rules", "全局规则：阶段顺序、不跳步、原文保留、并发、连续性"),
    ("state_management", "状态文件与状态流转"),
    ("missing_input_protocol", "输入缺失协议"),
    ("rollback_and_revision", "回滚与版本管理（返工环节已砍，回滚保留给 S3-S7 内部用）"),
    ("self_check_protocol", "自检协议与状态映射"),
    ("credential_policy", "密钥策略"),
]
core_red = {
    "layer": "redline",
    "core_id": "CORE-REDLINE",
    "pack_name": "何导工作流组合包",
    "pack_version": PACK_VERSION,
    "source_workflow_version": d.get("skill_version", "?"),
    "generated_at": GENERATED,
    "role": ("红线层：任何环节、任何批次、任何镜次都不得违反。"
             "本文件是唯一真源，禁止在环节骨架里另存副本并手改。改规则只改这里，然后重跑 _tools/split_pack.py。"),
    "read_rule": "每环节开工第一件事读本文件全文。已在本会话读过且 sha256 未变的，不必重读。",
    "sections": {},
}
for k, desc in REDLINE_KEYS:
    if k in d:
        core_red["sections"][k] = {"desc": desc, "content": d[k]}
RED_SHA = sha(core_red)

# ---------------------------------------------------------------- 2. core 支撑层
SUPPORT_KEYS = [
    ("local_execution_environment", "本地执行环境的坑（bash/powershell/删除/图像源）"),
    ("project_layout", "项目目录结构与命名（每环节写文件都要对照）"),
]
core_sup = {
    "layer": "support",
    "core_id": "CORE-SUPPORT",
    "pack_name": "何导工作流组合包",
    "pack_version": PACK_VERSION,
    "source_workflow_version": d.get("skill_version", "?"),
    "generated_at": GENERATED,
    "role": ("支撑层：不属红线，但只要在本机动手就会用到。按 by_stage 提示决定是否读，"
             "读到过一次即可复用，不必每环节重读。"),
    "read_rule": "S1 全读；其他环节先看 by_stage，命中才读对应章节。",
    "sections": {},
}
for k, desc in SUPPORT_KEYS:
    if k in d:
        core_sup["sections"][k] = {"desc": desc, "content": d[k]}

# runtime_control：支撑层保留**全文**（含 commands/purpose/update_process），保证与原文逐字一致；
# S1 另存一份指令表副本（runtime_commands），因为改推进方式/换引擎就在 S1 执行，不该让执行体跳文件。
RC = d.get("runtime_control", {})
rc_read = RC
# S1 只需指令表与改配置流程（commands/purpose/update_process），配置字段结构留在支撑层按需读
rc_cmd = {k: v for k, v in RC.items() if k in ("commands", "purpose", "update_process")}
core_sup["sections"]["runtime_control"] = {
    "desc": "运行配置：字段含义、引擎短号解析、中途换引擎影响清单、运行中改推进方式的流程",
    "content": rc_read,
}

# gate_enforcement 拆：通用总则 + stage_gate_map 留在支撑层，各 gate_ref 按环节分发
GATE_REF_KEYS = ["pipeline_face_gate_ref", "cast_frame_gate_ref", "asset_reference_chain_ref",
                 "download_atomicity_gate_ref", "h3_prompt_format_gate_ref",
                 "h3_video_ref_binding_gate_ref", "video_prompt_ref_composition_gate_ref"]
ge_general = {k: v for k, v in GE.items() if k not in GATE_REF_KEYS}
core_sup["sections"]["gate_enforcement"] = {
    "desc": "闸门总则：脚本位置、产物、覆盖口径、证据要求、阈值来源、严重级、交互闸门、无闸门阶段规则。本环节用哪些闸门见骨架 gates / gate_refs。",
    "content": ge_general,
}

# 引用索引 + 版本叙述
core_sup["refs"] = {
    "skills": d.get("skills_ref", {}),
    "api": d.get("api_ref", {}),
    "standards": d.get("standards_ref", {}),
    "note": "只给位置与用途；正文不内联，用到才按单源规则读对应文件。",
}
core_sup["by_stage"] = {
    "local_execution_environment": "全部环节都要（本机跑命令就会踩坑），读到过一次即可",
    "project_layout": "全部环节都要（写文件必须对照目录与命名）",
    "runtime_control": "S1 必读；S3 读 video_engine/seedance_model；S7 读 video_engine 与对应引擎参数；其余环节按需",
    "gate_enforcement": "全部环节都要（哪些闸门在骨架 gates 字段）",
    "refs": "S1 读一次建索引认知；之后用到具体技能/接口时直接按路径读",
}
SUP_SHA = sha(core_sup)

# 按环节分发的 gate_ref
GATE_REF_BY_STAGE = {
    "S3": ["pipeline_face_gate_ref", "cast_frame_gate_ref"],
    "S5": ["pipeline_face_gate_ref", "asset_reference_chain_ref"],
    "S6": ["asset_reference_chain_ref", "download_atomicity_gate_ref"],
    "S7": ["h3_prompt_format_gate_ref", "h3_video_ref_binding_gate_ref",
           "video_prompt_ref_composition_gate_ref", "download_atomicity_gate_ref"],
}
# 支撑层章节按环节的必读清单
SUP_MUST_BY_STAGE = {
    # 注意：只能写 core/01-support.json 里 sections 的真实 key，'refs' 不在 sections 内，另由 S1 的 refs_index 字段承载
    "S1": ["local_execution_environment", "project_layout", "runtime_control", "gate_enforcement"],
    "S2": ["local_execution_environment", "project_layout"],
    "S3": ["local_execution_environment", "project_layout", "runtime_control", "gate_enforcement"],
    "S4": ["local_execution_environment", "project_layout", "gate_enforcement"],
    "S5": ["local_execution_environment", "project_layout", "gate_enforcement"],
    "S6": ["local_execution_environment", "project_layout", "gate_enforcement"],
    "S7": ["local_execution_environment", "project_layout", "runtime_control", "gate_enforcement"],
}

wjson("core/00-core.json", core_red)
wjson("core/01-support.json", core_sup)

# ---------------------------------------------------------------- 3. contracts
contracts = {
    "contracts_id": "CONTRACTS",
    "pack_version": PACK_VERSION,
    "generated_at": GENERATED,
    "purpose": "7 份环节骨架彼此不可见，只靠本文件交接。开工前读本环节 in 并逐项确认实物存在，收工前按 out 交付。",
    "rule": ("任一 out 未按 path+schema 落盘，下一环节有权拒收并写输入缺失清单。"
             "禁止口头交接，禁止『在上下文里带过去』，禁止下一环节自己补上游产物。"),
    "chain": [
        {"from": "S1", "to": "S2", "artifacts": [
            {"name": "运行配置", "path": "13-工作流文档/运行配置.json", "schema": "runtime_config",
             "must_contain": ["video_engine", "advance_mode", "project_style", "target_duration_seconds", "project_resolution"],
             "note": "target_duration_seconds 是 S3 时长校验的目标值，缺它 S3 无法开工。"},
            {"name": "目录结构与命名规则", "path": "项目根（00-故事大纲文档 ~ 13-工作流文档）", "schema": "project_layout",
             "must_contain": ["13-工作流文档", "01-剧本", "06-分镜", "10-成片"],
             "note": "目录与命名按导演要求归 S1；S2 起只按既有目录写，不得自建目录或改名。"}]},
        {"from": "S2", "to": "S3", "artifacts": [
            {"name": "剧本正文", "path": "01-剧本/*.md", "schema": "script_markdown",
             "must_contain": ["场景划分", "人物", "动作", "台词"], "frozen": "S3 起不得改动剧本正文"}]},
        {"from": "S3", "to": "S4", "artifacts": [
            {"name": "场次分镜卡", "path": "06-分镜/02-场次分镜卡/*.md", "schema": "storyboard_card",
             "must_contain": ["镜号", "持续时长", "机位", "景别", "光影", "场景与人物", "画面内容", "运镜", "音效"]},
            {"name": "场景人物清单", "path": "06-分镜/01-分镜管线/场景人物清单.json", "schema": "scene_roster",
             "must_contain": ["scene_id", "asset_id", "正式名", "站位"]},
            {"name": "分镜总时长统计", "path": "06-分镜/01-分镜管线/分镜总时长统计.json", "schema": "duration_stat"},
            {"name": "说话人ID映射表", "path": "02-角色/04-说话人ID映射表/说话人ID映射表.json", "schema": "speaker_map",
             "must_contain": ["speaker_id", "voice_id", "asset_id"]}]},
        {"from": "S4", "to": "S5", "artifacts": [
            {"name": "定妆照与子形态图", "path": "02-角色/01-定妆照/", "schema": "image_files"},
            {"name": "场景与道具图", "path": "03-场景/、04-参考素材/01-道具/", "schema": "image_files"},
            {"name": "生图提示词", "path": "04-参考素材/03-资产提示词/", "schema": "prompt_files"},
            {"name": "声音圣经与基准音轨", "path": "02-角色/03-音色圣经与基准音轨/", "schema": "voice_bible",
             "must_contain": ["voice_id", "声线文字设定", "基准MP3"]}]},
        {"from": "S5", "to": "S6", "artifacts": [
            {"name": "分镜图提示词", "path": "07-分镜提示词/", "schema": "prompt_files"},
            {"name": "分镜静态图", "path": "08-分镜静态图/", "schema": "image_files"}]},
        {"from": "S6", "to": "S7", "artifacts": [
            {"name": "公网素材URL索引", "path": "08-分镜公网URL/公网素材URL索引.json", "schema": "public_url_index",
             "must_contain": ["asset_id", "xem8k5_returned_url", "verified"],
             "hard_rule": "S7 只接受 verified=true 的 URL；任一绑定找不到 verified URL 即阻断该镜"},
            {"name": "分镜图册", "path": "08-分镜图册/", "schema": "album_html"}]},
        {"from": "S7", "to": None, "artifacts": [
            {"name": "成片视频", "path": "10-成片/", "schema": "video_files",
             "must_contain": ["文件 >10KB", "容器头签名正确", "可播放"],
             "note": "本工作流终点。不剪辑、无返工环节。"}]},
    ],
    "excluded": {
        "stage8_revision_confirmation_and_redo": "导演决定砍掉返工环节，出片即交付。rollback_and_revision 协议保留在红线层，供 S3-S7 内部回滚。",
        "full_pass_review": "原由 stage8 收口的全片复核未纳入任何环节（导演决定不设卡点）。跨环节一致性（角色名统一、总时长对账、台词归属）由导演人工把关。",
    },
}
wjson("core/02-contracts.json", contracts)

# ---------------------------------------------------------------- 4. 工序段归类
S4_PHASES = [
    ("3a", "建组期", "定组类型与叙事目的、建场景人物清单、角色建档、锁站位。只读这一段。",
     [0, 1, 2, 3, 8, 11, 12, 15, 20, 29, 30, 32, 35, 36, 43, 45, 46]),
    ("3b", "填卡期", "写九字段与画面内容、台词、景别机位、朝向、微表情、细节镜。只读这一段。",
     [4, 5, 6, 7, 9, 10, 13, 14, 21, 22, 23, 24, 25, 26, 27, 28, 31, 33, 37, 38, 39, 41, 42, 44, 47, 48]),
    ("3c", "校验期", "跑闸门、逐镜自检、时长核对、全量通读。只读这一段。",
     [16, 17, 18, 19, 34, 40, 49]),
]
S7_PHASES = [
    ("7a", "提示词生成期", "读分镜母版与公网URL索引、按引擎路由技能、写提示词、组装多参绑定。只读这一段。",
     list(range(0, 24)) + [29, 30, 33, 35, 36, 38, 39, 41, 42, 43, 44]),
    ("7b", "提交前闸门", "发起任何视频请求前必跑的三道闸门。只读这一段。", [31, 40, 46, 47, 48]),
    ("7c", "提交与出片期", "建任务、轮询、单发无重试、下载落地三合一。只读这一段。", [24, 25, 26, 27, 28, 32, 37, 45]),
    ("7d", "收尾交付", "全部镜头落盘校验通过后交付。只读这一段。", [34]),
]
PATCHES = {
    ("stage7", 34): ("【收尾·本环节即终点】本工作流的最终环节就是本环节：全部镜头视频通过自检并写入 `10-成片` 后，"
                     "标记本环节 completed 并交付。**返工环节（原 stage8）已砍掉，不存在后续阶段**；"
                     "发现问题的处理方式是由导演在本环节内直接指定重做哪几镜，重做走红线层的 rollback_and_revision 协议。"),
}

FULL_FILM_KW = ["全片", "全量", "种类数", "占比", "总时长", "多样性", "配比", "所有镜头", "全剧", "组数", "抽样"]

SPECS = [
    {"id": "S1", "name": "立项与运行配置", "stages": [1, 2],
     "purpose": "把项目建起来（目录结构与命名规则）、把运行配置问清写死。本环节之后不再追问引擎/分辨率/时长，也不再改目录命名。",
     "extra": {"startup_interaction": d.get("startup_interaction", {}), "runtime_commands": rc_cmd,
               "refs_index": {"file": "core/01-support.json", "field": "refs",
                              "read": "建项目时读一次，认下 skills/ api/ standards/ 的路径与用途；之后用到哪个再按路径读，不要预读正文。"}}},
    {"id": "S2", "name": "剧本", "stages": [3],
     "purpose": "用户上传剧本，或按剧本技能生成剧本。只出剧本，不算时长、不拆镜。",
     "note": "目录与命名规则（原 stage2）已在 S1 定死；本环节只按既有目录写 01-剧本，不得自建目录或改名。"},
    {"id": "S3", "name": "分镜拆解", "stages": [4], "phased": S4_PHASES,
     "purpose": "把剧本拆成场次分镜卡。最重的环节，按镜头组批次推进，每批内走建组→填卡→校验三段。"},
    {"id": "S4", "name": "资产与声音", "stages": [5],
     "purpose": "抽资产、写生图提示词、生成定妆照/场景/道具图、生成声音圣经与基准音轨。"},
    {"id": "S5", "name": "分镜图", "stages": [6], "purpose": "写分镜图提示词、生成每镜分镜图。"},
    {"id": "S6", "name": "图册与COS上传", "stages": [6.5, 6.6],
     "purpose": "把分镜图与资产图上传腾讯 COS 拿公网 URL，同时生成本地分镜图册；两件事在本环节内同步推进。",
     "note": "图册（原 stage6.6）按导演要求并入本环节，与 COS 上传同步进行。"},
    {"id": "S7", "name": "出视频", "stages": [7], "phased": S7_PHASES,
     "purpose": "写视频提示词、跑提交前闸门、发起生成、轮询下载。不剪辑，出片即交付，无返工。"},
]

SKILLS_HINT = {
    "S1": [], "S2": ["skills/script_skill.md"],
    "S3": ["skills/storyboard_router.md（先路由）",
           "skills/storyboard_h3.md | storyboard_general.md | storyboard_seedance25.md（只读一套）"],
    "S4": ["skills/image_prompt_skill.md"], "S5": ["skills/image_prompt_skill.md"], "S6": [],
    "S7": ["skills/video_prompt_router.md（先路由）",
           "skills/video_prompt_h3.md | video_prompt_generic.md | video_prompt_seedance25.md（只读一套）"],
}
API_HINT = {
    "S1": [], "S2": [], "S3": [], "S4": ["api/image_api.json"], "S5": ["api/image_api.json"],
    "S6": ["api/policies.json（COS 上传）"],
    "S7": ["api/video_api_h3.json | video_api_wan3_0.json | video_api_grok.json | video_api_seedance.json（只读当前引擎一个）"],
}
GATE_EXTRA = {
    # S4 原先顶层 gates 为空，但正文 P16/P17/P18 三次要求跑闸门（v2.1.1 修正）
    "S4": ["gates/stage_5_asset_generation_gate.py（生成完成后必跑：确认两面齐套、无遗漏场景/道具）",
           "gates/asset_download_atomicity_gate.py（P17 明确要求：确认无『已登记URL但磁盘无对应文件』条目）"],
    "S3": ["gates/stage_4_storyboard_generation_gate.py（写入分镜卡之前必跑，PASS 才许落盘）",
           "gates/storyboard_cast_frame_consistency_gate.py（『场景与人物』三类一致性）",
           "gates/pipeline_scene_face_consistency_gate.py（场景面映射）"],
    "S5": ["gates/stage_6_image_binding_gate.py（发起图像生成前）",
           "gates/pipeline_scene_face_consistency_gate.py"],
    "S6": ["gates/asset_download_atomicity_gate.py（URL 落地与索引登记）"],
    "S7": ["gates/h3_video_prompt_format_gate.py（必跑）",
           "gates/h3_video_ref_binding_gate.py（发起任何视频请求前）",
           "gates/video_prompt_ref_composition_gate.py（第二道）",
           "gates/asset_download_atomicity_gate.py（收尾前）",
           "gates/one_shot_generation_gate.py（单发无重试）"],
}
# S4 的闸门原先只写在 process 正文里（P16/P17/P18），顶层 gates 漏登记，
# 导致执行体按 gates 字段办事时会漏跑资产闸门。现改为双重来源合并。


def collect_gates(sts, sid):
    """闸门分两类，避免把『正文里提到过』误当成『本环节要跑』：
    必须跑（gates）= stage_gate_map 映射的该 stage 主闸门 + GATE_EXTRA 人工补充
    仅提及（gates_mentioned）= 正文出现但不属主闸门的，是否执行以规则原文为准
    """
    primary = []
    gmap = GE.get("stage_gate_map", {})
    for st in sts:
        g = gmap.get(st["stage_id"])
        if g and g not in primary:
            primary.append(g)
    desc = {}
    for line in GATE_EXTRA.get(sid, []):
        mm = re.match(r"gates/([A-Za-z0-9_\-]+\.py)\s*(.*)", line)
        if mm:
            desc[mm.group(1)] = mm.group(2).strip("（） ")
            if mm.group(1) not in primary:
                primary.append(mm.group(1))
    gates = []
    for n in primary:
        if n in DEPRECATED_GATES:
            continue
        gates.append(f"gates/{n}（{desc[n]}）" if desc.get(n) else f"gates/{n}")
    blob = json.dumps(sts, ensure_ascii=False)
    mentioned = []
    for m in re.findall(r"gates/([A-Za-z0-9_\-]+\.py)", blob):
        if m not in primary and m not in DEPRECATED_GATES and m not in mentioned:
            mentioned.append(m)
    return gates, mentioned


# 这些字段已单独处理，其余字段一律进 stage_policies（原先被静默丢弃 32.5K 结构化策略块）
SKIP_STAGE_KEYS = {"stage_id", "stage_number", "name", "purpose",
                   "required_inputs", "process", "self_checks"}

# ---------------------------------------------------------------- 5. 生成骨架
summary = []
for spec in SPECS:
    sts = [by_num(n) for n in spec["stages"]]
    skel = {
        "skeleton_id": spec["id"],
        "skeleton_version": PACK_VERSION,
        "pack_version": PACK_VERSION,
        "source_workflow_version": d.get("skill_version", "?"),
        "generated_at": GENERATED,
        "name": spec["name"],
        "stage_numbers": spec["stages"],
        "purpose": spec["purpose"],
        "core_anchor": {
            "rule": ("本环节执行前必须已读 core/00-core.json 全文，且其 sha256 与下列值一致。"
                     "core 是唯一真源，不在本文件内复制，避免 7 份副本各自漂移。"),
            "redline": {"file": "core/00-core.json", "sha256": RED_SHA,
                        "sections_must_obey": list(core_red["sections"].keys())},
            "support": {"file": "core/01-support.json", "sha256": SUP_SHA,
                        "sections_must_read": SUP_MUST_BY_STAGE[spec["id"]]},
            "contracts": {"file": "core/02-contracts.json",
                          "read": ["本环节 in", "本环节 out"]},
        },
    }
    if INLINE_CORE:
        skel["core_anchor"]["redline_inlined"] = core_red["sections"]
    if spec.get("note"):
        skel["note"] = spec["note"]

    skel["load_policy"] = {
        "order": [
            "1) 读 core/00-core.json 全文（红线层，必读，一次）",
            "2) 读 core/01-support.json 的 sections_must_read 所列章节（一次，可跨环节复用）",
            "3) 读 core/02-contracts.json 本环节的 in / out",
            "4) 版本比对：manifest.json → pack_version + core_sha256（=core_anchor.redline.sha256）+ skeletons.%s.sha256" % spec["id"],
            "5) 读本文件：先看 phase_plan / stages，再按当前工序只读那一段",
            "6) stage_policies 是本环节的硬策略块（引擎路由、时长算法、URL 规则、图册规则等），做判定时才查对应 key，不必逐条背",
            "7) 用到技能才读 skills/；用到接口才读 api/ 并从 ../config 取密钥",
            "8) 跑 gates 字段列出的闸门",
        ],
        "forbid": ["禁止预读其他环节骨架", "禁止一次性把本文件所有 phases 塞进上下文",
                   "禁止在 core 之外另存红线规则副本并手改"],
    }
    skel["contracts"] = {
        "in": next((c["artifacts"] for c in contracts["chain"] if c["to"] == spec["id"]), []),
        "out": next((c["artifacts"] for c in contracts["chain"] if c["from"] == spec["id"]), []),
    }

    if spec.get("phased"):
        st = sts[0]
        pnum = "stage%d" % int(float(st["stage_number"]))
        phases, used = [], set()
        for pid, pname, pdesc, idxs in spec["phased"]:
            rules = []
            for i in idxs:
                txt = st["process"][i]
                if (pnum, i) in PATCHES:
                    txt = PATCHES[(pnum, i)]
                rules.append(txt)
                used.add(i)
            phases.append({"phase_id": pid, "name": pname, "read_rule": pdesc,
                           "rules": rules, "rule_count": len(rules), "bytes": jbytes(rules)})
        missing = [i for i in range(len(st["process"])) if i not in used]
        if missing:
            raise RuntimeError(f"{spec['id']} 有 process 未归类: {missing}")
        skel["phases"] = phases
        skel["batch_plan"] = {
            "batch_unit": "镜头组",
            "batch_size_rule": "开工时按本环节总组数切批，建议每批 8-12 组，使单批上下文可控；批内按 phase_plan 顺序走完再进下一批。",
            "phase_plan": [{"order": i + 1, "phase_id": p["phase_id"], "name": p["name"],
                            "read": p["read_rule"], "bytes": p["bytes"]}
                           for i, p in enumerate(phases)],
            "cross_batch_state": "每批结束把已完成组号/镜号写进 13-工作流文档/阶段状态.json 的 batch_progress；下一批先读它定起点。",
            "forbid": ["禁止一批用下一批的规则", "禁止把上一批的组重做（除非走 rollback 协议）",
                       "禁止在批内校验时跑 scope=full_film 的自检项（做完全部批次才跑）"],
        }
    else:
        skel["stages"] = [{"stage_number": st["stage_number"], "stage_id": st["stage_id"],
                           "name": st["name"], "purpose": st.get("purpose", ""),
                           "required_inputs": st.get("required_inputs", []),
                           "process": st.get("process", []),
                           "self_checks_count": len(st.get("self_checks", []))} for st in sts]

    # 切片型骨架没有 stages[] 数组，stage 的身份与输入声明会丢（stage4 的 5 项、stage7 的 12 项曾丢失）
    if spec.get("phased"):
        skel["stage_meta"] = [{"stage_number": st["stage_number"], "stage_id": st["stage_id"],
                               "name": st["name"], "purpose": st.get("purpose", ""),
                               "required_inputs": st.get("required_inputs", []),
                               "self_checks_count": len(st.get("self_checks", []))} for st in sts]

    # 阶段级结构化策略块（bgm_policy / engine_routing_policy / url_rules / album_rules 等）
    # 原先只搬 process+self_checks，这些块全部丢失（32.5KB）。整体按 stage 保留，不强行切进工序段。
    stage_policies = {}
    for st in sts:
        extra = {k: v for k, v in st.items() if k not in SKIP_STAGE_KEYS}
        if extra:
            stage_policies[st["stage_id"]] = extra
    if stage_policies:
        skel["stage_policies"] = stage_policies

    if "extra" in spec:
        skel["interaction"] = spec["extra"]

    checks = []
    for st in sts:
        for i, c in enumerate(st.get("self_checks", [])):
            checks.append({"id": f"{st['stage_id']}#{i}", "text": c, "p0": "P0" in c,
                           "scope": "full_film" if any(k in c for k in FULL_FILM_KW) else "batch"})
    if checks:
        # 自检正文只存一份，另给分组索引（避免同一批文本重复三遍撑大文件）
        skel["self_checks"] = {
            "count": len(checks),
            "items": checks,
            "p0_ids": [c["id"] for c in checks if c["p0"]],
            "full_film_ids": [c["id"] for c in checks if c["scope"] == "full_film"],
            "p0_count": sum(1 for c in checks if c["p0"]),
            "full_film_count": sum(1 for c in checks if c["scope"] == "full_film"),
            "how_to_use": ("批内只查 scope=batch 且 p0=true 的项（按 p0_ids 与 items 的 scope 交叉）；"
                           "全部批次做完后再查 full_film_ids。逐条必过，任一 P0 不过即不得标记 completed。"),
        }

    g_must, g_mentioned = collect_gates(sts, spec["id"])
    skel["gates"] = g_must
    if g_mentioned:
        skel["gates_mentioned"] = {
            "list": g_mentioned,
            "rule": "这些闸门在本环节规则正文或策略块里被提到，但不在 stage_gate_map 的必跑清单内。是否执行以对应规则原文为准，不要因为出现在这里就无条件跑。",
        }
    gate_refs = GATE_REF_BY_STAGE.get(spec["id"])
    if gate_refs:
        skel["gate_refs"] = {k: GE[k] for k in gate_refs if k in GE}
    skel["skills_hint"] = SKILLS_HINT[spec["id"]]
    skel["api_hint"] = API_HINT[spec["id"]]

    fn = f"stages/{spec['id']}-{spec['name']}.json"
    wjson(fn, skel)
    size = os.path.getsize(os.path.join(ROOT, fn))
    skel["size_bytes"] = size
    wjson(fn, skel)
    size = os.path.getsize(os.path.join(ROOT, fn))

    summary.append({"id": spec["id"], "name": spec["name"], "file": fn, "stages": spec["stages"],
                    "bytes": size, "phases": [(p["phase_id"], p["name"], kb(p["bytes"])) for p in skel.get("phases", [])],
                    "self_checks": skel.get("self_checks", {}).get("count", 0),
                    "p0": skel.get("self_checks", {}).get("p0_count", 0)})

# ---------------------------------------------------------------- 6. 源快照
# v2.1.1: 源快照不再写回根目录（根目录此前留着一个 413K 的 workflow.skeleton.json，执行体容易误读）。
# 源文件本体保持原样放在 _source/，只记 sha 供回溯。
SRC_BYTES = os.path.getsize(SKEL)
SRC_SHA = hashlib.sha256(open(SKEL, "rb").read()).hexdigest().upper()

# ---------------------------------------------------------------- 6.5 历史叙述归档
# 版本叙述不进程（占用上下文且不影响执行），但一条不能丢，全部归档到 docs/changelog.json。
# 注意：source_version_note 里描述的『画面内容承上启下结构』已于 v1.24.17 废止，
#       且 S3 正文与自检里有独立的承接规则（逐字搬运），故本条只是历史。
os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
wjson("docs/changelog.json", {
    "note": "v1.x 单体骨架时代的版本叙述与已排除内容，保留备查，不参与执行。执行时不必读本文件。",
    "source_workflow_version": d.get("skill_version"),
    "source_version_note": d.get("source_version_note", ""),
    "version_note": d.get("version_note", ""),
    "version_history_ref": d.get("version_history_ref", ""),
    "excluded_original_workflow_content": d.get("excluded_original_workflow_content", []),
})

# ---------------------------------------------------------------- 7. manifest
files = []
for dp, _dn, fns in os.walk(ROOT):
    for fnm in sorted(fns):
        fp = os.path.join(dp, fnm)
        rel = os.path.relpath(fp, ROOT).replace("\\", "/")
        if rel == "manifest.json" or rel.startswith("_tools/") or rel.startswith("_source/"):
            continue
        files.append({"path": rel, "bytes": os.path.getsize(fp),
                      "sha256": hashlib.sha256(open(fp, "rb").read()).hexdigest().upper()})
files.sort(key=lambda x: x["path"])
agg = hashlib.sha256("|".join(f"{x['path']}:{x['sha256']}" for x in files).encode()).hexdigest().upper()

skeletons = {}
for s in summary:
    fp = os.path.join(ROOT, s["file"])
    skeletons[s["id"]] = {
        "name": s["name"], "file": s["file"], "stage_numbers": s["stages"], "bytes": s["bytes"],
        "sha256": hashlib.sha256(open(fp, "rb").read()).hexdigest().upper(),
        "core_sha256": RED_SHA,
    }
wjson("manifest.json", {
    "pack_name": "何导工作流组合包", "pack_version": PACK_VERSION,
    "identity": {
        "skill_name": d.get("skill_name"), "skill_version": d.get("skill_version"),
        "skill_description": d.get("skill_description"), "language": d.get("language"),
        "note": "原骨架顶层标识，供把本包当 skill 挂载时使用。",
    },
    "source_workflow_version": d.get("skill_version", "?"), "generated_at": GENERATED,
    "structure": "core(红线+支撑+契约) + 7 份环节骨架",
    "version_lock_rule": ("任一环节开工前：读 manifest.pack_version + core_sha256 + skeletons.<ID>.sha256，"
                          "与项目 13-工作流文档/阶段状态.json 记录比对；不一致则暂停并提示确认。"
                          "改规则后必须重跑 _tools/split_pack.py 并递增 pack_version。"),
    "core_sha256": RED_SHA, "support_sha256": SUP_SHA, "aggregate_sha256": agg,
    "file_count": len(files), "skeletons": skeletons,
    "source_snapshot": {"path": f"_source/{SOURCE_NAME}", "bytes": SRC_BYTES, "sha256": SRC_SHA,
                        "note": "v1.5.36 单体骨架原样留存，仅供回溯。执行时禁止读取；改规则请改 core/00-core.json 后重跑拆分器。"},
    "deprecated_gates": sorted(DEPRECATED_GATES),
    "deprecated_gates_note": "stage8 返工环节已砍，该闸门不属于任何环节，不要调用。",
    "excluded_from_manifest": ["_tools/", "_source/"], "files": files,
})

# ---------------------------------------------------------------- 8. index
idx = {"pack_version": PACK_VERSION, "source_workflow_version": d.get("skill_version", "?"),
       "generated_at": GENERATED,
       "purpose": "规则条目 → 文件 + JSON 路径。闸门自检填 workflow_rule 时查本索引。",
       "entries": [
           {"id": "core.redline", "file": "core/00-core.json", "json_path": "sections"},
           {"id": "core.support", "file": "core/01-support.json", "json_path": "sections"},
           {"id": "contracts", "file": "core/02-contracts.json", "json_path": "chain"}]}
for s in summary:
    idx["entries"].append({"id": s["id"], "name": s["name"], "file": s["file"], "stage_numbers": s["stages"]})
    for pid, pname, _ in s["phases"]:
        idx["entries"].append({"id": f"{s['id']}.{pid}", "name": pname, "file": s["file"],
                               "json_path": f"phases[phase_id={pid}].rules"})
    if s["self_checks"]:
        idx["entries"].append({"id": f"{s['id']}.self_checks", "file": s["file"], "json_path": "self_checks"})
idx["excluded_stages"] = {"stage_8_revision_confirmation_and_redo": "导演决定砍掉返工环节，未纳入任何环节"}
idx["excluded_core_sections"] = {"startup_interaction": "归 S1", "version_note": "历史叙述，不进程",
                                 "version_history_ref": "历史叙述，不进程"}

# 原骨架 stage_index 的 body_pointer 指向 stage_workflow 数组，拆分后全部失效。
# 这里给新结构的实际落点，供排查与断点续跑时定位。
_file_of = {s["id"]: s["file"] for s in summary}
idx["original_stage_map"] = []
for sp in SPECS:
    for pos, n in enumerate(sp["stages"]):
        st = by_num(n)
        idx["original_stage_map"].append({
            "stage_number": st["stage_number"], "stage_id": st["stage_id"], "name": st["name"],
            "skeleton": sp["id"], "file": _file_of[sp["id"]],
            "location": (f"phases[{','.join(p[0] for p in sp['phased'])}]" if sp.get("phased")
                         else f"stages[{pos}]"),
            "self_checks_count": len(st.get("self_checks", [])),
            "skill_source": st.get("skill_source"),
        })
idx["original_stage_map_note"] = ("原 stage_index 的 body_pointer 已随结构失效，此表给每段正文的新落点与技能路由来源；"
                                  "stage_8 按导演决定整体排除。")
wjson("index.json", idx)

# index.json 是 manifest 之后才写的，这里回填它的真实 hash 并重算聚合，
# 否则 manifest 记的是上一版 index 的指纹，逐文件对账会报 hash 不符。
_man_path = os.path.join(ROOT, "manifest.json")
man = json.load(open(_man_path, encoding="utf-8"))
_idx_path = os.path.join(ROOT, "index.json")
_idx_entry = {"path": "index.json", "bytes": os.path.getsize(_idx_path),
              "sha256": hashlib.sha256(open(_idx_path, "rb").read()).hexdigest().upper()}
_slot = next((x for x in man["files"] if x["path"] == "index.json"), None)
if _slot is None:
    man["files"].append(_idx_entry)
    man["files"].sort(key=lambda x: x["path"])
    man["file_count"] = len(man["files"])
else:
    _slot.update(_idx_entry)
man["aggregate_sha256"] = hashlib.sha256(
    "|".join(f"{y['path']}:{y['sha256']}" for y in man["files"]).encode()).hexdigest().upper()
wjson("manifest.json", man)
agg = man["aggregate_sha256"]

print("=" * 74)
print(f"pack {PACK_VERSION} | 红线 {kb(jbytes(core_red))}K | 支撑 {kb(jbytes(core_sup))}K | 聚合 {agg[:16]}")
print("=" * 74)
for s in summary:
    ph = "  ".join(f"{p}({v}K)" for p, _n, v in s["phases"]) if s["phases"] else "—"
    print(f"{s['id']} {s['name']:<12} {s['bytes']/1024:>6.1f} KB  自检{s['self_checks']:>3}/P0 {s['p0']:>2}  {ph}")
print("-" * 74)
print(f"文件 {len(files)} | 旧单体骨架已标记归档")
