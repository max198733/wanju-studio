#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
h3_video_prompt_format_gate.py —— H3 视频提示词官方格式闸门（仅 video_engine=H3）

立闸背景（v1.21.32）：
  「格式严格按官网来」如果只写在技能正文里，就还是靠自觉。本闸门把 MiniMax 官方
  skills/h3-prompt-writing（SKILL.md + references/ref-en.txt）的格式要求变成可执行断言，
  逐镜校验官方 Ref2VA 六段结构、标签与时间记号、以及官方 Tips 明令避免的抽象词。

唯一真源：
  MiniMax-AI/MiniMax-H3 → skills/h3-prompt-writing/SKILL.md（Tips for Better Results / Output Rules）
                        → references/ref-en.txt（Full-Reference Mode Rewrite Output Format Guide）
  skills/video_prompt_h3.md → official_tips / storyboard_field_mapping / output_composition_rule
  骨架 stage_workflow(8).self_checks（v1.24.12 起 73 条）
  skills/video_prompt_h3.md → hard_requirements_overlay（v1.21.35 四项强制项，机检 C8~C11）

机检项（P0）：
  H3FMT-C1 六段齐全且顺序正确
  H3FMT-C2 字段名逐字照官方（无自拟段落名 / 无缺段）
  H3FMT-C3 summary 以方括号任务类型前缀开头
  H3FMT-C4 retention_analysis 用官方固定英文标记、不写中文、不含 (Sx)
  H3FMT-C5 [Shot 1] 无时间戳；后续 [Shot N] At MM:SS.mmm；风格句在 [Shot 1] 之前
  H3FMT-C6 对话 <d>[Language] …</d> 与说话人 (Sx) 格式合法
  H3FMT-C7 无官方 Tips 明令避免的抽象词充当描述（cinematic / beautiful 等）

v1.21.35 新增（导演指令「强调或者加闸门」，与技能 hard_requirements_overlay 一一对应）：
  H3FMT-C8  参考标签全部先在 subject_definitions 定义（无无归属标签；尤其 <Audio N> 只引用不定义）
  H3FMT-C9  有台词镜逐条写闭口句；无台词镜写全员闭口句
  H3FMT-C15 台词行必须带 <Subject N> 绑定与说话人 ID (Sx)（v1.24.27）
  H3FMT-C16 说话人 ID 跨镜唯一且稳定（v1.24.27）
  H3FMT-C10 显式声明画面文字纪律（subtitle / caption / on-screen text / watermark 一律不出现）
  H3FMT-C11 正文显式写画幅方向且与头部 resolution 行一致（横屏 horizontal 16:9 / 竖屏 vertical 9:16）

v1.24.8 新增（导演指令「台词前置」）：
  H3FMT-C12 首行追溯行之下第二行为台词块（有台词镜 `台词：{角色名}：{原文}`，无台词镜 `台词：无`），
            位于官方六段正文之上；台词块文本与该镜 <d> 内台词逐字一致（WARNING，不阻断）

v1.24.10 新增（导演指令「如果参考图超出 8 分的 6 图或者 4 分的 9 图限制，则删减道具参考图，
人物、场景、分镜图一定要参考进去」）：
  H3FMT-C13 多参数量与组成（P0 阻断；v1.24.12 组成修订）：
            ⓿ ref_image 组成只允许：人物 → 道具 → 分镜图；**场景资产图（@SCxx）不得入列**；
            ① ref_image 总数不得超档位上限 —— high_8（8分高质量档）= 6 张、standard_4（4分低价档）= 9 张；
            ② 【v1.24.11 细化】人物、场景仅在 `subject_definitions` **实际声明**了 CHxx/SCxx 时才要求必进；
               **分镜图无条件必进**（另需正文有 <Picture N>）。原判据无条件要求人物/场景，
               实测把无人空镜（第01集 S01_21 玄关全景）误判为「缺人物参考图」。
            ③ 超限时只允许裁道具；若保留了道具却缺必进项，判「裁剪顺序错误」；
            ④ 声明 ref_image_count 与清单实际条数一致、编号连续。
            上限口径来自 2026-09-29 AutoDL 实测（非文档记载）：high_8 传 ref_image_6 返回
            『存在未定义的参数』；standard_4 传 ref_image_9 返回同一错误；两档平台工作流名为
            『H3六图三音频生视频』『H3多图多音频生视频』。原技能文档『统一 8 张』口径已校正。

输出：
  12-质检/h3_video_prompt_format_gate_闸门结果_v{version}.json
  12-质检/h3_video_prompt_format_gate_闸门汇总_v{version}.md

用法：
  python h3_video_prompt_format_gate.py --project "C:/项目目录" [--version v1]
         [--prompt-dir 07-分镜提示词] [--prompt-suffix _视频提示词_v1.md] [--shots S01_01,S01_02]
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检 / 非 H3 项目
"""
import argparse, json, os, re, sys, datetime, glob

SECTIONS = ["subject_definitions", "summary", "retention_analysis",
            "detailed_description", "overall_soundscape", "non_diegetic_music"]

TASK_TYPES = ["keyframe completion", "reference generation", "video editing",
              "video continuation", "audio reuse", "audio reference"]

VIS_RETENTION = ["fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference"]
AUD_RETENTION = ["fully_copy", "partially_copy", "reference", "weak_reference"]
ALL_RETENTION = set(VIS_RETENTION) | set(AUD_RETENTION)

ABSTRACT_WORDS = ["cinematic", "beautiful", "stunning", "gorgeous", "epic",
                  "breathtaking", "amazing", "aesthetic", "magnificent"]

RE_SHOT = re.compile(r"\[Shot\s+(\d+)\]")
RE_TS = re.compile(r"At\s+\d{2}:\d{2}\.\d{3}")
RE_D = re.compile(r"<d>\s*\[([A-Za-z][A-Za-z\- ]*)\]\s*(.*?)</d>", re.S)
RE_SPEAKER = re.compile(r"\((S\d+)\)")
RE_SECTION_LINE = re.compile(r"(?m)^[ \t]*([a-z_]+)[ \t]*[：:][ \t]*$")

# v1.24.10：多参绑定清单解析（校验 ref_image 数量与组成）
RE_REFIMG_LINE = re.compile(r"(?m)^\s*ref_image_(\d+)\s*←\s*@(\S+?)(?:\s|$)")
RE_REFIMG_COUNT = re.compile(r"ref_image_count\s*=\s*(\d+)")
RE_RES_LINE = re.compile(r"(?m)^\s*S\d{2}_(?:\d{2}|D\d+)\s*\|.*?resolution\s*[:：]\s*(\S+)")
# 档位 ref_image 上限（2026-09-29 AutoDL 实测：high_8=6、standard_4=9）
TIER_REFIMAGE_MAX = {"high_8": 6, "standard_4": 9}
# 资产类型识别：@CHxx_角色资产图 / @SCxx_场景资产图 / @PRPxx_道具资产图 / 分镜图
RE_AID_KIND = re.compile(r"^(CH\d+|SC\d+(?:_[A-Z])?|PRP\d+|S\d{2}_(?:\d{2}|D\d+))", re.I)


def classify_aid(tag):
    """按 @标签把资产归类为 character / scene / prop / storyboard。"""
    m = RE_AID_KIND.match(tag)
    if not m:
        return "unknown"
    aid = m.group(1).upper()
    if aid.startswith("CH"):
        return "character"
    if aid.startswith("PRP"):
        return "prop"
    if aid.startswith("SC"):
        return "scene"
    if re.match(r"^S\d{2}_(?:\d{2}|D\d+)$", aid):
        return "storyboard"
    return "unknown"


def rel(proj, p):
    try:
        return os.path.relpath(p, proj).replace("\\", "/")
    except Exception:
        return p


def section_positions(txt):
    """返回 {段名: 起始索引}；段名须独占一行（可带中英文冒号）。"""
    pos = {}
    for m in RE_SECTION_LINE.finditer(txt):
        name = m.group(1)
        if name in SECTIONS and name not in pos:
            pos[name] = m.start()
    return pos


def get_section_text(txt, pos, name):
    if name not in pos:
        return ""
    order = sorted(pos.items(), key=lambda kv: kv[1])
    cur = pos[name]
    after = [p for n, p in order if p > cur]
    end = after[0] if after else len(txt)
    return txt[cur:end]


def check_prompt(path, proj):
    txt = open(path, encoding="utf-8").read()
    issues = []
    basename = os.path.basename(path)

    pos = section_positions(txt)
    missing = [s for s in SECTIONS if s not in pos]
    order_ok = [n for n, _ in sorted(pos.items(), key=lambda kv: kv[1])] == \
               [s for s in SECTIONS if s in pos]

    # H3FMT-C1 / C2
    if missing:
        issues.append(("H3FMT-C1", "fail", "缺段：%s（官方 Ref2VA 六段必须齐全）" % missing))
    if not order_ok:
        got = [n for n, _ in sorted(pos.items(), key=lambda kv: kv[1])]
        issues.append(("H3FMT-C2", "fail", "段序不符合官方：实际 %s" % got))
    # 自拟段落名检测：像段名的行但不在官方六段内
    for m in RE_SECTION_LINE.finditer(txt):
        name = m.group(1)
        if name not in SECTIONS and len(name) > 3 and name.islower():
            if any(k in name for k in ("description", "definition", "summary", "shot", "section",
                                       "analysis", "sound", "music", "prompt", "content")):
                issues.append(("H3FMT-C2", "fail", "疑似自拟段落名：%s（官方只允许六段固定名）" % name))

    # H3FMT-C3 summary 任务类型前缀
    sec_sum = get_section_text(txt, pos, "summary")
    body = [l.strip() for l in sec_sum.splitlines()[1:] if l.strip()]
    if sec_sum:
        if not body or not body[0].startswith("["):
            issues.append(("H3FMT-C3", "fail", "summary 未以方括号任务类型前缀开头（如 [reference generation]）"))
        else:
            head = body[0][1:body[0].index("]")] if "]" in body[0] else ""
            parts = [p.strip() for p in head.split("+") if p.strip()]
            bad = [p for p in parts if p not in TASK_TYPES]
            if bad:
                issues.append(("H3FMT-C3", "fail", "非法任务类型：%s（官方闭集=%s）" % (bad, TASK_TYPES)))
            if len(parts) != len(set(parts)):
                issues.append(("H3FMT-C3", "fail", "任务类型重复：%s" % parts))

    # H3FMT-C4 retention_analysis 标记
    sec_ret = get_section_text(txt, pos, "retention_analysis")
    if sec_ret:
        lines = [l.strip() for l in sec_ret.splitlines()[1:] if l.strip()]
        if not lines:
            issues.append(("H3FMT-C4", "fail", "retention_analysis 为空"))
        for l in lines:
            if not any(mk in l for mk in ALL_RETENTION):
                issues.append(("H3FMT-C4", "fail", "该行缺官方保留标记：%s" % l[:60]))
            if re.search(r"[\u4e00-\u9fa5]", l.split(":")[-1] if ":" in l else l):
                issues.append(("H3FMT-C4", "fail", "保留标记说明写了中文（官方要求英文）：%s" % l[:60]))
        if RE_SPEAKER.search(sec_ret):
            issues.append(("H3FMT-C4", "fail", "retention_analysis 中禁止出现 (Sx)"))

    # H3FMT-C5 时间记号
    sec_dd = get_section_text(txt, pos, "detailed_description")
    if sec_dd:
        body_dd = sec_dd.splitlines()[1:]
        joined = "\n".join(body_dd)
        shot1 = re.search(r"(?m)^[ \t]*\[Shot\s+1\][^\n]*", joined)
        if not shot1:
            issues.append(("H3FMT-C5", "fail", "detailed_description 中缺 [Shot 1] 标记"))
        else:
            if RE_TS.search(shot1.group(0)):
                issues.append(("H3FMT-C5", "fail", "[Shot 1] 不得带时间戳（官方：opening shot has no timestamp）"))
            pre = joined[:shot1.start()].strip()
            if not pre:
                issues.append(("H3FMT-C5", "fail", "[Shot 1] 之前缺风格句（官方要求 1–2 句英文先立风格）"))
        for m in re.finditer(r"(?m)^[ \t]*(\[Shot\s+(\d+)\][^\n]*)", joined):
            line, num = m.group(1), int(m.group(2))
            if num >= 2 and not RE_TS.search(line):
                issues.append(("H3FMT-C5", "fail", "[Shot %d] 缺切镜时间戳（应为 [Shot N] At MM:SS.mmm）" % num))

    # H3FMT-C6 对话与说话人
    if RE_SPEAKER.search(txt) and not RE_D.search(txt):
        issues.append(("H3FMT-C6", "fail", "存在说话人 (Sx) 但无 <d>[Language] …</d> 台词标签"))
    for m in RE_D.finditer(txt):
        if not m.group(2).strip():
            issues.append(("H3FMT-C6", "fail", "<d> 内台词为空"))

    # H3FMT-C7 抽象词
    low = txt.lower()
    for w in ABSTRACT_WORDS:
        if re.search(r"\b%s\b" % re.escape(w), low):
            i = low.index(w)
            issues.append(("H3FMT-C7", "fail",
                           "出现官方明令避免的抽象词 '%s'（上下文：…%s…）——须改写为可拍摄的具体元素"
                           % (w, txt[max(0, i - 40):i + 40].replace("\n", " "))))


    # ---- H3FMT-C8 标签归属：每个被引用的标签都必须在 subject_definitions 段定义 ----
    RE_LABEL = re.compile(r"<(Subject|Picture|Video|Audio)\s+\d+>")
    sec_sd = get_section_text(txt, pos, "subject_definitions")
    defined = set(RE_LABEL.findall(sec_sd) and [m.group(0) for m in RE_LABEL.finditer(sec_sd)])
    referenced = {m.group(0) for m in RE_LABEL.finditer(txt)}
    undefined = sorted(referenced - defined, key=lambda s: (s.split()[0], int(re.search(r"\d+", s).group())))
    if undefined:
        issues.append(("H3FMT-C8", "fail",
                       "存在无归属标签（被引用但未在 subject_definitions 定义）：%s —— 先定义后使用" % undefined))

    # ---- H3FMT-C15 台词行绑定（v1.24.27，P0）：<Subject N> (Sx), with …, says with …: <d>[Language] …</d> ----
    _dl = re.findall(r"(?m)^[^\n]*?says with[^\n]*<d>", txt)
    if _dl:
        for _l in _dl:
            if not re.search(r"<Subject\s+\d+>", _l):
                issues.append(("H3FMT-C15", "fail",
                               "台词行缺 <Subject N> 绑定（未绑到已定义主体，H3 无所指 → 易出鸟语）：%s" % _l.strip()[:70]))
            if not re.search(r"\(S\d+\)", _l):
                issues.append(("H3FMT-C15", "fail",
                               "台词行缺说话人 ID (Sx)：%s" % _l.strip()[:70]))
    elif RE_D.search(txt):
        issues.append(("H3FMT-C15", "fail", "有 <d> 台词但未出现 says with 句式（台词行未按官方句式书写）"))

    # ---- H3FMT-C16 说话人 ID 唯一稳定（v1.24.27，P0）----
    _pairs = re.findall(r"<Subject\s+(\d+)>\s*\((S\d+)\)", txt)
    _sx2sub = {}
    for _sn, _sx in _pairs:
        _sx2sub.setdefault(_sx, set()).add(_sn)
    for _sx, _subs in _sx2sub.items():
        if len(_subs) > 1:
            issues.append(("H3FMT-C16", "fail",
                           "说话人 ID %s 被多个主体复用（Subject %s）——同 ID 必须只对应一个角色"
                           % (_sx, sorted(_subs))))
    _sub2sx = {}
    for _sn, _sx in _pairs:
        _sub2sx.setdefault(_sn, set()).add(_sx)
    for _sn, _sxs in _sub2sx.items():
        if len(_sxs) > 1:
            issues.append(("H3FMT-C16", "fail",
                           "主体 Subject %s 在不同镜用了不同说话人 ID（%s）——须跨镜稳定" % (_sn, sorted(_sxs))))

    # ---- H3FMT-C9 台词闭口句 ----
    if RE_D.search(txt):
        if not re.search(r"closes the mouth", txt, re.I):
            issues.append(("H3FMT-C9", "fail",
                           "有台词镜未写闭口声明：每条 <d>…</d> 后须紧跟 After delivering the line, the speaker closes the mouth."))
    else:
        if not re.search(r"No character speaks in this shot", txt):
            issues.append(("H3FMT-C9", "fail",
                           "无台词镜未写全员闭口句 No character speaks in this shot; all visible mouths remain closed with no lip movement."))

    # ---- H3FMT-C10 画面文字纪律声明 ----
    if not (re.search(r"subtitles?", txt, re.I) and re.search(r"watermark", txt, re.I)
            and re.search(r"on-screen text", txt, re.I)):
        issues.append(("H3FMT-C10", "fail",
                       "未声明画面文字纪律：须写出 subtitle / caption / on-screen text / watermark 一律不出现"))

    # ---- H3FMT-C11 画幅方向（与头部 resolution 行一致）----
    mres = re.search(r"resolution[\"']?\s*:\s*([^\n]+)", txt)
    if not mres:
        issues.append(("H3FMT-C11", "fail", "头部缺 resolution 行，无法判定画幅方向"))
    else:
        rv = mres.group(1)
        want = None
        if "横" in rv:
            want = "horizontal"
        elif "竖" in rv:
            want = "vertical"
        else:
            mwh = re.search(r"(\d+)\s*[*x×]\s*(\d+)", rv)
            if mwh:
                want = "horizontal" if int(mwh.group(1)) > int(mwh.group(2)) else "vertical"
        if want and not re.search(want, txt, re.I):
            issues.append(("H3FMT-C11", "fail",
                           "正文未体现画幅方向：resolution=%s ⇒ 正文须出现 '%s'" % (rv.strip(), want)))

    # ---- H3FMT-C12 台词前置块（v1.24.8，WARNING 不阻断）----
    # 首行追溯行之下第二行应为台词块；台词块位于官方六段正文之上
    lines = txt.splitlines()
    head_idx = None
    for i, ln in enumerate(lines[:8]):
        if "resolution" in ln and ("|" in ln or "：" in ln):
            head_idx = i
            break
    first_sec = min(pos.values()) if pos else len(txt)
    if head_idx is None:
        issues.append(("H3FMT-C12", "warn",
                       "未找到首行追溯行，无法判定台词前置块"))
    else:
        # 在首行之后、首个官方段之前找 `台词：` 行
        tail = txt[len("\n".join(lines[:head_idx + 1])):first_sec]
        mfront = re.search(r"(?m)^[ \t]*台词[：:][ \t]*(.+)$", tail)
        if not mfront:
            issues.append(("H3FMT-C12", "warn",
                           "首行追溯行之下未写台词前置块（应写 `台词：{角色名}：{原文}` 或 `台词：无`）"))
        else:
            fv = mfront.group(1).strip()
            has_d = bool(RE_D.search(txt))
            if not has_d and fv not in ("无", "none", "N/A", "N/a"):
                issues.append(("H3FMT-C12", "warn",
                               "无台词镜的台词块应为 `台词：无`，实测 `台词：%s`" % fv[:40]))
            if has_d and fv in ("无", "none", "N/A", "N/a"):
                issues.append(("H3FMT-C12", "warn",
                               "本镜含 <d> 台词但前置块写「无」，两处不一致"))

    # ---- H3FMT-C13 多参数量与组成（v1.24.10 新增，P0）----
    # 真源：video_prompt_h3.reference_input_binding_rule.limits / ref_image_overlimit_trim_rule
    # 规则：① 总数不得超档位上限（high_8=6 / standard_4=9）；
    #      ② 人物、场景、分镜图三类「必进项」若该镜分镜卡栏内有标注，则必须出现在 ref_image 中；
    #      ③ 超限时只允许裁道具。
    ref_pairs = [(int(m.group(1)), m.group(2)) for m in RE_REFIMG_LINE.finditer(txt)]
    kind_by_idx = {i: classify_aid(tag) for i, tag in ref_pairs}
    kinds = list(kind_by_idx.values())
    n_img = len(ref_pairs)
    # 声明数量与实测数量一致性
    mc = RE_REFIMG_COUNT.search(txt)
    if ref_pairs:
        if mc and int(mc.group(1)) != n_img:
            issues.append(("H3FMT-C13", "fail",
                           "声明 ref_image_count=%s 与实际清单 %d 条不一致" % (mc.group(1), n_img)))
        # 连续编号检查
        idxs = sorted(kind_by_idx.keys())
        if idxs != list(range(n_img)):
            issues.append(("H3FMT-C13", "fail",
                           "ref_image 编号不连续：实际 %s（必须 0..%d）" % (idxs, n_img - 1)))
        # 档位上限
        mr = RE_RES_LINE.search(txt)
        res = mr.group(1) if mr else ""
        tier = "high_8" if "(" in res else ("standard_4" if res else "")
        hard_max = 6  # 未识别档位时按最严档位（high_8=6）判定
        if tier:
            hard_max = TIER_REFIMAGE_MAX[tier]
        if n_img > hard_max:
            issues.append(("H3FMT-C13", "fail",
                           "ref_image 共 %d 张，超出 %s 档上限 %d 张（超限时必须裁道具，不得裁人物/场景/分镜图）"
                           % (n_img, tier or "未识别档", hard_max)))
        # 必进项本身超限（无道具可裁）→ 报错停下，交导演裁决，不得静默裁必进项
        n_prop = sum(1 for k in kinds if k == "prop")
        # v1.24.12：必进项 = 人物 + 分镜图（场景资产图已退出 ref_image）
        n_core = len([k for k in kinds if k in ("character", "storyboard")])
        # v1.24.12：禁止场景资产图进入 ref_image
        if "scene" in kinds:
            issues.append(("H3FMT-C13", "fail",
                           "ref_image 含场景资产图（@SCxx）：v1.24.12 起场景不再作为参考图，"
                           "场景与空间一致性改由分镜图承载，必须移除该条 SCxx 绑定及其 <Subject N> 定义"))
        if n_img > hard_max and n_prop == 0 and n_core > hard_max:
            issues.append(("H3FMT-C13", "fail",
                           "必进项本身超限：人物/场景/分镜图合计 %d 张 > %s 档上限 %d 张且无道具可裁 —— "
                           "不得裁剪必进项，须停下报导演裁决（拆镜 / 升级档位 / 减少角色数）"
                           % (n_core, tier or "未识别档", hard_max)))
        # 必进项：人物 / 分镜图
        # v1.24.10：人物**仅在该镜确有该类资产时**才要求（subject_definitions 的
        # "asset id is CHxx" 即声明）；否则空镜会被误判缺人物。
        # v1.24.12：场景资产图退出 ref_image，不再作为必进项（出现即判 fail，见上方）。
        # 分镜图无条件必进（构图锚点 + 场景信息载体）。
        declared = {d.upper() for d in re.findall(r"asset id is ([A-Za-z]{2}\d{2}(?:_[A-Z])?)", txt)}
        need = []
        if any(d.startswith("CH") for d in declared):
            need.append(("character", "人物"))
        need.append(("storyboard", "分镜图"))
        has_pic = bool(re.search(r"<Picture\s+\d+>", txt))
        miss_core = []
        for nd, cn in need:
            if nd == "storyboard":
                if not has_pic:
                    issues.append(("H3FMT-C13", "fail",
                                   "缺分镜图参考：ref_image 清单无分镜图、正文亦无 <Picture N>（分镜图是构图锚点，必进）"))
                    miss_core.append("分镜图")
            elif nd not in kinds:
                issues.append(("H3FMT-C13", "fail",
                               "缺%s参考图：ref_image 清单中未出现 %s 类资产（必进项，不可为省额度而省略）"
                               % (cn, cn)))
                miss_core.append(cn)
        # 若必进项任缺而道具却在 → 明确判为「裁错对象」
        if "prop" in kinds and miss_core:
            issues.append(("H3FMT-C13", "fail",
                           "裁剪顺序错误：保留了道具参考图，却缺 %s ——超限时必须先裁道具" % "、".join(miss_core)))

    info = {"file": basename, "sections_found": [n for n, _ in sorted(pos.items(), key=lambda kv: kv[1])],
            "missing": missing, "shots": sorted({int(x) for x in RE_SHOT.findall(txt)})}
    return issues, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--prompt-dir", default="07-分镜提示词")
    ap.add_argument("--prompt-suffix", default="_视频提示词_v1.md")
    ap.add_argument("--shots", default="")
    ap.add_argument("--engine", default="")
    ap.add_argument("--rule-version", default="")
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    if not os.path.isdir(proj):
        print("[gate] 项目目录不存在：%s" % proj)
        return 2

    engine = args.engine
    if not engine:
        cfg = None
        for cand in ("13-工作流文档/运行配置.json", "13-工作流文档/运行配置_v1.json"):
            p = os.path.join(proj, cand.replace("/", os.sep))
            if os.path.isfile(p):
                try:
                    cfg = json.load(open(p, encoding="utf-8"))
                except Exception:
                    cfg = None
                break
        if isinstance(cfg, dict):
            engine = str(cfg.get("video_engine") or "")
    if engine and engine.upper() != "H3":
        print("[gate] 非 H3 项目（video_engine=%s），本闸门不适用" % engine)
        return 2

    pdir = os.path.join(proj, args.prompt_dir.replace("/", os.sep))
    files = sorted(glob.glob(os.path.join(pdir, f"*{args.prompt_suffix}")))
    if args.shots:
        want = {s.strip() for s in args.shots.split(",") if s.strip()}
        files = [f for f in files if any(w in os.path.basename(f) for w in want)]
    if not files:
        print("[gate] 无输入：%s 下未找到 *%s" % (pdir, args.prompt_suffix))
        return 2

    per_file, all_issues = [], []
    for f in files:
        iss, info = check_prompt(f, proj)
        per_file.append(info)
        for cid, sev, msg in iss:
            all_issues.append({"check_id": cid, "file": os.path.relpath(f, proj).replace("\\", "/"),
                               "shot_id": re.search(r"(S\d{2}_(?:\d{2}|D\d+))", os.path.basename(f)).group(1)
                               if re.search(r"(S\d{2}_(?:\d{2}|D\d+))", os.path.basename(f)) else "",
                               "message": msg})


    # ---- H3FMT-C14 单发台账（v1.24.20，P0）----
    # 真源 standards/one_shot_generation_policy.json：
    #   同一 shot_id + video 提交记录数 ≤1，除非有导演授权登记。
    _os_recs = _os_load_records(proj)
    if _os_recs is not None:
        from collections import Counter as _OSC
        _os_auth = _os_auth_keys(proj, ("video", "视频", "成片"))
        _os_cnt = _OSC(r.get("shot_id") for r in _os_recs if _os_norm_media(r.get("media_type")) == "video")
        for _sid, _n in _os_cnt.items():
            if _n > 1 and _sid not in _os_auth:
                all_issues.append({"check_id": "H3FMT-C14", "shot_id": _sid, "file": "",
                                   "message": "视频提交 %d 次（>1）且无导演授权——违反 ONE-SHOT 纪律" % _n})

    def mk(cid, label, rule, severity="P0", blocking=None):
        mine = [i for i in all_issues if i["check_id"] == cid]
        _blocking = bool(mine) if blocking is None else (bool(mine) and blocking)
        return {"check_id": cid, "label": label, "status": "PASS" if not mine else "FAIL",
                "severity": severity, "blocking": _blocking, "expected": label,
                "actual": "全部通过" if not mine else [f"{x['shot_id']}: {x['message']}" for x in mine][:20],
                "evidence": f"{args.prompt_dir}/*{args.prompt_suffix}（共 {len(files)} 镜）",
                "workflow_rule": rule,
                "repair_action": None if not mine else
                ("按官方 Ref2VA 规范修正该镜提示词后重跑本闸门；不得带格式缺陷提交 H3"
                 if _blocking else
                 "建议按 v1.24.8 台词前置块补齐（不阻断提交，但影响台词锚定效果）")}

    checks = [
        mk("H3FMT-C1", "六段齐全（subject_definitions / summary / retention_analysis / detailed_description / overall_soundscape / non_diegetic_music）",
           "stage_workflow(8).self_checks(63) + MiniMax 官方 ref-en.txt §1"),
        mk("H3FMT-C2", "字段名逐字照官方、段序正确、无自拟段落名",
           "stage_workflow(8).self_checks(63) + 官方 official_format_warning"),
        mk("H3FMT-C3", "summary 以方括号任务类型前缀开头（闭集、+ 连接、不重复）",
           "stage_workflow(8).self_checks(63) + 官方 ref-en.txt §3"),
        mk("H3FMT-C4", "retention_analysis 使用官方固定英文保留标记、不写中文、不含 (Sx)",
           "stage_workflow(8).self_checks(63) + 官方 ref-en.txt §4"),
        mk("H3FMT-C5", "[Shot 1] 无时间戳、后续 [Shot N] At MM:SS.mmm、风格句在 [Shot 1] 之前",
           "stage_workflow(8).self_checks(63) + 官方 ref-en.txt §5.1/§5.2"),
        mk("H3FMT-C6", "对话 <d>[Language] …</d> 与说话人 (Sx) 格式合法",
           "stage_workflow(8).self_checks(63) + 官方 ref-en.txt §5.4"),
        mk("H3FMT-C7", "无官方 Tips 明令避免的抽象词充当描述（cinematic / beautiful 等）",
           "stage_workflow(8).self_checks(64) + 官方 SKILL.md → Tips for Better Results"),
        mk("H3FMT-C8", "参考标签全部先在 subject_definitions 定义（无无归属标签）",
           "stage_workflow(8).self_checks(65) + video_prompt_h3.hard_requirements_overlay.R1_label_definition"),
        mk("H3FMT-C9", "有台词镜逐条写闭口句；无台词镜写全员闭口句",
           "stage_workflow(8).self_checks(66) + video_prompt_h3.hard_requirements_overlay.R2_dialogue_closing"),
        mk("H3FMT-C10", "显式声明画面文字纪律（无字幕/说明文字/水印）",
           "stage_workflow(8).self_checks(67) + video_prompt_h3.hard_requirements_overlay.R3_onscreen_text_declaration"),
        mk("H3FMT-C11", "正文显式写画幅方向且与 resolution 行一致（horizontal 16:9 / vertical 9:16）",
           "stage_workflow(8).self_checks(68) + video_prompt_h3.hard_requirements_overlay.R4_aspect_direction_in_body"),
        mk("H3FMT-C12", "台词前置块：首行追溯行之下第二行为 `台词：…`（无台词镜写 `台词：无`），位于官方六段之上",
           "video_prompt_h3.output_composition_rule.dialogue_front_block（v1.24.8 台词前置）",
           severity="P1", blocking=False),
        mk("H3FMT-C13", "多参数量与组成：不超档位上限（high_8=6 / standard_4=9）；人物（按该镜实际声明）+ 分镜图必进；道具可裁；场景资产图不得入列（v1.24.12）",
           "video_prompt_h3.reference_input_binding_rule.limits / ref_image_overlimit_trim_rule（v1.24.10；必进项判据 v1.24.11 细化）"),
        mk("H3FMT-C14", "单发台账（同一 shot_id 视频提交次数 ≤1，除导演授权外）",
           "standards/one_shot_generation_policy.json（v1.24.20；机检 H3FMT-C14）"),
    ]
    fails = [c for c in checks if c["status"] == "FAIL" and c.get("blocking")]
    overall = "FAIL" if fails else "PASS"
    result = {
        "gate_id": "h3_video_prompt_format_gate",
        "gate_type": "专项闸门（H3 视频提示词官方格式）",
        "project": proj,
        "checked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "rule_source_version": args.rule_version or "见 manifest.pack_version",
        "engine": engine or "H3（未读到运行配置，按 H3 处理）",
        "prompt_dir": args.prompt_dir, "prompt_suffix": args.prompt_suffix,
        "shots_checked": len(files),
        "overall_status": overall, "blocking": bool(fails),
        "blocking_fail_count": len(fails),
        "checks": checks, "failed_checks": [c["check_id"] for c in fails],
        "issue_detail": all_issues, "per_file": per_file,
        "next_action": ("按 failed_checks 逐镜修正为官方 Ref2VA 格式后重跑本闸门；通过才允许提交 H3"
                        if fails else "六段结构与官方口径全部一致，允许提交 H3"),
    }

    out_dir = os.path.join(proj, "12-质检")
    os.makedirs(out_dir, exist_ok=True)
    json.dump(result, open(os.path.join(out_dir, "h3_video_prompt_format_gate_闸门结果_%s.json" % args.version),
                           "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    lines = ["# H3 视频提示词官方格式闸门 · 汇总 %s" % args.version, "",
             "- 项目：%s" % proj,
             "- 检查时间：%s" % result["checked_at"],
             "- 受检镜数：%d ｜ 引擎：%s" % (len(files), result["engine"]),
             "- **总判定：%s**（阻断项 %d 条）" % (overall, len(fails)), "",
             "| check | 内容 | 结论 | 说明 |", "|---|---|---|---|"]
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        lines.append("| %s | %s | %s | %s |" % (c["check_id"], c["label"], c["status"], act[:200]))
    if all_issues:
        lines += ["", "## 问题明细", "", "| check | 镜号 | 问题 |", "|---|---|---|"]
        for i in all_issues[:80]:
            lines.append("| %s | %s | %s |" % (i["check_id"], i["shot_id"], i["message"][:150]))
    lines += ["", "## 唯一真源", "",
              "- MiniMax 官方 `MiniMax-AI/MiniMax-H3` → `skills/h3-prompt-writing/SKILL.md` 与 `references/ref-en.txt`",
              "- `skills/video_prompt_h3.md`（official_tips / storyboard_field_mapping / output_composition_rule）",
              "- 骨架 `stage_workflow(8).self_checks(63)(64)`",
              "- 本闸门为组合包 `gates/h3_video_prompt_format_gate.py` 的项目内落地副本", ""]
    open(os.path.join(out_dir, "h3_video_prompt_format_gate_闸门汇总_%s.md" % args.version),
         "w", encoding="utf-8").write("\n".join(lines))

    print("[gate] %s  受检 %d 镜  阻断项 %d" % (overall, len(files), len(fails)))
    for c in checks:
        print("  %s %-8s %s" % (c["check_id"], c["status"], str(c["actual"])[:120]))
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
