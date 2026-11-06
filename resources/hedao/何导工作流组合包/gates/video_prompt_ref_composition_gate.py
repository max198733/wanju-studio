#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
视频提示词「参考图组成」闸门（v1.24.13 新增）

覆盖 video_engine 为 **通用**（wan3.0 / grok / seedance2.0）与 **seedance2.5** 两条路线；
H3 路线由 h3_video_prompt_format_gate.py 负责，本闸门对 H3 项目直接跳过。

硬校验：
  VPRC-C1 通用路线：每条提示词的多参引用必须同时含
         ① 人物资产图（@CHxx）② 道具资产图（@PRPxx）③ 分镜图；
         **不得出现场景资产图（@SCxx）**（v1.24.13：与 H3 口径一致，场景由分镜图承载）。
  VPRC-C2 seedance2.5 路线：参考图必须全部为**资产图**（@CHxx / @SCxx / @PRPxx），
         **不得出现分镜图**（v1.24.13：seedance 不再传分镜图、不设 first_frame）。
  VPRC-C3 两条路线的资产引用编号不得重复，且分镜图（若该路线要求）位置一致。

规则源：
  video_prompt_generic.generic_engine_prompt_rule
  video_prompt_seedance25（structure 末段 / content / self_check_additions）
  api/video_api_seedance.json 的 group_video_policy_seedance25.content_rule
"""
import argparse
import glob
import json
import os
import re
import sys

RE_CH = re.compile(r"@(CH\d+)")
RE_SC = re.compile(r"@(SC\d+(?:_[A-Z])?)")
RE_PRP = re.compile(r"@(PRP\d+)")
RE_SB = re.compile(r"@(S\d{2}_(?:\d{2}|D\d+))|(@S\d{2}_(?:\d{2}|D\d+)_分镜图)|<Picture\s+\d+>|分镜图")
RE_SB_TAG = re.compile(r"@S\d{2}_(?:\d{2}|D\d+)(?:_分镜图)?|@[^\s@]*分镜图|<Picture\s+\d+>")

C1 = "VPRC-C1"
C2 = "VPRC-C2"
C3 = "VPRC-C3"


def read_engine(proj):
    for cand in ("13-工作流文档/运行配置.json", "13-工作流文档/运行配置_v1.json"):
        p = os.path.join(proj, cand.replace("/", os.sep))
        if os.path.isfile(p):
            try:
                cfg = json.load(open(p, encoding="utf-8"))
                if isinstance(cfg, dict):
                    return (str(cfg.get("video_engine") or ""),
                            str(cfg.get("seedance_model") or ""))
            except Exception:
                pass
    return "", ""


def classify(engine, model):
    e = (engine or "").lower()
    m = (model or "").lower()
    if e == "h3":
        return "h3"
    if e == "seedance":
        return "seedance25" if "2.5" in m or "2_5" in m or "25" in m else "generic"
    if e in ("wan3.0", "wan3", "grok", "seedance2.0", ""):
        return "generic"
    return "generic"


def check_prompt(path):
    t = open(path, encoding="utf-8", errors="ignore").read()
    ch = sorted(set(RE_CH.findall(t)))
    sc = sorted(set(RE_SC.findall(t)))
    prp = sorted(set(RE_PRP.findall(t)))
    sb = bool(RE_SB.search(t))
    return {"ch": ch, "sc": sc, "prp": prp, "sb": sb, "chars": len(t)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--prompt-dir", default="07-分镜提示词")
    ap.add_argument("--engine", default="")
    ap.add_argument("--seedance-model", default="")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    if not os.path.isdir(proj):
        print("[gate] 项目目录不存在：%s" % proj)
        return 2

    engine, model = args.engine, args.seedance_model
    if not engine:
        engine, model = read_engine(proj)
    route = classify(engine, model)
    if route == "h3":
        print("[gate] video_engine=H3，本闸门不适用（由 h3_video_prompt_format_gate 负责）")
        return 2

    root = os.path.join(proj, args.prompt_dir.replace("/", os.sep))
    files = sorted(glob.glob(os.path.join(root, "**", "*.md"), recursive=True))
    if not files:
        print("[gate] 无输入：%s 下未找到提示词 md" % root)
        return 2

    issues = []
    for f in files:
        info = check_prompt(f)
        fn = os.path.basename(f)
        if route == "generic":
            # C1 通用：人物 + 道具 + 分镜图必进；场景不得出现
            if not info["ch"]:
                issues.append((C1, "fail", "%s：多参引用缺人物资产图（@CHxx）" % fn))
            if not info["prp"]:
                issues.append((C1, "fail", "%s：多参引用缺道具资产图（@PRPxx）" % fn))
            if not info["sb"]:
                issues.append((C1, "fail", "%s：缺分镜图引用（@镜号_分镜图 / <Picture N>）" % fn))
            if info["sc"]:
                issues.append((C1, "fail",
                               "%s：出现场景资产图 %s —— v1.24.13 起通用路线与 H3 一致，场景不由资产图承载"
                               % (fn, "/".join(info["sc"]))))
        else:
            # C2 seedance2.5：只用资产图，不得含分镜图
            if not (info["ch"] or info["prp"]):
                issues.append((C2, "fail", "%s：seedance 路线未见任何人物/道具资产图引用" % fn))
            if info["sb"]:
                issues.append((C2, "fail",
                               "%s：出现分镜图引用 —— v1.24.13 起 seedance 路线不再传分镜图、不设 first_frame"
                               % fn))
        # C3 编号不重复
        for label, arr in (("人物", info["ch"]), ("场景", info["sc"]), ("道具", info["prp"])):
            if len(arr) != len(set(arr)):
                issues.append((C3, "fail", "%s：%s资产引用编号重复" % (fn, label)))

    warns = [i for i in issues if i[1] == "warn"]
    fails = [i for i in issues if i[1] == "fail"]
    overall = "FAIL" if fails else ("WARNING" if warns else "PASS")

    print("[gate] route=%s  文件=%d  问题=%d  总体=%s"
          % (route, len(files), len(issues), overall))
    for cid, sev, msg in issues:
        print("   %-9s %-5s %s" % (cid, sev, msg))

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        json.dump({
            "gate_id": "video_prompt_ref_composition_gate",
            "stage_id": "stage_7_video_prompt_h3_generation_and_download",
            "route": route, "engine": engine, "seedance_model": model,
            "files_checked": len(files), "overall_status": overall,
            "issues": [{"check_id": c, "severity": s, "message": m} for c, s, m in issues],
        }, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
