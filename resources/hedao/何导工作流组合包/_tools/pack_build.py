# -*- coding: utf-8 -*-
# ============================================================================
# 【已废弃 DEPRECATED】本脚本的源 md（C:/黛西/技能组/）已不存在，跑不起来。
# v2.x 请用 _tools/split_pack.py（从 _source/workflow-v1.5.36-source.json 重建）。
# 保留本文件仅为查证早期打包口径，不要执行。
# ============================================================================
"""何导工作流组合包 打包器 v1.2.9
从单文件源工作流拆分出：骨架 + skills(md) + api(json) + standards(json) + manifest + index + README
用法：python pack_build.py
注意：所有内容逐字搬运，不做人工改写；密钥字段统一 redact。
"""
import json, hashlib, os, re, datetime, shutil

SRC = r"C:\黛西\技能组\何导2026最强无敌雷霆漫剧工作流正式版.md"
CONFIG_DIR = r"C:\黛西\技能组\config"
ROOT = r"C:\黛西\技能组\何导工作流组合包"
# ⚠️ 本值须与骨架 workflow.skeleton.json 的 pack_version 保持一致。
# 注意：自包外真源 md 失效后，元数据刷新已改由 _维护脚本/refresh_pack_meta.py 从骨架读 pack_version，
# 本文件仅作历史保留（SRC 不存在，无法直接运行）。
PACK_VERSION = "1.2.20"
EXCLUDE_FROM_MANIFEST = ["_tools/"]
NOW = datetime.datetime.now().astimezone().isoformat(timespec="seconds")

SECRET_KEY_RE = re.compile(r"(?i)^(api_?key|apikey|key|token|secret|password|access_?key|secret_?key)$")

def collect_secrets():
    """运行期从 config/ 读取所有密钥值，用作字面量替换兜底；工具内不留明文密钥。"""
    vals = []
    if not os.path.isdir(CONFIG_DIR):
        return vals
    for fn in os.listdir(CONFIG_DIR):
        if not fn.endswith(".json"):
            continue
        try:
            cfg = json.load(open(os.path.join(CONFIG_DIR, fn), encoding="utf-8"))
        except Exception:
            continue
        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if SECRET_KEY_RE.match(k) and isinstance(v, str) and len(v.strip()) >= 12:
                        vals.append(v.strip())
                    else:
                        walk(v)
            elif isinstance(o, list):
                for x in o:
                    walk(x)
        walk(cfg)
    return sorted(set(vals), key=len, reverse=True)

SECRET_LITERALS = collect_secrets()

# 技能 → 组合包文件名（三套分镜各自独立成文件，避免混淆）
SKILL_FILE_MAP = {
    # 分镜三套 + 路由
    "storyboard_skill_router": "skills/storyboard_router.md",
    "storyboard_skill": "skills/storyboard_h3.md",
    "storyboard_skill_general": "skills/storyboard_general.md",
    "storyboard_skill_seedance25": "skills/storyboard_seedance25.md",
    # 视频提示词三套 + 路由
    "video_prompt_skill_router": "skills/video_prompt_router.md",
    "video_generation_extension": "skills/video_prompt_h3.md",
    "video_prompt_skill_generic": "skills/video_prompt_generic.md",
    "video_prompt_skill_seedance25": "skills/video_prompt_seedance25.md",
}
STORYBOARD_SIBLINGS = [
    ("embedded_skills.storyboard_skill", "skills/storyboard_h3.md", "H3分镜技能", "video_engine=H3"),
    ("embedded_skills.storyboard_skill_general", "skills/storyboard_general.md", "通用分镜技能", "wan3.0 / grok / seedance2.0 / 其他非H3非seedance2.5引擎"),
    ("embedded_skills.storyboard_skill_seedance25", "skills/storyboard_seedance25.md", "seedance2.5专属分镜技能", "video_engine=seedance 且 seedance_model=seedance2.5"),
]
VIDEO_PROMPT_SIBLINGS = [
    ("embedded_skills.video_generation_extension", "skills/video_prompt_h3.md", "H3视频提示词技能（h3-prompt-writing）", "video_engine=H3（MiniMax 官方结构化提示词：Ref2VA 六段 / T2VA 三字段）"),
    ("embedded_skills.video_prompt_skill_generic", "skills/video_prompt_generic.md", "通用视频提示词技能", "wan3.0 / grok / seedance2.0 / 其他非H3非seedance2.5引擎（分镜原文+多参）"),
    ("embedded_skills.video_prompt_skill_seedance25", "skills/video_prompt_seedance25.md", "seedance2.5视频提示词技能", "video_engine=seedance 且 seedance_model=seedance2.5（时间轴标记的镜头组原文+多参）"),
]

d = json.load(open(SRC, encoding="utf-8"))
for sub in ("skills", "api", "standards"):
    p = os.path.join(ROOT, sub)
    if os.path.isdir(p):
        shutil.rmtree(p, ignore_errors=True)
    os.makedirs(p, exist_ok=True)
os.makedirs(os.path.join(ROOT, "_tools"), exist_ok=True)

def redact(obj, where):
    if isinstance(obj, dict):
        return {k: ({"redacted": True, "note": f"密钥不随组合包分发；请读取 config/ 下对应配置文件（{where}）"}
                     if (SECRET_KEY_RE.match(k) and isinstance(v, str) and v.strip()) else redact(v, where))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact(x, where) for x in obj]
    if isinstance(obj, str):
        for s in SECRET_LITERALS:
            obj = obj.replace(s, "<REDACTED>")
        return obj
    return obj

def wjson(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    return path

def wtext(path, txt):
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)
    return path

# ---------- 1. standards ----------
sb = d["embedded_skills"]["storyboard_skill"]
STANDARD_MAP = {
    "shot_group_definition": ("core_basics", "shot_group_definition"),
    "shot_scale_standard": ("core_basics", "shot_scale_standard"),
    "scene_character_roster_policy": ("core_basics", "scene_character_roster_policy"),
    "shot_group_types": ("", "standard_shot_group_types"),
    "storyboard_specification": ("", "storyboard_specification"),
    "creation_taboo_rules": ("", "creation_taboo_rules"),
    "camera_movement_system": ("", "standard_camera_movement_system"),
    "camera_position_system": ("", "standard_camera_position_system"),
    "continuity_policy": ("", "continuity_policy"),
    "crowd_scene_focus_rule": ("", "crowd_scene_focus_rule"),
    "scene_blocking_policy": ("", "scene_blocking_policy"),
    "shot_reverse_shot_scene_face_policy": ("", "shot_reverse_shot_scene_face_policy"),
    "micro_expression_module": ("", "micro_expression_module"),
    "eye_line_and_gaze_policy": ("", "eye_line_and_gaze_policy"),
    "storyboard_execution_framework": ("", "execution_framework"),
}
std_files, std_index = {}, []
for name, (parent, key) in STANDARD_MAP.items():
    src = sb[parent][key] if parent else sb[key]
    ptr = f"embedded_skills.storyboard_skill.{parent + '.' if parent else ''}{key}"
    doc = {
        "standard_id": f"standards.{name}",
        "source_workflow_version": d["skill_version"],
        "source_pointer": ptr,
        "gate_readable": True,
        "purpose": "供闸门脚本与三套分镜技能按需加载；本文件为该标准的唯一真源，骨架与技能文件均只引用不复制。",
        "payload": redact(src, name),
    }
    std_files[name] = f"standards/{name}.json"
    wjson(os.path.join(ROOT, std_files[name]), doc)
    std_index.append({"id": doc["standard_id"], "file": std_files[name],
                      "json_path": "payload", "source_pointer": ptr})

# ---------- 1.5 拆镜执行总纲（三套分镜共用；渲染后注入三套分镜技能 md 顶部） ----------
FRAMEWORK_KEYS = ["execution_framework", "mandatory_format_rules", "shot_group_closed_set_rule",
                  "camera_movement_closed_set_rule", "prohibited_improvisation", "gate_binding"]
FRAMEWORK_SKILLS = ("storyboard_skill", "storyboard_skill_general", "storyboard_skill_seedance25")


def render_framework(sbobj):
    """把 storyboard_skill 顶部的六个总纲键渲染成 Markdown，注入三套分镜技能 md 顶部。"""
    L = ["## 拆镜执行总纲（三套分镜共用·最高优先级）", "",
         "> 本块由 `_tools/pack_build.py` 从真源 `standards/storyboard_execution_framework.json` 渲染注入；",
         "> `skills/storyboard_h3.md` / `skills/storyboard_general.md` / `skills/storyboard_seedance25.md` 三份文件顶部的本块内容逐字一致。",
         "> **动手拆镜前必须先完整读完本块**，本块优先级高于本技能其余所有条目。",
         "> 本块内的名称与数值一律逐字取用：禁止凭记忆、禁止自创、禁止用近义词替换。", ""]

    ef = sbobj["execution_framework"]
    L += ["### 一、唯一工序：九步（顺序不可调整、不可跳过、不可合并）", "",
          "- **开工前置**：" + ef["read_first"]]
    for st in ef["nine_steps"]:
        L.append("- **" + st["step"] + "**：" + st["action"])
    L += ["", "> " + ef["order_is_mandatory"], "",
          "> " + ef["unit_definition"], "", "> " + ef["closed_set_principle"], ""]

    mf = sbobj["mandatory_format_rules"]
    L += ["### 二、格式强制要求（重点：『场景与人物』栏）", "", "> " + mf["principle"], "",
          "**顶层与组标题**", "", "- " + mf["top_level"], "- " + mf["group_header"], "",
          "**单镜字段顺序（逐镜一致，顺序即下列顺序）**", ""]
    for i, k in enumerate(mf["shot_field_order"], 1):
        L.append(str(i) + ". " + k)
    L += ["", "> " + mf["shot_field_order_note"], "", "**『场景与人物』栏·五条硬规则**", ""]
    sc = mf["scene_character_field"]
    for k in ["priority", "count", "character_id", "scene_id", "face_id", "binding"]:
        L.append("- **" + k + "**：" + sc[k])
    L += ["", "**『场景与人物』栏·明确禁止**", ""]
    for x in sc["forbidden"]:
        L.append("- ⛔ " + x)
    L += ["", "**『画面内容』四条**", ""]
    for k, v in mf["content_field"].items():
        L.append("- **" + k + "**：" + v)
    L.append("")

    gs = sbobj["shot_group_closed_set_rule"]
    L += ["### 三、镜头组形式：全片只能用这六类", "", "> " + gs["rule"], "",
          "| 该组的叙事目的 | 只能用的组类型（逐字照抄） |", "|---|---|"]
    for x in gs["selection_by_purpose"]:
        L.append("| " + x["叙事目的"] + " | " + x["组类型"] + " |")
    am = gs["anti_monotony"]
    L += ["", "> " + gs["selection_rule"], "",
          "- **反单一化（硬约束）**：" + am["rule"],
          "- 为什么：" + am["reason"],
          "- 怎么查：" + am["check"],
          "- " + gs["structure_ref"], ""]

    cm = sbobj["camera_movement_closed_set_rule"]
    L += ["### 四、运镜：全片只能用这八类，且必须落在适用范围", "", "> " + cm["rule"], "",
          "| 运镜（逐字照抄） | 只用在这些镜 |", "|---|---|"]
    for x in cm["applicability"]["map"]:
        L.append("| " + x["movement_name"] + " | " + x["只能用在这些镜"] + " |")
    cma = cm["anti_monotony"]
    L += ["", "> " + cm["applicability"]["principle"], "",
          "> 违规判定：" + cm["applicability"]["violation"], "",
          "- **反单一化·四条硬约束**：" + cma["rule"],
          "- 为什么：" + cma["reason"],
          "- 怎么查：" + cma["check"],
          "- ⚠️ " + cma["contrast_note"], "",
          "- " + cm["level_note"], ""]

    L += ["### 五、禁止自作主张（逐条核对，违反任一条该阶段判 failed）", ""]
    for x in sbobj["prohibited_improvisation"]:
        L.append("- ⛔ " + x)
    L.append("")

    gb = sbobj["gate_binding"]
    L += ["### 六、闸门绑定", ""]
    for k, v in gb.items():
        L.append("- **" + k + "**：" + v)
    L += ["", "---", ""]
    return L


# ---------- 2. skills ----------
SKILL_HEAD = ["skill_name", "applies_to", "exclusive_load_rule", "skill_description", "core_principle"]
skill_index = []
for sname, sobj in d["embedded_skills"].items():
    rel = SKILL_FILE_MAP.get(sname, f"skills/{sname}.md")
    lines = [f"# {sobj.get('skill_name', sname)}", "",
             f"> 技能键：`embedded_skills.{sname}`　|　来源：何导工作流 v{d['skill_version']}",
             f"> 调用时机：**需要时才加载本文件**；工作流骨架只保留指针，不内联本文件正文。",
             f"> 单源规则：本文件是该技能的唯一真源；骨架、其它技能、闸门均只引用不复制。", ""]
    siblings, stitle, srule = None, "", ""
    if sname.startswith("storyboard_skill"):
        siblings, stitle = STORYBOARD_SIBLINGS, "三套分镜技能互斥说明"
        srule = "> 同一项目只加载其中一套，由 `skills/storyboard_router.md` 路由决定；禁止混用、叠加或凭习惯默认。"
    elif sname == "video_generation_extension" or sname.startswith("video_prompt_skill"):
        siblings, stitle = VIDEO_PROMPT_SIBLINGS, "三套视频提示词技能互斥说明"
        srule = "> 同一项目只加载其中一套，由 `skills/video_prompt_router.md` 路由决定；三套**禁止相互调用**、禁止交叉引用字段。"
    if siblings:
        lines += [f"## {stitle}", "", "| 技能 | 文件 | 适用条件 |", "|---|---|---|"]
        for _k, _f, _n, _c in siblings:
            mark = " ← **本文件**" if _f == rel else ""
            lines.append(f"| {_n} | `{_f}`{mark} | {_c} |")
        lines += ["", srule,
                  "> 三套共用同一套标准件（`standards/*.json`）与同一套分镜卡；台词时长规则一致：有台词镜 持续时长 ≥ ceil(字数÷5) + 2 秒。", ""]
        if sname in FRAMEWORK_SKILLS:
            lines += render_framework(sb)
    for k in SKILL_HEAD:
        if k in sobj:
            lines += [f"## {k}", "", str(sobj[k]), ""]
    lines += ["## 技能正文（按原始结构逐项保留）", ""]
    for k, v in sobj.items():
        if k in SKILL_HEAD:
            continue
        if sname == "storyboard_skill" and (k == "core_basics" or k in STANDARD_MAP or k in FRAMEWORK_KEYS):
            continue
        lines += [f"### {k}", "", "```json", json.dumps(redact(v, sname), ensure_ascii=False, indent=2), "```", ""]
    if sname == "storyboard_skill":
        lines += ["## 已抽取到 standards/ 的标准件（本文件不再内联）", "",
                  "| standard_id | 文件 | 原路径 |", "|---|---|---|"]
        for name, (parent, key) in STANDARD_MAP.items():
            lines.append(f"| standards.{name} | `{std_files[name]}` | `embedded_skills.storyboard_skill.{parent + '.' if parent else ''}{key}` |")
        lines += ["", "> 引用方式：编写/校验分镜时读取对应 standards 文件；闸门脚本直接 import 该 JSON，禁止硬编码标准名。", ""]
    wtext(os.path.join(ROOT, rel), "\n".join(lines))
    skill_index.append({"id": f"embedded_skills.{sname}", "file": rel,
                        "load_when": "执行引用该技能的阶段时按需加载"})

# ---------- 3. api ----------
INTERFACE_MAP = {
    "image_api": ("api/image_api.json", "xem8k5_gpt_image_config.json"),
    "video_api": ("api/video_api_h3.json", "minimax_h3_config.json"),
    "video_api_wan3_0": ("api/video_api_wan3_0.json", "wan_video_config.json"),
    "video_api_grok": ("api/video_api_grok.json", "duomi_grok_video_config.json"),
    "video_api_seedance": ("api/video_api_seedance.json", "seedance_video_config.json"),
}
POLICY_KEYS = [k for k in d["api_integration"] if k not in INTERFACE_MAP]
api_out, api_index = {}, []
for k, (p, cfg) in INTERFACE_MAP.items():
    doc = {"api_id": f"api_integration.{k}", "source_workflow_version": d["skill_version"],
           "credential_policy": "本文件不含任何密钥；运行期从与组合包同级的 config/ 目录读取（见 credential_file）。",
           "credential_file": f"../config/{cfg}",
           "payload": redact(d["api_integration"][k], k)}
    wjson(os.path.join(ROOT, p), doc)
    api_out[k] = {"file": p, "credential_file": f"../config/{cfg}"}
    api_index.append({"id": doc["api_id"], "file": p, "json_path": "payload", "credential_file": doc["credential_file"]})
wjson(os.path.join(ROOT, "api/policies.json"),
      {"api_id": "api_integration.policies", "source_workflow_version": d["skill_version"],
       "note": "api_integration 下的策略与配置类条目（非具体接口），集中一处避免碎片化。",
       "credential_policy": "本文件不含任何密钥；密钥统一从 ../config/ 读取。",
       "payload": redact({k: d["api_integration"][k] for k in POLICY_KEYS}, "policies")})
api_out["policies"] = {"file": "api/policies.json", "credential_file": None}
api_index.append({"id": "api_integration.policies", "file": "api/policies.json", "json_path": "payload", "covers": POLICY_KEYS})

# ---------- 4. skeleton ----------
META_KEYS = ["skill_name", "skill_version", "version_note", "version_history_ref", "skill_description",
             "language", "scope", "execution_discipline", "gate_enforcement", "startup_interaction",
             "runtime_control", "global_rules", "missing_input_protocol", "rollback_and_revision",
             "self_check_protocol", "project_layout", "state_management", "excluded_original_workflow_content"]
skeleton = {
    "pack_name": "何导工作流组合包", "pack_version": PACK_VERSION, "pack_generated_at": NOW,
    "source_workflow_file": "C:/黛西/技能组/何导2026最强无敌雷霆漫剧工作流正式版.md",
    "source_workflow_version": d["skill_version"], "source_version_note": d.get("version_note", ""),
    "load_policy": {
        "principle": "开阶段前只读本骨架 + 该阶段正文；技能/接口/标准仅在需要时按其文件加载，禁止预先全量读取。",
        "rule_source_of_truth": "本骨架内的 scope / execution_discipline / gate_enforcement / self_check_protocol / global_rules 与各阶段 self_checks 为唯一执行依据；被抽取的技能、接口、标准以各自文件为唯一真源。",
        "single_source_rule": "每条规则只在其真源文件出现一次：骨架不内联技能与接口正文，技能文件不复制标准件，标准件不复制阶段规则。",
        "storyboard_exclusive_rule": "stage4 先读 skills/storyboard_router.md 路由，再只加载三套分镜中的一套；禁止混用。",
        "load_order_per_stage": [
            "1) 读本骨架，做版本锁比对（manifest.json）",
            "2) 读 stages 正文（在骨架 stage_workflow[i]）",
            "3) 该阶段用到技能时才读 skills/<skill>.md（stage4 先读 storyboard_router.md 再读被选中的那一套）",
            "4) 该阶段用到接口时才读 api/<section>.json，并从 ../config/ 读密钥",
            "5) 闸门脚本按需 import standards/*.json，禁止硬编码标准名"],
    },
    "manifest_ref": "manifest.json", "index_ref": "index.json",
    "skills_ref": {"dir": "skills/", "entries": skill_index},
    "api_ref": {"dir": "api/", "entries": api_out},
    "standards_ref": {"dir": "standards/", "entries": std_index},
}
for k in META_KEYS:
    if k in d:
        skeleton[k] = redact(d[k], "skeleton")
skeleton["credential_policy"] = {
    "rule": "任何密钥只存放于组合包同级的 config/ 目录；组合包内所有文件禁止出现明文密钥。",
    "config_dir": CONFIG_DIR, "files": sorted(os.listdir(CONFIG_DIR)),
    "read_order": "先读 config/ 下对应配置文件；缺失再读同名环境变量；两者皆缺则写输入缺失清单并暂停。"}
skeleton["stage_index"] = [
    {"index": i, "stage_id": s["stage_id"], "stage_number": s["stage_number"], "name": s["name"],
     "skill_source": s.get("skill_source"),
     "self_checks_pointer": f"stage_workflow({i}).self_checks", "self_checks_count": len(s.get("self_checks", [])),
     "body_pointer": f"stage_workflow({i})", "body_in": "workflow.skeleton.json（阶段正文随骨架保留）"}
    for i, s in enumerate(d["stage_workflow"])]
skeleton["stage_workflow"] = [redact(s, "stage") for s in d["stage_workflow"]]
skeleton["embedded_skills_ref"] = "见 skills_ref（技能正文已抽出为 md 文件，需要时加载）"
skeleton["api_integration_ref"] = "见 api_ref（接口正文已抽出为 json 文件，密钥一律从 ../config/ 读取）"
wjson(os.path.join(ROOT, "workflow.skeleton.json"), skeleton)

# ---------- 5. index ----------
idx = {"pack_version": PACK_VERSION, "source_workflow_version": d["skill_version"], "generated_at": NOW,
       "purpose": "规则条目 → 文件 + 路径 的机器可解析索引：闸门自检的 workflow_rule 字段与任何跨文件引用都查本索引。",
       "entries": []}
for i, s in enumerate(d["stage_workflow"]):
    idx["entries"].append({"id": f"stage_workflow({i})", "stage_id": s["stage_id"],
                           "file": "workflow.skeleton.json", "json_path": f"stage_workflow[{i}]"})
    for j, c in enumerate(s.get("self_checks", [])):
        idx["entries"].append({"id": f"stage_workflow({i}).self_checks({j})", "stage_id": s["stage_id"],
                               "text_preview": c[:70], "file": "workflow.skeleton.json",
                               "json_path": f"stage_workflow[{i}].self_checks[{j}]"})
idx["entries"] += skill_index + api_index + std_index
for k in ["gate_enforcement", "self_check_protocol", "global_rules", "scope", "startup_interaction",
          "execution_discipline", "project_layout", "missing_input_protocol", "rollback_and_revision",
          "state_management"]:
    if k in skeleton:
        idx["entries"].append({"id": k, "file": "workflow.skeleton.json", "json_path": k})
wjson(os.path.join(ROOT, "index.json"), idx)

# ---------- 6. README ----------
readme = "\n".join([
    f"# 何导工作流组合包 v{PACK_VERSION}", "",
    f"- 生成时间：{NOW}", f"- 来源单文件：`{SRC}`（v{d['skill_version']}）",
    f"- 生成方式：`_tools/pack_build.py` 自动拆分（内容逐字搬运，未人工改写）", "",
    "## 目录结构", "",
    "| 路径 | 内容 | 什么时候读 |", "|---|---|---|",
    "| `workflow.skeleton.json` | **骨架**：scope / 纪律 / 闸门 / 自检协议 / 全局规则 / 启动与运行控制 / 目录命名 / 全部阶段正文（process + self_checks） | 每次开工前读 |",
    "| `manifest.json` | **版本锁**：pack_version + 逐文件 sha256 + 聚合 hash | 开工前版本比对 |",
    "| `index.json` | **引用定位**：规则条目 id → 文件 + JSON 路径（含每条 self_check） | 自检填 `workflow_rule`、跨文件引用 |",
    "| `skills/storyboard_router.md` | 分镜路由：按引擎选三套分镜中的一套 | **stage4 第一步** |",
    "| `skills/storyboard_h3.md` | **H3分镜技能**（仅 video_engine=H3；**顶部含拆镜执行总纲**） | H3 项目 stage4 |",
    "| `skills/storyboard_general.md` | **通用分镜技能**（wan3.0 / grok / seedance2.0 / 其他非H3非seedance2.5；**顶部含拆镜执行总纲**） | 对应项目 stage4 |",
    "| `skills/storyboard_seedance25.md` | **seedance2.5专属分镜技能**（拆解口径与通用分镜逐字一致；组=一整个视频，组内切镜交模型；运镜一项例外=组级总体运镜；**顶部含拆镜执行总纲**） | seedance2.5 项目 stage4 |",
    "| `skills/video_prompt_router.md` | 视频提示词路由：按引擎选三套中的一套 | **stage7 第一步** |",
    "| `skills/video_prompt_h3.md` | **H3视频提示词技能**（h3-prompt-writing：MiniMax 官方提示词规范——有参考资产=官方 Ref2VA 六段，无参考资产=官方 T2VA 三字段） | H3 项目 stage7 |",
    "| `skills/video_prompt_generic.md` | **通用视频提示词技能**（分镜原文+多参；generic_engine_prompt_rule 唯一真源） | wan3.0 / grok / seedance2.0 / 其他项目 stage7 |",
    "| `skills/video_prompt_seedance25.md` | **seedance2.5视频提示词技能**（时间轴标记的镜头组原文+多参；组内切镜只靠时间区间标注交模型；整组仅一条组级总体运镜） | seedance2.5 项目 stage7 |",
    "| `skills/script_skill.md` / `image_prompt_skill.md` | 剧本 / 生图提示词技能 | 对应阶段按需 |",
    "| `api/*.json` | 接口：image_api、video_api_h3（含 h3_interface_tiers 两档：standard_4 旧接口 / high_8 新接口 z0903）、wan3_0、grok、seedance + policies | 用到该引擎时读一个 |",
    "| `standards/*.json` | 标准件 15 个（**拆镜执行总纲**/组类型/运镜/机位/景别/微表情/站位/正反面/连贯性/多人聚焦/禁忌/分镜规格等） | 闸门直接 import；写分镜时按需读 |",
    "| `gates/*.py` | **专项闸门脚本**（可执行）：**stage4 分镜闸门**、生图多参闸门、stage8 交互闸门 | **stage4 写入分镜卡前** / stage6 生成前 / stage8 收尾前执行；项目内按其 `gate_enforcement.script_location` 落到 `11-工作流脚本/workflow_gates/` |",
    "| `_tools/pack_build.py` | 打包器（改规则后重跑它刷新组合包） | 维护时 |", "",
    "## 专项闸门（gates/）", "",
    "| 闸门 | 覆盖 | 何时执行 | 阻断规则 |", "|---|---|---|---|",
    "| `stage_4_storyboard_generation_gate.py` | STG4-C1 组类型闭集与多样性 / C2 运镜闭集 / C3 运镜适用范围 / C4 运镜反单一化四项（种类数≥min(4,镜数)、单一运镜≤40%、固定≤30%、相邻同运镜连续≤3镜）/ C5 字段格式完整性与顺序 / C6『场景与人物』硬校验，并逐条覆盖 stage4 全部 72 条 self_checks（机检项 + 人工语义项，coverage 口径自校验）。**支持 seedance2.5 组级回落**：组内不逐镜写『运镜方式』时，自动从「组级总体运镜」分段解析运镜类型用于闭集/配比校验（字段完整性同步豁免该字段） | **stage4 写入 `06-分镜/02-场次分镜卡` 之前**（对生成分镜卡的项目执行） | P0/P1 FAIL 即阻断落盘、阻断标记 passed、阻断进入 stage5 |",
    "| `stage_6_image_binding_gate.py` | IMG-BIND-C1 数量一致 / C2 顺序一致 / C3 ID合规 / C4 与API任务索引三处一致 | **stage6 分镜图提示词写入后、发起图像生成之前**（与闸门A 同属生成前闸门） | C1/C2/C3 FAIL 即阻断该镜生成；C4 索引缺失时记 WARNING |",
    "| `stage_8_interaction_gate.py` | STG8-C1 决策记录存在 / C2 三问齐全 / C3 已答问项字段完整 / C4 answer_source=user（无默认值顶替）/ C5 未触发问项有原因 / C6 条件一致性 / C7 成片交付清单内视频真实存在 / C8 收尾前置 / C9 返工已登记回滚记录 / C10 人工清单已回填 evidence | **stage8 逐条提问并收到用户答复、写出决策记录后，标记 completed 之前**（纯交互闸门阶段，见 `gate_enforcement.interactive_gate_rule`） | C1~C10 FAIL 即阻断 stage8 标记 passed/completed；无决策记录时退出码 2 |", "",
    "用法：`python gates/stage_4_storyboard_generation_gate.py --project <项目目录> --version v1`（`--storyboard 06-分镜/02-场次分镜卡/S01_分镜头脚本_v1.md` 可显式指定分镜卡）；",
    "输出 `12-质检/stage_4_storyboard_generation_闸门结果_v{n}.json` 与 `_闸门汇总_v{n}.md`；退出码 0=PASS / 1=有阻断项 / 2=无输入。",
    "",
    "用法：`python gates/stage_6_image_binding_gate.py --project <项目目录> --version v1`（`--shots S01_01,S01_02` 可只查指定镜）；",
    "输出 `12-质检/stage_6_image_binding_gate_闸门结果_v{n}.json` 与 `_闸门汇总_v{n}.md`；退出码 0=PASS / 1=有阻断项 / 2=无输入。", "",
    "用法：`python gates/stage_8_interaction_gate.py --project <项目目录> --version v1`（`--record` / `--delivery` 可显式指定决策记录与交付清单）；",
    "输出 `12-质检/stage_8_revision_confirmation_and_redo_闸门结果_v{n}.json` 与 `_闸门汇总_v{n}.md`；退出码 0=PASS / 1=有阻断项 / 2=无输入。", "",
    "> stage4 分镜闸门已用「合规 13 镜 6 组 + 违规 8 镜 3 组」夹具**实测**：合规组 overall_status=PASS（coverage 72/72 达标、blocking=false）；违规组 overall_status=FAIL，12 类违规全部被准确拦出——自创组类型『拉近特写组』、组类型单一化 66.7%、自创运镜名『缓慢推近』、运镜种类数 2 < min(4,8)、单一运镜占比 87.5% > 40%、相邻同运镜连续 5 镜 > 3、缺景别字段、特写缺『焦点：』标记、战斗组第二镜景别非特写、『场景与人物』人物未带 asset_id / 无 scene_id、台词格式不合规、overall_soundscape 含配乐。另以《末班车》21 镜 10 组同源双版样例（通用版 / seedance2.5 版）实测：两版均 overall=PASS —— 运镜 8 类齐用、固定占比 14.3%、单一运镜最高 23.8%、组类型 5 类且最高占比 40%，四条反单一化约束全部满足；seedance2.5 版组内不逐镜写运镜，改由「组级总体运镜」分段回落解析通过。", "",
    "> 生图多参闸门已用「合规1镜 + 违规3镜（场景名代替ID、漏绑、顺序错、索引不一致）」夹具**实测**：合规镜通过、四类违规全部被准确拦出。",
    "> stage8 交互闸门已用「合规2组（答复否收尾 / 答复是+抽卡+回滚记录）+ 违规9组（缺问项、默认值顶替、时间戳非法、条件不一致、交付清单缺文件、未答复即收尾、无回滚记录、人工清单缺失、n/a 无理由）」夹具**实测**：合规全过、九类违规全部被准确拦出；覆盖口径 workflow_selfcheck_total(8) = 机检 5 + 人工 3 自洽。", "",
    "## 三套分镜技能（互斥，禁止混用）", "",
    "| 技能 | 生效条件 | 拆解口径 | 视频单元 | 关键差异 |", "|---|---|---|---|---|",
    "| H3分镜 | video_engine=H3 | H3 原始口径 | 单镜 | 单镜按接口档位：high_8 为 1-15 秒、standard_4 为 1-10 秒；执行 H3 原生对白句式转换 |",
    "| 通用分镜 | wan3.0 / grok / seedance2.0 / 其他 | 通用口径 | 单镜 | **单镜持续时长下限 4 秒**；不用 H3 余量；不做 H3 句式转换 |",
    "| seedance2.5专属分镜 | video_engine=seedance 且 seedance_model=seedance2.5 | **与通用口径逐字一致**（运镜一项例外，见下） | **镜头组** | 一个镜头组=一个视频=一条组提示词；组总时长 4-30 秒；新增镜头组清单.json；**组内 2-3 镜的运镜合并为一条组级总体运镜** |", "",
    "> **seedance2.5 的差异是视频单元粒度（v1.21.25 起写死）+ 运镜层级（v1.21.26 起写死）**：拆解环节（组类型 / 组内结构 1 主镜+1-2 次镜 / 正反打组上限=说话人数 / 战斗组固定 4 镜 / 景别·机位闭集与配比 / 特写焦点 / 眼神落点 / 连贯性 / 站位锁定 / 组级面绑定）与通用分镜**逐项相同**，不得另立或放宽；seedance2.5 只把「一行视频=一个镜头组」作为视频单元，组内镜头之间的切换交给模型按组内时间轴（`第{S}秒-第{E}秒：`）自行掌控。**运镜一项例外**：组内 2-3 镜的逐镜『运镜方式』合并为组级唯一一条总体运镜，以焦点迁移路径引导镜头移动（八类闭集与 ≤30% 固定镜头配比照常校验）。见 `storyboard_shared_baseline`、`group_internal_transition_rule` 与 `group_aggregate_camera_movement_rule`。", "",
    "> **【拆镜执行总纲 v1.21.27】三套分镜技能文件顶部均注入同一份『拆镜执行总纲』**（真源 `standards/storyboard_execution_framework.json`，由打包器渲染注入，三份逐字一致）：①**九步唯一工序**（读路由→通读剧本→锁场景站位→先出格式框架→定组类型→定组内结构→定运镜→写画面内容→回填场景与人物→自检过闸）；②**格式强要求**（单镜九字段顺序固定；『场景与人物』栏五条硬规则：画面内容优先回填 / 数量一一对应 / 人物带 asset_id / 场景带 scene_id 与面ID / 与 visible 集合一致）；③**六类组形式与八类运镜全部是闭集**，取值逐字取自标准件，禁止自创、禁止自造变体、禁止用近义词；④**禁令 20 条**（禁止自作主张清单）；⑤**闸门绑定**（stage4 闸门必须在写入分镜卡之前 PASS）。", "",
    "> **【根治『全片只写一种运镜』v1.21.27】** 旧闸门只有一条『固定镜头占比 ≤30%』，只防『画面呆板』、防不住单一化（实测反例：全片 65% 为拉近运镜、固定仅 7%，旧闸门放行）。现新增三条独立硬约束，四条**互不替代、必须同时满足**：①运镜种类数 ≥ min(4, 镜数)；②单一运镜名占比 ≤ 40%；③固定运镜占比 ≤ 30%；④相邻镜头连续同一运镜不超过 3 镜。组类型同法：种类数 ≥ min(3, 组数)、单一组类型 ≤ 60%。八类运镜各自还有**适用范围**（环绕=新人物/新道具亮相、穿越障碍物=转场转折、焦点锁定跟拍=战斗高速运动、希区柯克变焦=内心巨变冲击、拉近=焦点引导、拉远=节奏切换铺转场、平移=基础日常、固定=平和无转折），脱离适用范围选运镜即判该镜不合格。", "",
    "> **三套共同规则**：有台词的镜头 持续时长 ≥ ceil(台词正文字数÷5) + 2 秒（1秒5字 + 2秒留白；例：10字→2+2=4秒）。", "",
    "> **特写焦点规矩（v1.21.24 起）**：景别为『特写』的镜头，画面内容开头必须以固定标记写明本镜唯一焦点——`焦点：[焦点对象]（[具体可见状态]）`，禁止泛指（人物/道具/环境/表情）、禁止多焦点、焦点须在画面视觉中心。三套分镜共用 `standards/shot_scale_standard.json` 的 `closeup_focus_rule`，配禁忌第 38 条 + stage4 流程与自检各 1 条。", "",
    "## 三套视频提示词技能（互斥，禁止相互调用）", "",
    "| 技能 | 生效条件 | 提示词形态 | 视频单元 |", "|---|---|---|---|",
    "| H3视频提示词 | video_engine=H3 | **MiniMax 官方结构化提示词**（有参考资产=官方 Ref2VA 六段；无参考资产=官方 T2VA 三字段；字段名/顺序/章节语法以官方 Prompt Writing Guide 为准） | 单镜 |",
    "| 通用视频提示词 | wan3.0 / grok / seedance2.0 / 其他 | **分镜原文 + 多参数据**（分辨率行 + @引用与URL；不改写/不翻译/不套结构） | 单镜 |",
    "| seedance2.5视频提示词 | video_engine=seedance 且 seedance_model=seedance2.5 | **时间轴标记的镜头组原文 + 多参数据**（每镜前 `第S-第E秒：`）；**整组仅一条组级总体运镜**（焦点迁移路径引导镜头移动） | 镜头组 |", "",
    "> 由 `skills/video_prompt_router.md` 路由；三套禁止相互调用、禁止交叉引用字段。`generic_engine_prompt_rule` 的唯一真源是 `skills/video_prompt_generic.md`。", "",
    "> **seedance2.5 组内切镜交模型（v1.21.25 起强制）**：组提示词内组内各镜之间的切换不再单独描述——唯一合法的衔接形式是每镜原文前的 `第{S}秒-第{E}秒：` 时间区间标注，模型在指定秒数切到指定镜；**禁止**自造衔接词 / 过渡语 / 转场描述（如「随后镜头切换至」「紧接着画面转到」「接着切到下一镜」），**禁止**把组内各镜改写成一条连续镜头描述。见 `group_transition_rule` 与 `forbidden`。", "",
    "> **seedance2.5 组级总体运镜（v1.21.26 起强制）**：一个镜头组=一个视频，因此组内 2-3 镜的逐镜『运镜方式』**合并为组级唯一一条总体运镜**——整组不再逐镜各写一个运镜名，而是**通过描述焦点的迁移路径来引导镜头移动**（焦点走到哪，镜头跟到哪），焦点格式沿用 `焦点：[焦点对象]（[该对象在本镜的具体可见状态]）`，按组内时间区间分段并与 `第{S}秒-第{E}秒：` 标注逐段对齐。**闭集与配比不放宽**：总体运镜每一段仍须落在 `standard_camera_movement_system` 八类闭集内，并按归属运镜类型逐镜计入 `camera_movement_ratio`（固定镜头占比 ≤30% 照常强制校验，不得用焦点迁移写法规避）。这是 seedance2.5 与通用分镜在『运镜』一项上的**唯一差异**。见 `group_aggregate_camera_movement_rule`。", "",
    "## H3 接口档位（video_engine=H3 时的启动条件追问）", "",
    "| 档位 | 接口 | 分辨率选项 | 说明 |", "|---|---|---|---|",
    "| `standard_4` 4分低价低质量 | `minimax_h3_image_audio_to_video_v2` | 768p竖 / 1080p竖 / 768p横 / 1080p横 | 原接口，单价低、产出质量较低 |",
    "| `high_8` 8分高质量 | `minimax_h3_z0903` | 768p竖(768*1376) / 768p横(1376*768) / 1088p竖(1088*1920) / 1088p横(1920*1088) / 1440p竖(1440*2560) / 1440p横(2560*1440) | 新接口；**取值必须带 (宽*高) 后缀**，否则以「不在 options 列表中」拒收；实测状态在 QUEUED/RUNNING 间回跳且偶发 FAILED，须内置提交与轮询重试 |", "",
    "> 启动顺序：video_engine → **h3_interface_tier（仅 H3 时追问）** → advance_mode → project_style → h3_resolution（选项组由 h3_interface_tier 决定）。档位写入运行配置 `h3_interface_tier`；stage7 据此选择 create 端点（两档查询端点相同，均为 /result/{task_id}）。", "",
    "## 启动提问的显示规则（选项一律中文）", "",
    "- 选项标签**一律中文展示**（中文在前、一眼可懂）；内部取值写在选项说明栏的「（写入运行配置的值：xxx）」里，供助手写运行配置时原样采用。",
    "- 举例：工作模式选项显示为 **自动 / 手动 / 图册半自动**（内部值 `auto` / `manual` / `album_semiauto`）；H3 接口档位选项显示为 **4分低价档 / 8分高质量档**（内部值 `standard_4` / `high_8`）。",
    "- 例外：当选项键本身就是必须原样写入配置的取值时（分辨率如 `768p横(1376*768)`、画幅如 `16:9`、清晰度如 `480P`），保留取值原文并补中文解释，禁止改写/翻译/简写。",
    "- 禁止把 `auto` / `manual` / `album_semiauto` / `standard_4` / `high_8` 这类内部值当选项名展示给导演。",
    "- 完整口径见骨架 `startup_interaction.option_display_rule`；stage1 有一条自检项校验本条。", "",
    "## 引擎短号表（指定或中途更换模型时用）", "",
    "| 项 | 短号 | 内部取值 |", "|---|---|---|",
    "| 视频引擎 | `1` / `2` / `3` / `4` | H3 / wan3.0（万相3.0）/ grok / seedance |",
    "| H3 接口档位 | `A` / `B` | `standard_4`（4分低价档）/ `high_8`（8分高质量档） |",
    "| grok 型号 | `1` / `2` | `grok`（grok-video）/ `grok1.5`（grok-video-1.5） |",
    "| seedance 型号 | `1` / `2` | `seedance2.0` / `seedance2.5` |", "",
    "- 可组合：`1B` = H3 的 8分高质量档；`2` = 万相3.0；`4-2` = seedance 2.5；`3-1` = grok 的 grok-video。",
    "- 口语也认（见 `runtime_control.engine_alias_map.spoken_lookup`）：想省钱→`1A` 或 `2`；要质量最高→`1B`；要嘴型/声线准→`1`；要长镜头（十几秒以上）→`4-2`；只要一图一镜→`2`；只要 720P 按秒计费→`3`。",
    "- **中途更换**必须走 `runtime_control.engine_switch_rule`：复述当前值 → 复述解析结果 → 完整列出 7 项影响清单 → 等导演明确确认后才写入运行配置。运行指令为**切换视频引擎**。",
    "- 只报引擎短号（如「换成 1」）时引擎已明确，但该引擎专属的档位/型号仍需按启动条件追问规则补问。", "",
    "## 密钥策略", "",
    "- 组合包内**不含任何明文密钥**；打包时 `api_key/token/secret/password` 等字段一律 redact 并指向 `../config/`。",
    f"- 密钥只存于与组合包**平级**的 `config/`：`{CONFIG_DIR}`",
    "- 读取顺序：`config/` 对应配置文件 → 同名环境变量 → 皆缺则写输入缺失清单并暂停。", "",
    "## 版本锁与维护", "",
    "- 版本 = `manifest.pack_version` + `manifest.aggregate_sha256`；开工前与本项目 `13-工作流文档/阶段状态.json` 的 `workflow_version/workflow_md5` 比对。",
    "- **改规则的唯一正确姿势**：改单文件源工作流（唯一真源）→ 重跑 `_tools/pack_build.py` → 递增 `pack_version`。**不要直接改组合包内文件**，会被重跑覆盖。",
    "- `_tools/` 不计入 manifest（避免改工具导致版本号误变）。", "",
])
wtext(os.path.join(ROOT, "README.md"), readme)

# ---------- 7. manifest ----------
files = []
for dp, _dn, fns in os.walk(ROOT):
    for fn in sorted(fns):
        fp = os.path.join(dp, fn)
        rel = os.path.relpath(fp, ROOT).replace("\\", "/")
        if rel == "manifest.json" or any(rel.startswith(x) for x in EXCLUDE_FROM_MANIFEST):
            continue
        files.append({"path": rel, "bytes": os.path.getsize(fp),
                      "sha256": hashlib.sha256(open(fp, "rb").read()).hexdigest().upper()})
files.sort(key=lambda x: x["path"])
agg = hashlib.sha256("|".join(f"{x['path']}:{x['sha256']}" for x in files).encode()).hexdigest().upper()
wjson(os.path.join(ROOT, "manifest.json"), {
    "pack_name": "何导工作流组合包", "pack_version": PACK_VERSION,
    "source_workflow_file": skeleton["source_workflow_file"], "source_workflow_version": d["skill_version"],
    "source_workflow_md5": hashlib.md5(open(SRC, "rb").read()).hexdigest().upper(),
    "generated_at": NOW,
    "version_lock_rule": "任一阶段/跑批开工前：读本 manifest 的 pack_version + aggregate_sha256，与项目 13-工作流文档/阶段状态.json 记录比对；不一致则暂停并提示确认。改规则后必须重跑打包器刷新 manifest 并递增 pack_version。",
    "excluded_from_manifest": EXCLUDE_FROM_MANIFEST,
    "aggregate_sha256": agg, "file_count": len(files), "files": files})

print("SKILLS:", [x["file"] for x in skill_index])
print("API:", [x["file"] for x in api_index])
print("STD:", len(std_files), "FILES:", len(files), "AGG:", agg[:16])
