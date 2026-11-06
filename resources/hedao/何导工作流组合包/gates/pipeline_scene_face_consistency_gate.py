#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline_scene_face_consistency_gate.py —— 场景正/反面（拍摄面）全链路一致性闸门

立闸背景（v1.21.29）：
  stage4 分镜、stage5 资产、stage6 分镜图、stage7 视频各自都有面相关的自检条目，
  但此前没有任何一道闸门**跨阶段**校验这条链路。实际跑批的典型断裂是：
  stage5 只出了背面、没出正面（或用了基础场景资产顶替），stage6 照样绑上去了，
  stage7 再引用过期 URL —— 每一环单看都"有个差不多的资产"，链路整体却是断的。
  本闸门把 stage4→stage5→stage6→stage7 的同一条面链路拉直，任一环断裂即 P0 阻断。

唯一真源：
  standards/shot_reverse_shot_scene_face_policy.json
    .face_schema / .scene_asset_naming_rule / .scene_asset_contract
    .group_face_binding_rule / .switch_rule
  骨架 gate_enforcement.pipeline_face_gate_ref

七环校验：
  PIPE-FACE-C1  stage4 面映射登记齐套（有正反打/过肩必须有 face_split 且 schema 合规）
  PIPE-FACE-C2  stage4 逐镜面标注（正反打/过肩镜『场景与人物』必须带面ID）
  PIPE-FACE-C3  stage5 两面资产齐套（SCxx_F 与 SCxx_B 各有本地副本 + verified 公网URL）
  PIPE-FACE-C4  stage5 面资产命名合规（{asset_id}_v{n}.png，三处一致）
  PIPE-FACE-C5  stage6 分镜图提示词面绑定 = 该镜标注面
  PIPE-FACE-C6  stage7 视频提示词面引用 = 该镜标注面
  PIPE-FACE-C7  组内两面不重复（同一正反打组内各镜引用的面不得全同）

执行时机（gate_enforcement.pipeline_face_gate_ref）：
  stage5 资产生成完成后 / stage6 发起图像生成前 / stage7 发起视频生成前，各跑一次。

输出：
  12-质检/pipeline_scene_face_consistency_gate_闸门结果_v{version}.json
  12-质检/pipeline_scene_face_consistency_gate_闸门汇总_v{version}.md

用法：
  python pipeline_scene_face_consistency_gate.py --project "C:/项目目录" [--version v1]
         [--stage 4|5|6|7]   # 只校验到该阶段（默认 7）
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检

v1.23.0 修订：①单源参考链（C8）扩到【角色子形态】级——『场景与人物』栏与提示词 @标记的 asset_id 提取正则均支持 CHxx_Cnn；②修复 GROUP_RE 同款 bug（原 `[^|｜）)]+` 不容许多字节右括号，导致按技能要求书写组标题时解析不出任何组）。
"""
import argparse, json, os, re, sys, datetime, glob

SHOT_RE = re.compile(r"镜号：\s*(S\d{2}_(?:\d{2}|D\d+))(.*?)(?=\n\s*[^\n]{0,8}镜号：\s*S\d{2}_(?:\d{2}|D\d+)|\n镜头组\s*\d+|\n##|\Z)", re.S)
GROUP_RE = re.compile(r"镜头组\s*(\d+)\s*[（(]\s*组类型：\s*([^|｜]+?)\s*[|｜]\s*叙事目的：\s*([^）)]+)[）)]")   # v1.23.0 修复：原 [^|｜）)]+ 不容许多字节右括号，致组解析失败
FIELD_ORDER = ["镜号", "持续时长", "机位", "景别", "光影", "场景与人物", "画面内容", "运镜方式", "音效", "台词"]
RE_SCENE_ID = re.compile(r"（(SC\d{2}(?:_[FB])?)）")
PROMPT_FACE_RE = re.compile(r"@(SC\d{2}_[FB])_场景资产图")
PROMPT_TAG_RE = re.compile(r"@((?:CH\d{2}(?:_C\d{2})?|PRP\d{2})|SC\d{2}(?:_[FB])?)_(?:角色|场景|道具)资产图")   # v1.23.0：支持角色子形态
CAST_ID_RE = re.compile(r"（((?:CH\d{2}(?:_C\d{2})?|PRP\d{2})|SC\d{2}(?:_[FB])?)）")   # v1.23.0：支持角色子形态


def prompt_tag_ids(proj, kind):
    """返回 {shot_id: set(提示词里的 asset_id 集合)}；kind='分镜图提示词' | '视频提示词'。"""
    d = os.path.join(proj, "07-分镜提示词")
    res = {}
    if not os.path.isdir(d):
        return res
    for f in sorted(glob.glob(os.path.join(d, "S*_%s_v*.md" % kind))):
        m = re.search(r"(S\d{2}_(?:\d{2}|D\d+))", os.path.basename(f))
        if not m:
            continue
        res[m.group(1)] = set(PROMPT_TAG_RE.findall(
            open(f, encoding="utf-8", errors="ignore").read()))
    return res
FACE_ANY_RE = re.compile(r"(SC\d{2}_[FB])")
FACE_ID_RE = re.compile(r"^SC\d{2}_[FB]$")
FILE_RE = re.compile(r"^(.+)_v(\d+)\.(png|jpe?g|webp)$", re.I)
CN_FACE_RE = re.compile(r"正面|背面|正反打|反打")

FACE_SPLIT_REQUIRED = ["front_face_id", "back_face_id", "face_owner", "camera_direction",
                       "group_binding", "note"]
ASSET_DIRS = ["03-场景", "02-角色/01-定妆照", "04-参考素材/01-道具", "资产"]


def rel(proj, p):
    try:
        return os.path.relpath(p, proj).replace("\\", "/")
    except Exception:
        return p


def _first_glob(proj, patterns):
    for pat in patterns:
        hits = sorted(glob.glob(os.path.join(proj, pat.replace("/", os.sep))))
        if hits:
            return hits[0]
    return None


def load_json(path):
    if not path or not os.path.isfile(path):
        return None
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return None


def field_of(body, name):
    pat = re.compile(r"\n[ \t]*" + name + r"：\s*(.*?)(?=\n[ \t]*(?:" + "|".join(FIELD_ORDER) + r")[：:]|\Z)", re.S)
    m = pat.search(body)
    return m.group(1).strip() if m else None


def parse_storyboards(proj):
    """解析 06-分镜/02-场次分镜卡 下全部分镜卡 → (shots, groups, files)"""
    d = os.path.join(proj, "06-分镜", "02-场次分镜卡")
    files = sorted(glob.glob(os.path.join(d, "*分镜头脚本*.md"))) if os.path.isdir(d) else []
    shots, groups = [], []
    for f in files:
        t = open(f, encoding="utf-8", errors="ignore").read()
        base = os.path.basename(f)
        for sid, body in SHOT_RE.findall(t):
            cast = field_of(body, "场景与人物") or ""
            scenes = RE_SCENE_ID.findall(cast)
            shots.append({"shot_id": sid, "file": rel(proj, f), "cast": cast,
                          "scenes": scenes,
                          "face": next((s for s in scenes if "_" in s), None)})
        hits = [(m.start(), m.group(1).strip(), m.group(2).strip()) for m in GROUP_RE.finditer(t)]
        for i, (pos, gno, gt) in enumerate(hits):
            end = hits[i + 1][0] if i + 1 < len(hits) else len(t)
            seg = t[pos:end]
            ids = [s["shot_id"] for s in shots if s["file"] == rel(proj, f) and ("镜号：" + s["shot_id"]) in seg]
            groups.append({"file": base, "group_no": gno, "group_type": gt.strip(), "shot_ids": ids})
    return shots, groups, files


def scan_assets(proj):
    out = []
    for d in ASSET_DIRS:
        full = os.path.join(proj, d.replace("/", os.sep))
        if not os.path.isdir(full):
            continue
        for fn in sorted(os.listdir(full)):
            fp = os.path.join(full, fn)
            if not os.path.isfile(fp):
                continue
            m = FILE_RE.match(fn)
            if m:
                out.append({"asset_id": m.group(1), "name": fn, "rel_path": rel(proj, fp)})
    return out


def prompt_faces(proj, kind):
    """kind='分镜图提示词' | '视频提示词'；返回 {shot_id: [face_id,...]}"""
    d = os.path.join(proj, "07-分镜提示词")
    res = {}
    if not os.path.isdir(d):
        return res
    for f in sorted(glob.glob(os.path.join(d, "S*_%s_v*.md" % kind))):
        m = re.search(r"(S\d{2}_(?:\d{2}|D\d+))", os.path.basename(f))
        if not m:
            continue
        txt = open(f, encoding="utf-8", errors="ignore").read()
        faces = PROMPT_FACE_RE.findall(txt)
        if not faces:
            faces = [x for x in FACE_ANY_RE.findall(txt)]
        res[m.group(1)] = faces
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--stage", default="7")
    ap.add_argument("--rule-version", default="")
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    if not os.path.isdir(proj):
        print("[gate] 项目目录不存在：%s" % proj)
        return 2
    upto = int(args.stage)

    roster_p = _first_glob(proj, ["06-分镜/01-分镜管线/场景人物清单*.json"])
    roster = load_json(roster_p)
    shots, groups, sb_files = parse_storyboards(proj)
    index_p = _first_glob(proj, ["08-分镜公网URL/公网素材URL索引.json"])
    idx_d = load_json(index_p) or {}
    index_assets = {}
    for a in (idx_d.get("assets") or []):
        if a.get("asset_id"):
            index_assets.setdefault(str(a["asset_id"]), a)
    assets = scan_assets(proj)
    aid2file = {}
    for a in assets:
        aid2file.setdefault(a["asset_id"], []).append(a)

    if roster is None and not shots and not index_assets:
        print("[gate] 无输入：无场景人物清单、无分镜卡、无资产索引")
        return 2

    checks = []

    def put(cid, status, severity, label, actual, evidence):
        checks.append({"check_id": cid, "label": label, "status": status, "severity": severity,
                       "blocking": status == "FAIL" and severity == "P0",
                       "expected": label, "actual": actual, "evidence": evidence,
                       "workflow_rule": "gate_enforcement.pipeline_face_gate_ref + standards.shot_reverse_shot_scene_face_policy",
                       "repair_action": None if status == "PASS"
                       else "按实际项回退对应阶段返修后重跑本闸门；链路未畅通前禁止发起下游生成"})

    # ---------- 面映射表 ----------
    face_scenes, schema_issues = {}, []
    for sc in ((roster or {}).get("scenes") or []):
        sid = sc.get("scene_id")
        fs = sc.get("face_split")
        if sc.get("face_mapping") and not fs:
            schema_issues.append("%s 使用已废止字段 face_mapping" % sid)
            continue
        if not fs:
            continue
        if not isinstance(fs, dict):
            schema_issues.append("%s face_split 非对象" % sid)
            continue
        miss = [k for k in FACE_SPLIT_REQUIRED if k not in fs]
        if miss:
            schema_issues.append("%s face_split 缺字段 %s" % (sid, miss))
        f, b = fs.get("front_face_id"), fs.get("back_face_id")
        if not (f and b):
            schema_issues.append("%s 缺 front/back_face_id" % sid)
            continue
        if str(f)[:4] != str(sid) or str(b)[:4] != str(sid):
            schema_issues.append("%s 面ID与 scene_id 不同源（%s/%s）" % (sid, f, b))
        face_scenes[sid] = {"front": str(f), "back": str(b),
                            "owners": fs.get("face_owner") or {},
                            "groups": fs.get("group_binding") or []}

    # ---------- 需要面标注的镜 ----------
    # 判定依据：属于正反打组 / 所属场景已登记 face_split / cast 已带面ID / cast 含『过肩』。
    # 注意：不能只看 cast 里有没有『正反打』字样——分镜卡正文通常不写这两字，会导致漏检。
    face_scene_ids = set(face_scenes.keys())
    rs_shot_ids = set()
    for g in groups:
        if "正反打" in g["group_type"]:
            rs_shot_ids.update(g["shot_ids"])
    need_face_shots = [s for s in shots
                       if s["shot_id"] in rs_shot_ids
                       or s["face"]
                       or re.search(r"过肩", s["cast"])
                       or any(sid in face_scene_ids for sid in s["scenes"])]
    rs_groups = [g for g in groups if "正反打" in g["group_type"]]

    # ===== C1 stage4 面映射登记齐套 =====
    c1 = list(schema_issues)
    if (rs_groups or any("过肩" in s["cast"] for s in shots)) and not face_scenes and shots:
        c1.append("分镜存在正反打/过肩镜头，但场景人物清单没有任何 face_split 登记")
    put("PIPE-FACE-C1", "FAIL" if c1 else ("PASS" if (face_scenes or shots) else "SKIPPED"), "P0",
        "stage4 面映射登记齐套（face_split schema 合规、有正反打必有面拆分）",
        c1 if c1 else ("%d 个场景已登记 face_split：%s" % (len(face_scenes), list(face_scenes.keys()))
                       if face_scenes else "无正反打/过肩，无需面拆分"),
        rel(proj, roster_p) if roster_p else "-")

    # ===== C2 stage4 逐镜面标注 =====
    c2 = []
    if shots:
        for s in need_face_shots:
            if not s["face"]:
                c2.append("%s(%s) 正反打/过肩镜『场景与人物』未写面ID" % (s["shot_id"], s["file"]))
            elif face_scenes:
                sid = s["face"][:4]
                if sid in face_scenes and s["face"] not in (face_scenes[sid]["front"], face_scenes[sid]["back"]):
                    c2.append("%s 的面ID %s 不在该场景 face_split 两面内" % (s["shot_id"], s["face"]))
    put("PIPE-FACE-C2", "FAIL" if c2 else ("PASS" if shots else "SKIPPED"), "P0",
        "stage4 逐镜面标注（正反打/过肩镜『场景与人物』带面ID且落在 face_split 内）",
        c2 if c2 else ("%d 个正反打/过肩镜全部带合规面ID" % len(need_face_shots) if shots
                       else "未找到分镜卡"),
        "%d 张分镜卡" % len(sb_files))

    # ===== C3 / C4 stage5 两面资产齐套与命名 =====
    c3, c4, ok3 = [], [], []
    if upto >= 5:
        for sid, fs in face_scenes.items():
            for fid in (fs["front"], fs["back"]):
                files = aid2file.get(fid) or []
                rec = index_assets.get(fid)
                if not files:
                    c3.append("%s 缺本地资产（%s_v{n}.png 不存在或命名不合规）" % (sid, fid))
                if not rec:
                    c3.append("%s 资产索引未登记" % sid if False else "%s 索引未登记面资产 %s" % (sid, fid))
                elif str(rec.get("url_status", "")).lower() != "verified":
                    c3.append("%s 面资产 %s 公网URL未verified（%s）" % (sid, fid, rec.get("url_status")))
                if rec:
                    lp = str(rec.get("local_path", "") or "").replace("\\", "/")
                    fn = os.path.basename(lp) if lp else ""
                    if fn and not re.match(r"^%s_v\d+\.(png|jpe?g|webp)$" % re.escape(fid), fn, re.I):
                        c4.append("%s 索引 local_path 文件名 %s 与面ID %s 不一致" % (sid, fn, fid))
            pf, pb = aid2file.get(fs["front"]) or [], aid2file.get(fs["back"]) or []
            if pf and pb and pf[0]["rel_path"] == pb[0]["rel_path"]:
                c3.append("%s 两面共用同一张图 %s" % (sid, pf[0]["name"]))
            if pf and pb and not any(x.startswith(sid + " ") for x in c3):
                ok3.append(sid)
        for d in ASSET_DIRS:
            full = os.path.join(proj, d.replace("/", os.sep))
            if not os.path.isdir(full):
                continue
            for fn in sorted(os.listdir(full)):
                if not os.path.isfile(os.path.join(full, fn)):
                    continue
                if not re.search(r"\.(png|jpe?g|webp)$", fn, re.I):
                    continue
                if CN_FACE_RE.search(fn):
                    c4.append("%s 用了中文面名（应 {asset_id}_v{n}.png）" % fn)
    put("PIPE-FACE-C3", "FAIL" if c3 else ("PASS" if face_scenes else "SKIPPED"), "P0",
        "stage5 场景两面资产齐套（SCxx_F 与 SCxx_B 各有本地副本 + verified 公网URL）",
        c3 if c3 else ("%d 个场景两面齐套：%s" % (len(ok3), ok3) if face_scenes else "无面拆分场景，不适用"),
        ((rel(proj, index_p) if index_p else "-") + " + 资产目录"))
    put("PIPE-FACE-C4", "FAIL" if c4 else ("PASS" if face_scenes else "SKIPPED"), "P0",
        "stage5 面资产命名合规（{asset_id}_v{n}.png、索引登记名一致、无中文面名）",
        c4 if c4 else ("%d 个场景面资产命名合规" % len(face_scenes) if face_scenes else "无面拆分场景，不适用"),
        "资产目录 + " + (rel(proj, index_p) if index_p else "资产索引"))

    # ===== C5 stage6 分镜图提示词面绑定 =====
    c5 = []
    if upto >= 6:
        pf_map = prompt_faces(proj, "分镜图提示词")
        if not pf_map:
            c5.append("未找到任何分镜图提示词文件（07-分镜提示词/*_分镜图提示词_v*.md）")
        else:
            for s in need_face_shots:
                if not s["face"]:
                    continue
                got = pf_map.get(s["shot_id"])
                if got is None:
                    c5.append("%s 缺分镜图提示词" % s["shot_id"])
                elif s["face"] not in got:
                    c5.append("%s 提示词场景绑定 %s ≠ 该镜标注面 %s" % (s["shot_id"], got or "无", s["face"]))
    put("PIPE-FACE-C5", "FAIL" if c5 else ("PASS" if (upto >= 6 and need_face_shots) else "SKIPPED"), "P0",
        "stage6 分镜图提示词场景绑定面 = 该镜标注面",
        c5 if c5 else ("%d 个正反打/过肩镜面绑定一致" % len(need_face_shots) if upto >= 6 else "未到 stage6，跳过"),
        "07-分镜提示词/*_分镜图提示词_v*.md")

    # ===== C6 stage7 视频提示词面引用 =====
    c6 = []
    if upto >= 7:
        vp_map = prompt_faces(proj, "视频提示词")
        if not vp_map:
            c6.append("未找到任何视频提示词文件（07-分镜提示词/*_视频提示词_v*.md）")
        else:
            for s in need_face_shots:
                if not s["face"]:
                    continue
                got = vp_map.get(s["shot_id"])
                if got is None:
                    c6.append("%s 缺视频提示词" % s["shot_id"])
                elif s["face"] not in got:
                    c6.append("%s 视频提示词面引用 %s ≠ 该镜标注面 %s" % (s["shot_id"], got or "无", s["face"]))
    put("PIPE-FACE-C6", "FAIL" if c6 else ("PASS" if (upto >= 7 and need_face_shots) else "SKIPPED"), "P0",
        "stage7 视频提示词场景面引用 = 该镜标注面",
        c6 if c6 else ("%d 个正反打/过肩镜面引用一致" % len(need_face_shots) if upto >= 7 else "未到 stage7，跳过"),
        "07-分镜提示词/*_视频提示词_v*.md")

    # ===== C7 组内两面不重复 =====
    c7 = []
    if shots:
        shot_face = {s["shot_id"]: s["face"] for s in shots}
        for g in rs_groups:
            fs = [shot_face.get(i) for i in g["shot_ids"]]
            fs2 = [x for x in fs if x]
            if len(fs2) >= 2 and len(set(fs2)) == 1:
                c7.append("组%s(%s) 全组引用同一面 %s，正反打未换面" % (g["group_no"], g["group_type"], fs2[0]))
        for g in groups:
            if "正反打" not in g["group_type"]:
                continue
            seq = [shot_face.get(i) for i in g["shot_ids"] if shot_face.get(i)]
            for a, b in zip(seq, seq[1:]):
                if a == b:
                    c7.append("组%s 相邻两镜停留同一面 %s" % (g["group_no"], a))
    put("PIPE-FACE-C7", "FAIL" if c7 else ("PASS" if (shots and (rs_groups or face_scenes)) else "SKIPPED"), "P0",
        "组内两面不重复（同一正反打组内换面、相邻镜不停留同一面）",
        c7 if c7 else ("%d 个正反打组换面正常" % len(rs_groups) if rs_groups else "无正反打组，不适用"),
        "%d 张分镜卡" % len(sb_files))

    # ===== C8 单源参考链（人物+场景+道具三类全量一致，v1.21.31） =====
    c8 = []
    if upto >= 6:
        tag6 = prompt_tag_ids(proj, "分镜图提示词")
        if not tag6:
            c8.append("未找到分镜图提示词，无法核对参考链")
        else:
            for s in shots:
                ids = set(CAST_ID_RE.findall(s["cast"]))
                if not ids:
                    continue
                got = tag6.get(s["shot_id"])
                if got is None:
                    c8.append("%s 缺分镜图提示词" % s["shot_id"])
                    continue
                miss = sorted(ids - got)
                extra = sorted(got - ids)
                if miss or extra:
                    c8.append("%s 漏绑=%s 多绑=%s" % (s["shot_id"], miss, extra))
    put("PIPE-FACE-C8",
        "FAIL" if c8 else ("PASS" if (upto >= 6 and shots) else "SKIPPED"), "P0",
        "单源参考链：『场景与人物』栏的 asset_id 集合 = stage6 提示词绑定集合（人物含【角色子形态 CHxx_Cnn】/场景/道具三类全量、不多不少）",
        c8 if c8 else ("%d 镜三类 asset_id 全量一致" % len(shots) if upto >= 6 else "未到 stage6，跳过"),
        "06-分镜/02-场次分镜卡 + 07-分镜提示词/*_分镜图提示词_v*.md")

    # ---------- 汇总 ----------
    order = ["PIPE-FACE-C1", "PIPE-FACE-C2", "PIPE-FACE-C3", "PIPE-FACE-C4",
             "PIPE-FACE-C5", "PIPE-FACE-C6", "PIPE-FACE-C7", "PIPE-FACE-C8"]
    checks.sort(key=lambda c: order.index(c["check_id"]))
    fails = [c for c in checks if c["status"] == "FAIL"]
    overall = "FAIL" if fails else ("WARNING" if any(c["status"] == "SKIPPED" for c in checks) else "PASS")

    result = {
        "gate_id": "pipeline_scene_face_consistency_gate",
        "gate_type": "链路级闸门（场景正/反面全链路一致性）",
        "project": proj,
        "checked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "rule_source_version": args.rule_version or "见 manifest.pack_version",
        "checked_upto_stage": upto,
        "inputs": {"roster": rel(proj, roster_p) if roster_p else None,
                   "storyboard_files": len(sb_files),
                   "index": rel(proj, index_p) if index_p else None,
                   "asset_files": len(assets)},
        "summary": {"face_scenes": len(face_scenes), "need_face_shots": len(need_face_shots),
                    "storyboard_groups": len(groups), "reverse_shot_groups": len(rs_groups)},
        "overall_status": overall,
        "blocking": bool(fails),
        "blocking_fail_count": len(fails),
        "checks": checks,
        "failed_checks": [c["check_id"] for c in fails],
        "stage_return_target": {
            "PIPE-FACE-C1": "stage_4_storyboard_generation",
            "PIPE-FACE-C2": "stage_4_storyboard_generation",
            "PIPE-FACE-C3": "stage_5_asset_prompt_and_asset_generation",
            "PIPE-FACE-C4": "stage_5_asset_prompt_and_asset_generation",
            "PIPE-FACE-C5": "stage_6_storyboard_image_prompt_and_image_generation",
            "PIPE-FACE-C6": "stage_7_video_prompt_h3_generation_and_download",
            "PIPE-FACE-C7": "stage_4_storyboard_generation",
            "PIPE-FACE-C8": "stage_4_storyboard_generation / stage_6_storyboard_image_prompt_and_image_generation",
        },
        "next_action": ("链路未畅通：按每条 failed_checks 的 stage_return_target 回退返修后重跑本闸门；"
                        "禁止带断裂链路发起下游生成" if fails
                        else "面链路七环全部畅通，允许继续下游阶段"),
    }

    out_dir = os.path.join(proj, "12-质检")
    os.makedirs(out_dir, exist_ok=True)
    json.dump(result, open(os.path.join(out_dir, "pipeline_scene_face_consistency_gate_闸门结果_%s.json" % args.version),
                           "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    lines = ["# 场景面链路一致性闸门 · 汇总 %s" % args.version, "",
             "- 项目：%s" % proj,
             "- 检查时间：%s" % result["checked_at"],
             "- 校验至阶段：stage%s" % upto,
             "- 规模：面拆分场景 %d ｜ 需面镜头 %d ｜ 分镜组 %d（正反打 %d）"
             % (len(face_scenes), len(need_face_shots), len(groups), len(rs_groups)),
             "- **总判定：%s**（阻断项 %d 条）" % (overall, len(fails)), "",
             "| 环 | 检查 | 结论 | 说明 |", "|---|---|---|---|"]
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        lines.append("| %s | %s | %s | %s |" % (c["check_id"], c["label"], c["status"], act[:200]))
    lines += ["", "## 唯一真源", "",
              "- `standards/shot_reverse_shot_scene_face_policy.json`（face_schema / scene_asset_naming_rule / scene_asset_contract / group_face_binding_rule / switch_rule）",
              "- 骨架 `gate_enforcement.pipeline_face_gate_ref`",
              "- 本闸门为组合包 `gates/pipeline_scene_face_consistency_gate.py` 的项目内落地副本", ""]
    open(os.path.join(out_dir, "pipeline_scene_face_consistency_gate_闸门汇总_%s.md" % args.version),
         "w", encoding="utf-8").write("\n".join(lines))

    print("[gate] %s  面场景 %d  需面镜头 %d  正反打组 %d  阻断 %d"
          % (overall, len(face_scenes), len(need_face_shots), len(rs_groups), len(fails)))
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        print("  %s %-8s %s" % (c["check_id"], c["status"], act[:120]))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
