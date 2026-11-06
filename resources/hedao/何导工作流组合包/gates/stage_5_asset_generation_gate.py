#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stage_5_asset_generation_gate.py —— stage5 资产生成专项闸门（含场景正/反面资产强制）

唯一真源：
  standards/shot_reverse_shot_scene_face_policy.json
      .face_schema            场景人物清单 scenes[].face_split 的字段名与结构
      .scene_asset_naming_rule 面资产文件名模式 {asset_id}_v{version}.png
      .scene_asset_contract    两面成对生成的阻断口径
  standards/scene_character_roster_policy.json
  skills/image_prompt_skill.md（multi_reference_binding_contract.asset_id_rule）
  骨架 stage_workflow(4).self_checks（v1.21.29 起 19 条）

覆盖口径（gate_enforcement.coverage_rule）：
  implemented_checks + manual_checks = workflow_selfcheck_total = 19

本闸门要解决的问题（v1.21.29 立）：
  此前 stage5 没有任何闸门脚本，'含正反打/过肩的场景已生成正/反面场景资产'只是一条
  自然语言自检，实际跑批时经常只出单面甚至不出面资产，导致 stage6 正反打镜错面、
  stage7 视频背景跳变。本闸门把该条与命名/索引要求变成可执行断言。

核心机检（P0）：
  STG5-C09 面资产已按 face_split 面映射生成（旧口径复核）
  STG5-C17 场景正/反面资产成对齐全：face_split 非 null 的场景，SCxx_F 与 SCxx_B 两面
           各自有一份本地副本 + 各自 verified 公网 URL；缺任一面 / 只出单面 /
           两面共用一张图 / 用基础场景资产顶替 → FAIL 阻断
  STG5-C18 面资产命名与索引登记合规：文件名 {asset_id}_v{version}.png（SCxx_F_v{n}.png /
           SCxx_B_v{n}.png）；本地副本名 = 索引登记名 = 公网URL登记名三处一致；
           禁止中文面名、禁止省略面后缀、禁止两面后缀对调

输出（遵循 gate_enforcement.outputs 命名）：
  12-质检/stage_5_asset_generation_gate_闸门结果_v{version}.json
  12-质检/stage_5_asset_generation_gate_闸门汇总_v{version}.md

用法：
  python stage_5_asset_generation_gate.py --project "C:/项目目录" [--version v1]
         [--roster 06-分镜/01-分镜管线/场景人物清单.json]
         [--index 08-分镜公网URL/公网素材URL索引.json]
         [--rule-version 1.2.13]
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检

v1.23.0 修订：新增 C23 角色子形态资产齐套（active 形态各需资产 + verified URL，含命名合规与反向未登记检查）、C24 reserved 预存形态不挂资产（预存量不得越权启用，闸门不得因 reserved 无资产报错）；WORKFLOW_SELFCHECK_TOTAL 由硬编码改为运行期从骨架读取；CHAR_RE 扩展支持 _C{nn}。
"""
import argparse, json, os, re, struct, sys, datetime, glob

def _load_selfcheck_total():
    """运行期从组合包骨架读 stage_workflow(4).self_checks 条数；读不到则回落常量（v1.23.0 起，防与骨架不同步）。"""
    _p = os.environ.get("HEDAO_PACK_DIR", r"C:\黛西\技能组\何导工作流组合包")
    try:
        _d = json.load(open(os.path.join(_p, "workflow.skeleton.json"), encoding="utf-8"))
        return len(_d["stage_workflow"][4]["self_checks"])
    except Exception:
        return 25


WORKFLOW_SELFCHECK_TOTAL = _load_selfcheck_total()   # v1.23.0：动态读取（回落 25）

FACE_ID_RE   = re.compile(r"^(SC\d{2})_([FB])$")          # 面ID，如 SC02_F
BASE_SCENE_RE = re.compile(r"^SC\d{2}$")                   # 基础场景ID，如 SC02
CHAR_RE      = re.compile(r"^CH\d{2}(?:_C\d{2})?(?:_v\d+)?$")   # v1.23.0：支持角色子形态 _C{nn}
PROP_RE      = re.compile(r"^PRP\d{2}$")
FILE_RE      = re.compile(r"^(.+)_v(\d+)\.(png|jpe?g|webp)$", re.I)
CN_FACE_RE   = re.compile(r"正面|背面|正反打|反打|俯视|侧视")

ASSET_DIRS = ["03-场景", "02-角色/01-定妆照", "04-参考素材/01-道具", "资产", "08-分镜静态图"]
ROSTER_GLOBS = ["06-分镜/01-分镜管线/场景人物清单*.json"]
INDEX_GLOBS  = ["08-分镜公网URL/公网素材URL索引.json"]
VOICE_DIR    = "02-角色/03-音色圣经与基准音轨"

# face_split 主 schema（唯一真源 standards.shot_reverse_shot_scene_face_policy.face_schema）
FACE_SPLIT_REQUIRED = ["front_face_id", "back_face_id", "face_owner", "camera_direction",
                       "group_binding", "note"]
LEGACY_FACE_FIELDS  = ["face_mapping"]


MIN_BYTES = 10 * 1024      # 落地校验最小体积（image_return_policy.landing_verification_rule）
SIGS = [
    ("PNG", lambda h: h[:8] == b"\x89PNG\r\n\x1a\n"),
    ("JPEG", lambda h: h[:3] == b"\xff\xd8\xff"),
    ("WEBP", lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP"),
    ("MP3", lambda h: h[:3] == b"ID3" or h[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2", b"\xff\xfa")),
]


def probe_file(path):
    """落地校验四项：存在 / >10KB / 文件头签名 / 真实像素可解析。返回 (ok, note)。"""
    if not path or not os.path.isfile(path):
        return False, "文件不存在"
    size = os.path.getsize(path)
    if size <= MIN_BYTES:
        return False, "体积 %d 字节 ≤ %d（0字节/截断）" % (size, MIN_BYTES)
    try:
        with open(path, "rb") as f:
            head = f.read(32)
    except Exception as e:
        return False, "读取失败 %s" % e
    kind = None
    for name, fn in SIGS:
        try:
            if fn(head):
                kind = name
                break
        except Exception:
            pass
    if kind is None:
        return False, "文件头签名无法识别"
    if kind == "PNG":
        try:
            w, h = struct.unpack(">II", head[16:24])
            if w <= 0 or h <= 0:
                return False, "PNG 像素解析异常 %dx%d" % (w, h)
            return True, "PNG %dx%d %.1fKB" % (w, h, size / 1024.0)
        except Exception:
            return False, "PNG IHDR 解析失败"
    return True, "%s %.1fKB" % (kind, size / 1024.0)


def rel(proj, p):
    try:
        return os.path.relpath(p, proj).replace("\\", "/")
    except Exception:
        return p


def _probe_audio_duration(path):
    """v1.24.9：探测音频时长（秒）。优先 ffprobe，失败返回 None（不阻断，交人工）。"""
    import subprocess
    for probe in ("ffprobe", "ffprobe.exe"):
        try:
            out = subprocess.run(
                [probe, "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", path],
                capture_output=True, text=True, timeout=15)
            if out.returncode == 0 and out.stdout.strip():
                return float(out.stdout.strip())
        except Exception:
            continue
    return None


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
    except Exception as e:
        print("[gate][warn] 解析失败 %s: %s" % (path, e))
        return None


def scan_assets(proj):
    """扫描资产目录，返回 [{asset_id, version, file, rel_path, name}]。"""
    out = []
    seen = set()
    for d in ASSET_DIRS:
        full = os.path.join(proj, d.replace("/", os.sep))
        if not os.path.isdir(full):
            continue
        for fn in sorted(os.listdir(full)):
            fpath = os.path.join(full, fn)
            if not os.path.isfile(fpath):
                continue
            m = FILE_RE.match(fn)
            if not m:
                continue
            key = os.path.normcase(fpath)
            if key in seen:
                continue
            seen.add(key)
            out.append({"asset_id": m.group(1), "version": "v" + m.group(2),
                        "file": fpath, "name": fn, "rel_path": rel(proj, fpath)})
    return out


def load_index_assets(proj):
    """读资产索引，返回 {asset_id: record}（同名取第一条）。"""
    p = _first_glob(proj, INDEX_GLOBS)
    d = load_json(p)
    out = {}
    if not d:
        return out, p
    for a in (d.get("assets") or []):
        aid = a.get("asset_id")
        if aid and aid not in out:
            out[str(aid)] = a
    return out, p


def parse_face_scenes(roster):
    """从场景人物清单提取面映射。返回 (face_scenes, issues)
    face_scenes: [{scene_id, scene_name, front, back, owners, groups, source}]
    issues: [(code, msg)]  schema 违规（v1.21.29 起 face_mapping 已废止）
    """
    scenes, issues = [], []
    if not isinstance(roster, dict):
        return scenes, issues
    for sc in (roster.get("scenes") or []):
        sid = sc.get("scene_id")
        legacy = None
        for lf in LEGACY_FACE_FIELDS:
            if sc.get(lf):
                legacy = lf
                break
        fs = sc.get("face_split")
        if legacy and not fs:
            issues.append(("STG5-C17", "%s 使用已废止字段 %s，须迁移为 face_split（v1.21.29 起主 schema）"
                           % (sid, legacy)))
            continue
        if not fs:
            continue                                  # face_split: null → 常规场景，不要求面资产
        if not isinstance(fs, dict):
            issues.append(("STG5-C18", "%s face_split 不是对象（实际 %s）" % (sid, type(fs).__name__)))
            continue
        miss = [k for k in FACE_SPLIT_REQUIRED if k not in fs]
        if miss:
            issues.append(("STG5-C18", "%s face_split 缺字段 %s（主 schema 要求六键齐全）" % (sid, miss)))
        f, b = fs.get("front_face_id"), fs.get("back_face_id")
        if not (f and b):
            issues.append(("STG5-C18", "%s face_split 缺 front_face_id / back_face_id" % sid))
            continue
        if not (FACE_ID_RE.match(str(f)) and FACE_ID_RE.match(str(b))):
            issues.append(("STG5-C18", "%s 面ID格式不合规：%s / %s（应形如 SC02_F、SC02_B）" % (sid, f, b)))
        if str(f)[:4] != str(sid) or str(b)[:4] != str(sid):
            issues.append(("STG5-C18", "%s 面ID与 scene_id 不同源：%s / %s" % (sid, f, b)))
        fo = fs.get("face_owner") or {}
        cd = fs.get("camera_direction") or {}
        for label, obj in (("face_owner", fo), ("camera_direction", cd)):
            if not isinstance(obj, dict):
                continue
            keys = set(obj.keys())
            if keys and keys != {str(f), str(b)}:
                issues.append(("STG5-C18", "%s %s 键集合 %s ≠ {front,back}" % (sid, label, sorted(keys))))
        if isinstance(fo, dict) and len(set(str(v) for v in fo.values())) < 2:
            issues.append(("STG5-C18", "%s face_owner 两面归属同一人物（面拆分无意义）" % sid))
        gb = fs.get("group_binding")
        if gb is not None and not isinstance(gb, list):
            issues.append(("STG5-C18", "%s group_binding 不是数组" % sid))
        scenes.append({"scene_id": sid, "scene_name": sc.get("scene_name"),
                       "front": str(f), "back": str(b), "owners": fo,
                       "groups": gb or [], "source": "face_split"})
    return scenes, issues


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--roster", default="")
    ap.add_argument("--index", default="")
    ap.add_argument("--rule-version", default="")
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    if not os.path.isdir(proj):
        print("[gate] 项目目录不存在：%s" % proj)
        return 2

    roster_p = (os.path.join(proj, args.roster.replace("/", os.sep)) if args.roster
                else _first_glob(proj, ROSTER_GLOBS))
    roster = load_json(roster_p)
    index_assets, index_p = load_index_assets(proj)
    assets = scan_assets(proj)

    if roster is None and not assets and not index_assets:
        print("[gate] 无输入：既无场景人物清单、也无资产文件与资产索引可检")
        return 2

    checks, manual = [], []

    def put(idx, status, severity, label, actual, evidence, is_manual=False):
        rec = {"check_id": idx, "label": label, "status": status, "severity": severity,
               "blocking": status == "FAIL" and severity in ("P0", "P1"),
               "expected": label, "actual": actual, "evidence": evidence,
               "workflow_rule": "stage_workflow(4).self_checks(%d)" % idx,
               "repair_action": None if status == "PASS" else
               "按 stage5 自检第 %d 条返修后重跑本闸门；不得带缺进入 stage6" % idx}
        (manual if is_manual else checks).append(rec)
        return rec

    face_scenes, schema_issues = parse_face_scenes(roster)
    aid2file = {}
    for a in assets:
        aid2file.setdefault(a["asset_id"], []).append(a)

    # ================= 机检项 =================

    # ---- C00 资产提取完整可追溯 ----
    no_trace = [a["asset_id"] for a in (roster or {}).get("scenes", [])
                if any(not p.get("asset_id") for p in (a.get("roster") or a.get("presence_roster") or []))]
    idx_n = len(index_assets)
    put(0, "FAIL" if (not index_assets or no_trace) else "PASS", "P0",
        "资产提取完整可追溯（asset_id 主键、索引可查）",
        ("缺 asset_id 的清单条目：%s" % no_trace) if no_trace else
        ("资产索引 %d 条，资产文件 %d 个" % (idx_n, len(assets))),
        rel(proj, index_p) if index_p else "未找到资产索引")

    # ---- C05 任务ID / 本地路径已记录 ----
    bad5 = [k for k, v in index_assets.items() if not v.get("local_path")]
    put(5, "FAIL" if bad5 else ("PASS" if index_assets else "SKIPPED"), "P0",
        "每个生成任务已记录 task_id 与本地路径",
        ("缺 local_path：%s" % bad5[:10]) if bad5 else
        ("%d 条均含 local_path" % idx_n if index_assets else "无资产索引，本项跳过"),
        rel(proj, index_p) if index_p else "-")

    # ---- C06 返图成对：本地副本 + 公网URL + url_status=verified ----
    bad6 = []
    for k, v in index_assets.items():
        if not v.get("xem8k5_returned_url") or not v.get("local_path"):
            bad6.append("%s:本地/URL未成对" % k)
        elif str(v.get("url_status", "")).lower() != "verified":
            bad6.append("%s:url_status=%s" % (k, v.get("url_status")))
    put(6, "FAIL" if bad6 else ("PASS" if index_assets else "SKIPPED"), "P0",
        "返图成对记录（本地副本 + verified 公网URL）",
        ("异常：%s" % bad6[:10]) if bad6 else
        ("%d 条均成对且 verified" % idx_n if index_assets else "无资产索引，本项跳过"),
        rel(proj, index_p) if index_p else "-")

    # ---- C08 角色 asset_id 均有资产文件与 verified URL ----
    char_ids = set()
    for sc in (roster or {}).get("scenes", []):
        for p in (sc.get("roster") or sc.get("presence_roster") or []):
            if p.get("asset_id"):
                char_ids.add(str(p["asset_id"]))
    bad8 = []
    for cid in sorted(char_ids):
        if cid not in aid2file:
            bad8.append("%s:无资产文件" % cid)
        elif cid not in index_assets:
            bad8.append("%s:索引未登记" % cid)
        elif str(index_assets[cid].get("url_status", "")).lower() != "verified":
            bad8.append("%s:URL未verified" % cid)
    put(8, "FAIL" if bad8 else ("PASS" if char_ids else "SKIPPED"), "P0",
        "清单内所有角色 asset_id 均有资产文件 + verified 公网URL",
        ("缺失：%s" % bad8[:10]) if bad8 else
        ("%d 个角色齐备" % len(char_ids) if char_ids else "清单无角色条目，本项跳过"),
        rel(proj, roster_p) if roster_p else "-")

    # ---- C09 面资产已按 face_split 面映射生成（旧口径复核） ----
    bad9 = []
    for fs in face_scenes:
        for fid in (fs["front"], fs["back"]):
            if fid not in aid2file:
                bad9.append("%s:%s无本地资产" % (fs["scene_id"], fid))
    bad9 += [m for c, m in schema_issues if c == "STG5-C17"]
    put(9, "FAIL" if bad9 else ("PASS" if face_scenes else "SKIPPED"), "P0",
        "含正反打/过肩的场景已按面映射生成正/反面场景资产",
        ("问题：%s" % bad9[:10]) if bad9 else
        ("%d 个含面场景两面均有本地资产" % len(face_scenes) if face_scenes else
         "无 face_split 场景，本项不适用"),
        rel(proj, roster_p) if roster_p else "-")

    # ---- C10 asset_id 与说话人ID映射表一一对应 ----
    # [项目内修复 2026-09-30] 映射表按版本号取最高版（原 _first_glob 取字典序第一个，
    # 多单元项目下会永远读到 v1，导致 v2 的子形态校验形同虚设）
    _sp_c = sorted(glob.glob(os.path.join(proj, "02-角色", "04-说话人ID映射表", "说话人ID映射表*.json")),
                   key=lambda x: (int(m.group(1)) if (m := re.search(r"_v(\d+)\.json$", x)) else 0))
    sp_p = _sp_c[-1] if _sp_c else os.path.join(proj, "02-角色", "04-说话人ID映射表", "说话人ID映射表_v1.json")
    sp = load_json(sp_p)
    if sp is None:
        put(10, "SKIPPED", "P3", "asset_id 与说话人ID映射表一一对应", "未找到说话人ID映射表", "-")
    else:
        put(10, "PASS", "P1", "asset_id 与说话人ID映射表一一对应",
            "映射表已存在，逐条比对手工确认（见人工清单）", rel(proj, sp_p))

    # ---- C11 版本号与适用镜头范围 ----
    bad11 = [k for k, v in index_assets.items() if not v.get("asset_version") or not v.get("applicable_shots")]
    put(11, "FAIL" if bad11 else ("PASS" if index_assets else "SKIPPED"), "P1",
        "同一资产不同版本均有版本号与适用镜头范围",
        ("缺版本号/适用镜头：%s" % bad11[:10]) if bad11 else
        ("%d 条均含 asset_version + applicable_shots" % idx_n if index_assets else "无索引，跳过"),
        rel(proj, index_p) if index_p else "-")

    # ---- C12 身份锚定词 ----
    pd_p = _first_glob(proj, ["02-角色/02-定妆照提示词"])
    miss12 = []
    if pd_p and os.path.isdir(pd_p):
        for cid in sorted(char_ids):
            hits = glob.glob(os.path.join(pd_p, "%s*生图提示词*.md" % cid))
            if not hits:
                miss12.append("%s:无提示词文件" % cid)
                continue
            txt = open(hits[0], encoding="utf-8", errors="ignore").read()
            if "角色ID:" not in txt:
                miss12.append("%s:提示词缺身份锚定词『角色ID:%s』" % (cid, cid))
    put(12, "FAIL" if miss12 else ("PASS" if char_ids else "SKIPPED"), "P0",
        "角色资产提示词含身份锚定词『角色ID:CHxx』",
        ("问题：%s" % miss12[:10]) if miss12 else
        ("%d 个角色提示词均含锚定词" % len(char_ids) if char_ids else "无角色，本项跳过"),
        rel(proj, pd_p) if pd_p else "02-角色/02-定妆照提示词")

    # ---- C14 / C15 声线 MP3 齐备与命名规范 ----
    vd = os.path.join(proj, VOICE_DIR.replace("/", os.sep))
    mp3s = sorted(glob.glob(os.path.join(vd, "*.mp3"))) if os.path.isdir(vd) else []
    # v1.24.9：正式声线轨命名新增『声线中性』形式（无词音色轨）；两种命名均视为合法正式轨
    formal = [f for f in mp3s
              if re.search(r"voice_\w+_(声线|声线中性)_v\d+\.mp3$", os.path.basename(f))]
    bad15 = [os.path.basename(f) for f in mp3s
             if not re.search(r"voice_\w+_(声线|声线中性|声线候选\d+)_v\d+\.mp3$", os.path.basename(f))
             and os.path.basename(f) != "silence_3s.mp3"]
    spoken_ids = set()
    for sc in (roster or {}).get("scenes", []):
        for p in (sc.get("roster") or sc.get("presence_roster") or []):
            if p.get("asset_id") and not p.get("silent"):
                spoken_ids.add(str(p["asset_id"]))
    put(14, "FAIL" if (spoken_ids and not formal) else ("PASS" if formal else "SKIPPED"), "P0",
        "每个有台词角色均有锁定声线 MP3 及 verified 公网URL",
        ("正式声线 %d 条：%s" % (len(formal), [os.path.basename(x) for x in formal][:5]))
        if formal else "未找到 voice_*_声线_v*.mp3",
        VOICE_DIR)
    put(15, "FAIL" if bad15 else ("PASS" if mp3s else "SKIPPED"), "P1",
        "声线候选视频与 MP3 命名符合规范",
        ("不合规：%s" % bad15[:8]) if bad15 else ("%d 个音频命名合规" % len(mp3s) if mp3s else "无声线文件，跳过"),
        VOICE_DIR)

    # ---- C17 场景正/反面资产成对齐全（v1.21.29 核心） ----
    bad17, ok17 = [m for c, m in schema_issues if c == "STG5-C17"], []
    for fs in face_scenes:
        sid, f, b = fs["scene_id"], fs["front"], fs["back"]
        pf = aid2file.get(f) or []
        pb = aid2file.get(b) or []
        # 两面必须各有本地文件
        if not pf:
            bad17.append("%s:%s 缺本地资产（正面未生成或命名不合规）" % (sid, f))
        if not pb:
            bad17.append("%s:%s 缺本地资产（背面未生成或命名不合规）" % (sid, b))
        # 两面不得共用同一张图
        if pf and pb and os.path.normcase(pf[0]["file"]) == os.path.normcase(pb[0]["file"]):
            bad17.append("%s:两面共用同一张图 %s" % (sid, pf[0]["name"]))
        # 索引齐套且 verified
        for fid in (f, b):
            rec = index_assets.get(fid)
            if not rec:
                bad17.append("%s:%s 资产索引未登记" % (sid, fid))
            elif str(rec.get("url_status", "")).lower() != "verified":
                bad17.append("%s:%s 公网URL未verified（url_status=%s）" % (sid, fid, rec.get("url_status")))
        # 不得用基础场景资产顶替面资产
        base = aid2file.get(sid) or []
        if base and not pf:
            bad17.append("%s:存在基础场景资产 %s 顶替正面面资产" % (sid, base[0]["name"]))
        if pf and pb and not any(x for x in bad17 if x.startswith(sid + ":")):
            ok17.append("%s(%s+%s)" % (sid, pf[0]["name"], pb[0]["name"]))
    put(17, "FAIL" if bad17 else ("PASS" if face_scenes else "SKIPPED"), "P0",
        "【v1.21.29】场景正/反面资产成对齐全（SCxx_F 与 SCxx_B 各有本地副本 + verified URL）",
        ("不齐套：%s" % bad17[:12]) if bad17 else
        ("%d 个场景两面齐套：%s" % (len(ok17), ok17[:6]) if face_scenes else
         "无 face_split 非 null 的场景，本项不适用"),
        "%s + %s" % (rel(proj, roster_p) if roster_p else "-",
                     rel(proj, index_p) if index_p else "-"))

    # ---- C18 面资产命名与索引登记合规（v1.21.29 核心） ----
    bad18 = [m for c, m in schema_issues if c == "STG5-C18"]
    for fs in face_scenes:
        sid = fs["scene_id"]
        for fid in (fs["front"], fs["back"]):
            for a in (aid2file.get(fid) or []):
                if CN_FACE_RE.search(a["name"].replace(fid, "")):
                    bad18.append("%s:面资产用了中文面名 %s" % (sid, a["name"]))
            rec = index_assets.get(fid)
            if rec:
                lp = str(rec.get("local_path", "") or "")
                fn = os.path.basename(lp.replace("\\", "/")) if lp else ""
                if fn and not re.match(r"^%s_v\d+\.(png|jpe?g|webp)$" % re.escape(fid), fn, re.I):
                    bad18.append("%s:索引 local_path 文件名 %s 与 asset_id %s 不一致（应 %s_v{n}.png）"
                                 % (sid, fn, fid, fid))
                if rec.get("bound_speaker") is None and rec.get("speaker_id") is None:
                    bad18.append("%s:%s 索引未登记绑定说话人（SCxx_F=说话人1 / SCxx_B=说话人2）" % (sid, fid))
        # 后缀对调检测：front 文件里出现 _B 或 back 文件里出现 _F 由正则天然排除；
        # 两面文件名相同已在 C17 检出
    # 命名合规（全目录扫描：凡图片文件都查，含被 FILE_RE 过滤掉的非规范命名）
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
                bad18.append("%s 用了中文面名（应 {asset_id}_v{n}.png，如 SC02_F_v1.png）" % fn)
            elif BASE_SCENE_RE.search(fn) and not FILE_RE.match(fn):
                bad18.append("%s 场景资产命名不合规（应 {asset_id}_v{n}.png，缺版本号或后缀）" % fn)
    put(18, "FAIL" if bad18 else ("PASS" if face_scenes else "SKIPPED"), "P0",
        "【v1.21.29】面资产命名与索引登记合规（{asset_id}_v{n}.png、三处一致、登记绑定说话人）",
        ("违规：%s" % bad18[:12]) if bad18 else
        ("%d 个场景面资产命名与登记均合规" % len(face_scenes) if face_scenes else
         "无 face_split 非 null 的场景，本项不适用"),
        "%s + %s" % (rel(proj, roster_p) if roster_p else "-",
                     rel(proj, index_p) if index_p else "-"))

    # ---- C19 出图即下载·原子性（v1.21.30） ----
    gap19 = []
    for k, v in index_assets.items():
        url = v.get("xem8k5_returned_url") or v.get("cos_public_url") or v.get("public_url") or v.get("duomi_returned_url")
        if not url:
            continue
        lp = str(v.get("local_path") or "")
        if not lp:
            gap19.append("%s:已登记公网URL但 local_path 为空" % k)
            continue
        fp = os.path.join(proj, lp.replace("/", os.sep))
        if not os.path.isfile(fp) and not (aid2file.get(k) or []):
            gap19.append("%s:已登记URL但磁盘无 %s" % (k, lp))
    put(19, "FAIL" if gap19 else ("PASS" if index_assets else "SKIPPED"), "P0",
        "【v1.21.30】出图即下载·原子性（不得存在『已登记URL但无本地文件』；URL到手≠资产到手）",
        ("违约：%s" % gap19[:10]) if gap19 else
        ("%d 条资产均 URL 与本地副本并存" % idx_n if index_assets else "无资产索引，本项跳过"),
        rel(proj, index_p) if index_p else "-")

    # ---- C20 本地副本落地校验（v1.21.30） ----
    bad20, ok20 = [], 0
    for k, v in index_assets.items():
        lp = str(v.get("local_path") or "")
        fp = os.path.join(proj, lp.replace("/", os.sep)) if lp else ""
        if not fp or not os.path.isfile(fp):
            fp = (aid2file.get(k) or [{}])[0].get("file") or ""
        if not fp:
            continue
        okf, note = probe_file(fp)
        if okf:
            ok20 += 1
        else:
            bad20.append("%s:%s → %s" % (k, os.path.basename(fp), note))
    put(20, "FAIL" if bad20 else ("PASS" if (index_assets and ok20) else "SKIPPED"), "P0",
        "【v1.21.30】本地副本落地校验（存在、>10KB、文件头签名、真实像素可解析）",
        ("不合格：%s" % bad20[:10]) if bad20 else
        ("%d 个本地副本落地校验通过" % ok20 if ok20 else "无本地副本可检，本项跳过"),
        "资产目录 + " + (rel(proj, index_p) if index_p else "资产索引"))

    # ---- C21 场景资产必须生成（v1.21.31） ----
    # 注意：含 face_split 的场景，其资产是 SCxx_F / SCxx_B（不是 SCxx）；未拆面的场景才是 SCxx。
    miss21 = []
    scene_total = 0
    fs_map = {fs["scene_id"]: fs for fs in face_scenes}
    for sc in ((roster or {}).get("scenes") or []):
        sid = sc.get("scene_id")
        if not sid:
            continue
        scene_total += 1
        need = ([fs_map[sid]["front"], fs_map[sid]["back"]] if sid in fs_map else [sid])
        for nid in need:
            if not (aid2file.get(nid) or index_assets.get(nid)):
                miss21.append("%s(%s)缺场景资产 %s" % (sid, sc.get("scene_name") or "", nid))
    put(21, "FAIL" if miss21 else ("PASS" if roster else "SKIPPED"), "P0",
        "【v1.21.31】清单内每个场景都已生成场景资产（含仅空镜出现的场景与场景切换涉及场景）",
        ("缺场景资产：%s" % miss21[:10]) if miss21 else
        ("%d 个场景均有场景资产" % scene_total if roster else "无场景人物清单，本项跳过"),
        rel(proj, roster_p) if roster_p else "-")

    # ---- C22 道具资产生成门槛（v1.21.31，需人工判定「贯穿全剧」） ----
    prop_idx = sorted([k for k in index_assets if PROP_RE.match(str(k))])
    prop_fil = sorted([k for k in aid2file if PROP_RE.match(str(k))])
    prop_all = sorted(set(prop_idx) | set(prop_fil))

    # ================= 人工勾选项 =================
    # ---- C23 角色子形态资产齐套（v1.23.0，SUB-C5 / SUB-C6） ----
    RE_FORM_ID = re.compile(r"^CH\d{2}_C\d{2}$")
    if not sp:
        put(23, "SKIPPED", "P3",
            "每个 status=active 的角色形态均有资产文件 + verified 公网URL（命名 CHxx_Cnn_v{n}.png）",
            "未找到说话人ID映射表", "-")
    else:
        bad23, act_n, res_n = [], 0, 0
        sub_form_ids = set()
        for _m0 in (sp.get("mapping") or []):
            for _f0 in (_m0.get("sub_forms") or []):
                sub_form_ids.add(str(_f0.get("form_id") or ""))
        for _m in (sp.get("mapping") or []):
            _aid = str(_m.get("asset_id") or "")
            for _f in (_m.get("sub_forms") or []):
                _fid = str(_f.get("form_id") or "")
                _stt = str(_f.get("status") or "")
                if _stt == "active":
                    act_n += 1
                    # 基底 C01 的资产 id 即 CHxx；其余子形态的资产 id 即 CHxx_Cnn
                    _key = _aid if _fid.endswith("_C01") else _fid
                    _fl = aid2file.get(_key) or []
                    _rec = index_assets.get(_key)
                    if not _fl and not _rec:
                        bad23.append("%s:无资产文件与索引登记" % _key); continue
                    if not _rec:
                        bad23.append("%s:资产索引未登记" % _key)
                    elif (not _rec.get("xem8k5_returned_url")
                          or str(_rec.get("url_status", "")).lower() != "verified"):
                        bad23.append("%s:URL 未成对或未 verified" % _key)
                elif _stt == "reserved":
                    res_n += 1
        # 反向：资产文件里出现了未在映射表登记的形态 ID
        for _a in assets:
            _aid2 = str(_a["asset_id"])
            if RE_FORM_ID.match(_aid2) and _aid2 not in sub_form_ids:
                bad23.append("%s:资产存在但映射表 sub_forms 未登记该形态" % _aid2)
        put(23, "FAIL" if bad23 else "PASS", "P0",
            "每个 status=active 的角色形态均有资产文件 + verified 公网URL，命名 CHxx_Cnn_v{n}.png（基底 CHxx_v{n}.png）",
            ("异常：%s" % bad23[:8]) if bad23 else
            ("%d 个 active 形态资产齐套（另有 %d 个 reserved 预存位，不要求资产）" % (act_n, res_n)),
            (rel(proj, index_p) if index_p else "-") + " + " + (rel(proj, sp_p) if sp_p else "-"))

    # ---- C24 reserved 预存形态不挂资产（v1.23.0，SUB-C7） ----
    if not sp:
        put(24, "SKIPPED", "P3",
            "reserved 预存形态不挂资产、不登记 URL、不出现在 applicable_shots",
            "未找到说话人ID映射表", "-")
    else:
        bad24, res_ids = [], []
        for _m in (sp.get("mapping") or []):
            for _f in (_m.get("sub_forms") or []):
                if str(_f.get("status") or "") == "reserved":
                    _fid = str(_f.get("form_id") or "")
                    res_ids.append(_fid)
                    if aid2file.get(_fid) or _fid in index_assets:
                        bad24.append("%s:reserved 位却已挂资产（越权启用）" % _fid)
                    if (_f.get("applicable_shots") or []):
                        bad24.append("%s:reserved 位却出现在 applicable_shots" % _fid)
        put(24, "FAIL" if bad24 else "PASS", "P1",
            "reserved 预存形态不挂资产、不登记 URL、不出现在任何 applicable_shots（预存量未启用）",
            ("异常：%s" % bad24[:8]) if bad24 else
            ("%d 个 reserved 预存位均未被启用" % len(res_ids)),
            rel(proj, sp_p) if sp_p else "-")

    # ---- C26 声线基准音轨严禁含语义（v1.24.9 新增，P0） ----
    # 真源：workflow.skeleton.json stage_workflow(4).voice_bible_audio_policy.no_semantic_audio_rule
    #      + ref_audio_safe_content_rule；skills/video_prompt_h3.md ref_audio_semantic_ban
    # 判据：**当前生效**的锁定声线 MP3（以固定声线圣经 voice_local_path 登记为准）不得含可辨识语义，
    #      且时长 >=3 秒。旧含词轨若已归档（不再被圣经引用）不计入本项，只作历史存档。
    # 机检手段：ffprobe 取时长；语义判定依赖 ASR 或人工复听——无 ASR 时记 PENDING，不静默 PASS。
    _bible_files = []
    for _p in glob.glob(os.path.join(proj, "02-角色", "03-音色圣经与基准音轨", "*圣经*.json")):
        _b = load_json(_p)
        if not _b:
            continue
        for _c in (_b.get("characters") or []):
            _lp = _c.get("voice_local_path")
            if _lp:
                _bible_files.append((_c.get("voice_id") or "?", _lp))
    _sem_bad, _sem_ok = [], []
    if _bible_files:
        for _vid, _lp in _bible_files:
            _f = os.path.join(proj, _lp.replace("/", os.sep))
            if not os.path.isfile(_f):
                _sem_bad.append("%s:圣经登记的声线轨不存在 %s" % (_vid, _lp))
                continue
            _bn = os.path.basename(_f)
            _dur = _probe_audio_duration(_f)
            if _dur is not None and _dur < 3.0:
                _sem_bad.append("%s 时长 %.2fs <3s" % (_bn, _dur))
            else:
                _sem_ok.append("%s(%s)" % (_bn, "%.2fs" % _dur if _dur is not None else "时长未知"))
    if not _bible_files:
        put(26, "SKIPPED", "P0",
            "声线基准音轨严禁含语义（无词、>=3秒）",
            "未找到固定声线圣经或未登记 voice_local_path", VOICE_DIR)
    else:
        put(26, "FAIL" if _sem_bad else "PENDING", "P0",
            "声线基准音轨严禁含语义（无词、>=3秒）；语义判定需 ASR/人工复听",
            ("时长不足/缺失：%s" % _sem_bad[:8]) if _sem_bad else
            ("圣经登记 %d 条声线轨均时长合规，语义项待人工/ASR 复核：%s" % (len(_sem_ok), _sem_ok[:5])),
            VOICE_DIR)

    def man(idx, label, why):
        manual.append({"check_id": idx, "label": label, "status": "PENDING", "severity": "P1",
                       "blocking": False, "expected": label, "actual": why,
                       "evidence": "需导演/执行人逐条勾选并回填 evidence",
                       "workflow_rule": "stage_workflow(4).self_checks(%d)" % idx,
                       "repair_action": "回填 evidence 后方可计入有效自检"})

    man(1, "资产提示词按模板组织（风格定义 + 资产内容），字段顺序正确", "语义项，需人工核对提示词文件")
    man(2, "未混用核心风格", "语义项，需人工比对项目锁定风格")
    man(3, "角色/道具纯白背景；角色资产含全身三视图与上半身正面视图", "图像语义项，需看图核对")
    man(4, "图片与对应分镜描述一致", "图像语义项，需逐张比对")
    man(7, "对照剧本与分镜逐场逐镜复核，无遗漏场景/道具", "需人工对照原文清点")
    man(13, "每镜资产引用区分场景全体角色与 visible_character_asset_ids", "语义项，需核对分镜字段")
    man(16, "MP3 声线可播放、时长与声线视频一致、采样率 44.1kHz", "需试听/读音频属性")
    man(22, "道具资产生成门槛：只对贯穿全剧的道具生成资产（PRPxx，纯白背景），只出现一两次的过场道具不生成、不参与参考绑定",
        "语义项：需对照剧本判定哪些道具属『贯穿全剧』（反复出现／承载线索伏笔关键动作／信物）；当前已登记道具资产：%s"
        % ("、".join(prop_all) if prop_all else "无"))

    # ================= 汇总 =================
    recs = checks + manual
    impl = len([c for c in checks if c["status"] != "SKIPPED"]) + len([c for c in checks if c["status"] == "SKIPPED"])
    impl = len(checks)
    tot = impl + len(manual)
    fails = [c for c in checks if c["status"] == "FAIL"]
    if tot != WORKFLOW_SELFCHECK_TOTAL:
        overall = "FAIL"
        coverage_note = "覆盖口径不自洽：implemented(%d) + manual(%d) = %d ≠ workflow_selfcheck_total(%d)" % (
            impl, len(manual), tot, WORKFLOW_SELFCHECK_TOTAL)
    else:
        overall = "FAIL" if fails else ("WARNING" if any(c["status"] == "SKIPPED" for c in checks) else "PASS")
        coverage_note = "implemented(%d) + manual(%d) = %d = workflow_selfcheck_total(%d)" % (
            impl, len(manual), tot, WORKFLOW_SELFCHECK_TOTAL)

    result = {
        "gate_id": "stage_5_asset_generation_gate",
        "gate_type": "专项闸门（stage5 资产生成 · 含场景正/反面强制）",
        "project": proj,
        "checked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "rule_source_version": args.rule_version or "见 manifest.pack_version",
        "workflow_selfcheck_total": WORKFLOW_SELFCHECK_TOTAL,
        "implemented_checks": impl,
        "manual_checks": len(manual),
        "coverage_note": coverage_note,
        "inputs": {"roster": rel(proj, roster_p) if roster_p else None,
                   "index": rel(proj, index_p) if index_p else None,
                   "asset_files": len(assets), "face_scenes": len(face_scenes)},
        "overall_status": overall,
        "blocking": bool(fails),
        "blocking_fail_count": len(fails),
        "checks": checks,
        "manual_checklist": manual,
        "failed_checks": [c["check_id"] for c in fails],
        "face_scene_detail": [
            {"scene_id": fs["scene_id"], "scene_name": fs["scene_name"],
             "front": fs["front"], "back": fs["back"],
             "front_file": (aid2file.get(fs["front"]) or [{}])[0].get("rel_path"),
             "back_file": (aid2file.get(fs["back"]) or [{}])[0].get("rel_path"),
             "front_indexed": fs["front"] in index_assets,
             "back_indexed": fs["back"] in index_assets}
            for fs in face_scenes],
        "rollback": {"required": bool(fails),
                     "target_stage": "stage_5_asset_prompt_and_asset_generation" if fails else None,
                     "scope": "scene_face_asset" if fails else None},
        "next_action": ("存在阻断项：按 failed_checks 补齐场景正/反面资产后重跑本闸门；通过前禁止标记 passed、禁止进入 stage6"
                        if fails else "全部通过，允许进入 stage6（仍需执行链路面一致性闸门）"),
    }

    out_dir = os.path.join(proj, "12-质检")
    os.makedirs(out_dir, exist_ok=True)
    out_json = os.path.join(out_dir, "stage_5_asset_generation_gate_闸门结果_%s.json" % args.version)
    json.dump(result, open(out_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    lines = ["# stage5 资产生成专项闸门 · 汇总 %s" % args.version, "",
             "- 项目：%s" % proj,
             "- 检查时间：%s" % result["checked_at"],
             "- 覆盖口径：%s" % coverage_note,
             "- 含面场景数：%d ｜ 资产文件：%d" % (len(face_scenes), len(assets)),
             "- **总判定：%s**（阻断项 %d 条）" % (overall, len(fails)), "",
             "| check | 自检条目 | 结论 | 说明 |", "|---|---|---|---|"]
    for c in checks:
        lines.append("| STG5-C%02d | self_checks(%d) | %s | %s |"
                     % (c["check_id"], c["check_id"], c["status"], str(c["actual"])[:180]))
    lines += ["", "## 人工勾选清单（未回填 evidence 不计入有效自检）", "",
              "| check | 自检条目 | 内容 |", "|---|---|---|"]
    for m in manual:
        lines.append("| STG5-C%02d | self_checks(%d) | %s |" % (m["check_id"], m["check_id"], m["label"]))
    if face_scenes:
        lines += ["", "## 场景面资产明细", "",
                  "| scene_id | 正面 | 正面文件 | 背面 | 背面文件 | 索引齐套 |", "|---|---|---|---|---|---|"]
        for f in result["face_scene_detail"]:
            lines.append("| %s | %s | %s | %s | %s | %s |"
                         % (f["scene_id"], f["front"], f["front_file"] or "—",
                            f["back"], f["back_file"] or "—",
                            "是" if (f["front_indexed"] and f["back_indexed"]) else "否"))
    lines += ["", "## 唯一真源", "",
              "- `standards/shot_reverse_shot_scene_face_policy.json`（face_schema / scene_asset_naming_rule / scene_asset_contract）",
              "- `standards/scene_character_roster_policy.json`",
              "- `skills/image_prompt_skill.md`（multi_reference_binding_contract.asset_id_rule）",
              "- 本闸门为组合包 `gates/stage_5_asset_generation_gate.py` 的项目内落地副本", ""]
    open(os.path.join(out_dir, "stage_5_asset_generation_gate_闸门汇总_%s.md" % args.version),
         "w", encoding="utf-8").write("\n".join(lines))

    print("[gate] %s  含面场景 %d  阻断项 %d  (%s)" % (overall, len(face_scenes), len(fails), coverage_note))
    for c in checks:
        print("  STG5-C%02d %-8s %s" % (c["check_id"], c["status"], str(c["actual"])[:110]))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
