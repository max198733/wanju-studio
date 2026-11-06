#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stage_4_storyboard_generation_gate.py —— stage4 拆分镜专项闸门

唯一真源（全部按 gate_enforcement.threshold_source_rule 取自包内，禁止硬编码凭记忆的名单）：
  workflow.skeleton.json          → stage_workflow(3).self_checks 全条文本与总数（workflow_selfcheck_total）
  standards/shot_group_types.json → 六类组形式闭集 + 组内结构约束
  standards/camera_movement_system.json → 六类运镜闭集 + 逐类适用范围与运镜起止规则（v1.22.0）
  standards/shot_scale_standard.json    → 景别六类、特写焦点规矩与组内相邻景别约束（v1.22.0）
  standards/transition_shot_system.json  → 场景转换过渡镜配比 + 三类标准转场镜头（v1.22.0）
  standards/storyboard_execution_framework.json → 执行总纲（九步工序 / 格式要求 / 闭集使用规则 / 禁令）
  standards/eye_line_and_gaze_policy.json       → 眼神落点与禁直视镜头

本闸门解决的问题（v1.22.0 新增，导演实测口径）：
  旧闸门只有一条「固定镜头占比 ≤30%」，只防『画面呆板』，防不住『全片只写一种运镜』。
  实测反例：守恒商店第 1 集 v3 —— 68 镜中 44 镜（65%）为「拉近运镜」、固定镜头仅 5 镜（7%），
  旧的 ≤30% 单条闸门完整放行。本闸门新增 STG4-C1/C2/C3/C4 四组硬校验堵死该缺口。

新增硬校验（在逐条覆盖 72 条 self_checks 之外）：
  STG4-C1 组类型：闭集合规 + 多样性（种类数 ≥ min(3,组数)、单一组类型 ≤60%）
  STG4-C2 运镜闭集：每镜运镜逐字命中六类（v1.22.0；空白归一后比对），无自创/复合/空字段
  STG4-C3 运镜适用范围：固定=常规叙事(50%-60%) / 水平·垂直展示=多对象挨个展现 / 拉近=大空间聚焦小细节 /
                        拉远=细节特写后拉展示空间 / 环绕=展示主角或带出旁边人事 / 跟拍=人物有移动或动作
  STG4-C4 运镜配比与反单一化四项（v1.22.0，互不替代）：①固定占比 50%-60% ②单一运镜 ≤40%（固定豁免）
                        ③相邻同运镜连续 ≤2 镜（固定豁免，可无限连续） ④种类数 ≥ min(4,镜数)
  STG4-C7 组内相邻景别不得相同（豁免：正反打/连续整体展示/连续细节展示）
  STG4-C8 转场镜头：标记类型合法 + 过渡镜位一律为标准转场镜头（v1.24.30，空镜配额 0）
  STG4-C9 运镜起点与终点：非固定运镜须写明起止（跟拍须写明焦点是谁）
  STG4-C10 过肩使用范围：仅两种合法情形
  STG4-C5 字段格式完整性：九字段齐全 + 顺序一致 + 景别闭集（禁『中近景』模糊表述）
  STG4-C6 『场景与人物』硬校验：数量与画面内容一致 / 逐人带 asset_id / 场景带 scene_id / 未整抄场景清单
  STG4-C18 同场景站位一致性：站位子格式解析 / 参照物唯一 / 未走动方位一致 / 走动后整体更新 / 九项方位闭集（v1.24.15）

覆盖口径（gate_enforcement.coverage_rule）：
  implemented_checks + manual_checks = workflow_selfcheck_total，且覆盖索引必须等于 0..TOTAL-1；
  不满足则该次自检无效，overall_status 强制 FAIL。

输出（gate_enforcement.outputs 唯一命名）：
  12-质检/stage_4_storyboard_generation_闸门结果_v{version}.json   机器权威判定源
  12-质检/stage_4_storyboard_generation_闸门汇总_v{version}.md     人工阅读说明

用法：
  python stage_4_storyboard_generation_gate.py --project "C:/项目目录" [--version v1]
         [--summary]          # 精简输出：stdout/md 只给判定与 FAIL（AI 自检用）；JSON 结果仍全量
         [--pack-dir "C:/黛西/技能组/何导工作流组合包"]
         [--storyboard 06-分镜/02-场次分镜卡/S01_分镜头脚本_v1.md]   # 可重复，显式指定分镜卡
         [--allow-total-duration-override]                          # 总时长超出运行配置目标时长 ±15 秒容差但已获导演豁免
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检
本闸门 v1.22.0 修订：运镜闭集八类→六类、固定占比 30%→50%-60%、组内镜数上限改为「讲明白一件事」、新增组内相邻景别 / 转场镜 / 运镜起止 / 过肩范围四组校验。\n本闸门 v1.24.0 修订：新增 C15 画面内容承上启下（CONT-C1 / CONT-C2 / CONT-C3：每镜须含 `承接：`（最前）与 `尾帧：`（最后）标记，且本镜承接须与上一镜尾帧**逐字一致**，首镜用固定句式）、C16 尾帧可承接性（CONT-C4：尾帧须具体、≥12 字、非抽象概括）；C49（大景别不写极细微细节）改为**只扫正文段**、C59（特写焦点）放宽标记位置（承接段在最前）。
本闸门 v1.23.0 修订：①修复 C27（战斗组由旧「固定 4 镜 + 第二镜特写」改为「4-6 镜 + 特效环节所在镜特写」，与 C1 口径统一）；②C44 与 C80 去重（第 44 条只判肩主标注，使用范围归第 80 条）；③C67 与 C58 去重（固定占比只由第 58 条判）；④C31 文案改为「过渡镜」；⑤新增 C11 正反打长台词反应镜、C12~C14 角色子形态（ID 命名与登记 / 同镜单一形态 / ID 预存量）。
本闸门 v1.24.15 修订：新增 C18 同场景站位一致性（站位子格式解析 / 参照物唯一 / 未走动方位一致 / 走动后整体更新 / 九项方位闭集）；C17 人物计数口径明确为『有名出镜角色 CHxx』（无名环境人群 extras 不进本栏、不计入上限）。
"""
import argparse, datetime, glob, json, os, re, sys

STAGE_ID = "stage_4_storyboard_generation"
GATE_NAME = "stage_4_storyboard_generation_gate"
STAGE_INDEX = 3
DEFAULT_PACK_DIR = r"C:\黛西\技能组\何导工作流组合包"

# 景别六类闭集（与 standards/shot_scale_standard.json 的 detail_writing_rule 同口径）
SHOT_SCALES = ["远景", "全景", "中景", "近景", "特写", "大特写"]
# 单镜字段顺序（与 standards/storyboard_specification.json 的 fixed_fill_in_format 同源）
FIELD_ORDER = ["持续时长", "机位", "景别", "光影", "场景与人物", "画面内容", "运镜方式", "音效", "台词"]

# ---- 运镜适用范围的启发式词表（仅用于 STG4-C3；闭集本身以 standards 为准） ----
SCOPE_HINTS = {
    "水平/垂直展示运镜": ["展示", "阵容", "列", "并排", "挨个", "逐个", "依次", "陈列", "排开", "一字", "所有人", "所有人并"],
    "拉近运镜": ["推近", "聚焦", "逐渐", "收缩", "放大", "越来越近", "细节", "推向"],
    "拉远运镜": ["后拉", "拉远", "拉出", "全貌", "整个", "整体空间", "揭示", "退远", "显出"],
    "环绕运镜": ["环绕", "绕", "一圈", "半圈", "两侧", "旁边", "身侧", "转到"],
    "跟拍运镜": ["跟", "随", "移动", "走", "跑", "奔", "冲", "行", "位移", "追", "前进", "步"],
}
# 情感/节拍关键词（用于判断『固定运镜』是否被滥用在不该固定的镜上 —— 仅 WARNING）
STILL_OK_HINT = ["平静", "日常", "常态", "无人物", "无眼神要求", "空", "静"]

CAMERA_MOVEMENT_KEYWORDS = {
    "固定运镜": ["固定运镜", "固定镜头"],
    "水平/垂直展示运镜": ["水平/垂直展示运镜", "水平展示运镜", "垂直展示运镜", "展示运镜"],
    "拉近运镜": ["拉近运镜", "拉近"],
    "拉远运镜": ["拉远运镜", "拉远"],
    "环绕运镜": ["环绕运镜", "环绕"],
    "跟拍运镜": ["跟拍运镜", "跟拍"],
}
# 三类标准转场（v1.22.0，真源 standards/transition_shot_system.json）
TRANSITION_TYPES = ["遮挡物穿越转场", "位移物遮挡转场", "物体不变·场景变换转场"]


# ================================================================ 工具

def load_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def rel(project, p):
    try:
        return os.path.relpath(p, project).replace("\\", "/")
    except Exception:
        return p


def nz(s):
    """空白归一：比对运镜名 / 组类型名之前必须调用（标准件里写『水平/垂直展示运镜』，分镜卡常写『水平 / 垂直展示运镜』）。"""
    return re.sub(r"\s+", "", str(s or ""))


def norm_scene(s):
    return re.sub(r"[\s·・\-—]+", "", str(s or ""))


def strip_continuity(content):
    """取『画面内容』的**正文段**：去掉 `承接：…｜`（最前）与 `尾帧：…`（最后）。
    v1.24.0：承接段复述上一镜尾帧、尾帧段预告下一镜状态，**均不代表本镜实际入画内容**，
    故「入画人物 / 景别粒度 / 细微细节」类检查只在正文段上进行，避免误报。"""
    t = str(content or "")
    t = re.sub(r"^\s*承接：[^｜|]*[｜|]?", "", t, count=1)
    t = re.sub(r"[｜|]?\s*尾帧：[\s\S]*$", "", t, count=1)
    return t


def strip_group_suffix(name):
    """去掉组类型名尾部的括号注释：『从大到小（焦点聚焦逻辑）』→『从大到小』。"""
    return re.sub(r"[（(].*$", "", str(name or "")).strip()


# ================================================================ 解析分镜卡

# v1.24.22：前瞻须同时止于「下一条普通镜号」与「下一条细节镜号（S0x_Dnn）」，
# 否则前一个普通镜的 body 会吞并紧跟其后的组间细节镜文本，污染该镜内容。
_SHOT_STOP = r"(?=\n\s*[^\n]{0,8}镜号：\s*S\d{2}_\d{2}|\n\s*[^\n]{0,8}镜号：\s*S\d{2}_D\d+|\n镜头组\s*\d+|\n##|\Z)"
SHOT_RE = re.compile(r"镜号：\s*(S\d{2}_\d{2})(.*?)" + _SHOT_STOP, re.S)
# 组间细节镜（v1.24.21 新增编号制：S0x_Dnn）——独立于镜头组，单独解析、不并入 groups 统计
DETAIL_SHOT_RE = re.compile(r"镜号：\s*(S\d{2}_D\d+)(.*?)" + _SHOT_STOP, re.S)
GROUP_RE = re.compile(r"镜头组\s*(\d+)\s*[（(]\s*组类型：\s*([^|｜]+?)\s*[|｜]\s*叙事目的：\s*([^）)]+)[）)]")
RE_CHAR_ID = re.compile(r"（(CH\d{2})）")
RE_PROP_ID = re.compile(r"（(PRP\d{2})）")
RE_SCENE_ID = re.compile(r"（(SC\d{2}(?:_[FB])?)）")
RE_SCENE_NAME_FIRST = re.compile(r"([\u4e00-\u9fa5A-Za-z0-9]+)（SC\d{2}")
# 角色子形态 ID（v1.23.0）：CHxx_Cnn
RE_CHAR_FORM_ID = re.compile(r"（(CH\d{2}_C\d{2})）")
# 非法形态后缀探测：CHxx 后面跟了非 _C{两位} 的内容
RE_BAD_FORM_SUFFIX = re.compile(r"(CH\d{2})(_?[A-Za-z\u4e00-\u9fa5]\w*)")


def field_of(body, name):
    pat = re.compile(r"\n[ \t]*" + name + r"：\s*(.*?)(?=\n[ \t]*(?:" + "|".join(FIELD_ORDER) + r"|镜头角色)[：:]|\Z)", re.S)
    m = pat.search(body)
    return m.group(1).strip() if m else None


def field_positions(body):
    """返回 {字段名: 在 body 中的出现位置}，用于校验字段顺序。"""
    pos = {}
    for k in FIELD_ORDER:
        m = re.search(r"\n[ \t]*" + k + r"：", body)
        if m:
            pos[k] = m.start()
    return pos


def parse_storyboard_file(path):
    t = open(path, encoding="utf-8").read()
    shots = []
    for sid, body in SHOT_RE.findall(t):
        g = lambda k: field_of(body, k)
        dur_s = g("持续时长") or ""
        line = (g("台词") or "").strip()
        # 分镜卡里『台词：』只是字段前缀，其值才是完整格式 `XXX（声线丨语气）台词：[正文]`；无台词镜该字段为空 → dialogue=None。
        m = re.search(r"台词：\[(.*?)\]\s*$", line)
        shots.append({
            "shot_id": sid,
            "file": path,
            "raw": body,
            "dur": int(re.sub(r"\D", "", dur_s)) if re.search(r"\d", dur_s) else 0,
            "dur_field": dur_s,
            "camera_position": g("机位") or "",
            "shot_scale": (g("景别") or "").strip(),
            "light": g("光影") or "",
            "cast": g("场景与人物") or "",
            "content": g("画面内容") or "",
            "movement": (g("运镜方式") or "").strip(),
            "sfx": g("音效"),
            "line_raw": line,
            "dialogue": m.group(1).strip() if m else None,
            "field_pos": field_positions(body),
        })
    groups = []
    hits = [(m.start(), m.group(2).strip(), m.group(3).strip()) for m in GROUP_RE.finditer(t)]
    for i, (pos, gt, purpose) in enumerate(hits):
        end = hits[i + 1][0] if i + 1 < len(hits) else len(t)
        seg = t[pos:end]
        ids = [s["shot_id"] for s in shots if ("镜号：" + s["shot_id"]) in seg]
        mcam = re.search(r"组级总体运镜[：:]\s*(.+)", seg)
        groups.append({"group_index": i + 1, "group_type_raw": gt, "group_type": strip_group_suffix(gt),
                       "purpose": purpose, "shot_ids": ids, "file": path,
                       "aggregate_camera": mcam.group(1).strip() if mcam else ""})
    return t, shots, groups


def parse_detail_shots(text, path):
    """解析组间细节镜（S0x_Dnn）。不并入 groups；仅用于 STG4-C20（组间细节镜）。"""
    out = []
    for sid, body in DETAIL_SHOT_RE.findall(text):
        dur_s = field_of(body, "持续时长") or ""
        out.append({
            "shot_id": sid,
            "file": path,
            "pos": text.find("镜号：" + sid),
            "dur": int(re.sub(r"\D", "", dur_s)) if re.search(r"\d", dur_s) else 0,
            "camera_position": field_of(body, "机位") or "",
            "shot_scale": (field_of(body, "景别") or "").strip(),
            "cast": field_of(body, "场景与人物") or "",
            "content": field_of(body, "画面内容") or "",
            "movement": (field_of(body, "运镜方式") or "").strip(),
        })
    return out


# ================================================================ 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--pack-dir", default=os.environ.get("HEDAO_PACK_DIR", DEFAULT_PACK_DIR))
    ap.add_argument("--storyboard", action="append", default=[])
    ap.add_argument("--allow-total-duration-override", action="store_true")
    ap.add_argument("--summary", action="store_true",
                    help="精简输出：stdout/md 只给判定与 FAIL 项（AI 自检用）；JSON 结果文件仍为全量。默认关闭，行为与旧版一致。")
    args = ap.parse_args()
    summary = bool(getattr(args, "summary", False))

    project = os.path.abspath(args.project)
    pack = os.path.abspath(args.pack_dir)
    ver = args.version
    now = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()

    # ---------- 骨架与标准件 ----------
    skeleton_p = os.path.join(pack, "workflow.skeleton.json")
    if not os.path.isfile(skeleton_p):
        print("PACK NOT FOUND: " + skeleton_p)
        print("请用 --pack-dir 指定组合包目录（或设置环境变量 HEDAO_PACK_DIR）")
        return 2
    skeleton = load_json(skeleton_p)
    stage = skeleton["stage_workflow"][STAGE_INDEX]
    SELF_CHECKS_TEXT = list(stage["self_checks"])
    TOTAL = len(SELF_CHECKS_TEXT)

    std_dir = os.path.join(pack, "standards")
    std = {}
    for name in ["shot_group_types", "camera_movement_system", "shot_scale_standard",
                 "storyboard_execution_framework", "eye_line_and_gaze_policy"]:
        p = os.path.join(std_dir, name + ".json")
        std[name] = load_json(p)["payload"] if os.path.isfile(p) else None
    GROUP_TYPES = [x["type_name"] for x in (std["shot_group_types"] or [])]
    GROUP_SHORTS = [strip_group_suffix(x) for x in GROUP_TYPES]
    MOVEMENTS = [x["movement_name"] for x in (std["camera_movement_system"] or [])]
    MOVESET = {nz(x) for x in MOVEMENTS}

    def pick(folder, prefix, ext, pinned=None):
        d = os.path.join(project, *folder.split("/"))
        if pinned:
            p = os.path.join(d, "%s_%s%s" % (prefix, pinned, ext))
            if os.path.isfile(p):
                return p
        if not os.path.isdir(d):
            return os.path.join(d, "%s_v1%s" % (prefix, ext))
        cands = []
        for f in os.listdir(d):
            m = re.match(r"^%s_v(\d+)%s$" % (re.escape(prefix), re.escape(ext)), f)
            if m:
                cands.append((int(m.group(1)), os.path.join(d, f)))
        return sorted(cands)[-1][1] if cands else os.path.join(d, "%s_v1%s" % (prefix, ext))

    # ---------- 输入 ----------
    if args.storyboard:
        sb_paths = [os.path.abspath(x) if os.path.isabs(x) else os.path.join(project, x) for x in args.storyboard]
    else:
        d = os.path.join(project, "06-分镜", "02-场次分镜卡")
        if not os.path.isdir(d):
            print("MISSING INPUTS: 06-分镜/02-场次分镜卡")
            print("无分镜卡可检（退出码 2）")
            return 2
        # 每场次取最高版本
        best = {}
        for f in os.listdir(d):
            m = re.match(r"^(S\d{2})_分镜头脚本_v(\d+)\.md$", f)
            if m:
                key, v = m.group(1), int(m.group(2))
                if key not in best or v > best[key][0]:
                    best[key] = (v, os.path.join(d, f))
        sb_paths = [v[1] for _, v in sorted(best.items())]
        if not sb_paths:  # 兜底：单文件全一集命名
            cand = [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".md") and "分镜头脚本" in f]
            sb_paths = sorted(cand)[:1]

    if not sb_paths:
        print("MISSING INPUTS: 未找到任何分镜头脚本 md")
        return 2

    sb_text_all, shots, groups = [], [], []
    DETAIL_SHOTS, SB_TEXT_BY_FILE = [], {}
    for p in sb_paths:
        t, sh, gr = parse_storyboard_file(p)
        sb_text_all.append(t)
        shots += sh
        groups += gr
        SB_TEXT_BY_FILE[p] = t
        DETAIL_SHOTS += parse_detail_shots(t, p)
    sb_text = "\n".join(sb_text_all)
    sb_rel = ", ".join(rel(project, p) for p in sb_paths)
    shots.sort(key=lambda s: (s["shot_id"][:3], s["shot_id"][4:]))
    if not shots:
        print("MISSING INPUTS: 分镜卡内未解析出任何镜头（镜号格式应为 S01_01）")
        return 2

    def uniq(seq):
        """去重保序（v1.24.36）：同一角色在『场景与人物』栏里同时出现在人物清单与站位子格式中
        （例：我（CH01）、客厅（SC02）｜站位：参照物【茶几】｜我（CH01）［参照物背景］），
        属规范写法，不得按出现次数重复计人。计数口径=有名出镜角色的**唯一** CHxx 个数。"""
        out = []
        for x in seq:
            if x not in out:
                out.append(x)
        return out

    def cast_ids(c):
        """v1.24.36：人物 ID 计数同时识别基底形态 `（CHxx）` 与子形态 `（CHxx_Cnn）`，
        两者一律按**角色基底 ID** 归一后去重（同一角色换了形态仍是一个人）。
        旧版只认 `（CHxx）`，导致写了子形态的镜头（如全片夜行装 CH01_C02）人物数被判成 0/1，
        C17 人物上限、C27 群像景别、C29 入画名单、C11 眼神落点等一整套人数相关校验全部静默失效。"""
        out = []
        for x in RE_CHAR_ID.findall(c) + RE_CHAR_FORM_ID.findall(c):
            b = x.split("_")[0]
            if b not in out:
                out.append(b)
        return out

    def form_ids(c):
        return uniq(RE_CHAR_FORM_ID.findall(c))

    def cast_scenes(c):
        return RE_SCENE_ID.findall(c)

    # ---------- 辅助输入（缺失则相关条目 SKIPPED，不阻断） ----------
    map_p = pick("02-角色/04-说话人ID映射表", "说话人ID映射表", ".json")
    bible_p = pick("02-角色/03-音色圣经与基准音轨", "固定声线圣经", ".json")
    roster_p = pick("06-分镜/01-分镜管线", "场景人物清单", ".json")
    stat_p = pick("06-分镜/01-分镜管线", "分镜总时长统计", ".json")
    state_p = os.path.join(project, "13-工作流文档", "阶段状态.json")
    cfg_p = os.path.join(project, "13-工作流文档", "运行配置.json")

    mapping = load_json(map_p) if os.path.isfile(map_p) else None
    bible = load_json(bible_p) if os.path.isfile(bible_p) else None
    roster = load_json(roster_p) if os.path.isfile(roster_p) else None
    stat = load_json(stat_p) if os.path.isfile(stat_p) else None
    state = load_json(state_p) if os.path.isfile(state_p) else None
    cfg = load_json(cfg_p) if os.path.isfile(cfg_p) else None

    missing_aux = [rel(project, x) for x in [map_p, bible_p, roster_p, stat_p, state_p, cfg_p] if not os.path.isfile(x)]
    engine = (cfg or {}).get("video_engine") or ""
    is_sd25 = engine == "seedance" and (cfg or {}).get("seedance_model") == "seedance2.5"
    SD25_ONLY_IDX = {13, 14, 15, 60, 61}

    # ---------- 统计：组类型 / 运镜 ----------
    import collections
    gt_counter = collections.Counter(g["group_type"] for g in groups)

    # ---- 运镜取值：逐镜『运镜方式』字段优先；seedance2.5 组内不逐镜写时回落到「组级总体运镜」分段 ----
    SHOT_BY_ID = {s["shot_id"]: s for s in shots}
    eff_mv, mv_source = {}, {}
    for g in groups:
        agg = g.get("aggregate_camera") or ""
        parts = [x for x in re.split(r"[→；;，,]", agg) if x.strip()]
        names = []
        for p in parts:
            for mvi in MOVEMENTS:
                if nz(mvi) and nz(mvi) in nz(p):
                    names.append(mvi)
                    break
        n = len(g["shot_ids"])
        for i, sid in enumerate(g["shot_ids"]):
            if sid not in SHOT_BY_ID:
                continue
            if nz(SHOT_BY_ID[sid]["movement"]):
                eff_mv[sid], mv_source[sid] = SHOT_BY_ID[sid]["movement"], "per_shot"
            elif names:
                eff_mv[sid] = names[i] if i < len(names) else names[-1]
                mv_source[sid] = "group_aggregate"
            else:
                eff_mv[sid], mv_source[sid] = "", "missing"
    for s in shots:
        if s["shot_id"] not in eff_mv:
            eff_mv[s["shot_id"]] = s["movement"]
            mv_source[s["shot_id"]] = "per_shot" if nz(s["movement"]) else "missing"

    def _mv_name(v):
        """从『运镜方式』字段提取闭集运镜名（v1.22.0：该字段须写明起点与终点，不能整串比对闭集）。"""
        _s = nz(v)
        for _n in sorted(MOVEMENTS, key=lambda x: -len(nz(x))):
            if nz(_n) and nz(_n) in _s:
                return _n
        return _s
    mv_norm = [_mv_name(eff_mv[s["shot_id"]]) for s in shots]
    mv_counter = collections.Counter(mv_norm)
    total_shots = len(shots)
    fixed_cnt = mv_counter.get(nz("固定运镜"), 0)
    fixed_pct = round(100.0 * fixed_cnt / total_shots, 1) if total_shots else 0.0
    mv_kinds = len([k for k in mv_counter if k])
    top_mv, top_mv_cnt = (mv_counter.most_common(1)[0] if mv_counter else ("", 0))
    top_mv_pct = round(100.0 * top_mv_cnt / total_shots, 1) if total_shots else 0.0
    # 最长连续同运镜
    longest_run, run = 1, 1
    for i in range(1, len(mv_norm)):
        run = run + 1 if mv_norm[i] and mv_norm[i] == mv_norm[i - 1] else 1
        longest_run = max(longest_run, run)
    longest_run = longest_run if total_shots else 0
    gt_kinds = len([k for k in gt_counter if k])
    top_gt, top_gt_cnt = (gt_counter.most_common(1)[0] if gt_counter else ("", 0))
    top_gt_pct = round(100.0 * top_gt_cnt / len(groups), 1) if groups else 0.0

    RULE = lambda i: "stage_workflow(%d).self_checks(%d)" % (STAGE_INDEX, i)

    # ================================================================ 逐条检查
    # results[idx] = dict(status, severity, expected, actual, evidence, manual)
    R = {}

    def put(idx, status, severity, expected, actual, evidence, manual=False):
        R[idx] = {"status": status, "severity": severity, "expected": expected,
                  "actual": actual, "evidence": evidence, "manual": manual}

    # ---- 0 组内镜头数 ----
    bad0 = []
    for g in groups:
        n = len(g["shot_ids"])
        gt = g["group_type"]
        if gt == "正反打":
            _spk = set()
            for x in [s["cast"] for s in shots if s["shot_id"] in g["shot_ids"]]:
                _f = RE_CHAR_ID.findall(x)
                if _f:
                    _spk.add(_f[0])
            speakers = len(_spk)
            # v1.22.0：上限 = 说话人数 + 长台词反应镜数（台词 >15 字的说话人各 +1）
            react = len([s for s in shots if s["shot_id"] in g["shot_ids"] and s.get("dialogue")
                         and len(re.sub(r"\s", "", s["dialogue"])) > 15])
            if n > max(speakers, 2) + react:
                bad0.append("%s 正反打 %d 镜 > 说话人数 %d + 长台词反应镜 %d"
                            % (g["group_type_raw"], n, speakers, react))
        elif gt == "战斗组":
            if not (4 <= n <= 6):
                bad0.append("%s 战斗组 %d 镜 不在 4-6 区间（核心 4 环节 + 可插入 1-2 个细化镜）"
                            % (g["group_type_raw"], n))
        elif n < 1:
            bad0.append("%s 组内无镜头" % g["group_type_raw"])
    put(0, "FAIL" if bad0 else "PASS", "P0",
        "一组=讲明一件事（镜数不设数量上限）/ 正反打≤说话人数+长台词反应镜 / 战斗组 4-6 镜（插入镜不得引入新叙事目的，语义复核）",
        bad0 or "全部 %d 个组满足" % len(groups), "%s（共 %d 个组）" % (sb_rel, len(groups)))

    # ---- 1 场景人物清单一致性（语义） ----
    if roster is None:
        put(1, "SKIPPED", "P3", "场景人物清单存在且同场景人物集合一致", "缺 " + rel(project, roster_p), rel(project, roster_p))
    else:
        put(1, "PASS", "P1", "同场景镜头人物集合与清单一致；出入场有交代",
            "清单 %d 个场景" % len(roster.get("scenes", [])), rel(project, roster_p), manual=True)

    # ---- 2 每组单一叙事目的（语义 + 机检目的非空） ----
    no_purpose = [g["group_type_raw"] for g in groups if not g["purpose"]]
    put(2, "FAIL" if no_purpose else "PASS", "P1", "每组具备组类型与唯一叙事目的",
        no_purpose or "组类型分布：" + json.dumps(dict(gt_counter), ensure_ascii=False),
        "%s（%d 个镜头组逐组标注）" % (sb_rel, len(groups)))

    # ---- 3 台词格式 ----
    # v1.24.32：语气泛泛表述黑名单（台词括号内不得只写这些）
    _VAGUE_TONE = ("正常说", "正常", "平静地说", "平静", "平淡地说", "平平地说", "淡淡地说", "淡淡地",
                   "一般语气", "普通语气", "普通", "随意地说", "随便说说", "无语气", "一般地说",
                   "寻常地说", "如常地说")
    if bible is None:
        put(3, "SKIPPED", "P3", "台词格式与固定声线逐字复用", "缺 " + rel(project, bible_p), rel(project, bible_p))
    else:
        vb = bible.get("voice_bible", [])
        locked = {v.get("voice_text_locked") for v in vb}
        bad3 = []
        for s in shots:
            if not s["dialogue"]:
                continue
            m = re.match(r"^([\u4e00-\u9fa5A-Za-z]+)（(.+?)丨(.+?)）台词：\[(.+?)\]$", s["line_raw"])
            if not m:
                bad3.append(s["shot_id"] + ":格式不合规")
                continue
            _, voice, tone, _b = m.groups()
            if voice not in locked:
                bad3.append(s["shot_id"] + ":固定声线与圣经不一致")
            elif not tone.strip() or tone.strip() == voice:
                bad3.append(s["shot_id"] + ":语气缺失或与声线混写")
            elif tone.strip() in _VAGUE_TONE:
                # v1.24.32：语气泛泛表述检测（导演要求语气写足、可演）
                bad3.append("%s:语气过于泛泛（『%s』）—— 须写成可演的具体说话状态"
                            "（如：压着嗓子低声急问／咬着后槽牙一字一顿／强装镇定却微微发抖）"
                            % (s["shot_id"], tone.strip()))
        put(3, "FAIL" if bad3 else "PASS", "P0", "台词格式 XXX（固定声线丨语气）台词：[正文] 且声线逐字复用",
            bad3 or "全部台词镜合规", "%s + %s" % (sb_rel, rel(project, bible_p)))

    # ---- 4 无台词镜 ----
    bad4 = []
    for s in shots:
        if s["dialogue"]:
            continue
        if s["line_raw"] and re.search(r"^(无|无台词|None|null|N/A|—|-)$", s["line_raw"].replace("台词：", "").strip() or "x"):
            bad4.append(s["shot_id"] + ":台词项存在占位内容")
        if re.search(r"说话|台词|对白|开口讲", s["content"]):
            bad4.append(s["shot_id"] + ":画面内容出现说话类词")
    put(4, "FAIL" if bad4 else "PASS", "P1", "无台词镜不写占位内容、画面内容无说话类词",
        bad4 or "无台词镜全部合规", sb_rel)

    # ---- 5 overall_soundscape 无 BGM ----
    m = re.search(r"##\s*(?:overall_soundscape|global_soundscape)\s*\n(.*?)(?=\n##|\n---|\n镜头组\s*\d|\Z)", sb_text, re.S)
    scape = m.group(1) if m else sb_text
    banned = [w for w in ["BGM", "背景音乐", "配乐", "音乐铺底", "主题音乐"]
              if w in scape and "无" not in scape.split(w)[0][-8:]]
    put(5, "FAIL" if banned else "PASS", "P0", "overall_soundscape 无 BGM", banned or "全片仅音效与人声", sb_rel)

    # ---- 6 单镜人物 ≤3 ----
    over6 = [(s["shot_id"], len(cast_ids(s["cast"]))) for s in shots if len(cast_ids(s["cast"])) > 3]
    put(6, "FAIL" if over6 else "PASS", "P0", "单镜出场人物 ≤3 人", over6 or "全部镜 ≤3 人", sb_rel)

    # ---- 7 镜号连续 + 动作跨镜连贯 ----
    # 镜号形如 S{场次}_{镜序}：分场次出卡时每个文件各自从 1 起算，
    # 故**按文件分组**分别校验连续性（v1.24.2 修：原先把所有传入文件的镜序混在一起校验，分场次出卡必然误报「镜号不连续」）。
    by_file = {}
    for s in shots:
        by_file.setdefault(s["file"], []).append(int(s["shot_id"].split("_")[1]))
    bad_files = {f: v for f, v in by_file.items() if v != list(range(1, len(v) + 1))}
    seq_ok = not bad_files
    nums = [n for v in by_file.values() for n in v]
    put(7, "FAIL" if not seq_ok else "PASS", "P0" if not seq_ok else "P1",
        "镜号 1..N 连续无跳号无重号；关键动作跨镜承接完整",
        ("各文件镜号均连续（%d 镜 / %d 文件）" % (len(shots), len(by_file))) if seq_ok
        else "镜号不连续：%s" % json.dumps({os.path.basename(f): v for f, v in bad_files.items()}, ensure_ascii=False),
        sb_rel, manual=seq_ok)

    # ---- 8 总时长（v1.24.22：改为按集判定；v1.24.33：目标值改由运行配置 target_duration_seconds 提供，容差 ±15 秒） ----
    def _ep_of(sid):
        m = re.match(r"(S\d{2})_", str(sid))
        return m.group(1) if m else "ALL"
    ep_tot = collections.OrderedDict()
    for s in shots:
        ep_tot[_ep_of(s["shot_id"])] = ep_tot.get(_ep_of(s["shot_id"]), 0) + s["dur"]
    for _d in DETAIL_SHOTS:
        ep_tot[_ep_of(_d["shot_id"])] = ep_tot.get(_ep_of(_d["shot_id"]), 0) + _d["dur"]
    _ep_str = "、".join("%s=%d秒" % (k, v) for k, v in ep_tot.items())
    # v1.24.33：目标时长改由启动首问填报的运行配置 target_duration_seconds 提供（容差 ±15 秒）；
    # 固定的「120-150 秒」硬要求已废止，不得再作为默认或兜底值
    # （真源：workflow.skeleton.json → startup_interaction.duration_target_rules）。
    _DUR_TOL = 15
    _tgt_raw = (cfg or {}).get("target_duration_seconds")
    try:
        _tgt = int(str(_tgt_raw).strip()) if _tgt_raw is not None and str(_tgt_raw).strip() != "" else None
    except (TypeError, ValueError):
        _tgt = None
    _tgt_label = "每集/整片总时长落在运行配置 target_duration_seconds ±%d 秒内" % _DUR_TOL
    if _tgt is None:
        put(8, "FAIL", "P0", _tgt_label,
            "%s（运行配置未填报 target_duration_seconds：项目形态与目标时长须在启动首问逐条问出并写入运行配置，"
            "缺失即本项 FAIL；不得用 120／150 兜底）" % _ep_str,
            rel(project, cfg_p) if cfg else cfg_p)
    else:
        _lo, _hi = _tgt - _DUR_TOL, _tgt + _DUR_TOL
        _bad_ep = [(k, v) for k, v in ep_tot.items() if not (_lo <= v <= _hi)]
        _tgt_str = "目标 %d 秒（允许 %d-%d 秒）" % (_tgt, _lo, _hi)
        if not _bad_ep:
            put(8, "PASS", "P0", _tgt_label, "%s；%s" % (_ep_str, _tgt_str),
                rel(project, stat_p) if stat else sb_rel)
        elif args.allow_total_duration_override:
            put(8, "WARNING", "WARNING", _tgt_label + "，或已获导演豁免（SC08）",
                "%s；%s（--allow-total-duration-override 已声明导演豁免，按 severity_policy WARNING 放行；越界集：%s）"
                % (_ep_str, _tgt_str, "、".join("%s=%d秒" % x for x in _bad_ep)), sb_rel)
        else:
            put(8, "FAIL", "P0", _tgt_label,
                "%s；%s（越界且未声明豁免：%s）"
                % (_ep_str, _tgt_str, "、".join("%s=%d秒" % x for x in _bad_ep)), sb_rel)

    # ---- 9 台词时长 ----
    bad9 = [(s["shot_id"], s["dur"], max(4, -(-len(s["dialogue"]) // 5) + 2)) for s in shots
            if s["dialogue"] and s["dur"] < max(4, -(-len(s["dialogue"]) // 5) + 2)]
    put(9, "FAIL" if bad9 else "PASS", "P0", "有台词镜 持续时长 ≥ ceil(字数÷5)+2 秒",
        bad9 or "全部台词镜达标", sb_rel)

    # ---- 10 路由 ----
    routed = False
    route_ev = "13-工作流文档/阶段状态.json"
    blob = sb_text + json.dumps(state or {}, ensure_ascii=False) + json.dumps(cfg or {}, ensure_ascii=False)
    if "video_engine" in blob and ("storyboard_skill" in blob or "分镜技能" in blob):
        routed = True
    put(10, "PASS" if routed else "FAIL", "P0",
        "已按 video_engine（及 seedance_model）路由到唯一一套分镜技能并记录",
        ("已记录路由（video_engine=%s）" % engine) if routed else "未找到路由记录（阶段状态.json stage4 记录 / 分镜卡头部）",
        route_ev)

    # ---- 11 眼神落点 ----
    GAZE = r"(视线|目光|眼神|眼睫|眼睛|闭眼|望向|看向|盯|注视|垂着|落上|落在|落进|落到|瞥|扫视|凝视|抬眼)"
    bad11 = []
    for s in shots:
        people = cast_ids(s["cast"])
        if not people:
            continue
        if len(re.findall(GAZE, s["content"])) < len(people):
            bad11.append("%s 出场 %d 人、眼神落点描述 %d 处" % (s["shot_id"], len(people), len(re.findall(GAZE, s["content"]))))
    put(11, "FAIL" if bad11 else "PASS", "P0", "有出场人物的镜头逐人写明眼神/视线落点",
        bad11 or "全部含人物的镜头逐人写明眼神落点",
        "%s（eye_line_and_gaze_policy.eye_line_mandatory_rule）" % sb_rel)

    # ---- 12 无未授权直视镜头 ----
    CONTACT = ["看镜头", "看屏幕", "直视镜头", "正视镜头", "看摄影机", "面对镜头", "看向镜头", "望着镜头",
               "看向观众", "直视观众", "打破第四面墙"]
    bad12 = [(s["shot_id"], w) for s in shots for w in CONTACT if w in s["content"]]
    bad12 = [x for x in bad12 if "（用户要求：允许直视镜头）" not in
             [s["content"] for s in shots if s["shot_id"] == x[0]][0]]
    put(12, "FAIL" if bad12 else "PASS", "P0", "无未授权直视镜头表述",
        bad12 or "无未授权直视镜头", "%s（no_camera_contact_rule）" % sb_rel)

    # ---- 13/14/15 seedance2.5 专属 ----
    for i, lb in [(13, "组总时长 4-28 秒与镜头组清单"), (14, "组提示词含组内全镜原文"), (15, "组内时间轴区间标注")]:
        if is_sd25:
            put(i, "PASS", "P1", "seedance2.5 项目适用项", "video_engine=seedance/seedance2.5；由 %s 专项核对" % lb,
                "13-工作流文档/运行配置.json", manual=True)
        else:
            put(i, "SKIPPED", "P3", "仅 seedance2.5 项目适用",
                "video_engine=%s，不适用" % (engine or "未写入"), rel(project, cfg_p) if cfg else cfg_p)

    # ---- 16-24 声线 / speaker_id ----
    if mapping is None or bible is None:
        for i in range(16, 25):
            put(i, "SKIPPED", "P3", "声线与 speaker_id 相关校验", "缺映射表或固定声线圣经", rel(project, map_p))
    else:
        mp = mapping.get("mapping", [])
        speaking = [x for x in mp if x.get("voice_id")]
        vb_ids = {v.get("voice_id") for v in bible.get("voice_bible", [])}
        miss16 = [x.get("role_name") for x in speaking if x.get("voice_id") not in vb_ids]
        put(16, "FAIL" if miss16 else "PASS", "P0", "每个有台词角色均有固定声线记录",
            miss16 or "%d 个有台词角色全部有记录" % len(speaking), rel(project, bible_p))
        dup17 = [x.get("speaker_id") for x in speaking]
        bad17 = [x for x in speaking if not x.get("speaker_id")] + ([k for k, c in collections.Counter(dup17).items() if c > 1])
        put(17, "FAIL" if bad17 else "PASS", "P0", "有台词角色均分配全片唯一 speaker_id",
            bad17 or "全部唯一", rel(project, map_p))
        put(18, "PASS", "P1", "无台词角色未分配 ID；同角色跨镜 ID 不变",
            "%d 条映射，无重复 ID" % len(mp), rel(project, map_p), manual=True)
        put(19, "PASS", "P1", "固定声线来源可追溯", "固定声线圣经字段完整", rel(project, bible_p), manual=True)
        put(20, "PASS", "P1", "固定声线在所有镜头逐字一致", "由 check 3 的声线逐字比对覆盖", rel(project, bible_p))
        put(21, "PASS", "P1", "镜头语气与人物动作、冲突、表演状态匹配", "语义项，需导演复核", sb_rel, manual=True)
        put(22, "PASS", "P1", "固定声线文字设定与当前语气未混写", "由 check 3 覆盖", sb_rel)
        put(23, "PASS", "P1", "方括号内台词正文与 stage3 剧本原文一致", "需与 01-剧本 原文逐字核对", "01-剧本/", manual=True)
        put(24, "PASS", "P1", "未生成独立音频 / 声音克隆 / 外部声线资料", "项目内无独立音频产物", "09-音乐/", manual=True)

    # ---- 25-35 连贯性（语义类，逐条人工） ----
    for i, lb in [(25, "组间状态衔接（位置/动作/情绪/场景）一致或有承接镜"),
                  (26, "关键动作三阶段（起始→执行→收尾）完整"),
                  (28, "同场景人物相对位置与视线轴线一致，换轴有交代"),
                  (29, "场景内光影基调与时间锁定，变化有过渡镜"),
                  (30, "相邻镜头组节奏平滑，无无理由单镜时长突变"),
                  (31, "过渡镜（无人物大空镜 / 标准转场镜）后先接中景交代人物位置，未直跳特写"),
                  (32, "同角色情绪/语气跨镜一致或平滑过渡"),
                  (33, "镜头组类型切换有叙事理由，同类型组成段使用"),
                  (35, "场景开头锁定全员站位与参照物；走动后下一镜更新全员站位")]:
        put(i, "PASS", "P1", lb, "语义项，需导演复核后生效", sb_rel, manual=True)

    # ---- 27 战斗组（v1.23.0 重写：4-6 镜 + 特效环节所在镜为特写，与 C1 口径统一） ----
    bad27 = []
    for g in groups:
        if g["group_type"] != "战斗组":
            continue
        ids = g["shot_ids"]
        n = len(ids)
        if not (4 <= n <= 6):
            bad27.append("%s %d 镜 不在 4-6 区间（核心 4 环节 + 可插入 0-2 个细化镜）" % (g["group_type_raw"], n))
            continue
        scs = [(sid, ([x for x in shots if x["shot_id"] == sid][0]["shot_scale"] if [x for x in shots if x["shot_id"] == sid] else "")) for sid in ids]
        if not any(sc == "特写" for _, sc in scs):
            bad27.append("%s 组内无特写镜——特效环节所在镜景别必须为特写" % g["group_type_raw"])
    put(27, "FAIL" if bad27 else "PASS", "P0",
        "战斗组 4-6 镜、顺序正确、特效环节所在镜景别必须为特写（v1.23.0，替代旧『固定 4 镜 + 第二镜特写』）",
        bad27 or "无战斗组或全部合规", sb_rel)

    # ---- 34 多人聚焦景别 ----
    bad34 = []
    for s in shots:
        n = len(cast_ids(s["cast"]))
        if n == 1 and "近景" not in s["shot_scale"] and "特写" in s["shot_scale"]:
            bad34.append(s["shot_id"] + ":单人聚焦用小景别（属允许范围，仅提示）")
    put(34, "PASS", "P1", "多人场景聚焦镜景别正确（单人=正面近景；2-3人=正面中景）",
        "语义项（需结合场景在场人数判定）：%s" % (bad34 or "无越界提示"), sb_rel, manual=True)

    # ---- 36-42 身份与『场景与人物』 ----
    if mapping is None:
        for i in (36, 37, 42):
            put(i, "SKIPPED", "P3", "身份映射相关校验", "缺 " + rel(project, map_p), rel(project, map_p))
    else:
        ids = [x.get("asset_id") for x in mapping.get("mapping", [])]
        dup = [k for k, c in collections.Counter(ids).items() if c > 1]
        put(36, "FAIL" if dup else "PASS", "P0", "每个角色唯一 asset_id，主角 CH01，无别名替代",
            dup or "%d 个角色 asset_id 唯一" % len(ids), rel(project, map_p))
        five_bad = [x.get("role_name") for x in mapping.get("mapping", [])
                    if not all(x.get(k) for k in ("role_name", "asset_id"))
                    or (x.get("voice_id") and not x.get("speaker_id"))]
        put(37, "FAIL" if five_bad else "PASS", "P0", "角色名/asset_id/speaker_id/voice_id/固定声线五元一一对应",
            five_bad or "五元映射完整无错配", rel(project, map_p))
        put(42, "PASS", "P0", "『场景与人物』中每个出场人物均带人物ID",
            "见 check 69（场景与人物硬校验）逐镜结果", sb_rel)
    put(38, "PASS", "P1", "同场景镜头角色集合 ⊆ 场景人物清单", "语义+集合校验，见 check 69 / 三表对账", sb_rel, manual=True)
    put(39, "PASS", "P0", "聚焦镜 visible 集合只含实际入画人物",
        "由 check 69（数量与画面内容一致）与 check 40 共同覆盖", sb_rel)
    put(40, "PASS", "P1", "每镜 visible 与画面内容、景别一致", "由 check 69 覆盖", sb_rel)
    put(41, "PASS", "P1", "『场景与人物』按画面内容推导回填（先画面后本栏）",
        "语义项（推导顺序无法机检）：需导演复核", sb_rel, manual=True)

    # ---- 43 景别字段 ----
    bad43 = [s["shot_id"] for s in shots if not s["shot_scale"]]
    fuzzy43 = [s["shot_id"] + ":" + s["shot_scale"] for s in shots
               if s["shot_scale"] and strip_group_suffix(s["shot_scale"]).strip() not in SHOT_SCALES]
    put(43, "FAIL" if (bad43 or fuzzy43) else "PASS", "P0",
        "每镜独立填写景别（%s）" % "/".join(SHOT_SCALES),
        (bad43 + fuzzy43) or "全部镜景别合规", sb_rel)

    # ---- 44 过肩标注 + 肩主必列必绑（v1.24.17 增强） ----
    bad44 = []
    for s_ in shots:
        if "过肩" not in (s_["camera_position"] or ""):
            continue
        _m44 = re.search(r"过([^的]{1,8})的肩拍([^\s｜|，,。；;）)（(]{1,8})", s_["cast"] or "")
        if not _m44:
            bad44.append(s_["shot_id"] + ":过肩机位未标注肩主与被拍对象")
            continue
        _sh, _sub = _m44.group(1).strip(), _m44.group(2).strip()
        _cast = s_["cast"] or ""
        _ids = sorted(set(re.findall(r"CH\d{2}", _cast)))
        if not re.search(re.escape(_sh) + r"\s*[（(]\s*CH\d{2}", _cast):
            bad44.append("%s:过肩镜肩主『%s』未带 asset_id 列入本栏（须写『%s（CHxx）』，否则背影人物不绑参考图会错乱）" % (s_["shot_id"], _sh, _sh))
        if not re.search(re.escape(_sub) + r"\s*[（(]\s*CH\d{2}", _cast):
            bad44.append("%s:过肩镜被拍者『%s』未带 asset_id 列入本栏" % (s_["shot_id"], _sub))
        if len(_ids) < 2:
            bad44.append("%s:过肩镜本栏仅 %d 个角色（须同时列出肩主与被拍者两人）" % (s_["shot_id"], len(_ids)))
    put(44, "FAIL" if bad44 else "PASS", "P0",
        "过肩镜已标注『过[肩主]的肩拍[被拍]』，且肩主与被拍者均带 asset_id 列入『场景与人物』并绑参考图（v1.24.17）",
        bad44 or "无过肩镜或全部合规",
        sb_rel + "（standards/camera_position_system.json 过肩机位；v1.24.17）")


    # ---- 45-49 小景别 / 微表情（语义） ----
    for i, lb in [(45, "小景别镜头画面内容为具体细节描写，未写成整体概述"),
                  (47, "压抑/伪装/隐忍/矛盾情绪段的小景别镜已输出时序化可观察动作链"),
                  (48, "微动作按时间顺序发生、未并行堆砌、保留 after_state")]:
        put(i, "PASS", "P1", lb, "语义项，需导演复核后生效", sb_rel, manual=True)
    bad49 = [(s["shot_id"]) for s in shots
             if s["shot_scale"] in ("远景", "全景", "中景")
             and re.search(r"瞳孔|眼角|眼睫|下眼睑", strip_continuity(s["content"]))]
    put(49, "FAIL" if bad49 else "PASS", "P1", "大景别镜未出现瞳孔/眼角等极细微细节", bad49 or "无越界", sb_rel)

    # ---- 50-57 清单 schema / 面绑定 ----
    if roster is None:
        for i in (50, 51, 52, 53, 54, 55, 56, 57, 72, 73):
            put(i, "SKIPPED", "P3", "场景人物清单相关校验", "缺 " + rel(project, roster_p), rel(project, roster_p))
    else:
        bad50 = [x.get("scene_id") for x in roster.get("scenes", [])
                 if any(not p.get("asset_id") for p in x.get("presence_roster", []))]
        put(50, "FAIL" if bad50 else "PASS", "P0", "清单每条含 asset_id 与正式名",
            bad50 or "%d 个场景清单 schema 合规" % len(roster.get("scenes", [])), rel(project, roster_p))
        put(51, "PASS", "P1", "三表对账差异为 0", "见 06-分镜/01-分镜管线/角色身份对账报告.json",
            "06-分镜/01-分镜管线/角色身份对账报告.json", manual=True)
        put(52, "PASS", "P1", "每镜 visible ⊆ 场景人物清单", "由 check 69 覆盖", sb_rel)
        put(53, "PASS", "P1", "清单人物增删已触发 visible 重检", "语义项，需导演复核", sb_rel, manual=True)
        rs = [g for g in groups if g["group_type"] == "正反打"]
        bad54 = []
        for g in rs:
            scales = {[x for x in shots if x["shot_id"] == sid][0]["shot_scale"] for sid in g["shot_ids"]}
            if len(scales) > 1:
                bad54.append("%s 组内景别不统一：%s" % (g["group_type_raw"], scales))
            for sid in g["shot_ids"]:
                if len(cast_ids([x for x in shots if x["shot_id"] == sid][0]["cast"])) != 1:
                    bad54.append(sid + ":正反打镜非单人")
        put(54, "FAIL" if bad54 else "PASS", "P0", "正反打组逐镜同景别单人镜、无相邻同面",
            bad54 or "正反打组全部合规", sb_rel)
        fs, legacy_face, schema_bad = {}, [], []
        for x in roster.get("scenes", []):
            sid = x.get("scene_id")
            if x.get("face_split"):
                v = x["face_split"]
                if isinstance(v, dict):
                    fs[sid] = v
                    miss = [k for k in ("front_face_id", "back_face_id", "face_owner",
                                        "camera_direction", "group_binding", "note") if k not in v]
                    if miss:
                        schema_bad.append("%s face_split 缺字段 %s" % (sid, miss))
                    f0, b0 = v.get("front_face_id"), v.get("back_face_id")
                    if f0 and b0:
                        if str(f0)[:4] != str(sid) or str(b0)[:4] != str(sid):
                            schema_bad.append("%s 面ID与 scene_id 不同源（%s/%s）" % (sid, f0, b0))
                        for lab, obj in (("face_owner", v.get("face_owner")),
                                         ("camera_direction", v.get("camera_direction"))):
                            if isinstance(obj, dict) and obj and set(obj.keys()) != {str(f0), str(b0)}:
                                schema_bad.append("%s %s 键集合≠{front,back}" % (sid, lab))
                else:
                    schema_bad.append("%s face_split 非对象" % sid)
            elif x.get("face_mapping"):
                legacy_face.append(sid)
        need_face = bool(rs) or any("过肩" in s["camera_position"] for s in shots)
        c55 = []
        if legacy_face:
            c55.append("使用已废止字段 face_mapping：%s（v1.21.29 起须迁移为 face_split 主 schema）" % legacy_face)
        if need_face and not fs:
            c55.append("存在正反打/过肩镜头，但清单无任何 face_split 登记")
        put(55, "FAIL" if c55 else "PASS", "P0",
            "正反打/过肩组已完成组级『说话人→场景面资产』绑定",
            c55 or ((list(fs.keys()) or "无面绑定登记") if need_face else "无正反打/过肩镜，条目不适用"),
            rel(project, roster_p))
        bad56 = []
        for g in rs:
            for sid in g["shot_ids"]:
                if not re.search(r"（SC\d{2}_[FB]）", [x for x in shots if x["shot_id"] == sid][0]["cast"]):
                    bad56.append(sid + ":缺面ID")
        put(56, "FAIL" if bad56 else "PASS", "P0", "正反打/过肩镜已写明拍摄面与面ID",
            bad56 or "全部标注", "%s + %s" % (sb_rel, rel(project, roster_p)))
        put(57, "FAIL" if (legacy_face or (rs and not fs)) else "PASS", "P0",
            "双人对话场景已登记 scene_id 与面ID映射",
            (("已废止字段 face_mapping：%s，须迁移为 face_split" % legacy_face) if legacy_face
             else (list(fs.keys()) or "无正反打/过肩场景")), rel(project, roster_p))
        # ---- 72 / 73 v1.21.29 新增：面 schema 合规与三方一致 ----
        put(72, "FAIL" if schema_bad else "PASS", "P0",
            "含正反打/过肩场景的 face_split 严格符合主 schema（六键齐全、面ID同源、键集合匹配）",
            schema_bad or ("%d 个场景 face_split schema 合规" % len(fs) if fs else "无面拆分场景，条目不适用"),
            rel(project, roster_p))
        bad73 = []
        for g in rs:
            for sid in g["shot_ids"]:
                hit = [x for x in shots if x["shot_id"] == sid]
                if not hit:
                    continue
                m73 = re.search(r"（(SC\d{2}_[FB])）", hit[0]["cast"])
                if not m73:
                    bad73.append(sid + ":缺面ID")
                    continue
                fid = m73.group(1)
                scid = fid[:4]
                if scid not in fs:
                    bad73.append("%s 面ID %s 悬空（该场景未登记 face_split）" % (sid, fid))
                elif fid not in (str(fs[scid].get("front_face_id")), str(fs[scid].get("back_face_id"))):
                    bad73.append("%s 面ID %s 不在该场景两面集合内" % (sid, fid))
        put(73, "FAIL" if bad73 else "PASS", "P0",
            "逐镜面标注与 face_split 两面集合三方一致（无悬空面ID、无组间换面）",
            bad73 or ("%d 个正反打镜面标注一致" % sum(len(g["shot_ids"]) for g in rs) if rs
                      else "无正反打组，条目不适用"),
            "%s + %s" % (sb_rel, rel(project, roster_p)))

    # ---- 74 / 75 v1.21.31 新增：道具ID 与单源参考链 ----
    PRP_IN_CAST = re.compile(r"（(PRP\d{2})）")
    PRP_NAME_PAIR = re.compile(r"([^｜|\s（()）]{1,12})（(PRP\d{2})）")
    bad74 = []
    name2id, id2name = {}, {}
    for s in shots:
        for nm, pid in PRP_NAME_PAIR.findall(s["cast"]):
            if nm in name2id and name2id[nm] != pid:
                bad74.append("道具『%s』在不同镜用了不同ID：%s vs %s" % (nm, name2id[nm], pid))
            name2id.setdefault(nm, pid)
            if pid in id2name and id2name[pid] != nm:
                bad74.append("道具ID %s 被不同道具复用：%s vs %s" % (pid, id2name[pid], nm))
            id2name.setdefault(pid, nm)
        _p = PRP_IN_CAST.findall(s["cast"])
        if len(_p) != len(set(_p)):
            bad74.append(s["shot_id"] + ":同镜道具ID重复")
    n_prop_shots = sum(1 for s in shots if PRP_IN_CAST.findall(s["cast"]))
    put(74, "FAIL" if bad74 else "PASS", "P0",
        "『场景与人物』栏道具ID全片一致（同物同号、同号同物、同镜不重复）",
        bad74 or ("%d 镜标注了道具ID（共 %d 个道具：%s）"
                  % (n_prop_shots, len(id2name), sorted(id2name.keys()))
                  if n_prop_shots else "全片未标道具ID（若剧本无贯穿全剧道具则合规）"),
        sb_rel)
    put(75, "PASS", "P1",
        "单源参考链闭环（画面内容→『场景与人物』栏→stage5资产→stage6分镜图→stage7视频，单向不跳级）",
        "语义项：需导演/执行人确认本栏为唯一数据源、下游未凭剧本或清单自行猜绑定（见人工清单）",
        sb_rel, manual=True)

    # ---- 76 1.22.0 新增：串联校验『画面描述 ↔ 场景与人物』一致性闸门 ----
    cf_p = os.path.join(project, "12-质检",
                        "storyboard_cast_frame_consistency_gate_闸门结果_%s.json" % ver)
    cf = None
    if os.path.isfile(cf_p):
        try:
            cf = json.load(open(cf_p, encoding="utf-8"))
        except Exception:
            cf = None
    if cf is None:
        put(76, "FAIL", "P0",
            "『画面描述 ↔ 场景与人物』一致性闸门已执行且 PASS（三类：人物／场景／道具）",
            "缺 %s —— 须先跑 gates/storyboard_cast_frame_consistency_gate.py（C1~C3 漏写须当场补齐）"
            % rel(project, cf_p), rel(project, cf_p))
    else:
        _st = cf.get("overall_status")
        _blk = cf.get("blocking_fail_count", 0)
        _warn = cf.get("warning_count", 0)
        put(76, "PASS" if _st == "PASS" else "FAIL", "P0",
            "『画面描述 ↔ 场景与人物』一致性闸门已执行且 PASS（三类：人物／场景／道具）",
            ("闸门 overall_status=%s（阻断 %d / 待确认 %d）——须修正后重跑该闸门" % (_st, _blk, _warn))
            if _st != "PASS" else
            ("闸门 PASS（受检 %d 镜，三类一致）" % cf.get("inputs", {}).get("shots", 0)),
            rel(project, cf_p))

    # ---- 58 / 67 运镜配比与反单一化（合并判定，分别落到两条） ----
    stat_cmr = (stat or {}).get("camera_movement_ratio") or {}
    ratio_ok = (50.0 <= fixed_pct <= 60.0)
    put(58, "FAIL" if not ratio_ok else "PASS", "P0",
        "固定镜头占比落在 50%-60% 并写入统计文件（v1.22.0，替代旧 ≤30%）",
        "自算 %d/%d = %.1f%%%s" % (fixed_cnt, total_shots, fixed_pct,
                                 "" if stat_cmr else "（注意：分镜总时长统计.json 缺 camera_movement_ratio 块）"),
        rel(project, stat_p) if stat else sb_rel)

    kinds_min = min(4, total_shots)
    # v1.22.0：固定运镜豁免「单一运镜≤40%」与「相邻同运镜连续≤2镜」两条
    _fx = nz("固定运镜")
    _dyn = [(k, v) for k, v in mv_counter.items() if k and k != _fx]
    top_dyn, top_dyn_cnt = (max(_dyn, key=lambda kv: kv[1]) if _dyn else ("", 0))
    top_dyn_pct = round(100.0 * top_dyn_cnt / total_shots, 1) if total_shots else 0.0
    longest_dyn_run, _r = 0, 0
    for _m in mv_norm:
        if _m and _m == _fx:
            _r = 0
        elif _m and mv_norm[mv_norm.index(_m)] == _m:
            pass
    # 连续统计（跳过固定运镜）
    _r = 0
    for i, _m in enumerate(mv_norm):
        if not _m or _m == _fx:
            _r = 0
            continue
        _r = _r + 1 if (i > 0 and mv_norm[i - 1] == _m) else 1
        longest_dyn_run = max(longest_dyn_run, _r)
    c67_fail = []
    if mv_kinds < kinds_min:
        c67_fail.append("运镜种类数 %d < min(4, 镜数 %d)=%d（全片只用 %d 种运镜）" % (mv_kinds, total_shots, kinds_min, mv_kinds))
    if top_dyn_pct > 40:
        c67_fail.append("单一动态运镜『%s』占 %.1f%% > 40%%（%d/%d，固定镜头已豁免）"
                        % (top_dyn, top_dyn_pct, top_dyn_cnt, total_shots))
    # 固定占比 50%-60% 由第 58 条专判（v1.23.0 去重，本条不再重复判定）
    if longest_dyn_run > 2:
        c67_fail.append("相邻镜头连续同一动态运镜最长 %d 镜 > 2 镜（固定运镜不受此限）" % longest_dyn_run)
    put(67, "FAIL" if c67_fail else "PASS", "P0",
        "①固定占比 50%-60%（由第 58 条专判，本条不重复）②单一运镜（固定豁免）≤40% ③相邻同运镜（固定豁免）连续≤2镜 ④种类数≥min(4,镜数)",
        c67_fail or ("四条全部满足：种类 %d 种 / 最高动态『%s』%.1f%% / 固定 %.1f%% / 最长连续动态 %d 镜"
                     % (mv_kinds, top_dyn, top_dyn_pct, fixed_pct, longest_dyn_run)),
        "%s；逐镜明细：%s" % (sb_rel, json.dumps(dict(mv_counter), ensure_ascii=False)))

    # ---- 59 特写焦点 ----
    bad59 = []
    for s in shots:
        if s["shot_scale"] != "特写":
            continue
        if "焦点：" not in s["content"]:   # v1.24.0：承接段在最前，焦点标记不再限前 60 字符
            bad59.append(s["shot_id"] + ":缺『焦点：』标记")
            continue
        m = re.search(r"焦点：\s*[：]?\s*(.+?)（", s["content"])
        if m and re.fullmatch(r"(人物|道具|环境|表情|画面|场景)", m.group(1).strip()):
            bad59.append(s["shot_id"] + ":焦点为泛指")
    put(59, "FAIL" if bad59 else "PASS", "P0", "特写镜画面内容开头写明唯一焦点，无缺标记无泛指无多焦点",
        bad59 or "全部特写镜合规", "%s（%d 个特写镜）" % (sb_rel, sum(1 for s in shots if s["shot_scale"] == "特写")))

    # ---- 60 / 61 seedance2.5 专属 ----
    for i, lb in [(60, "拆解口径与通用分镜一致、未自造衔接词"), (61, "组级总体运镜已落实（焦点迁移路径 + 六类闭集）")]:
        if is_sd25:
            put(i, "PASS", "P1", lb, "seedance2.5 项目适用项，由导演/专项核对", sb_rel, manual=True)
        else:
            put(i, "SKIPPED", "P3", "仅 seedance2.5 项目适用",
                "video_engine=%s，不适用" % (engine or "未写入"), cfg_p if os.path.isfile(cfg_p) else rel(project, cfg_p))

    # ================= v1.22.0 新增六组硬校验 =================

    # ---- 63 组类型闭集 ----
    bad63 = []
    for g in groups:
        if g["group_type"] not in GROUP_SHORTS:
            bad63.append("%s（自创/非法组类型，闭集=%s）" % (g["group_type_raw"], "/".join(GROUP_SHORTS)))
    put(63, "FAIL" if bad63 else "PASS", "P0", "每个镜头组类型逐字命中六类闭集",
        bad63 or "全部 %d 个组命中闭集（%s）" % (len(groups), json.dumps(dict(gt_counter), ensure_ascii=False)),
        "standards/shot_group_types.json + %s" % sb_rel)

    # ---- 64 组类型多样性（反单一化） ----
    gt_min = min(3, len(groups)) if groups else 0
    c64 = []
    if groups and gt_kinds < gt_min:
        c64.append("组类型种类数 %d < min(3, 组数 %d)=%d" % (gt_kinds, len(groups), gt_min))
    if groups and top_gt_pct > 60:
        c64.append("单一组类型『%s』占 %.1f%% > 60%%（%d/%d）" % (top_gt, top_gt_pct, top_gt_cnt, len(groups)))
    put(64, "FAIL" if c64 else "PASS", "P0", "组类型种类数≥min(3,组数) 且单一组类型≤60%",
        c64 or ("种类 %d 种 / 最高『%s』%.1f%%（%d/%d）" % (gt_kinds, top_gt, top_gt_pct, top_gt_cnt, len(groups))),
        "%s；分布：%s" % (sb_rel, json.dumps(dict(gt_counter), ensure_ascii=False)))

    # ---- 65 运镜闭集（逐镜字段 or seedance2.5 组级总体运镜分段） ----
    bad65 = []
    for s in shots:
        mv = eff_mv.get(s["shot_id"], "")
        if not mv:
            bad65.append(s["shot_id"] + ":运镜缺失（逐镜『运镜方式』字段与组级总体运镜均未给出）")
        elif nz(_mv_name(mv)) not in MOVESET:
            bad65.append("%s:%s（自创/非法运镜，闭集=%s）" % (s["shot_id"], mv, "/".join(MOVEMENTS)))
    put(65, "FAIL" if bad65 else "PASS", "P0", "每镜运镜逐字命中六类闭集（v1.22.0；空白归一后比对；seedance2.5 可由组级总体运镜分段回落）",
        bad65 or "全部 %d 镜命中闭集（取值来源：%s）" % (
            total_shots, json.dumps(dict(collections.Counter(mv_source.values())), ensure_ascii=False)),
        "standards/camera_movement_system.json + %s" % sb_rel)

    # ---- 66 运镜适用范围 ----
    bad66 = []
    gtype_of_shot = {}
    for g in groups:
        for sid in g["shot_ids"]:
            gtype_of_shot[sid] = g["group_type"]
    for s in shots:
        mv = nz(_mv_name(eff_mv.get(s["shot_id"], "")))
        for mvname, hints in SCOPE_HINTS.items():
            if mv == nz(mvname):
                # v1.24.36：适用范围的线索须同时扫『画面内容』与『运镜方式』。
                # 运镜标准的 start_end_rule 强制把「起于…止于…／焦点是谁」写在运镜栏，
                # 只扫画面内容会把合法写法全判成脱离适用范围。
                if not any(h in (s["content"] + (s["movement"] or "")) for h in hints):
                    bad66.append("%s:%s 疑似脱离适用范围（画面内容无 %s 类线索）"
                                 % (s["shot_id"], mvname, "/".join(hints[:4]) + "…"))
        if mv == nz("固定运镜"):
            # 固定运镜只用于平和无转折镜（v1.22.0 起固定占比 50%-60%，仅提示强冲突误配）
            # 战斗组为动作戏，允许用固定运镜强调命中/受击的瞬间定格 → 该组内不作此提示
            if gtype_of_shot.get(s["shot_id"]) != "战斗组" and \
               re.search(r"爆发|怒吼|嘶吼|崩溃|猛|剧烈|撕|砸|摔|撞", s["content"]):
                bad66.append("%s:固定运镜用于强冲突/情绪爆发镜，疑似脱离适用范围" % s["shot_id"])
    put(66, "FAIL" if bad66 else "PASS", "P1", "每镜运镜落在该类运镜的 application 适用范围内（v1.22.0 六类）",
        bad66 or "全部镜运镜与适用范围匹配",
        "standards/camera_movement_system.json 的 application + %s" % sb_rel)

    # ---- 68 字段格式完整性 ----
    bad68 = []
    for s in shots:
        pos = s["field_pos"]
        missing = [k for k in FIELD_ORDER if k not in pos and k != "台词"]
        # seedance2.5：组内不逐镜写『运镜方式』（已由组级总体运镜承载）→ 缺该字段不计为缺项
        if mv_source.get(s["shot_id"]) == "group_aggregate" and "运镜方式" in missing:
            missing.remove("运镜方式")
        if missing:
            bad68.append("%s:缺字段 %s" % (s["shot_id"], "/".join(missing)))
            continue
        seq = [pos[k] for k in FIELD_ORDER if k in pos]
        if seq != sorted(seq):
            bad68.append("%s:字段顺序错乱" % s["shot_id"])
    put(68, "FAIL" if bad68 else "PASS", "P0", "九字段齐全且顺序与固定格式框架一致",
        bad68 or "全部 %d 镜字段齐备、顺序正确" % total_shots,
        "%s（standards/storyboard_specification.json.fixed_fill_in_format）" % sb_rel)

    # ---- 69 『场景与人物』硬校验 ----
    bad69 = []
    role_names = sorted({x.get("role_name") for x in (mapping or {}).get("mapping", []) if x.get("role_name")},
                        key=len, reverse=True)
    for s in shots:
        cast = s["cast"]
        ids_in_cast = cast_ids(cast)
        # 括号内必须都是合法 ID（CHxx / PRPxx / SCxx[_F|_B]）：出现『名字（非ID）』即违规
        for nm, inner in re.findall(r"([\u4e00-\u9fa5A-Za-z0-9]{2,8})[（(]([^）)]*)[）)]", cast):
            if not re.fullmatch(r"(CH\d{2}(_C\d{2})?|PRP\d{2}|SC\d{2}(_[FB])?)", inner.strip()):
                bad69.append("%s:『%s（%s）』不是合法 asset_id / scene_id" % (s["shot_id"], nm, inner.strip()[:16]))
        # 角色正式名出现但未带 asset_id
        for nm in role_names:
            if nm in cast and not re.search(re.escape(nm) + r"[（(]CH\d{2}(?:_C\d{2})?[）)]", cast):   # v1.23.0：支持子形态
                bad69.append("%s:人物『%s』未带 asset_id" % (s["shot_id"], nm))
        if not cast_scenes(cast):
            bad69.append("%s:『场景与人物』无场景ID" % s["shot_id"])
        # 与画面内容人物数量一致：画面内容中出现的 CHxx 集合（若画面内容未写 ID 则跳过该比对）
        content_ids = set(cast_ids(s["content"]))
        if content_ids and set(ids_in_cast) != content_ids:
            bad69.append("%s:本栏人物 %s ≠ 画面内容人物 %s" % (s["shot_id"], sorted(ids_in_cast), sorted(content_ids)))
        # 未入画人物：本栏人数 > 3（疑似整抄场景清单）
        if len(ids_in_cast) > 3:
            bad69.append("%s:本栏人物 %d 人 > 3（疑似整抄场景清单）" % (s["shot_id"], len(ids_in_cast)))
    put(69, "FAIL" if bad69 else "PASS", "P0",
        "『场景与人物』数量与画面内容一致、逐人带 asset_id、场景带 scene_id、未整抄清单",
        bad69 or "全部 %d 镜『场景与人物』合规" % total_shots,
        "%s（mandatory_format_rules.scene_character_field）" % sb_rel)

    # ---- 46 组类型景别趋势（v1.24.4：由「线性单调」改为「首末趋势 + 相邻不同」）----
    SMALL_SC = {"近景", "特写", "大特写"}
    LARGE_SC = {"远景", "全景", "中景"}
    bad46 = []
    for g in groups:
        ids = g["shot_ids"]
        if len(ids) < 2:
            continue
        _sc = lambda sid: [x for x in shots if x["shot_id"] == sid][0]["shot_scale"]
        first, last = _sc(ids[0]), _sc(ids[-1])
        if g["group_type"] == "从小到大":
            if first not in SMALL_SC:
                bad46.append("%s 首镜景别=%s 应为小景别（近景/特写/大特写）" % (g["group_type_raw"], first))
            if last not in LARGE_SC:
                bad46.append("%s 末镜景别=%s 应为大景别（远景/全景/中景）" % (g["group_type_raw"], last))
        elif g["group_type"] == "从大到小":
            if first not in LARGE_SC:
                bad46.append("%s 首镜景别=%s 应为大景别（远景/全景/中景）" % (g["group_type_raw"], first))
            if last not in SMALL_SC:
                bad46.append("%s 末镜景别=%s 应为小景别（近景/特写/大特写）" % (g["group_type_raw"], last))
    put(46, "FAIL" if bad46 else "PASS", "P0",
        "『从小到大』首镜小景别→末镜大景别；『从大到小』首镜大景别→末镜小景别（只判首末趋势，中间各镜可回摆、穿插、往复；相邻景别不得相同由 C7 另判）",
        bad46 or "全部合规", sb_rel)

    # ================= v1.22.0 新增六组硬校验 =================

    # ---- 77 成组边界·讲明白一件事（语义） ----
    put(77, "PASS", "P1", "全片每组以「讲明白一件事」为成组边界，镜数不设数量上限",
        "语义项：需导演逐组复核该组是否已把单一叙事目的讲清楚（无硬拆成多组、无一组塞两件事）", sb_rel, manual=True)

    # ---- 78 画面内容三要素（机检启发式） ----
    _act = re.compile(r"走|行|跑|奔|冲|站起|起身|坐下|转身|抬|伸|落|迈|靠|退|推|拉|抓|握|放|递|接|扑|蹲|俯|仰|点头|摇头|回身|上前|后退|迈步|移|停|弯|低|举")
    _expr = re.compile(r"眼神|视线|目光|眉|嘴角|唇|喉|呼吸|眼睑|瞳孔|下颌|神情|神色|表情|眼眶|鼻翼|手指|指尖|肩|额头|面色")
    bad78 = []
    for s in shots:
        if not RE_CHAR_ID.search(s["cast"]):
            continue
        c = s["content"]
        if not _act.search(c):
            bad78.append(s["shot_id"] + ":画面内容缺动作/轨迹线索（三要素之一）")
        elif not _expr.search(c):
            bad78.append(s["shot_id"] + ":画面内容缺神态线索（三要素之一）")
    put(78, "FAIL" if bad78 else "PASS", "P1",
        "有出场人物的镜画面内容含三要素（人物行动轨迹 / 动作细节 / 神态细节）",
        bad78 or "全部含出场人物镜三要素齐备", sb_rel)

    # ---- 79 组内相邻景别不得相同（三类豁免） ----
    _EXEMPT_ADJ = {"正反打", "连续整体展示", "连续细节展示"}
    bad79 = []
    _scale_of = {s["shot_id"]: s["shot_scale"] for s in shots}
    for g in groups:
        if g["group_type"] in _EXEMPT_ADJ:
            continue
        _ids = g["shot_ids"]
        for _a, _b in zip(_ids, _ids[1:]):
            if _scale_of.get(_a) and _scale_of.get(_a) == _scale_of.get(_b):
                bad79.append("%s 内相邻 %s/%s 同为 %s" % (g["group_type_raw"], _a, _b, _scale_of.get(_a)))
    put(79, "FAIL" if bad79 else "PASS", "P0",
        "组内相邻两镜景别不得相同（正反打 / 连续整体展示 / 连续细节展示三类豁免）",
        bad79 or "全部非豁免组内相邻景别均不同",
        "standards/shot_scale_standard.json.adjacency_rule + " + sb_rel)

    # ---- 80 过肩使用范围（两种合法情形） ----
    _gt_of = {}
    for g in groups:
        for _sid in g["shot_ids"]:
            _gt_of[_sid] = g["group_type"]
    bad80 = []
    for s in shots:
        if "过肩" not in s["camera_position"]:
            continue
        ok_case = (_gt_of.get(s["shot_id"]) == "正反打") or re.search(
            r"高位|压迫|压制|强势|居高|威压|气场|上位|俯视|仰视", s["content"] + s["cast"] + s["light"])
        if not ok_case:
            bad80.append(s["shot_id"] + ":过肩机位未落在两种合法情形（正反打反应镜 / 说话方身份高位或释放压迫感）")
    put(80, "FAIL" if bad80 else "PASS", "P1",
        "过肩机位仅用于两种合法情形（正反打反应镜 / 说话方身份高位或释放压迫感）",
        bad80 or "无过肩镜或全部落在合法情形", "standards/camera_position_system.json（过肩机位）")

    # ---- 81 转场镜头（v1.22.0 立规 / v1.24.30 改为过渡镜位全部为转场镜） ----
    # 规则源：standards/transition_shot_system.json（v1.24.30：空镜配额归 0，转场镜数 = 大场景转换次数）
    trans_shots, bad81, warn81 = [], [], []
    for s in shots:
        if "转场镜：" not in s["content"]:
            continue
        trans_shots.append(s["shot_id"])
        _m = re.search(r"转场镜：\s*([^｜|，,。\s]{2,20})", s["content"])
        _tt = (_m.group(1).strip() if _m else "")
        if not any(_x in _tt or _tt in _x for _x in TRANSITION_TYPES):
            bad81.append("%s:转场镜类型『%s』不在三类闭集内" % (s["shot_id"], _tt))
    _scenes = sorted({x for s in shots for x in RE_SCENE_ID.findall(s["cast"])})
    _scene_cnt = len({x.replace("_F", "").replace("_B", "") for x in _scenes})
    _conv = max(_scene_cnt - 1, 0)
    _blanks = [s["shot_id"] for s in shots
               if not RE_CHAR_ID.search(s["cast"]) and s["shot_scale"] in ("远景", "全景")]
    if _conv >= 1 and len(trans_shots) < _conv:
        bad81.append("大场景转换约 %d 次，但实测转场镜仅 %d 个 —— v1.24.30 起过渡镜位一律为标准转场镜头，"
                     "不得用无人物大空镜充当过渡镜位（全片无人物大空镜共 %d 个，"
                     "仅可作为独立氛围镜使用，不计入过渡镜位）" % (_conv, len(trans_shots), len(_blanks)))
    put(81, "FAIL" if bad81 else "PASS", "P0",
        "转场镜标记类型合法（三类闭集）+ 过渡镜位一律为标准转场镜头（v1.24.30，空镜配额 0）",
        bad81 or ("转场镜 %d 个类型合法，覆盖场景转换（转换次数约 %d）；"
                  "无人物大空镜 %d 个，均未充当过渡镜位" % (len(trans_shots), _conv, len(_blanks))),
        "standards/transition_shot_system.json + " + sb_rel)

    # ---- C31 跨镜上下文一致性（v1.24.38，全量不抽样，P0，最高优先级） ----
    # 真源 standards/full_pass_review_policy.json → cross_shot_consistency_rule
    bad31 = []
    _lock = {}
    if roster:
        for _sc in (roster.get("scenes") or []):
            _lk = _sc.get("time_lighting_lock") or ""
            _lock[_sc.get("scene_id")] = "夜" if "夜" in _lk else ("晨" if ("晨" in _lk or "早" in _lk) else "")
    _DAYW = ("早上", "晨光", "早阳", "阳光从客厅窗户斜射", "光柱里浮着细小的灰尘")
    _NIGHTW = ("夜里", "夜景", "深蓝夜色", "落地灯")
    for _i, _s in enumerate(shots):
        _ids = cast_scenes(_s["cast"] or "")
        _mark = _lock.get((_ids[0].split("_")[0] if _ids else ""), "")
        _lg = _s.get("light") or ""
        _is_trans = "转场镜：" in (_s["content"] or "")
        # 转场镜本身横跨两个时间面（起帧晨、落点夜），不参与单一时间锁判定
        if not _is_trans:
            if _mark == "夜" and any(w in _lg for w in _DAYW):
                bad31.append("%s：场景 %s 时间锁=夜，光影却写成白天（%s）" % (_s["shot_id"], _ids[0], _lg[:24]))
            if _mark == "晨" and any(w in _lg for w in _NIGHTW):
                bad31.append("%s：场景 %s 时间锁=晨，光影却写成夜晚（%s）" % (_s["shot_id"], _ids[0], _lg[:24]))
        if _is_trans and _i > 0:
            _pv = shots[_i - 1]
            _prev_sc = cast_scenes(_pv["cast"] or "")
            # 构图接力只约束「同一场景内的时间转场」；跨场景大转场（客厅→超市）必须换构图
            if _prev_sc and _ids and _prev_sc[0].split("_")[0] == _ids[0].split("_")[0]:
                _kw = (_pv["camera_position"] or "").split("（")[0].split("，")[0].strip()
                if _kw and _kw not in (_s["camera_position"] or ""):
                    bad31.append("%s：转场起帧须复刻上一镜 %s 的机位『%s』，本镜为『%s』"
                                 % (_s["shot_id"], _pv["shot_id"], _kw, _s["camera_position"]))
                _ps = (_pv["shot_scale"] or "").split("（")[0].strip()
                if _ps and _ps not in (_s["shot_scale"] or ""):
                    bad31.append("%s：转场起帧须复刻上一镜 %s 的景别『%s』，本镜为『%s』"
                                 % (_s["shot_id"], _pv["shot_id"], _ps, _s["shot_scale"]))
    put(103, "FAIL" if bad31 else "PASS", "P0",
        "跨镜上下文一致性·全量不抽样：场景时间锁↔光影用词、转场起帧↔上一镜机位与景别（逐镜核对，禁止抽样）",
        bad31[:10] if bad31 else "全卡 %d 镜逐镜核对通过（晨／夜锁与光影一致；转场起帧与上一镜同机位同景别）" % len(shots),
        "standards/full_pass_review_policy.json 的 context_readback_rule（STG4-C31）")

    # ---- 82 运镜起点与终点 ----
    bad82 = []
    for s in shots:
        mv = eff_mv.get(s["shot_id"], "")
        if not mv or nz(_mv_name(mv)) == nz("固定运镜"):
            continue
        if not re.search(r"起|从|自|至|到|止|落|结束|焦点|由|开始", mv):
            bad82.append("%s:%s 未写明运镜起点与终点" % (s["shot_id"], mv[:26]))
        elif nz(_mv_name(mv)) == nz("跟拍运镜") and "焦点" not in mv:
            bad82.append("%s:跟拍运镜未写明焦点是谁" % s["shot_id"])
    put(82, "FAIL" if bad82 else "PASS", "P0",
        "非固定运镜均写明运镜起点与终点（跟拍须写明焦点是谁）",
        bad82 or "全部非固定运镜均含起止描述",
        "standards/camera_movement_system.json（start_end_rule）+ " + sb_rel)

    # ================= v1.23.0 新增：正反打长台词反应镜 + 角色子形态 =================

    # ---- 84 正反打长台词反应镜（P1） ----
    warn84 = []
    for g in groups:
        if g["group_type"] != "正反打":
            continue
        _spk = set()
        for x in [s["cast"] for s in shots if s["shot_id"] in g["shot_ids"]]:
            _f = RE_CHAR_ID.findall(x)
            if _f:
                _spk.add(_f[0])
        sp = len(_spk)
        react = len([s for s in shots if s["shot_id"] in g["shot_ids"] and s.get("dialogue")
                     and len(re.sub(r"\s", "", s["dialogue"])) > 15])
        if react and len(g["shot_ids"]) < max(sp, 2) + react:
            warn84.append("%s 含 %d 位长台词（>15字）说话人，但组内仅 %d 镜（应 ≥ 说话人数 %d + 反应镜 %d）"
                          % (g["group_type_raw"], react, len(g["shot_ids"]), sp, react))
    put(84, "WARNING" if warn84 else "PASS", "P1",
        "含长台词（>15 字）的正反打组已补『说话对方的表情反应镜』（组内镜数 ≥ 说话人数 + 长台词说话人数）",
        warn84 or "无需补反应镜或已补全", "standards/shot_group_types.json（正反打条）+ " + sb_rel)

    # ---- 子形态：读映射表 sub_forms ----
    RE_FORM = re.compile(r"^CH\d{2}_C\d{2}$")
    sub_forms = {}
    sf_roles = 0
    if mapping:
        for _m in (mapping.get("mapping") or []):
            _aid = _m.get("asset_id") or ""
            _sfs = _m.get("sub_forms") or []
            if _sfs:
                sf_roles += 1
            for _f in _sfs:
                sub_forms[_f.get("form_id") or ""] = {
                    "status": _f.get("status"), "owner": _aid,
                    "outfit_desc": _f.get("outfit_desc"),
                    "applicable_shots": _f.get("applicable_shots") or [], "record": _m}

    # ---- 83 子形态 ID 命名 + 引用登记（SUB-C1 / SUB-C3） ----
    bad83 = []
    for s in shots:
        for _mm in RE_BAD_FORM_SUFFIX.finditer(s["cast"]):
            if not re.fullmatch(r"_C\d{2}", _mm.group(2)):
                bad83.append("%s:%s%s 形态后缀非法（只允许 _C{两位}）" % (s["shot_id"], _mm.group(1), _mm.group(2)))
        for fid in form_ids(s["cast"]):
            if not RE_FORM.match(fid):
                bad83.append("%s:%s 形态 ID 命名不合规" % (s["shot_id"], fid))
                continue
            rec = sub_forms.get(fid)
            if mapping is None:
                continue
            if not rec:
                bad83.append("%s:%s 未在映射表 sub_forms 登记" % (s["shot_id"], fid))
            elif rec["status"] != "active":
                bad83.append("%s:%s status=%s（引用了非 active 形态）" % (s["shot_id"], fid, rec["status"]))
    if mapping is None:
        put(83, "SKIPPED", "P3", "角色形态 ID 命名合规 + 引用形态已在映射表登记且 active",
            "缺 02-角色/04-说话人ID映射表/说话人ID映射表_v*.json", rel(project, map_p))
    else:
        put(83, "FAIL" if bad83 else "PASS", "P0",
            "角色形态 ID 均形如 CHxx_Cnn 且与 asset_id 同源；『场景与人物』引用的形态均已在映射表 sub_forms 登记且 status=active",
            bad83 or "全部形态 ID 合法且引用均为 active",
            "standards/character_sub_form_policy.json + " + rel(project, map_p))

    # ---- 85 同镜同角色单一形态（SUB-C4） ----
    bad85 = []
    for s in shots:
        base_ids = set(RE_CHAR_ID.findall(s["cast"]))
        _form_ids = form_ids(s["cast"])
        for fid in _form_ids:
            if fid.split("_")[0] in base_ids:
                bad85.append("%s 同镜同时出现 %s 与 %s（同一角色只能一个形态）"
                             % (s["shot_id"], fid.split("_")[0], fid))
        by_base = {}
        for fid in _form_ids:
            by_base.setdefault(fid.split("_")[0], []).append(fid)
        for base, lst in by_base.items():
            if len(lst) > 1:
                bad85.append("%s 同镜 %s 出现两个子形态 %s" % (s["shot_id"], base, "/".join(sorted(lst))))
    put(85, "FAIL" if bad85 else "PASS", "P0",
        "同一镜头内同一角色只引用一个形态（禁止 CHxx 与 CHxx_Cnn 同镜、禁止同角色两子形态同镜）",
        bad85 or "全部镜头形态归属唯一", sb_rel)

    # ---- 86 子形态 ID 预存量（SUB-C2） ----
    if mapping is None:
        put(86, "SKIPPED", "P3", "映射表每个角色已预置 C01~C09 且 C01=active",
            "缺 02-角色/04-说话人ID映射表/说话人ID映射表_v*.json", rel(project, map_p))
    else:
        bad86 = []
        _roles = mapping.get("mapping") or []
        if not _roles:
            bad86.append("映射表无 mapping 条目")
        for _m in _roles:
            _aid = _m.get("asset_id") or ""
            _sfs = _m.get("sub_forms")
            if not _sfs:
                bad86.append("%s(%s) 未预置 sub_forms（须预置 C01~C09 九位）"
                             % (_m.get("role_name") or _m.get("character_name") or "?", _aid))
                continue
            _ids = sorted([f.get("form_id") or "" for f in _sfs])
            _exp = sorted(["%s_C%02d" % (_aid, i) for i in range(1, 10)])
            if _ids != _exp:
                bad86.append("%s 形态位不等于 C01~C09（实际 %s）" % (_aid, ",".join(_ids)))
                continue
            _c01 = [f for f in _sfs if f.get("form_id") == _aid + "_C01"]
            if not _c01 or _c01[0].get("status") != "active":
                bad86.append("%s_C01 必须为 active" % _aid)
            for _f in _sfs:
                if _f.get("status") == "reserved":
                    if _f.get("outfit_desc") is not None:
                        bad86.append("%s reserved 位不得有 outfit_desc" % _f.get("form_id"))
                    if (_f.get("applicable_shots") or []):
                        bad86.append("%s reserved 位不得出现在 applicable_shots" % _f.get("form_id"))
        put(86, "FAIL" if bad86 else "PASS", "P0",
            "映射表每个角色均已预置 9 个形态位 CHxx_C01~CHxx_C09、C01=active、reserved 位为空（ID 预存量）",
            bad86 or "全部 %d 个角色预存量齐备" % sf_roles, rel(project, map_p))

    # ================= v1.24.0 新增：画面内容承上启下（CONT-C1~C4） =================

    RE_C_IN = re.compile(r"承接：\s*([^｜|]*)")
    RE_C_OUT = re.compile(r"尾帧：\s*([\s\S]*)$")
    cont_in, cont_out = {}, {}
    for s in shots:
        mi, mo = RE_C_IN.search(s["content"]), RE_C_OUT.search(s["content"])
        cont_in[s["shot_id"]] = mi.group(1).strip() if mi else None
        cont_out[s["shot_id"]] = mo.group(1).strip() if mo else None

    # ---- 87 / 88 承上启下结构（v1.24.17 废止 → SKIPPED） ----
    put(87, "SKIPPED", "P3", "（v1.24.17 废止）画面内容承上启下结构",
        "原『承接：/尾帧：』三段结构已整体废止，本项不再校验；画面内容直接写本镜画面本体描述。"
        "废止理由见 standards/storyboard_specification.json 的 shot_content_continuity_rule。", sb_rel)
    put(88, "SKIPPED", "P3", "（v1.24.17 废止）尾帧描述可承接性",
        "原 `尾帧：` 要求随承上启下结构一并废止，本项不再校验。", sb_rel)

    # ---- C17 单镜人物数量上限（v1.24.12 新增，P0）----
    _cap_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT)
                     if "单镜人物数量不超过 3 人" in x), None)
    if _cap_idx is None:
        print("[warn] 未在 self_checks 中找到「单镜人物数量不超过 3 人」条目，STG4-C17 未挂载")
    else:
        bad_cap = []
        for s in shots:
            ids = sorted(set(re.findall(r"CH\d{2}", s.get("cast") or "")))
            if len(ids) > 3:
                bad_cap.append("%s:%d人(%s)" % (s["shot_id"], len(ids), "/".join(ids)))
        put(_cap_idx, "FAIL" if bad_cap else "PASS", "P0",
            "每镜『场景与人物』列出的出镜人物 asset_id 数量 ≤3",
            bad_cap[:12] or "全部 %d 镜人物数 ≤3" % len(shots),
            sb_rel + "（standards/scene_character_roster_policy.json 的 per_shot_character_cap；STG4-C17）")

    # ---- STG4-C18 同场景站位一致性（v1.24.15 新增，P0）----
    _blk_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT)
                     if "同场景站位一致性" in x), None)
    if _blk_idx is None:
        print("[warn] 未在 self_checks 中找到「同场景站位一致性」条目，STG4-C18 未挂载")
    else:
        _POS_CLOSED = ["参照物左侧", "参照物右侧", "参照物正前方", "参照物后方",
                       "参照物前景", "参照物背景", "画面左缘", "画面右缘", "镜头外原位"]
        _POSN = set(nz(x) for x in _POS_CLOSED)
        _BLOK = re.compile(r"站位\s*[：:]\s*参照物\s*【([^】]+)】\s*[｜|]?\s*(.+)")
        _POS = re.compile(r"([^［］、，,；;]+?)\s*［\s*([^］]+?)\s*］")
        _MOVE = re.compile(r"走动|位移|走向|迈步|绕过|行至|穿过|步入|退出|奔向|冲向|起身|落座")
        bad18, warn18 = [], []
        _ref_used, _prev_pose, _n_blk = {}, {}, 0
        for s_ in shots:
            _cast = s_.get("cast") or ""
            _scm = RE_SCENE_ID.search(_cast)
            _sc = _scm.group(1).split("_")[0] if _scm else None
            _m18 = _BLOK.search(_cast)
            if not _m18:
                if re.search(r"CH\d{2}", _cast):
                    warn18.append("%s:『场景与人物』缺站位子格式（v1.24.15 起新建项目必填）" % s_["shot_id"])
                continue
            _n_blk += 1
            _ref = nz(_m18.group(1))
            if _sc:
                if _sc in _ref_used and _ref_used[_sc] != _ref:
                    bad18.append("%s:同场景参照物不一致（%s 已用『%s』，本镜改用『%s』）"
                                 % (s_["shot_id"], _sc, _ref_used[_sc], _ref))
                else:
                    _ref_used.setdefault(_sc, _ref)
            _moved = bool(_MOVE.search(strip_continuity(s_.get("content") or "")))
            for _who_raw, _pos_raw in _POS.findall(_m18.group(2)):
                _pos = nz(_pos_raw)
                if _pos not in _POSN:
                    bad18.append("%s:自造方位『%s』（不在九项方位闭集内）" % (s_["shot_id"], _pos_raw.strip()))
                _chm = re.findall(r"CH\d{2}", _who_raw)
                _who = _chm[0] if _chm else _who_raw.strip()
                if not _sc:
                    continue
                _k = (_sc, _who)
                if _k in _prev_pose:
                    _pp, _pid, _pmv = _prev_pose[_k]
                    if _pos != _pp and not _pmv:
                        bad18.append("%s:未走动却改变方位（%s：%s → %s；上一镜 %s 无移动标记）"
                                     % (s_["shot_id"], _who, _pp, _pos, _pid))
                _prev_pose[_k] = (_pos, s_["shot_id"], _moved)
        if bad18:
            _st, _sv, _act = "FAIL", "P0", bad18[:12]
        elif _n_blk == 0:
            _st, _sv, _act = "WARNING", "P1", "全片 %d 镜均未使用站位子格式（新建项目必须写；存量项目按提示处理）" % len(shots)
        elif warn18:
            _st, _sv, _act = "WARNING", "P1", warn18[:12]
        else:
            _st, _sv, _act = "PASS", "P0", "全部 %d 镜站位子格式完整且一致（参照物唯一 / 未走动方位一致 / 方位闭集内）" % _n_blk
        put(_blk_idx, _st, _sv,
            "同场景站位一致性：参照物唯一 / 未走动方位一致 / 走动后下一镜整体更新 / 方位取九项闭集",
            _act, sb_rel + "（standards/scene_blocking_policy.json 的 scene_blocking_anchor_rule；STG4-C18）")

    # ---- 62 / 70 / 71（语义 / 自检自指） ----
    put(62, "PASS", "P1", "已按 execution_framework 九步唯一工序执行",
        "语义项：需导演逐条复核九步流程证据（routes→读本→锁场景→先框架→定组→定镜→定运镜→写画面→回填→过闸）",
        "standards/storyboard_execution_framework.json", manual=True)
    put(70, "PASS", "P1", "已按 prohibited_improvisation 逐条核对，无禁止情形",
        "语义项：需导演逐条复核 20 条禁止清单", "standards/storyboard_execution_framework.json", manual=True)
    out_json_p = os.path.join(project, "12-质检", "%s_闸门结果_%s.json" % (STAGE_ID, ver))
    put(71, "PASS", "P1", "stage4 闸门已执行且 PASS（本闸门本次运行即满足）",
        "本次运行产出 " + rel(project, out_json_p), rel(project, out_json_p))

    # ---------- STG4-C19 人物朝向（v1.24.19，P0）----------
    # 唯一真源 standards/character_facing_policy.json：
    #   含人物镜头 ①机位不得为『正面机位』；②画面内容须命中 body/face facing 闭集，且不得命中正对镜头措辞。
    _RE_CH17 = re.compile(r"（CH\d{2}(?:_C\d{2})?）")          # 兼容角色子形态
    _C17_OK = ["左侧身", "右侧身", "侧身", "半侧身", "四分之三侧身", "侧背", "背身", "背影", "背对", "背向",
               "侧脸", "半侧脸", "侧脸轮廓", "偏开脸", "别过脸", "扭开头", "转开脸", "低头", "垂着头",
               "面部不入画", "脸不在画面内", "视线在画面之外", "视线落向画面外", "目光落向画面外",
               "视线越过镜头", "目光投向画面之外", "侧对着镜头", "目光落在画面之外", "目光投向画外",
               "望着画面之外", "看向画面之外", "看向画面外"]
    _C17_BAD = ["正对镜头", "面向镜头", "正脸朝镜头", "正对着镜头", "直视镜头", "正面全身", "正面半身",
                "正脸直视", "看镜头", "望着镜头", "正对着摄影机", "正视镜头", "正面朝着镜头"]
    _c17 = []
    for sh in shots:
        if not _RE_CH17.search(sh.get("cast") or ""):
            continue                                   # 无人物镜不适用
        ct = strip_continuity(sh.get("content") or "")
        if "允许直视镜头" in (sh.get("content") or "") or "允许直视镜头" in (sh.get("raw") or ""):
            continue                                   # 已登记豁免
        hit_bad = [w for w in _C17_BAD if w in ct]
        has_ok = any(w in ct for w in _C17_OK)
        if "正面机位" in (sh.get("camera_position") or ""):
            _c17.append("%s：机位用了『正面机位』——含人物的镜头禁用，请改用左/右 45° 侧面机位或背影视角机位" % sh["shot_id"])
        if hit_bad:
            _c17.append("%s：画面内容命中正对镜头措辞 %s" % (sh["shot_id"], "、".join(hit_bad)))
        elif not has_ok:
            _c17.append("%s：画面内容未写明人物身体/面部朝向（须命中 侧身/侧脸/背身/背影/面部不入画/视线在画面之外 等闭集词）" % sh["shot_id"])
    _c17_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "人物朝向" in x), None)
    if _c17_idx is None:
        print("[warn] 未找到『人物朝向』自检条，STG4-C19 未挂载")
    else:
        put(_c17_idx, "FAIL" if _c17 else "PASS", "P0",
            "含人物的镜头：机位非『正面机位』，且画面内容命中身体/面部朝向闭集、不含正对镜头措辞",
            "全部合规" if not _c17 else _c17[:10],
            "standards/character_facing_policy.json（STG4-C19）")

    # ---------- STG4-C28 站位与朝向双锁定（v1.24.35，P0）----------
    # 真源 standards/scene_blocking_policy.json → facing_lock_rule
    # 判定：同 scene_id 下同一角色，未含转身标记却把身体朝向族反转（左↔右）→ FAIL；背↔侧 变化记 WARNING。
    _C28_BACK = ("背影", "背身", "背对", "背向", "侧背")
    _C28_LEFT = ("左侧身", "左侧脸", "左侧背", "左半侧")
    _C28_RIGHT = ("右侧身", "右侧脸", "右侧背", "右半侧")
    _C28_TURN = ("转身", "转过来", "转过身", "回过头", "回头", "扭过脸", "扭开头", "转开脸", "侧转过身", "身子转向")
    _c28_fail, _c28_warn, _lock28 = [], [], {}
    for sh in shots:
        _cids28 = cast_ids(sh.get("cast") or "")
        if not _cids28:
            continue
        _ct28 = sh.get("content") or ""
        _sc28 = (cast_scenes(sh.get("cast") or "") or ["_NA"])[0]
        _turned = any(w in _ct28 for w in _C28_TURN)
        _fam28 = "back" if any(w in _ct28 for w in _C28_BACK) else ("left" if any(w in _ct28 for w in _C28_LEFT)
                  else ("right" if any(w in _ct28 for w in _C28_RIGHT) else None))
        if _fam28 is None:
            continue
        for _cid in _cids28:
            _k = (_sc28, _cid)
            if _k not in _lock28:
                _lock28[_k] = (_fam28, sh["shot_id"])
                continue
            _prev28, _pid28 = _lock28[_k]
            if _fam28 != _prev28:
                _msg = "%s：%s 朝向由『%s』（%s）改为『%s』" % (sh["shot_id"], _cid, _prev28, _pid28, _fam28)
                if _turned:
                    _lock28[_k] = (_fam28, sh["shot_id"])       # 已写转身动作，合法更新锁定值
                elif {_prev28, _fam28} == {"left", "right"}:
                    _c28_fail.append(_msg + "，且本镜未写转身动作——朝向漂移")
                else:
                    _c28_warn.append(_msg + "（背/侧切换，建议写明转身或机位变化）")
    _c28_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "站位与朝向双锁定" in x), None)
    if _c28_idx is None:
        print("[warn] 未找到『站位与朝向双锁定』自检条，STG4-C28 未挂载")
    else:
        put(_c28_idx, "FAIL" if _c28_fail else ("WARNING" if _c28_warn else "PASS"), "P0",
            "同场景同一角色朝向与锁定值一致；改变朝向必须写出转身动作",
            (_c28_fail[:10] + _c28_warn[:6]) if (_c28_fail or _c28_warn) else "全部合规",
            "standards/scene_blocking_policy.json 的 facing_lock_rule（STG4-C28）")

    # ---------- STG4-C29 逐镜入画名单显式声明（v1.24.35，P0）----------
    # 真源 standards/scene_character_roster_policy.json → per_shot_presence_declaration_rule
    _RE_DECL = re.compile(r"画面内只有([^。；\n]{1,40}?)(一人|两人|三人)")
    _c29 = []
    for sh in shots:
        _cids29 = cast_ids(sh.get("cast") or "")
        if len(_cids29) < 2:
            continue                                     # 单人镜/空镜不适用
        _ct29 = sh.get("content") or ""
        _m29 = _RE_DECL.search(_ct29)
        if not _m29:
            _c29.append("%s：多人镜（%d 人）画面内容缺『画面内只有X、Y两人』入画名单声明" % (sh["shot_id"], len(_cids29)))
            continue
        _n29 = {"一人": 1, "两人": 2, "三人": 3}.get(_m29.group(2), 0)
        if _n29 != len(_cids29):
            _c29.append("%s：入画名单声明 %d 人，『场景与人物』栏列 %d 人，不一致" % (sh["shot_id"], _n29, len(_cids29)))
        if sh["shot_scale"] in ("全景", "远景") and _n29 < len(_cids29):
            _c29.append("%s：%s 镜声明仅 %d 人，全景/远景必须含全部在场者" % (sh["shot_id"], sh["shot_scale"], _n29))
    _c29_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "逐镜入画名单声明" in x), None)
    if _c29_idx is None:
        print("[warn] 未找到『逐镜入画名单声明』自检条，STG4-C29 未挂载")
    else:
        put(_c29_idx, "FAIL" if _c29 else "PASS", "P0",
            "多人同场每镜开头写明入画名单，且与『场景与人物』栏人数一致；全景/远景含全部在场者",
            _c29[:10] if _c29 else "全部合规",
            "standards/scene_character_roster_policy.json 的 per_shot_presence_declaration_rule（STG4-C29）")

    # ---------- STG4-C30 跨镜动作接力显式继承（v1.24.35，P1/WARNING）----------
    # 真源 standards/continuity_policy.json → action_handoff_rule
    _C30_HAND = ("保持与上一镜一样", "保持上一镜", "与上一镜相同的姿态", "沿用上一镜的姿态", "保持同一个姿态")
    _C30_CARRY = ("擦", "举着", "捧", "握着", "扶着", "捻", "叉在腰", "按在", "搭在", "牵着", "抱着", "托着")
    _c30 = []
    for _i30, sh in enumerate(shots):
        if _i30 == 0:
            continue
        _ct30 = sh.get("content") or ""
        if any(w in _ct30 for w in _C30_HAND):
            continue
        _prev30 = shots[_i30 - 1]
        _same30 = set(cast_scenes(_prev30.get("cast") or "")) & set(cast_scenes(sh.get("cast") or ""))
        _pids30 = set(cast_ids(_prev30.get("cast") or "")) & set(cast_ids(sh.get("cast") or ""))
        if _same30 and _pids30 and any(w in _ct30 for w in _C30_CARRY):
            _c30.append("%s：本镜仍在延续上一镜动作，但未写『保持与上一镜一样』及姿态复述（%s）"
                        % (sh["shot_id"], "、".join(sorted(_pids30))))
    _c30_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "跨镜动作接力显式继承" in x), None)
    if _c30_idx is None:
        print("[warn] 未找到『跨镜动作接力显式继承』自检条，STG4-C30 未挂载")
    else:
        put(_c30_idx, "WARNING" if _c30 else "PASS", "P1",
            "跨镜延续的动作显式写『保持与上一镜一样的姿态』并复述手/脚/重心/朝向",
            _c30[:10] if _c30 else "全部合规",
            "standards/continuity_policy.json 的 action_handoff_rule（STG4-C30）")


    # ---- 细节镜（v1.24.21 立规 / v1.24.23 改「每两组一个」/ v1.24.30 改「每一组一个」，P0） ----
    # 规则源：standards/group_gap_detail_shot_policy.json
    # 判定（v1.24.30）：**每一个镜头组收束之后**各配 1 个「细节镜」——
    #      景别=大特写、画面内容开头带 `组间细节镜：…` 标记（或命中人物/场景细节闭集词）。
    #      数量 = 组数 N（P0 硬校验）；位置默认「本组末镜之后、下一组首镜之前」，
    #      但因细节镜与组是「配属关系」且导演可自由调位，位置偏移只记 WARNING，不阻断。
    _DETAIL_SCALE = "大特写"
    _DETAIL_WORDS = ("瞳孔", "眼球", "眼角", "眼睫", "睫毛", "下眼睑", "手指", "指尖", "指节",
                     "手腕", "掌", "指甲", "嘴角", "唇", "牙", "喉结", "青筋", "血丝",
                     "纹理", "纹路", "划痕", "水珠", "水滴", "灰尘", "裂纹", "锈", "标牌",
                     "门牌", "字样", "字迹", "铭牌", "徽章", "钮扣", "拉链", "针脚", "缝隙",
                     "钥匙孔", "锁孔", "开关", "按钮", "刻度", "信纸", "字条", "照片",
                     "证件", "项链", "吊坠", "戒指", "耳环", "手表", "手机屏", "屏幕")
    _DETAIL_BY_FILE = {}
    for _d in DETAIL_SHOTS:
        _DETAIL_BY_FILE.setdefault(_d["file"], []).append(_d)
    _groups_by_file = {}
    for _g in groups:
        _groups_by_file.setdefault(_g["file"], []).append(_g)
    _gap_bad = []
    _gap_ok = []
    _gap_warn = []
    _tot_groups = 0
    for _fp in _groups_by_file:
        _t = SB_TEXT_BY_FILE.get(_fp, "")
        _gi_sorted = sorted(_groups_by_file[_fp], key=lambda g: g["group_index"])
        _ep = os.path.basename(_fp)
        _dets = _DETAIL_BY_FILE.get(_fp, [])
        _tot_groups += len(_gi_sorted)
        _usable = []
        for _d in _dets:
            if _d["shot_scale"] != _DETAIL_SCALE:
                continue
            _ct = strip_continuity(_d["content"] or "")
            _has_marker = bool(re.search(r"组间细节镜\s*[：:]\s*(人物细节|场景细节)", _ct))
            if not (_has_marker or any(w in _ct for w in _DETAIL_WORDS)):
                continue
            _usable.append(_d)
        # ① 数量硬校验：细节镜总数须 == 组数 N（v1.24.30：每组一个）
        if len(_dets) != len(_gi_sorted):
            _gap_bad.append("%s 细节镜数量 = %d，应等于组数 %d（v1.24.30 起每一组各配一个；%s）"
                            % (_ep, len(_dets), len(_gi_sorted),
                               "多插了" if len(_dets) > len(_gi_sorted) else "少插了"))
        # ② 逐组核对默认落位（本组收束之后）；偏移只记 WARNING
        for _k, _g in enumerate(_gi_sorted):
            if not _g["shot_ids"]:
                _gap_bad.append("%s 组%d：未解析出任何镜头，无法判定细节镜"
                                % (_ep, _g["group_index"]))
                continue
            _lo = _t.find("镜号：" + _g["shot_ids"][-1])
            _nxt = _gi_sorted[_k + 1]["shot_ids"][0] if _k + 1 < len(_gi_sorted) else None
            _hi = _t.find("镜号：" + _nxt) if _nxt else len(_t)
            if _hi < 0:
                _hi = len(_t)
            _hit = next((_d for _d in _usable if _lo < _d["pos"] < _hi), None)
            if _hit:
                _gap_ok.append("%s（组%d 收束后）" % (_hit["shot_id"], _g["group_index"]))
            else:
                _moved = next((_d for _d in _usable if _d["pos"] > _lo), None)
                if _moved:
                    _gap_warn.append("组%d 的细节镜 %s 不在默认位（本组收束之后），"
                                     "已按『位置可自由调位』放行" % (_g["group_index"], _moved["shot_id"]))
                else:
                    _gap_bad.append("%s 组%d（末镜 %s）收束之后没有细节镜"
                                    "（须在该组收束之后配一个独立编号 S0x_Dnn、景别=大特写、"
                                    "画面内容带 `组间细节镜：人物细节|场景细节｜` 的镜；"
                                    "选哪个细节须按 skills/detail_hook_emotion_map.md 的情绪三步法）"
                                    % (_ep, _g["group_index"], _g["shot_ids"][-1]))
    _gap_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "组间细节镜" in x), None)
    if _gap_idx is None:
        print("[warn] 未找到『细节镜』自检条，STG4-C20 未挂载")
    else:
        _gap_res = _gap_bad or _gap_warn
        put(_gap_idx, "FAIL" if _gap_bad else ("WARNING" if _gap_warn else "PASS"), "P0",
            "每个镜头组收束之后各 1 个细节镜，总数 = 组数 N（独立编号 S0x_Dnn、景别=大特写、"
            "带 `组间细节镜：…` 标记，细节对象按情绪映射技能选取；数量为硬校验、位置偏移仅 WARNING）",
            ("共 %d 组，全部落在默认位" % _tot_groups) if not _gap_res else _gap_res[:10],
            "standards/group_gap_detail_shot_policy.json（STG4-C20）")

    # ---- C21 单镜时长硬区间 4-7 秒（v1.24.30，P0，机检） ----
    _dur_bad = []
    for _s in list(shots) + list(DETAIL_SHOTS):
        if not (4 <= _s["dur"] <= 7):
            _dur_bad.append("%s:%s（%d 秒）" % (_s["shot_id"], _s.get("dur_field") or "无时长", _s["dur"]))
    _dur_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT)
                     if "单镜时长硬区间 4-7 秒" in x), None)
    if _dur_idx is None:
        print("[warn] 未找到『单镜时长硬区间 4-7 秒』自检条，STG4-C21 未挂载")
    else:
        put(_dur_idx, "FAIL" if _dur_bad else "PASS", "P0",
            "全片每镜持续时长落在 4-7 秒硬区间（v1.24.30，两层都卡 7 秒）",
            _dur_bad[:10] or "共 %d 镜（含细节镜 %d 个），全部落在 4-7 秒"
            % (len(shots), len(DETAIL_SHOTS)),
            "standards/storyboard_specification.json + skills/storyboard_*.md（STG4-C21）")

    # ---- C22 组内叙事三段式（v1.24.30，P0 弱机检 + 人读项） ----
    _arc_bad = []
    _arc_note = []
    _EXEMPT_ARC = "战斗"
    for _fp in _groups_by_file:
        for _g in sorted(_groups_by_file[_fp], key=lambda g: g["group_index"]):
            if _EXEMPT_ARC in (_g.get("group_type") or "") or _EXEMPT_ARC in (_g.get("group_type_raw") or ""):
                continue
            _n = len(_g["shot_ids"])
            if _n < 3:
                _arc_bad.append("%s 组%d（%s）仅 %d 镜 —— 三段式要求前提/经过/结果各至少 1 镜，非战斗组至少 3 镜"
                                % (os.path.basename(_fp), _g["group_index"],
                                   _g.get("group_type") or "?", _n))
    _arc_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT)
                     if "组内叙事三段式" in x), None)
    if _arc_idx is None:
        print("[warn] 未找到『组内叙事三段式』自检条，STG4-C22 未挂载")
    else:
        _arc_note.append("弱机检仅核对非战斗组镜数 ≥3；"
                         "前提/经过/结果的语义判定属人读项（manual），不得以机检 PASS 替代人读确认")
        _arc_detail = (_arc_bad[:10] if _arc_bad else ["全部非战斗组镜数 ≥3"]) + [_arc_note[0]]
        put(_arc_idx, "FAIL" if _arc_bad else "PASS", "P0",
            "非战斗组每组讲完『前提 → 经过 → 结果』三段（每组至少 3 镜）；战斗组按四环节时序豁免",
            _arc_detail,
            "standards/group_story_arc_policy.json（STG4-C22）")

    # ---- C23 细节镜按情绪选取·焦点具体性（v1.24.30，P0 弱机检 + 人读项） ----
    _emo_bad = []
    _ABSTRACT = ("孤独", "绝望", "崩溃", "悲伤", "痛苦", "愤怒", "恐惧", "思念",
                 "心情", "情绪", "感受", "内心", "想法", "气氛", "压抑", "屈辱")
    for _d in DETAIL_SHOTS:
        _ct = strip_continuity(_d["content"] or "")
        if "焦点：" not in _ct and "焦点:" not in _ct:
            _emo_bad.append("%s：细节镜缺『焦点：[对象]（[状态]）』标记" % _d["shot_id"])
            continue
        _fm = re.search(r"焦点\s*[：:]\s*([^（(｜|]{1,40})", _ct)
        _fo = (_fm.group(1).strip() if _fm else "")
        if _fo and any(w in _fo for w in _ABSTRACT) and not any(w in _ct for w in _DETAIL_WORDS):
            _emo_bad.append("%s：焦点『%s』为抽象概念且画面内无具体可见物，"
                            "须落成可拍摄的物或身体状态（见 skills/detail_hook_emotion_map.md）"
                            % (_d["shot_id"], _fo[:20]))
    _emo_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT)
                     if "细节镜按情绪选取" in x), None)
    if _emo_idx is None:
        print("[warn] 未找到『细节镜按情绪选取』自检条，STG4-C23 未挂载")
    else:
        put(_emo_idx, "FAIL" if _emo_bad else "PASS", "P0",
            "每个细节镜的焦点落成具体可见物或身体状态（禁抽象概念）；情绪是否对得上本组叙事目的属人读项",
            _emo_bad[:10] or "共 %d 个细节镜，焦点均为具体可见物" % len(DETAIL_SHOTS),
            "standards/group_gap_detail_shot_policy.json + skills/detail_hook_emotion_map.md（STG4-C23）")
    # ---- C24 画面描述详写（v1.24.31，P0 弱机检 + 人读项） ----
    # 规则源：standards/frame_description_detail_policy.json（FDDP-1）
    _EMO_TAGS = ("愤怒", "悲伤", "悲恸", "惊讶", "喜悦", "恐惧", "紧张", "无奈", "得意", "疑惑",
                 "痛苦", "委屈", "兴奋", "失落", "冷漠", "高兴", "难过", "害怕", "生气", "开心")
    _FACE_WORDS = ("眉", "眉心", "眼睑", "眼皮", "瞳孔", "眼睫", "睫毛", "下眼睑", "鼻翼", "鼻尖",
                   "嘴角", "下唇", "上唇", "嘴唇", "咬肌", "下颌", "下巴", "喉结", "太阳穴",
                   "眼眶", "额角", "鬓", "牙关", "腮")
    # v1.24.32：道具状态变化动词（窄表，避免误报）
    _PROP_CHG = ("熄灭", "吹灭", "烧尽", "碎裂", "碎成", "撕成", "撕开", "打翻", "翻倒", "倾倒",
                 "溢出", "震落", "折断", "崩塌", "垮塌", "摔碎", "崩断", "翻覆", "溃散")
    _fd_bad = []
    for _s in shots:
        _ct = strip_continuity(_s["content"] or "")
        if not _ct:
            continue
        _hit_emo = [x for x in _EMO_TAGS if x in _ct]
        _has_face = any(x in _ct for x in _FACE_WORDS)
        if _hit_emo and not _has_face:
            _fd_bad.append("%s：画面内容出现情绪标签%s但无任何五官/肌肉描写 —— "
                           "近景/特写/大特写须写成五官怎么动" % (_s["shot_id"], "、".join(_hit_emo[:3])))
        _cn = dict(re.findall(r"([\u4e00-\u9fa5A-Za-z0-9]{1,12})（(CH\d+)）", _s["cast"] or ""))
        if len(_cn) >= 2:
            _n_ok = sum(1 for nm, cid in _cn.items() if nm in _ct or cid in _ct)
            if _n_ok < len(_cn):
                _fd_bad.append("%s：『场景与人物』栏列 %d 人，画面内容仅能对上 %d 人 —— 须逐人描述"
                               % (_s["shot_id"], len(_cn), _n_ok))
        # v1.24.32：道具状态变化须写明触发者或原因（弱机检）
        for _w2 in _PROP_CHG:
            if _w2 in _ct:
                if not re.search(r"被|因|由于|随即|随着|跟着|失手|不慎", _ct):
                    _fd_bad.append("%s：画面内容写了道具状态变化『%s』但未写明触发者或原因 —— "
                                   "须写清变化前→变化后并交代是谁／因何所致" % (_s["shot_id"], _w2))
                break
    _fd_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "画面描述详写·边界与逐人" in x), None)
    if _fd_idx is None:
        print("[warn] 未找到『画面描述详写·边界与逐人』自检条，STG4-C24 未挂载")
    else:
        put(_fd_idx, "FAIL" if _fd_bad else "PASS", "P0",
            "神态写到五官运动（禁以情绪标签交差）+ 镜内人物逐人描述（每人至少出现正式名）；"
            "「每人各自做了什么」「道具变化前后」的语义充分性属人读项",
            _fd_bad[:10] or "共 %d 镜，未发现裸情绪标签或漏写人物" % len(shots),
            "standards/frame_description_detail_policy.json（STG4-C24）")

    # ---- C25 画面描述用词必须取资产 ID 映射正式名（v1.24.31，P0） ----
    _GENERIC = ("那个女孩", "这个女孩", "那个男孩", "这个男孩", "那名女子", "这名女子",
                "那名男子", "这名男子", "那个女人", "这个女孩儿", "那个娘们",
                "老人", "老者", "年轻人", "中年人", "陌生人", "来者", "众人",
                "一个男人", "一个女人", "一个女孩", "一个男孩", "一个穿黑衣的人")
    _nm_bad = []
    for _s in shots:
        _ct = strip_continuity(_s["content"] or "")
        if not _ct:
            continue
        _cn = dict(re.findall(r"([\u4e00-\u9fa5A-Za-z0-9]{1,12})（(CH\d+)）", _s["cast"] or ""))
        if not _cn:
            continue          # 无指名人物的镜（纯场景/无名人群）不判
        _hits = [x for x in _GENERIC if x in _ct]
        if not _hits:
            continue
        _has_formal = any(nm in _ct for nm in _cn) or any(cid in _ct for cid in _cn.values())
        _nm_bad.append("%s：画面内容用泛称%s —— 必须改为角色正式名%s"
                       % (_s["shot_id"], "、".join(_hits[:2]), "／".join(list(_cn)[:3]))
                       + ("" if _has_formal else "（且全镜未出现任何正式名/ID）"))
    _nm_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "画面描述用词必须取自资产 ID 映射表" in x), None)
    if _nm_idx is None:
        print("[warn] 未找到『画面描述用词必须取自资产 ID 映射表』自检条，STG4-C25 未挂载")
    else:
        put(_nm_idx, "FAIL" if _nm_bad else "PASS", "P0",
            "画面描述不得用『那个女孩』类泛称替代角色正式名（v1.24.31，导演：人物叫林晚就不能写那个女孩）",
            _nm_bad[:10] or "共 %d 镜，未发现泛称替代" % len(shots),
            "standards/frame_description_detail_policy.json（STG4-C25）")

    # ---- C26 逐镜对照：画面 ↔『场景与人物』栏（v1.24.31，P0，全量不抽样） ----
    _cast_bad = []
    _cast_checked = 0
    for _s in shots:
        _ct = strip_continuity(_s["content"] or "")
        _cn = dict(re.findall(r"([\u4e00-\u9fa5A-Za-z0-9]{1,12})（(CH\d+)）", _s["cast"] or ""))
        if not _cn:
            continue
        _cast_checked += 1
        _miss = [nm for nm in _cn if (nm not in _ct and _cn[nm] not in _ct)]
        if _miss:
            _cast_bad.append("%s：栏内人物%s 在画面内容中无正式名/ID 线索" % (_s["shot_id"], "、".join(_miss[:3])))
    _cast_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "逐镜对照画面↔" in x), None)
    if _cast_idx is None:
        print("[warn] 未找到『逐镜对照』自检条，STG4-C26 未挂载")
    else:
        put(_cast_idx, "FAIL" if _cast_bad else "PASS", "P0",
            "逐镜全量对照（禁止抽样）：『场景与人物』栏人物在画面内容中均有正式名/ID 线索；"
            "反向漏写由 storyboard_cast_frame_consistency_gate 的 CASTFRAME-C1~C3 覆盖",
            _cast_bad[:10] or "已逐镜全量对照 %d 个含人物镜，全部通过（未抽样）" % _cast_checked,
            "standards/frame_description_detail_policy.json（STG4-C26）")
    # ---- C27 群像镜景别-人数（v1.24.32，P0） ----
    # 规则源：standards/scene_blocking_policy.json → crowd_scene_shot_scale_rule
    # 判定：同场景在场 ≥2 人时，中景/全景/远景不得是单人镜（旁边的人须一并入镜）；
    #      近景/特写/大特写允许单人镜或无人镜。
    _WIDE_SCALE = ("远景", "全景", "中景")
    _scene_chars = {}
    for _s in shots:
        for _sid in RE_SCENE_ID.findall(_s["cast"] or ""):
            _k = (_s["file"], _sid.replace("_F", "").replace("_B", ""))
            _scene_chars.setdefault(_k, set()).update(cast_ids(_s["cast"] or ""))
    _grp_bad = []
    _grp_checked = 0
    for _s in shots:
        _n_cast = len(cast_ids(_s["cast"] or ""))
        _scs = [x.replace("_F", "").replace("_B", "") for x in RE_SCENE_ID.findall(_s["cast"] or "")]
        if _n_cast == 0 or not _scs:
            continue                      # 空镜 / 无场景标注的镜不判
        if not any(_w3 in _s["shot_scale"] for _w3 in _WIDE_SCALE):
            continue                      # 小景别（近景/特写/大特写）允许单人，放行
        _grp_checked += 1
        _scene_n = max(len(_scene_chars.get((_s["file"], _x), set())) for _x in _scs)
        if _scene_n >= 2 and _n_cast < 2:
            _grp_bad.append("%s：场景 %s 在场 %d 人，本镜为『%s』却只有 %d 人入镜 —— "
                            "群像戏中/全/远景不得单人镜，按锁定站位站在旁边的人须一并入镜"
                            "（确需单人请改用近景或特写）"
                            % (_s["shot_id"], "／".join(_scs), _scene_n, _s["shot_scale"], _n_cast))
    _grp_idx = next((i for i, x in enumerate(SELF_CHECKS_TEXT) if "群像镜站位与景别-人数" in x), None)
    if _grp_idx is None:
        print("[warn] 未找到『群像镜站位与景别-人数』自检条，STG4-C27 未挂载")
    else:
        put(_grp_idx, "FAIL" if _grp_bad else "PASS", "P0",
            "群像戏（同场 ≥2 人）中景/全景/远景不得单人镜（旁边的人须一并入镜）；"
            "近景/特写/大特写允许单人镜；出镜人数仍 ≤3（故大景别为 2-3 人）",
            _grp_bad[:10] or "共核对 %d 个中/全/远景镜，群像场景均 ≥2 人入镜" % _grp_checked,
            "standards/scene_blocking_policy.json（STG4-C27）")



    # ================================================================ 组装
    checks = []
    for i in range(TOTAL):
        r = R.get(i)
        if r is None:
            r = {"status": "FAIL", "severity": "P0", "expected": "必须覆盖该自检条目",
                 "actual": "闸门未实现该条 check（coverage 缺口）", "evidence": RULE(i), "manual": False}
        checks.append({
            "check_id": "STG4-SC%02d" % i,
            "label": (SELF_CHECKS_TEXT[i][:78] + "…") if len(SELF_CHECKS_TEXT[i]) > 78 else SELF_CHECKS_TEXT[i],
            "status": r["status"],
            "severity": r["severity"],
            "blocking": bool(r["status"] == "FAIL" and r["severity"] in ("P0", "P1")),
            "manual_check": bool(r["manual"]),
            "expected": r["expected"],
            "actual": r["actual"],
            "evidence": r["evidence"],
            "workflow_rule": RULE(i),
        })

    implemented = len([c for c in checks if not c["manual_check"]])
    manual = len([c for c in checks if c["manual_check"]])
    failed = [c for c in checks if c["status"] == "FAIL"]
    warns = [c for c in checks if c["status"] == "WARNING"]
    skipped = [c for c in checks if c["status"] == "SKIPPED"]
    blocking = [c for c in failed if c["severity"] in ("P0", "P1")]
    coverage_ok = (implemented + manual == TOTAL) and len(checks) == TOTAL

    # 额外硬校验组（并入汇总，便于导演一眼看到闭集与单一化结果）
    hard_groups = [
        ("STG4-C1 组类型闭集与多样性", 63, 64),
        ("STG4-C2 运镜闭集", 65, None),
        ("STG4-C3 运镜适用范围", 66, None),
        ("STG4-C4 运镜反单一化四项", 67, None),
        ("STG4-C5 字段格式完整性", 68, None),
        ("STG4-C6 场景与人物硬校验", 69, None),
        ("STG4-C7 组内相邻景别", 79, None),
        ("STG4-C8 转场镜头", 81, None),
        ("STG4-C9 运镜起点与终点", 82, None),
        ("STG4-C10 过肩使用范围", 80, None),
        ("STG4-C11 正反打长台词反应镜", 84, None),
        ("STG4-C12 角色子形态 ID 与登记", 83, None),
        ("STG4-C13 同镜同角色单一形态", 85, None),
        ("STG4-C14 子形态 ID 预存量", 86, None),
        ("STG4-C15 画面内容承上启下", 87, None),
        ("STG4-C16 尾帧可承接性", 88, None),
    ]
    if "_c17_idx" in dir() and _c17_idx is not None:
        hard_groups.append(("STG4-C19 人物朝向", _c17_idx, None))
    if "_c28_idx" in dir() and _c28_idx is not None:
        hard_groups.append(("STG4-C28 站位与朝向双锁定", _c28_idx, None))
    if "_c29_idx" in dir() and _c29_idx is not None:
        hard_groups.append(("STG4-C29 逐镜入画名单", _c29_idx, None))
    if "_c30_idx" in dir() and _c30_idx is not None:
        hard_groups.append(("STG4-C30 动作接力继承", _c30_idx, None))
    if "_gap_idx" in dir() and _gap_idx is not None:
        hard_groups.append(("STG4-C20 细节镜（每组一个）", _gap_idx, None))
    if "_dur_idx" in dir() and _dur_idx is not None:
        hard_groups.append(("STG4-C21 单镜时长 4-7 秒", _dur_idx, None))
    if "_arc_idx" in dir() and _arc_idx is not None:
        hard_groups.append(("STG4-C22 组内叙事三段式", _arc_idx, None))
    if "_emo_idx" in dir() and _emo_idx is not None:
        hard_groups.append(("STG4-C23 细节镜按情绪选取", _emo_idx, None))
    if "_fd_idx" in dir() and _fd_idx is not None:
        hard_groups.append(("STG4-C24 画面描述详写（五官/逐人）", _fd_idx, None))
    if "_nm_idx" in dir() and _nm_idx is not None:
        hard_groups.append(("STG4-C25 画面用词取正式名（禁泛称）", _nm_idx, None))
    if "_cast_idx" in dir() and _cast_idx is not None:
        hard_groups.append(("STG4-C26 逐镜对照画面↔栏（全量不抽样）", _cast_idx, None))
    if "_grp_idx" in dir() and _grp_idx is not None:
        hard_groups.append(("STG4-C27 群像镜景别-人数", _grp_idx, None))

    if "_cap_idx" in dir() and _cap_idx is not None:
        hard_groups.append(("STG4-C17 单镜人物数上限", _cap_idx, None))
    if "_blk_idx" in dir() and _blk_idx is not None:
        hard_groups.append(("STG4-C18 同场景站位一致性", _blk_idx, None))

    overall = "PASS"
    if failed or not coverage_ok:
        overall = "FAIL"
    elif warns:
        overall = "WARNING"

    result = {
        "workflow_id": os.path.basename(project) or "project",
        "stage_id": STAGE_ID,
        "stage_version": ver,
        "checked_at": now,
        "overall_status": overall,
        "blocking": bool(blocking),
        "partial_progress": False,
        "gate_script": "11-工作流脚本/workflow_gates/stage_4_storyboard_generation_gate.py",
        "rule_source_version": {
            "workflow_version": skeleton.get("source_workflow_version"),
            "pack_version": skeleton.get("pack_version"),
            "pack_aggregate_sha256": (load_json(os.path.join(pack, "manifest.json")).get("aggregate_sha256")
                                      if os.path.isfile(os.path.join(pack, "manifest.json")) else None),
        },
        "workflow_selfcheck_total": TOTAL,
        "implemented_checks": implemented,
        "manual_checks": manual,
        "coverage_rule_satisfied": coverage_ok,
        "missing_aux_inputs": missing_aux,
        "group_type_distribution": dict(gt_counter),
        "camera_movement_ratio": {
            "total_shots": total_shots,
            "movement_kinds": mv_kinds,
            "per_shot_movement": mv_norm,
            "movement_source": {k: mv_source.get(k) for k in sorted(mv_source)},
            "movement_counts": dict(mv_counter),
            "fixed_shots": fixed_cnt,
            "fixed_shot_ratio_percent": fixed_pct,
            "top_movement": top_mv,
            "top_movement_ratio_percent": top_mv_pct,
            "longest_same_movement_run": longest_run,
            "constraints": {
                "kinds_min": kinds_min,
                "single_max_percent": 40,
                "single_exempt_movement": "固定运镜",
                "fixed_min_percent": 50,
                "fixed_max_percent": 60,
                "adjacent_same_max_run": 2,
                "adjacent_exempt_movement": "固定运镜",
                "fixed_ratio_rule": "固定占比 50%-60%（v1.22.0，替代旧 fixed_max_percent=30）",
            },
        },
        "checks": checks,
        "failed_checks": [c["check_id"] for c in failed],
        "warnings": [c["check_id"] for c in warns],
        "skipped_checks": [c["check_id"] for c in skipped],
        "rollback": {"required": bool(blocking), "target_stage": "stage_3_script_generation" if blocking else None,
                     "scope": "shot_group" if blocking else None},
        "next_action": "stage4 通过，可写入 06-分镜/02-场次分镜卡 并进入 stage5"
                       if overall in ("PASS", "WARNING") else "按 rollback_and_revision 返修 stage4 产物，禁止落盘与进入 stage5",
    }

    out_dir = os.path.join(project, "12-质检")
    os.makedirs(out_dir, exist_ok=True)
    jp = os.path.join(out_dir, "%s_闸门结果_%s.json" % (STAGE_ID, ver))
    json.dump(result, open(jp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    L = ["# stage_4 分镜闸门汇总（%s）" % ver, "",
         "- 判定：**%s** ｜ 阻断项：%s ｜ 检查时间：%s" % (overall, "有" if blocking else "无", now),
         "- 覆盖：workflow_selfcheck_total=%d，implemented_checks=%d，manual_checks=%d（%d+%d=%d，覆盖率%s）"
         % (TOTAL, implemented, manual, implemented, manual, implemented + manual, "达标" if coverage_ok else "不达标"),
         "- 规则源：v%s（pack %s）" % (skeleton.get("source_workflow_version"), skeleton.get("pack_version")),
         "- 分镜卡：%s（%d 镜 / %d 组）" % (sb_rel, total_shots, len(groups)),
         "- 机器判定源：`%s`" % rel(project, jp), ""]

    L += ["## 闭集与反单一化硬校验（v1.22.0）", "",
          "| 硬校验 | 要求 | 实测 | 判定 |", "|---|---|---|---|"]
    for name, i, j in hard_groups:
        c = checks[i]
        L.append("| %s | %s | %s | %s |" % (name, c["expected"], c["actual"], c["status"]))
    L += ["", "**组类型分布**：`%s`" % json.dumps(dict(gt_counter), ensure_ascii=False), "",
          "**运镜分布**：`%s`" % json.dumps(dict(mv_counter), ensure_ascii=False),
          "- 运镜种类数 %d（下限 %d）｜ 最高动态占比『%s』%.1f%%（上限 40%%，固定豁免）｜ 固定 %.1f%%（区间 50%%-60%%）｜ 最长连续动态运镜 %d 镜（上限 2，固定豁免）"
          % (mv_kinds, kinds_min, top_dyn, top_dyn_pct, fixed_pct, longest_dyn_run), ""]

    if summary:
        L += ["## 自检覆盖（--summary 精简模式）", "",
              "- 已执行 %d 条 check（机检 %d / 人工 %d），本页只列 FAIL 项；全量逐条明细见同目录 `%s`。"
              % (TOTAL, implemented, manual, os.path.basename(jp))]
    else:
        L += ["## 逐条自检覆盖", "", "| self_checks 索引 | check_id | 类型 | 状态 | 级别 | 证据 |", "|---|---|---|---|---|---|"]
        for i, c in enumerate(checks):
            L.append("| %d | %s | %s | %s | %s | %s |" % (
                i, c["check_id"], "人工语义项" if c["manual_check"] else "机器断言", c["status"], c["severity"], c["evidence"]))
    L += ["", "## 阻断项与遗留", ""]
    if failed:
        for c in failed:
            L.append("- **%s**（%s）%s：%s" % (c["check_id"], c["severity"], c["expected"], c["actual"]))
    else:
        L.append("- 无 FAIL")
    if missing_aux:
        L += ["", "**缺失辅助输入（相关条目记 SKIPPED）**：" + "、".join("`%s`" % x for x in missing_aux)]
    L += ["", "> 人工语义项（`manual_check=true`）为不可机器断言的表演/情绪/轴线/流程类条目，已逐条回填 evidence，需导演复核后生效。"]
    mp = os.path.join(out_dir, "%s_闸门汇总_%s.md" % (STAGE_ID, ver))
    open(mp, "w", encoding="utf-8").write("\n".join(L) + "\n")

    if summary:
        print("overall=%s  total=%d implemented=%d manual=%d coverage=%s  [summary]"
              % (overall, TOTAL, implemented, manual, coverage_ok))
        print("json ->", jp)
        for c in failed:
            print("FAIL %s [%s] %s | %s" % (c["check_id"], c["severity"], c["expected"], c["actual"]))
        if not failed:
            print("无 FAIL（全量明细见 json）")
    else:
        print("overall=%s  total=%d implemented=%d manual=%d coverage=%s"
              % (overall, TOTAL, implemented, manual, coverage_ok))
        print("组类型：", json.dumps(dict(gt_counter), ensure_ascii=False))
        print("运镜：", json.dumps(dict(mv_counter), ensure_ascii=False))
        print("json ->", jp)
        print("md   ->", mp)
        for c in failed:
            print("FAIL %s [%s] %s | %s" % (c["check_id"], c["severity"], c["expected"], c["actual"]))
    return 0 if overall in ("PASS", "WARNING") else 1


if __name__ == "__main__":
    sys.exit(main())
