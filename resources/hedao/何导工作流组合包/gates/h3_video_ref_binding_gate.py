# -*- coding: utf-8 -*-
"""h3_video_ref_binding_gate.py —— H3 视频请求『参考图绑定』闸门（v1.24.25 新增，P0）

补的正是此前无人把守的那一环：**提示词里写了 @分镜图 ≠ 请求体里真垫了分镜图**。
本闸门逐镜核对三处一致性：
  ① 提示词 ref_image_0~n 清单           （07-分镜提示词/*_视频提示词_v1.md）
  ② stage6.5 公网素材URL索引           （08-分镜公网URL/公网素材URL索引.json）
  ③ 实际请求体回写                     （13-工作流文档/API任务索引.json 的 video 记录）

机检项：
  REFBIND-C1 每镜 ref_image 必含分镜图（@S0x_xx_分镜图），且 URL 与索引同源
  REFBIND-C2 所有 ref_image URL 一律 .webp（standards/asset_upload_format_policy.json 契约）
  REFBIND-C3 ref_image 数量 ≤ 档位上限（high_8=6 / standard_4=9）
  REFBIND-C4 组成与顺序 = 人物 → 道具 → 分镜图（末位）
  REFBIND-C5 人物 ref 集合 == 该镜分镜卡『场景与人物』栏的 CHxx 集合（不多不少）
  REFBIND-C6 实际请求体（已回写的 video 任务）ref_image 字段值 == 提示词清单（防「写一套、发一套」）
  REFBIND-C7 英文画面描述与分镜卡逐镜对齐（卡里列的角色必须写到；未列的角色不得出现）（v1.24.27）
用法：
  python gates/h3_video_ref_binding_gate.py --project <项目> [--verbose]
"""
import os, re, io, sys, json, glob, argparse

RE_SB = re.compile(r"(?m)^\s*ref_image_(\d+)\s*←\s*@(\S+?)\s+(\S+)\s*$")
EN_NAME = {
    "CH01": ["Li Xiaoxiao", "李霄霄"], "CH02": ["Empress Dowager", "太后"],
    "CH03": ["Emperor", "皇帝"], "CH04": ["the General", "General ", "将军"],
    "CH05": ["Dequan", "德全"], "CH06": ["matron", "嬷嬷", "老宫女"],
    "CH07": ["Cuiping", "翠屏"], "CH08": ["deputy general", "副将"],
}
# v1.24.28：画面描述允许中英任一语言 —— 早前正文取自硬编码英文 EN[shot_id]（插镜后与镜号整体错位），
# 已改为实时取分镜卡，故描述为中文；C7 的实质是「描述与分镜卡对齐」，与语言无关。
RE_CAST = re.compile(r"（(CH\d{2}(?:_C\d{2})?)）")
SHOT_RE = re.compile(r"镜号：\s*(S\d{2}_(?:\d{2}|D\d+))(.*?)(?=\n\s*[^\n]{0,8}镜号：\s*S\d{2}_(?:\d{2}|D\d+)|(?=\n##)|(?=\Z))", re.S)


def rd(p):
    return io.open(p, encoding="utf-8", errors="ignore").read()


def load(p, d=None):
    return json.load(io.open(p, encoding="utf-8")) if os.path.isfile(p) else d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--prompt-dir", default="07-分镜提示词")
    ap.add_argument("--prompt-suffix", default="_视频提示词_v1.md")
    ap.add_argument("--tier", default="high_8")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    proj = os.path.abspath(a.project)
    MAXN = 6 if a.tier == "high_8" else 9

    idx = load(os.path.join(proj, "08-分镜公网URL", "公网素材URL索引.json"), {}) or {}
    url_of = {}
    for x in idx.get("assets", []):
        u = x.get("xem8k5_returned_url") or x.get("url")
        if x.get("asset_id") and u:
            url_of[x["asset_id"]] = u

    card = ""
    d = os.path.join(proj, "06-分镜", "02-场次分镜卡")
    if os.path.isdir(d):
        for f in sorted(glob.glob(os.path.join(d, "*分镜头脚本*.md"))):
            card += rd(f)
    cast_of = {}
    for sid, body in SHOT_RE.findall(card):
        m = re.search(r"\n[ \t]*场景与人物：\s*(.*?)(?=\n[ \t]*\S+：|\Z)", body, re.S)
        cast_of[sid] = list(dict.fromkeys(RE_CAST.findall(m.group(1) if m else "")))

    ti = load(os.path.join(proj, "13-工作流文档", "API任务索引.json"), {"tasks": []}) or {"tasks": []}
    sent = {}
    for t in ti.get("tasks", []):
        if t.get("media_type") == "video":
            sent[t.get("shot_id")] = [f.split("=", 1)[1] for f in (t.get("ref_image_fields") or []) if "=" in f]

    files = sorted(glob.glob(os.path.join(proj, a.prompt_dir.replace("/", os.sep), "*" + a.prompt_suffix)))
    if not files:
        print("[gate] 无输入：%s 下未找到 *%s" % (a.prompt_dir, a.prompt_suffix))
        return 2

    iss = []
    for f in files:
        t = rd(f)
        sid = re.search(r"(S\d{2}_(?:\d{2}|D\d+))", os.path.basename(f))
        sid = sid.group(1) if sid else os.path.basename(f)
        refs = [(int(x), y, z) for x, y, z in RE_SB.findall(t)]
        if not refs:
            iss.append(("REFBIND-C1", sid, "无任何 ref_image 行"))
            continue
        ordered = [x for x, _y, _z in sorted(refs)]
        if ordered != list(range(len(refs))):
            iss.append(("REFBIND-C1", sid, "ref_image 编号不连续：%s" % ordered))
        # C1 分镜图必进
        sb = [(y, z) for _x, y, z in refs if re.match(r"^S\d{2}_(?:\d{2}|D\d+)_分镜图$", y)]
        if not sb:
            iss.append(("REFBIND-C1", sid, "ref_image 里没有分镜图（@S0x_xx_分镜图）——分镜图是必进项、固定末位"))
        else:
            want = url_of.get(sid)
            if want and sb[0][1] != want:
                iss.append(("REFBIND-C1", sid, "分镜图 URL 与 stage6.5 索引不同源（应取索引里的 WebP 地址）"))
            if refs[-1][1] != sb[0][0]:
                iss.append(("REFBIND-C4", sid, "分镜图不在 ref_image 末位"))
        # C2 webp
        for _x, y, z in refs:
            if not z.endswith(".webp"):
                iss.append(("REFBIND-C2", sid, "ref_image URL 非 .webp：@%s %s" % (y, z[-40:])))
        # C3 上限
        if len(refs) > MAXN:
            iss.append(("REFBIND-C3", sid, "ref_image %d 张 > %s 档上限 %d" % (len(refs), a.tier, MAXN)))
        # C4 顺序 人物→道具→分镜图
        kinds = ["SB" if re.match(r"^S\d{2}_", y) else ("CH" if y.startswith("CH") else "PRP") for _x, y, _z in refs]
        expect = sorted(kinds, key=lambda k: {"CH": 0, "PRP": 1, "SB": 2}[k])
        if kinds != expect:
            iss.append(("REFBIND-C4", sid, "组成顺序不是 人物→道具→分镜图：%s" % kinds))
        # C5 人物集合
        want_c = cast_of.get(sid)
        if want_c is not None:
            got_c = sorted(re.match(r"(CH\d{2}(?:_C\d{2})?)", y).group(1) for _x, y, _z in refs if y.startswith("CH"))
            if got_c != sorted(want_c):
                iss.append(("REFBIND-C5", sid, "人物 ref %s ≠ 分镜卡『场景与人物』%s" % (got_c, sorted(want_c))))
        # C7 英文画面描述与分镜卡逐镜对齐（v1.24.27）
        _en = re.search(r"\[Shot 1\] On the horizontal[^\n]*", t)
        _en = _en.group(0) if _en else ""
        _want = cast_of.get(sid)
        if _want is not None and _en:
            for _cid, _kw in EN_NAME.items():
                _hit = any(k.lower() in _en.lower() for k in _kw)
                if (_cid in _want) and not _hit:
                    iss.append(("REFBIND-C7", sid, "卡里列了 %s，但画面描述没写到该角色（描述与分镜卡未对齐，中英均认）" % _cid))
                if (_cid not in _want) and _hit:
                    iss.append(("REFBIND-C7", sid, "画面描述写了卡里没列的角色 %s（描述与分镜卡未对齐）" % _cid))

        # C6 实发 == 提示词
        if sid in sent:
            got_urls = [z for _x, _y, z in refs]
            if sent[sid] != got_urls:
                iss.append(("REFBIND-C6", sid, "实际请求体 ref_image 与提示词不一致（写一套发一套）"))

    # ---------- REFBIND-C8 生成器入口护栏存在性（v1.24.28，P0） ----------
    # 只靠闸门会被人跳过；必须在真正发请求的那支脚本里内置同一判据（运行时硬拒绝）。
    _gen = None
    for _c in ("11-工作流脚本/_stage7_generate.py", "11-工作流脚本/stage7_generate.py",
               "stage7_generate.py", "scripts/stage7_generate.py"):
        _p = os.path.join(a.project, _c.replace("/", os.sep))
        if os.path.isfile(_p):
            _gen = _p
            break
    if _gen is None:
        iss.append(("REFBIND-C8", "-", "未找到 stage7 生成脚本，无法确认入口护栏（分镜图参考强制须两处独立成立）"))
    else:
        _g = rd(_gen)
        if "SBRM_GUARD" not in _g:
            iss.append(("REFBIND-C8", "-", "生成脚本缺 SBRM_GUARD 入口护栏：未在提交前硬校验『本镜必含分镜图』"))
        elif ("分镜图" not in _g) or ("storyboard" not in _g.lower()):
            iss.append(("REFBIND-C8", "-", "SBRM_GUARD 标记存在但未见分镜图判据"))

    blocked = [i for i in iss if i[0] != "REFBIND-INFO"]
    _verdict = "PASS" if not blocked else "FAIL"
    print("[gate] %s  受检 %d 镜  阻断 %d%s"
          % (_verdict, len(files), len(blocked),
             "  （仅提示词，无已发视频记录时 C6 跳过）" if not sent else ""))
    print("  REFBIND-C1 分镜图必进且与索引同源 / C2 全 .webp / C3 数量上限 / C4 组成顺序 / C5 人物集合")
    print("  REFBIND-C6 实发==提示词 / C7 英文描述与卡对齐 / C8 生成器入口护栏（v1.24.28）")
    # v1.24.28：把「是否允许发起视频请求」写成可机读结论，供生成器与编排层直接读取
    try:
        _out = os.path.join(a.project, "12-质检")
        os.makedirs(_out, exist_ok=True)
        io.open(os.path.join(_out, "h3_video_ref_binding_gate_结论.json"), "w", encoding="utf-8").write(
            json.dumps({"gate": "h3_video_ref_binding_gate", "verdict": _verdict,
                        "block_generation": bool(blocked),
                        "checked": len(files), "blocked": len(blocked),
                        "rule": "SBRM-1：任一镜缺分镜图 → 整批不得提交",
                        "issues": [{"check": c, "shot_id": s, "msg": m} for c, s, m in blocked]},
                       ensure_ascii=False, indent=2))
    except Exception as _e:
        print("  [warn] 结论文件写入失败：%s" % _e)
    if blocked:
        print("  >>> 分镜图参考强制未满足：禁止发起任何一条视频请求（SBRM-1） <<<")
    for cid, sid, msg in iss[:30]:
        print("  %s %s %s" % (cid, sid, msg))
    return 0 if not blocked else 1


if __name__ == "__main__":
    sys.exit(main())
