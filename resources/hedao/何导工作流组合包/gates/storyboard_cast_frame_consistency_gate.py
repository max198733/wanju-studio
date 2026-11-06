#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
storyboard_cast_frame_consistency_gate.py —— 『场景与人物』↔『画面内容』一致性闸门

立闸背景（v1.22.0）：
  规则早就写了『场景与人物』栏必须由『画面内容』派生（先写画面、再据画面回填本栏），
  但**没有任何闸门真正核对这两栏**。既有的 stage4 闸门 C69 只在「画面内容里写了 CHxx」时才比对
  （`if content_ids and set(ids_in_cast) != content_ids`），而分镜卡的画面内容是自然语言、
  本来就不写 asset_id —— 于是这条检查在实践中**从不生效**；而且它只比人物，
  **场景与道具完全没比**。本闸门补上这个洞：用名字表做正反向双向核对，三类全覆盖。

唯一真源：
  骨架 stage_workflow(3).self_checks（v1.22.0 起 77 条）
  skills/storyboard_{h3,general,seedance25}.md → 『场景与人物』栏 priority 硬规则
  骨架 gate_enforcement.cast_frame_gate_ref

机检项：
  CASTFRAME-C1 正向·人物：画面内容出现某角色正式名 → 本栏必须列出该角色（带 CHxx）
  CASTFRAME-C2 正向·场景：画面内容出现某场景正式名 → 本栏必须列出该场景（带 SCxx）
  CASTFRAME-C3 正向·道具：画面内容出现某贯穿全剧道具名 → 本栏必须列出该道具（带 PRPxx）
  CASTFRAME-C4 反向·人物：本栏所列角色在画面内容中既无正式名也无 ID → 待确认（多为代词指代）
  CASTFRAME-C5 反向·道具：本栏所列道具在画面内容中未出现其名 → 待确认

严重度：
  C1/C2/C3 为 P0 —— 「画面里明确写了名字却没进本栏」是确定的漏写，必须当场补。
  C4/C5 为 WARNING —— 画面描述用「她/他/众人」等代词属正常写法，不能据此判错，
              但必须逐条人工确认；确认是漏写则按 C1~C3 的口径当场改。

**为什么场景不做反向检查**：分镜卡的『画面内容』本就不必重复场景名（写的是「书桌前」「走向门口」
这类场景内细节，场景身份由场景ID与参考图确定）。对场景做「栏里有 → 画面必须写名」的反向断言
会大面积误报，故场景只保留正向（C2：画面提到场景名就必须入栏），不做反向。

输出：
  12-质检/storyboard_cast_frame_consistency_gate_闸门结果_v{version}.json
  12-质检/storyboard_cast_frame_consistency_gate_闸门汇总_v{version}.md

用法：
  python storyboard_cast_frame_consistency_gate.py --project "C:/项目目录" [--version v1]
         [--roster 06-分镜/01-分镜管线/场景人物清单.json] [--shots S01_01,S01_02]
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检

v1.24.0 修订：本闸门只按『画面内容』的**正文段**核对（去掉最前 `承接：…｜` 与最后 `尾帧：…`）。
**v1.24.17：承上启下结构已废止，画面内容不再含这两个标记 —— `_body_content` 成为兼容性 no-op（保留以防老项目）。**
"""
import argparse, json, os, re, sys, datetime, glob

SHOT_RE = re.compile(r"镜号：\s*(S\d{2}_(?:\d{2}|D\d+))(.*?)(?=\n\s*[^\n]{0,8}镜号：\s*S\d{2}_(?:\d{2}|D\d+)|\n镜头组\s*\d+|\n##|\Z)", re.S)
FIELD_ORDER = ["镜号", "持续时长", "机位", "景别", "光影", "场景与人物", "画面内容", "运镜方式", "音效", "台词"]
RE_CHAR_ID = re.compile(r"（(CH\d{2}(?:_C\d{2})?)）")   # v1.23.0：支持角色子形态
RE_SCENE_ID = re.compile(r"（(SC\d{2}(?:_[FB])?)）")
RE_PROP_ID = re.compile(r"（(PRP\d{2})）")
RE_NAME_ID = re.compile(r"([^\s｜|（()），,。、]{1,14})[（(]((?:CH|PRP)\d{2}(?:_C\d{2})?)[）)]")
# v1.24.36：名字表同时识别角色子形态 `（CHxx_Cnn）`，否则写了子形态的镜（如夜行装 CH01_C02）
# 会被判成「画面内容出现『我』但本栏未列」——角色明明已在栏内，只因 ID 带了形态后缀。
def _base_id(x):
    return x.split("_")[0] if x else x
RE_SCENE_NAME_ID = re.compile(r"([^\s｜|（()），,。、]{1,20})[（(](SC\d{2}(?:_[FB])?)[）)]")
# 常见代词/泛称：命中则不把「本栏有、画面无名字」当漏写
PRONOUNS = ["他", "她", "它", "其", "二人", "两人", "三人", "众人", "人群", "对方",
            "彼此", "各自", "主角", "镜头中的人", "该角色", "此人", "那人"]


def rel(proj, p):
    try:
        return os.path.relpath(p, proj).replace("\\", "/")
    except Exception:
        return p


def field_of(body, name):
    pat = re.compile(r"\n[ \t]*" + name + r"：\s*(.*?)(?=\n[ \t]*(?:" + "|".join(FIELD_ORDER) + r")[：:]|\Z)", re.S)
    m = pat.search(body)
    return m.group(1).strip() if m else ""


def load_json(path):
    if not path or not os.path.isfile(path):
        return None
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return None


def _first_glob(proj, patterns):
    for pat in patterns:
        hits = sorted(glob.glob(os.path.join(proj, pat.replace("/", os.sep))))
        if hits:
            return hits[0]
    return None


def parse_storyboards(proj, paths=None):
    """paths=None：扫正式目录 06-分镜/02-场次分镜卡/。
    paths=[...]：按显式路径取（文件或目录均可），用于在草稿区对未落盘产物执行闸门（v1.24.1）。"""
    if paths:
        files, seen = [], set()
        for raw in paths:
            rp = raw if os.path.isabs(raw) else os.path.join(proj, raw.replace("/", os.sep))
            if os.path.isdir(rp):
                cand = sorted(glob.glob(os.path.join(rp, "*分镜头脚本*.md")))
            elif os.path.isfile(rp):
                cand = [rp]
            else:
                cand = []
            for f in cand:
                if f not in seen:
                    seen.add(f)
                    files.append(f)
    else:
        d = os.path.join(proj, "06-分镜", "02-场次分镜卡")
        files = sorted(glob.glob(os.path.join(d, "*分镜头脚本*.md"))) if os.path.isdir(d) else []
    shots = []
    for f in files:
        t = open(f, encoding="utf-8", errors="ignore").read()
        for sid, body in SHOT_RE.findall(t):
            shots.append({"shot_id": sid, "file": rel(proj, f),
                          "cast": field_of(body, "场景与人物"),
                          "content": field_of(body, "画面内容")})
    return shots, files


def _body_content(content):
    """取『画面内容』的正文段（去掉最前的 `承接：…｜` 与最后的 `尾帧：…`）。
    v1.24.0：承接段复述上一镜尾帧、尾帧段预告下一镜，均不代表本镜实际入画内容——
    本闸门只按正文段核对『画面内容』↔『场景与人物』，避免把上一镜的人物算进本镜。"""
    t = str(content or "")
    t = re.sub(r"^\s*承接：[^｜|]*[｜|]?", "", t, count=1)
    t = re.sub(r"[｜|]?\s*尾帧：[\s\S]*$", "", t, count=1)
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--roster", default="")
    ap.add_argument("--shots", default="")
    ap.add_argument("--rule-version", default="")
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    if not os.path.isdir(proj):
        print("[gate] 项目目录不存在：%s" % proj)
        return 2

    raw_shots = [s.strip() for s in (args.shots or "").split(",") if s.strip()]
    # --shots 双语义（v1.24.1）：含路径分隔符或 .md 结尾 → 视为显式路径（文件或目录，支持草稿区执行）；
    #                            否则沿用旧语义（按分镜卡文件名过滤）。
    as_paths = any(("/" in s or "\\" in s or s.lower().endswith(".md")) for s in raw_shots)
    shots, sb_files = parse_storyboards(proj, raw_shots if as_paths else None)
    if raw_shots and not as_paths:
        want = set(raw_shots)
        shots = [s for s in shots if s["shot_id"] in want]
    roster_p = (os.path.join(proj, args.roster.replace("/", os.sep)) if args.roster
                else _first_glob(proj, ["06-分镜/01-分镜管线/场景人物清单*.json"]))
    roster = load_json(roster_p)

    if not shots:
        print("[gate] 无输入：未找到任何分镜头脚本（06-分镜/02-场次分镜卡/*分镜头脚本*.md）")
        return 2

    # ---------- 名字表 ----------
    char_table, scene_table = {}, {}
    if isinstance(roster, dict):
        for sc in (roster.get("scenes") or []):
            sid, sname = sc.get("scene_id"), (sc.get("scene_name") or "").strip()
            if sid and sname:
                scene_table[sname] = sid
            for p in (sc.get("roster") or sc.get("presence_roster") or []):
                nm, aid = (p.get("character_name") or p.get("role_name") or "").strip(), p.get("asset_id")
                if nm and aid and str(aid).startswith("CH"):
                    char_table[nm] = str(aid)
    # 道具表：全片扫描『场景与人物』栏里已登记的「道具名（PRPxx）」
    prop_table = {}
    for s in shots:
        for nm, pid in RE_NAME_ID.findall(s["cast"]):
            if pid.startswith("PRP"):
                prop_table.setdefault(nm.strip(), _base_id(pid))
    # 角色表兜底：从分镜卡『场景与人物』栏补（清单可能缺角色）
    for s in shots:
        for nm, cid in RE_NAME_ID.findall(s["cast"]):
            if cid.startswith("CH"):
                char_table.setdefault(nm.strip(), _base_id(cid))
    # 场景表兜底
    for s in shots:
        for nm, sid in RE_SCENE_NAME_ID.findall(s["cast"]):
            scene_table.setdefault(nm.strip(), sid)

    # 长名优先，避免子串误判
    chars = sorted(char_table.items(), key=lambda kv: -len(kv[0]))
    scenes = sorted(scene_table.items(), key=lambda kv: -len(kv[0]))
    props = sorted(prop_table.items(), key=lambda kv: -len(kv[0]))

    def has_pronoun(txt):
        return any(p in txt for p in PRONOUNS)


    # ---------- 逐镜检查 ----------
    fwd_char, fwd_scene, fwd_prop = [], [], []
    rev_char, rev_prop = [], []
    for s in shots:
        cast, content = s["cast"], _body_content(s["content"])   # v1.24.0：只按正文段核对
        sid = s["shot_id"]
        cast_c = set(_base_id(x) for x in RE_CHAR_ID.findall(cast))   # v1.24.36：子形态归一为基底 ID
        cast_s = set(RE_SCENE_ID.findall(cast))
        cast_p = set(RE_PROP_ID.findall(cast))

        # 正向：画面内容提到正式名 → 本栏必须有
        for nm, cid in chars:
            if nm in content and cid not in cast_c:
                fwd_char.append("%s:画面内容出现『%s』但本栏未列（应补 『%s（%s）』）" % (sid, nm, nm, cid))
        for nm, scid in scenes:
            base = scid[:4]
            if nm in content and base not in {x[:4] for x in cast_s}:
                fwd_scene.append("%s:画面内容出现场景『%s』但本栏未列（应补 『%s（%s）』）" % (sid, nm, nm, scid))
        for nm, pid in props:
            if nm in content and pid not in cast_p:
                fwd_prop.append("%s:画面内容出现道具『%s』但本栏未列（应补 『%s（%s）』）" % (sid, nm, nm, pid))

        # 反向：本栏所列 → 画面内容需有正式名或 ID 线索；无则待确认（可能代词）
        # 注意：场景不做反向（画面描述本就不必重复场景名，做了会大面积误报），只做主效果最强的角色与道具。
        for cid in sorted(cast_c):
            nm = next((n for n, i in char_table.items() if i == cid), "")
            if nm and nm not in content and cid not in content:
                rev_char.append("%s:本栏列了『%s（%s）』但画面内容未出现其名或ID%s"
                                % (sid, nm, cid, "（画面内有代词，若为其指代请确认）" if has_pronoun(content) else ""))
        for pid in sorted(cast_p):
            nm = next((n for n, i in prop_table.items() if i == pid), "")
            if nm and nm not in content:
                rev_prop.append("%s:本栏列了道具『%s（%s）』但画面内容未出现其名" % (sid, nm, pid))

    checks = []

    def put(cid, status, severity, label, actual, evidence, blocking=None):
        checks.append({"check_id": cid, "label": label, "status": status, "severity": severity,
                       "blocking": (status == "FAIL" and severity == "P0") if blocking is None else (status == "FAIL" and blocking),
                       "expected": label, "actual": actual, "evidence": evidence,
                       "workflow_rule": "stage_workflow(3).self_checks(76) + gate_enforcement.cast_frame_gate_ref",
                       "repair_action": None if status == "PASS" else
                       "按提示当场修改该镜分镜卡（画面内容提到什么就补什么 / 本栏多写的删掉或回补画面描述），改完重跑本闸门"})

    put("CASTFRAME-C1", "FAIL" if fwd_char else "PASS", "P0",
        "画面内容提到某角色 → 『场景与人物』栏必须列出该角色（带 CHxx）",
        fwd_char[:20] if fwd_char else "全部 %d 镜：画面提到的角色均已入栏" % len(shots),
        "%d 张分镜卡（角色名表 %d 人）" % (len(sb_files), len(char_table)))
    put("CASTFRAME-C2", "FAIL" if fwd_scene else "PASS", "P0",
        "画面内容提到某场景 → 『场景与人物』栏必须列出该场景（带 SCxx）",
        fwd_scene[:20] if fwd_scene else "全部 %d 镜：画面提到的场景均已入栏" % len(shots),
        "%d 张分镜卡（场景名表 %d 个）" % (len(sb_files), len(scene_table)))
    put("CASTFRAME-C3", "FAIL" if fwd_prop else "PASS", "P0",
        "画面内容提到某贯穿全剧道具 → 『场景与人物』栏必须列出该道具（带 PRPxx）",
        fwd_prop[:20] if fwd_prop else "全部 %d 镜：画面提到的道具均已入栏" % len(shots),
        "%d 张分镜卡（道具名表 %d 个）" % (len(sb_files), len(prop_table)))
    put("CASTFRAME-C4", "FAIL" if rev_char else "PASS", "WARNING",
        "本栏所列角色在画面内容里必须有线索（正式名或 ID；代词指代需逐条确认）",
        rev_char[:20] if rev_char else "全部 %d 镜：本栏角色均有画面线索" % len(shots),
        "%d 张分镜卡" % len(sb_files), blocking=False)
    put("CASTFRAME-C5", "FAIL" if rev_prop else "PASS", "WARNING",
        "本栏所列道具在画面内容里必须有线索（正式名）",
        rev_prop[:20] if rev_prop else "全部 %d 镜：本栏道具均有画面线索" % len(shots),
        "%d 张分镜卡" % len(sb_files), blocking=False)

    fails = [c for c in checks if c["blocking"]]
    warns = [c for c in checks if c["status"] == "FAIL" and not c["blocking"]]
    overall = "FAIL" if fails else ("WARNING" if warns else "PASS")
    result = {
        "gate_id": "storyboard_cast_frame_consistency_gate",
        "gate_type": "专项闸门（『场景与人物』↔『画面内容』一致性）",
        "project": proj,
        "checked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "rule_source_version": args.rule_version or "见 manifest.pack_version",
        "inputs": {"storyboard_files": len(sb_files), "shots": len(shots),
                   "roster": rel(proj, roster_p) if roster_p else None,
                   "char_table": len(char_table), "scene_table": len(scene_table), "prop_table": len(prop_table)},
        "overall_status": overall, "blocking": bool(fails),
        "blocking_fail_count": len(fails), "warning_count": len(warns),
        "checks": checks, "failed_checks": [c["check_id"] for c in fails],
        "warning_checks": [c["check_id"] for c in warns],
        "next_action": ("存在漏写：按 failed_checks 的出项当场补齐该镜『场景与人物』栏后重跑本闸门；"
                        "C4/C5 的待确认项需逐条人工判定（代词指代可标确认，确属漏写按 C1~C3 口径改）"
                        if (fails or warns) else "『场景与人物』与『画面内容』三类全部一致"),
    }

    out_dir = os.path.join(proj, "12-质检")
    os.makedirs(out_dir, exist_ok=True)
    json.dump(result, open(os.path.join(out_dir, "storyboard_cast_frame_consistency_gate_闸门结果_%s.json" % args.version),
                           "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    lines = ["# 『场景与人物』↔『画面内容』一致性闸门 · 汇总 %s" % args.version, "",
             "- 项目：%s" % proj,
             "- 检查时间：%s" % result["checked_at"],
             "- 规模：%d 镜 ｜ 角色名表 %d ｜ 场景名表 %d ｜ 道具名表 %d"
             % (len(shots), len(char_table), len(scene_table), len(prop_table)),
             "- **总判定：%s**（阻断 %d / 待确认 %d）" % (overall, len(fails), len(warns)), "",
             "| check | 内容 | 结论 | 说明 |", "|---|---|---|---|"]
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        lines.append("| %s | %s | %s | %s |" % (c["check_id"], c["label"], c["status"], act[:220]))
    lines += ["", "> C1~C3 是**确定的漏写**（画面里明确写了名字却没进本栏），必须当场补；",
              "> C4~C5 是**待确认**（画面用「她/他/众人」等代词属正常写法），需逐条人工判定。", "",
              "## 唯一真源", "",
              "- 骨架 `stage_workflow(3).self_checks(76)` + `gate_enforcement.cast_frame_gate_ref`",
              "- `skills/storyboard_{h3,general,seedance25}.md` → 『场景与人物』栏 priority 硬规则",
              "- 本闸门为组合包 `gates/storyboard_cast_frame_consistency_gate.py` 的项目内落地副本", ""]
    open(os.path.join(out_dir, "storyboard_cast_frame_consistency_gate_闸门汇总_%s.md" % args.version),
         "w", encoding="utf-8").write("\n".join(lines))

    print("[gate] %s  受检 %d 镜  阻断 %d  待确认 %d" % (overall, len(shots), len(fails), len(warns)))
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        print("  %s %-8s %s" % (c["check_id"], c["status"], act[:120]))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
