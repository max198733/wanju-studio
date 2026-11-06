#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stage_6_image_binding_gate.py —— 生图多参（参考图绑定）专项闸门

唯一真源：何导工作流 embedded_skills.image_prompt_skill.multi_reference_binding_contract
（组合包内 skills/image_prompt_skill.md）

提示词格式兼容两种写法（自动识别，无需切换）：
  新三段式：[风格前缀词] … / [分镜原文] … 场景与人物：… … / [多参数据] @CH01_角色资产图 <url> …
  旧五项式：【机位】…【场景人物】…【参考图绑定】@CH01_角色资产图…【风格定义】…

本闸门覆盖 5 项可机检断言：
  IMG-BIND-C1 数量一致：@标记去重后数量 = 绑定对象数；人物/场景与【场景人物】字段集合与数量完全一致；无重复、无未知 ID；道具 ≤2
  IMG-BIND-C2 顺序一致：@标记顺序 = 角色（按【场景人物】出场顺序）→ 场景 → 道具，逐位比对
  IMG-BIND-C3 ID 合规：每个@标记匹配 ^@((CH|PRP)\\d{2}|SC\\d{2}(_[FB])?)_(角色|场景|道具)资产图$，
                     且 ID 类型与后缀类型一致（CH→角色、PRP→道具、SC→场景）；禁止用角色名/场景名替代 asset_id
  IMG-BIND-C4 三处一致：与 13-工作流文档/API任务索引.json 中该镜的 ref_image_fields 顺序/数量比对（可选，索引存在时执行）
  IMG-BIND-C5 场景面绑定一致（v1.21.29）：『场景与人物』标注的面ID集合必须等于多参数据中绑定的场景面资产集合；
                     带面标注的镜不得绑基础场景资产，未带面标注的镜也不得绑面资产（防错面、防面标注与绑定脱节）
  IMG-BIND-C6 道具绑定一致（v1.21.31）：『场景与人物』栏中的道具ID（PRPxx）集合必须等于多参数据中的道具资产集合；
                     栏内出现的贯穿全剧道具必须全部绑上，栏内没有的不得增挂（过场道具不生成、不参考），单镜道具 ≤2

输出（遵循 gate_enforcement.outputs 命名）：
  12-质检/stage_6_image_binding_gate_闸门结果_v{version}.json
  12-质检/stage_6_image_binding_gate_闸门汇总_v{version}.md

用法：
  python stage_6_image_binding_gate.py --project "C:/项目目录" [--version v1]
         [--prompt-dir 07-分镜提示词] [--index 13-工作流文档/API任务索引.json]
         [--prompt-suffix _分镜图提示词_v1.md] [--shots S01_01,S01_02]
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检
"""
import argparse, json, os, re, sys, datetime, glob

RE_SCENE_FIELD = re.compile(r"（(SC\d{2}(?:_[FB])?)）")
RE_CHAR_FIELD = re.compile(r"（((?:CH\d{2}(?:_C\d{2})?|PRP\d{2}))）")   # v1.23.0：支持角色子形态
RE_TAG = re.compile(r"@((?:CH\d{2}(?:_C\d{2})?|PRP\d{2})|SC\d{2}(?:_[FB])?)_(角色|场景|道具)资产图")   # v1.23.0：支持角色子形态
RE_TAG_LOOSE = re.compile(r"@[^\s@]+")          # 用于抓“形状不对”的@标记
RE_ID_ONLY = re.compile(r"^((CH\d{2}(?:_C\d{2})?|PRP\d{2})|SC\d{2}(?:_[FB])?)$")   # v1.23.0：支持角色子形态
TYPE_OF_PREFIX = {"CH": "角色", "PRP": "道具", "SC": "场景"}


FIELD_KEYS = ["镜号", "持续时长", "机位", "景别", "光影", "场景与人物", "画面内容", "运镜方式", "音效", "台词"]
STOP = r"(?=\s*[｜|]\s*(?:" + "|".join(FIELD_KEYS) + r")[：:]|\n|\Z)"


def grab_field(text, label):
    """label 传含括号的完整字段名（如【场景人物】），取该字段同一行的值。"""
    m = re.search(re.escape(label) + r"\s*(.+)", text)
    return m.group(1).strip() if m else None


def grab_segment(text, key):
    """新格式：[分镜原文] 段内按 `key：值` 抓取，值截止到下一个 `｜key：` 或行尾。"""
    m = re.search(re.escape(key) + r"[：:]\s*(.+?)" + STOP, text, re.S)
    return m.group(1).strip() if m else None


def grab_section(text, label):
    """抓 [label] 段内容（到下一个 [xxx] 段头或行尾）。"""
    m = re.search(r"\[" + re.escape(label) + r"\]\s*(.+?)(?=\n\s*\[|\Z)", text, re.S)
    return m.group(1).strip() if m else None


def parse_scene_character(txt):
    """兼容新三段式（[分镜原文] 内 `场景与人物：…`）与旧五项格式（【场景人物】…）。"""
    return (grab_segment(txt, "场景与人物")
            or grab_section(txt, "场景人物")
            or grab_field(txt, "【场景人物】")
            or "")


def parse_binding(txt):
    """兼容新三段式（[多参数据] 段）与旧五项格式（【参考图绑定】…）。"""
    return (grab_section(txt, "多参数据")
            or grab_field(txt, "【参考图绑定】")
            or "")


def parse_prompt_file(path):
    txt = open(path, encoding="utf-8").read()
    shot = re.search(r"(S\d{2}_(?:\d{2}|D\d+))", os.path.basename(path))
    return {
        "shot_id": shot.group(1) if shot else os.path.basename(path),
        "file": path,
        "scene_character": parse_scene_character(txt),
        "binding": parse_binding(txt),
        "raw": txt,
    }


def check_shot(sh, index_bindings):
    issues = []
    sc = sh["scene_character"]
    bind = sh["binding"]
    # [项目内修复 2026-09-30] RE_CHAR_FIELD 同时会抓到 PRPxx，但 chars_tag 只统计「角色」后缀的标签，
    # 导致「场景与人物」栏含贯穿道具时 C1 必然误报漏绑；此处把 chars_field 收敛为纯 CH 集合（道具由 C6 专判）。
    chars_field = [x for x in RE_CHAR_FIELD.findall(sc) if x.startswith("CH")]
    scenes_field = RE_SCENE_FIELD.findall(sc)

    tags = [(i, t) for i, t in RE_TAG.findall(bind)]
    loose = RE_TAG_LOOSE.findall(bind)
    chars_tag = [i for i, t in tags if t == "角色"]
    scenes_tag = [i for i, t in tags if t == "场景"]
    props_tag = [i for i, t in tags if t == "道具"]

    # ---------- C3 ID 合规 ----------
    for l in loose:
        if not RE_TAG.match(l):
            issues.append(("IMG-BIND-C3", "fail", f"@标记不合规：{l}（应为 @<asset_id>_角色|场景|道具资产图；禁止用角色名/场景名替代 asset_id）"))
    for i, t in tags:
        if not RE_ID_ONLY.match(i):
            issues.append(("IMG-BIND-C3", "fail", f"asset_id 不合规：@({i})_{t}资产图"))
        else:
            prefix = ("SC" if i.startswith("SC") else ("PRP" if i.startswith("PRP") else i[:2]))
            if TYPE_OF_PREFIX[prefix] != t:
                issues.append(("IMG-BIND-C3", "fail",
                               f"ID 与后缀类型不匹配：@{i}_{t}资产图（{i} 应为 {TYPE_OF_PREFIX[prefix]}资产图）"))
    if len(loose) != len(tags):
        issues.append(("IMG-BIND-C3", "fail", f"存在未被正则识别的@标记：共 {len(loose)} 个，合规 {len(tags)} 个"))

    # ---------- C1 数量一致 ----------
    if not chars_field and not scenes_field:
        issues.append(("IMG-BIND-C1", "fail", "【场景人物】字段为空或未按『角色正式名（asset_id）｜场景正式名（scene_id）』格式书写，无法核对绑定"))
    if len(chars_tag) != len(set(chars_tag)):
        issues.append(("IMG-BIND-C1", "fail", f"角色@标记存在重复：{chars_tag}"))
    if len(scenes_tag) != len(set(scenes_tag)):
        issues.append(("IMG-BIND-C1", "fail", f"场景@标记存在重复：{scenes_tag}"))
    if sorted(chars_tag) != sorted(chars_field):
        miss = [c for c in chars_field if c not in chars_tag]
        extra = [c for c in chars_tag if c not in chars_field]
        issues.append(("IMG-BIND-C1", "fail", f"角色绑定不齐套：漏绑={miss} 多绑={extra}（字段={chars_field} 绑定={chars_tag}）"))
    if sorted(scenes_tag) != sorted(scenes_field):
        miss = [c for c in scenes_field if c not in scenes_tag]
        extra = [c for c in scenes_tag if c not in scenes_field]
        issues.append(("IMG-BIND-C1", "fail", f"场景绑定不齐套：漏绑={miss} 多绑={extra}（字段={scenes_field} 绑定={scenes_tag}）"))
    if len(scenes_tag) > 1:
        issues.append(("IMG-BIND-C1", "fail", f"场景参考图应恰好 1 个（本镜 {len(scenes_tag)} 个）"))
    if len(props_tag) > 2:
        issues.append(("IMG-BIND-C1", "fail", f"道具参考图超过上限 2 个（本镜 {len(props_tag)} 个）"))
    if not chars_tag and not scenes_tag:
        issues.append(("IMG-BIND-C1", "fail", "【参考图绑定】为空：只写@文本而无图片输入或完全未绑定"))

    # ---------- C2 顺序一致 ----------
    if chars_tag != [c for c in chars_field if c in chars_tag] and chars_tag:
        issues.append(("IMG-BIND-C2", "fail", f"角色绑定顺序与【场景人物】出场顺序不一致：绑定={chars_tag} 期望={[c for c in chars_field if c in chars_tag]}"))
    if scenes_tag != [c for c in scenes_field if c in scenes_tag] and scenes_tag:
        issues.append(("IMG-BIND-C2", "fail", f"场景绑定顺序与【场景人物】场景顺序不一致：绑定={scenes_tag} 期望={[c for c in scenes_field if c in scenes_tag]}"))
    ordered = [i for i, _t in tags]
    if ordered != chars_tag + scenes_tag + props_tag:
        issues.append(("IMG-BIND-C2", "fail", f"总顺序不符合『角色→场景→道具』：实际={ordered}"))

    # ---------- C5 场景面绑定一致（v1.21.29） ----------
    face_fields = set(re.findall(r"（(SC\d{2}_[FB])）", sc))
    face_tags = {i for i in scenes_tag if "_" in i}
    if face_fields and face_fields != face_tags:
        issues.append(("IMG-BIND-C5", "fail",
                       f"场景面绑定不一致：『场景与人物』标注面={sorted(face_fields)} 多参绑定面={sorted(face_tags)}"))
    elif face_tags and not face_fields:
        issues.append(("IMG-BIND-C5", "fail",
                       f"多参绑定了面资产 {sorted(face_tags)}，但该镜『场景与人物』未标注面ID（面归属无依据）"))
    elif not face_tags and face_fields:
        issues.append(("IMG-BIND-C5", "fail",
                       f"该镜标注了场景面 {sorted(face_fields)}，但多参绑的是基础场景资产（应用面资产 @SCxx_F/_B_场景资产图）"))

    # ---------- C6 道具绑定一致（v1.21.31） ----------
    prop_fields = set(re.findall(r"（(PRP\d{2})）", sc))
    prop_tags = set(props_tag)
    if prop_fields != prop_tags:
        miss = sorted(prop_fields - prop_tags)
        extra = sorted(prop_tags - prop_fields)
        issues.append(("IMG-BIND-C6", "fail",
                       f"道具参考绑定与『场景与人物』不一致：漏绑={miss} 多绑={extra}"
                       f"（字段={sorted(prop_fields)} 绑定={sorted(prop_tags)}）"))

    # ---------- C4 三处一致（与 API 任务索引比对） ----------
    idx = index_bindings.get(sh["shot_id"]) if index_bindings else None
    if idx is not None:
        n_idx = idx.get("count")
        if n_idx is not None and n_idx != len(tags):
            issues.append(("IMG-BIND-C4", "fail", f"与 API 任务索引不一致：索引记录绑定 {n_idx} 项，提示词@标记 {len(tags)} 项"))
        order_idx = idx.get("asset_ids")
        if order_idx and order_idx != [i for i, _t in tags]:
            issues.append(("IMG-BIND-C4", "fail", f"与 API 任务索引顺序不一致：索引={order_idx} 提示词={[i for i, _t in tags]}"))
    return issues, {"shot_id": sh["shot_id"], "chars_field": chars_field, "scenes_field": scenes_field,
                    "chars_tag": chars_tag, "scenes_tag": scenes_tag, "props_tag": props_tag,
                    "tags": [i for i, _t in tags], "index_checked": idx is not None}


def load_index_tokens(index_path):
    """读取 13-工作流文档/API任务索引.json 中每镜的 image_tokens_consumed。
    v1.24.18：参考图是否真被服务端消费，唯一可靠判据就是响应 usage.input_tokens_details.image_tokens。"""
    import json as _json
    out = {}
    if not os.path.isfile(index_path):
        return out
    try:
        d = _json.load(open(index_path, encoding="utf-8"))
    except Exception:
        return out
    recs = d.get("records") or d.get("tasks") or (d if isinstance(d, list) else [])
    for r in recs:
        if not isinstance(r, dict):
            continue
        sid = r.get("shot_id")
        if not sid:
            continue
        out[sid] = r.get("image_tokens_consumed", r.get("image_tokens"))
    return out


def load_index_bindings(path):
    """从 API任务索引.json 尽力提取每镜的绑定（兼容多种字段命名）；取不到则返回 {}。"""
    if not path or not os.path.isfile(path):
        return {}
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    def walk(o):
        if isinstance(o, dict):
            sid = o.get("shot_id") or o.get("shot")
            if sid and re.match(r"^S\d{2}_(?:\d{2}|D\d+)$", str(sid)):
                rec = {}
                ids = o.get("source_asset_ids") or o.get("asset_ids") or o.get("image_bindings_asset_ids")
                if isinstance(ids, list):
                    rec["asset_ids"] = [str(x) for x in ids]
                    rec["count"] = len(ids)
                elif isinstance(o.get("ref_image_fields"), list):
                    rec["count"] = len(o["ref_image_fields"])
                if rec:
                    out[str(sid)] = {**out.get(str(sid), {}), **rec}
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    walk(d)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--prompt-dir", default="07-分镜提示词")
    ap.add_argument("--prompt-suffix", default="_分镜图提示词_v1.md")
    ap.add_argument("--index", default="13-工作流文档/API任务索引.json")
    ap.add_argument("--shots", default="")
    ap.add_argument("--rule-version", default="")
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    pdir = os.path.join(proj, args.prompt_dir.replace("/", os.sep))
    files = sorted(glob.glob(os.path.join(pdir, f"*{args.prompt_suffix}")))
    if args.shots:
        want = {s.strip() for s in args.shots.split(",") if s.strip()}
        files = [f for f in files if any(w in os.path.basename(f) for w in want)]
    if not files:
        print(f"[gate] 无输入：{pdir} 下未找到 *{args.prompt_suffix}")
        return 2

    index_bindings = load_index_bindings(os.path.join(proj, args.index.replace("/", os.sep)))
    per_shot, all_issues = [], []
    for f in files:
        sh = parse_prompt_file(f)
        iss, info = check_shot(sh, index_bindings)
        per_shot.append(info)
        for cid, sev, msg in iss:
            all_issues.append({"check_id": cid, "shot_id": sh["shot_id"],
                               "file": os.path.relpath(f, proj).replace("\\", "/"), "message": msg})

    # ---- IMG-BIND-C7 参考图真实消费（v1.24.18，P0）----
    # 判据唯一：响应 usage.input_tokens_details.image_tokens。==0 即服务端静默丢弃参考图（HTTP 可能仍是 200）。
    # 本闸门既在「生成前」跑（此时无 token 数据 → SKIPPED），也在「生成后」复核跑（此时强判）。
    _tok = load_index_tokens(os.path.join(proj, args.index.replace("/", os.sep)))
    _c7_hit = False
    if _tok:
        for f in files:
            _sh = parse_prompt_file(f)
            _sid = _sh.get("shot_id")
            if not _sh.get("binding"):
                continue          # 无参考图的镜不适用
            _v = _tok.get(_sid)
            if _v is None:
                _c7_hit = True
                all_issues.append({"check_id": "IMG-BIND-C7", "shot_id": _sid,
                                   "file": os.path.relpath(f, proj).replace("\\", "/"),
                                   "message": "未登记 image_tokens_consumed，无法证明参考图被消费（禁止以「HTTP 200 有图」当作已生效）"})
            elif not isinstance(_v, int) or _v <= 0:
                _c7_hit = True
                all_issues.append({"check_id": "IMG-BIND-C7", "shot_id": _sid,
                                   "file": os.path.relpath(f, proj).replace("\\", "/"),
                                   "message": "image_tokens=%s：参考图被服务端静默丢弃，该镜分镜图作废、阻断进入 stage7（须改走 /v1/images/edits 的 multipart image 逐张重复提交）" % _v})


    # ---- IMG-BIND-C8 单发台账（v1.24.20，P0）----
    # 真源 standards/one_shot_generation_policy.json：
    #   同一 shot_id + image 提交记录数 ≤1，除非有导演授权登记。
    _os_recs = _os_load_records(proj)
    _os_img_hit = False
    if _os_recs is not None:
        from collections import Counter as _OSC
        _os_auth = _os_auth_keys(proj, ("image", "分镜图", "图", "图片", "asset"))
        _os_cnt = _OSC(r.get("shot_id") for r in _os_recs if _os_norm_media(r.get("media_type")) == "image")
        for _sid, _n in _os_cnt.items():
            if _n > 1 and _sid not in _os_auth:
                _os_img_hit = True
                all_issues.append({"check_id": "IMG-BIND-C8", "shot_id": _sid, "file": "",
                                   "message": "分镜图提交 %d 次（>1）且无导演授权——违反 ONE-SHOT 纪律" % _n})

    def mk(cid, label, rule, ok_msg):
        mine = [i for i in all_issues if i["check_id"] == cid]
        return {
            "check_id": cid, "label": label,
            "status": "PASS" if not mine else "FAIL",
            "severity": "P0", "blocking": bool(mine),
            "expected": ok_msg,
            "actual": "全部通过" if not mine else [f"{x['shot_id']}: {x['message']}" for x in mine],
            "evidence": f"{args.prompt_dir}/*{args.prompt_suffix}（共 {len(files)} 镜）",
            "workflow_rule": rule,
            "repair_action": None if not mine else "按提示逐镜修正【参考图绑定】后重跑本闸门；不得带病提交 stage6 生成",
        }

    checks = [
        mk("IMG-BIND-C1", "数量三重一致（@标记去重数=绑定对象数；人物/场景与【场景人物】集合与数量一致；无重复；道具≤2）",
           "embedded_skills.image_prompt_skill.multi_reference_binding_contract.count_consistency_rule",
           "每镜：去重@标记数=绑定对象数，人物/场景与字段完全一致，无重复、无未知ID、道具≤2"),
        mk("IMG-BIND-C2", "顺序三重一致（角色按出场序→场景→道具，逐位比对）",
           "embedded_skills.image_prompt_skill.multi_reference_binding_contract.order_consistency_rule",
           "每镜：@标记顺序 = 角色(按【场景人物】出场序) → 场景 → 道具"),
        mk("IMG-BIND-C3", "ID 合规（正则 ^@((CH\\d{2}(_C\\d{2})?|PRP\\d{2})|SC\\d{2}(_[FB])?)_(角色|场景|道具)资产图$，角色含子形态 CHxx_Cnn；禁止用角色名/场景名替代）",
           "embedded_skills.image_prompt_skill.multi_reference_binding_contract.asset_id_rule",
           "每镜：所有@标记均为合规 asset_id 形式且 ID 与后缀类型一致"),
        mk("IMG-BIND-C4", "与 API 任务索引三处一致（ref_image_fields/source_asset_ids 顺序与数量）",
           "embedded_skills.image_prompt_skill.multi_reference_binding_contract.count_consistency_rule + order_consistency_rule",
           "索引存在时：绑定数量与顺序与提示词完全一致；索引缺失时本项按 SKIPPED 记录"),
        mk("IMG-BIND-C5", "场景面绑定一致（『场景与人物』面ID集合 = 多参数据场景面资产集合）",
           "stage_workflow(5).self_checks(30) + standards.shot_reverse_shot_scene_face_policy.over_shoulder_relation / switch_rule",
           "带面标注的镜必须绑该面资产；未带面标注的镜不得绑面资产；两面不得错配"),
        mk("IMG-BIND-C6", "道具绑定一致（『场景与人物』PRPxx 集合 = 多参数据道具资产集合）",
           "stage_workflow(5).self_checks(34) + skills/image_prompt_skill.md multi_reference_binding_contract.asset_id_rule.prop",
           "栏内出现的贯穿全剧道具必须全部绑上（@PRPxx_道具资产图）；栏内没有的不得增挂；单镜道具 ≤2"),
        mk("IMG-BIND-C8", "单发台账（同一 shot_id 分镜图提交次数 ≤1，除导演授权外）",
           "standards.one_shot_generation_policy.json（v1.24.20；机检 IMG-BIND-C8）",
           "每镜分镜图只允许发起一次付费生成；失败不自动重发；重做须先登记导演授权"),
        mk("IMG-BIND-C7", "参考图真实消费（有参考图的镜 image_tokens 必须 > 0）",
           "api/image_api.reference_consumption_contract.pass_rule + stage_workflow(5).self_checks(参考图真实消费)",
           "凡绑定参考图的镜：响应 usage.input_tokens_details.image_tokens > 0 且已写入 API任务索引的 image_tokens_consumed；==0 即参考图被静默丢弃"),
    ]
    if not index_bindings:
        _c4 = [c for c in checks if c["check_id"] == "IMG-BIND-C4"][0]
        _c4["status"], _c4["actual"], _c4["blocking"] = "WARNING", "API任务索引未找到或未登记 asset_ids，本项未执行（其余四项已执行）", False
    if _os_recs is None:
        _c8 = [c for c in checks if c["check_id"] == "IMG-BIND-C8"][0]
        _c8["status"], _c8["actual"], _c8["blocking"] = "SKIPPED", "尚无生成台账（未开始生成时按未执行处理）", False
    if not _tok:
        _c7 = [c for c in checks if c["check_id"] == "IMG-BIND-C7"][0]
        _c7["status"], _c7["actual"], _c7["blocking"] = "SKIPPED", "尚无 image_tokens_consumed 记录（生成前预检；生成后复核时本项为 P0 强判）", False

    # ---------- IMG-BIND-C9 分镜图重出 ⇒ 该镜旧视频作废（v1.24.28，P0） ----------
    # 依据 standards/storyboard_reference_mandatory_policy.json 的 downstream_invalidation：
    # 分镜图一旦重出（内容改 / 资产换版 / 光照·场景修正），该镜此前的视频不得沿用。
    # 判据：分镜图文件 mtime 晚于同镜视频文件 mtime ⇒ 视频是用旧图产物，须作废重出。
    try:
        import glob as _g9
        _imgs = {}
        for _f in _g9.glob(os.path.join(proj, "08-分镜静态图", "*_v*.png")):
            _sid = os.path.basename(_f).split("_v")[0]
            if re.match(r"^S\d{2}_(?:\d{2}|D\d+)$", _sid):
                _imgs[_sid] = max(_imgs.get(_sid, 0), os.path.getmtime(_f))
        _stale = []
        for _sid, _imt in sorted(_imgs.items()):
            for _vf in _g9.glob(os.path.join(proj, "10-成片", "**", "%s_v*.mp4" % _sid), recursive=True):
                if os.path.getmtime(_vf) < _imt - 2:
                    _stale.append("%s（视频早于分镜图，疑似沿用旧图产物）" % _sid)
                    break
        checks.append({
            "check_id": "IMG-BIND-C9", "label": "分镜图重出 ⇒ 该镜旧视频作废（SBRM 下游作废）",
            "status": "FAIL" if _stale else "PASS", "blocking": bool(_stale),
            "expected": "每镜视频的 mtime 不早于本镜分镜图的 mtime",
            "actual": ("、".join(_stale[:8]) if _stale else "全部镜视频均不早于本镜分镜图"),
        })
    except Exception as _e9:
        checks.append({"check_id": "IMG-BIND-C9", "label": "分镜图重出 ⇒ 该镜旧视频作废",
                       "status": "SKIPPED", "blocking": False, "expected": "", "actual": "未执行：%s" % _e9})

    fails = [c for c in checks if c["status"] == "FAIL"]
    overall = "FAIL" if fails else ("WARNING" if any(c["status"] == "WARNING" for c in checks) else "PASS")
    result = {
        "gate_id": "stage_6_image_binding_gate",
        "gate_type": "专项闸门（生图多参）",
        "project": proj,
        "checked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "rule_source_version": args.rule_version or "见 manifest.pack_version",
        "prompt_dir": args.prompt_dir, "prompt_suffix": args.prompt_suffix,
        "shots_checked": len(files),
        "overall_status": overall, "blocking": bool(fails),
        "blocking_fail_count": len(fails),
        "checks": checks,
        "failed_checks": [c["check_id"] for c in fails],
        "issue_detail": all_issues,
        "per_shot": per_shot,
        "rollback": {"required": bool(fails), "target_stage": "stage_6_storyboard_image_prompt_and_image_generation" if fails else None,
                     "scope": "shot" if fails else None},
        "next_action": "存在阻断项：逐镜修正后重跑本闸门；通过后才允许发起 stage6 图像生成" if fails
                       else "全部通过，允许发起 stage6 图像生成（生成后仍须执行结果侧资产一致性复核）",
    }

    out_json = os.path.join(proj, "12-质检", f"stage_6_image_binding_gate_闸门结果_{args.version}.json")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    json.dump(result, open(out_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    lines = [f"# 生图多参专项闸门 · 汇总 {args.version}", "",
             f"- 项目：{proj}", f"- 检查时间：{result['checked_at']}", f"- 受检镜数：{len(files)}",
             f"- **总判定：{overall}**（阻断项 {len(fails)} 条）", "",
             "| check | 结论 | 说明 |", "|---|---|---|"]
    for c in checks:
        lines.append(f"| {c['check_id']} {c['label']} | {c['status']} | {str(c['actual'])[:200]} |")
    if all_issues:
        lines += ["", "## 问题明细", "", "| check | 镜号 | 问题 |", "|---|---|---|"]
        for i in all_issues:
            lines.append(f"| {i['check_id']} | {i['shot_id']} | {i['message']} |")
    lines += ["", "## 唯一真源", "",
              "- 规则：`embedded_skills.image_prompt_skill.multi_reference_binding_contract`（组合包 `skills/image_prompt_skill.md`）",
              "- 本闸门为该项目内 `11-工作流脚本/workflow_gates/` 的参考实现，可用组合包 `gates/stage_6_image_binding_gate.py` 覆盖更新", ""]
    out_md = os.path.join(proj, "12-质检", f"stage_6_image_binding_gate_闸门汇总_{args.version}.md")
    open(out_md, "w", encoding="utf-8").write("\n".join(lines))

    print(f"[gate] {overall}  受检 {len(files)} 镜  阻断项 {len(fails)}")
    for c in checks:
        print(f"  {c['check_id']} {c['status']}")
    for i in all_issues[:20]:
        print(f"   - {i['shot_id']} {i['check_id']} {i['message']}")
    return 1 if fails else 0


# ---------- ONE-SHOT 台账读取器（v1.24.20）----------
def _os_load_records(project):
    import os, json
    lp = os.path.join(project, "13-工作流文档", "生成台账.json")
    if not os.path.isfile(lp):
        return None
    try:
        j = json.load(open(lp, encoding="utf-8"))
    except Exception:
        return None
    if isinstance(j, dict) and "__parse_error__" in j:
        return None
    return j.get("records", j) if isinstance(j, dict) else j


def _os_auth_keys(project, want_media):
    import os, json
    sp = os.path.join(project, "13-工作流文档", "阶段状态.json")
    if not os.path.isfile(sp):
        return set()
    try:
        j = json.load(open(sp, encoding="utf-8"))
    except Exception:
        return set()
    ks = set()
    for a in (j.get("regeneration_authorizations", []) or []):
        mt = str(a.get("media_type", "")).strip().lower()
        if mt in want_media or mt == "":
            ks.add(a.get("shot_id"))
    return ks


def _os_norm_media(m):
    m = str(m or "").strip().lower()
    if m in ("image", "img", "图片", "图", "分镜图", "资产图", "asset"):
        return "image"
    if m in ("video", "vid", "视频", "成片", "h3"):
        return "video"
    return m


if __name__ == "__main__":
    sys.exit(main())
