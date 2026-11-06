#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
one_shot_generation_gate.py —— ONE-SHOT 生成台账核验闸门（v1.24.20，P0）

唯一真源：standards/one_shot_generation_policy.json
  「每个镜头的图片与视频，各自只准生成一次；任何模式不得自动重跑；不满意必须先询问导演。」

核验对象：13-工作流文档/生成台账.json
台账每条记录字段（见标准件 ledger_schema）：
  shot_id / media_type(image|video) / attempt_no / task_id / submitted_at / status / authorization

判定：
  OS-C1  台账文件存在且格式合法（缺文件按 SKIPPED，不阻断；文件存在但格式错 → FAIL）
  OS-C2  每 (shot_id, media_type) 组合的提交记录数 ≤ 1（除非该镜在该媒上有导演授权）
  OS-C3  每条记录 attempt_no 与出现次序一致（从 1 起、连续、无重复）
  OS-C4  凡 attempt_no ≥ 2 的记录必须带 director_authorized 授权号
  OS-C5  已授权镜的重做次数 ≤ 授权登记中的候选数 N（默认 1）
  OS-C6  失败记录未被自动重发（同一 (shot_id, media_type) 只有 1 条时，status=failed 即合法；
         出现 ≥2 条且无授权即判自动重发）

用法：
  python one_shot_generation_gate.py --project <项目目录> [--version v1]
退出码：0 = PASS，1 = FAIL，2 = 输入缺失（无台账 → PASS+SKIPPED）
"""
import os, sys, json, argparse, datetime
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")

GATE_ID = "one_shot_generation_gate"
LEDGER_REL = "13-工作流文档/生成台账.json"
STATE_REL = "13-工作流文档/阶段状态.json"


def _load_json(p):
    if not os.path.isfile(p):
        return None
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception as e:
        return {"__parse_error__": str(e)}


def _norm_media(m):
    m = str(m or "").strip().lower()
    if m in ("image", "img", "图片", "图", "分镜图", "资产图", "asset"):
        return "image"
    if m in ("video", "vid", "视频", "成片", "h3"):
        return "video"
    return m or "unknown"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--ledger", default=LEDGER_REL)
    ap.add_argument("--state", default=STATE_REL)
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    ledger_p = os.path.join(proj, args.ledger.replace("/", os.sep))
    state_p = os.path.join(proj, args.state.replace("/", os.sep))

    checks = []
    issues = []

    def put(cid, status, label, actual, blocking=True):
        checks.append({
            "check_id": cid, "label": label, "status": status,
            "severity": "P0", "blocking": bool(blocking and status == "FAIL"),
            "expected": label, "actual": actual,
            "evidence": args.ledger,
            "workflow_rule": "standards/one_shot_generation_policy.json（%s）" % cid,
            "repair_action": None if status in ("PASS", "SKIPPED") else
                             "按 ONE-SHOT 政策修正：删除自动重发逻辑；若确需重做，先登记导演授权到阶段状态.json",
        })

    j = _load_json(ledger_p)
    # ---- OS-C1 ----
    if j is None:
        put("OS-C1", "SKIPPED", "生成台账存在且格式合法（当前无台账，按未开始生成处理）",
            "未找到 %s" % args.ledger, blocking=False)
        for cid, lb in (("OS-C2", "每 (shot_id, media_type) 提交次数 ≤ 1"),
                        ("OS-C3", "attempt_no 连续且从 1 起"),
                        ("OS-C4", "attempt_no ≥ 2 必须带导演授权"),
                        ("OS-C5", "授权重做次数 ≤ 授权候选数"),
                        ("OS-C6", "失败记录未被自动重发")):
            put(cid, "SKIPPED", lb, "无台账", blocking=False)
        _emit(proj, args.version, checks, issues)
        return 0

    if isinstance(j, dict) and "__parse_error__" in j:
        put("OS-C1", "FAIL", "生成台账格式合法", "台账 JSON 解析失败：%s" % j["__parse_error__"])
        _emit(proj, args.version, checks, issues)
        return 1

    recs = j.get("records", j) if isinstance(j, dict) else j
    if not isinstance(recs, list):
        put("OS-C1", "FAIL", "生成台账格式合法", "台账不是数组（records 字段），实测 %s" % type(recs).__name__)
        _emit(proj, args.version, checks, issues)
        return 1
    put("OS-C1", "PASS", "生成台账存在且格式合法", "共 %d 条记录" % len(recs))

    # 授权
    sj = _load_json(state_p) or {}
    auths = sj.get("regeneration_authorizations", []) if isinstance(sj, dict) else []
    auth_map = {}   # (shot_id, media) -> N
    for a in auths:
        k = (a.get("shot_id"), _norm_media(a.get("media_type")))
        auth_map[k] = max(auth_map.get(k, 0), int(a.get("candidate_count") or 1))

    # ---- OS-C2 ----
    cnt = Counter((r.get("shot_id"), _norm_media(r.get("media_type"))) for r in recs)
    bad2 = []
    for (sid, mt), n in cnt.items():
        if n > 1 and (sid, mt) not in auth_map:
            bad2.append("%s/%s 提交 %d 次（>1）且无导演授权" % (sid, mt, n))
    put("OS-C2", "FAIL" if bad2 else "PASS",
        "每 (shot_id, media_type) 提交次数 ≤ 1（除授权外）",
        bad2[:20] if bad2 else "全部单发")
    for x in bad2:
        issues.append({"check_id": "OS-C2", "message": x})

    # ---- OS-C3 ----
    byk = defaultdict(list)
    for r in recs:
        byk[(r.get("shot_id"), _norm_media(r.get("media_type")))].append(r)
    bad3 = []
    for k, lst in byk.items():
        seq = sorted(int(r.get("attempt_no") or 0) for r in lst)
        if seq != list(range(1, len(lst) + 1)):
            bad3.append("%s/%s attempt_no 序列 %s（应为 1..%d）" % (k[0], k[1], seq, len(lst)))
    put("OS-C3", "FAIL" if bad3 else "PASS", "attempt_no 连续且从 1 起",
        bad3[:20] if bad3 else "全部连续")
    for x in bad3:
        issues.append({"check_id": "OS-C3", "message": x})

    # ---- OS-C4 ----
    bad4 = []
    for r in recs:
        if int(r.get("attempt_no") or 1) >= 2 and not r.get("authorization"):
            bad4.append("%s/%s attempt_no=%s 无授权号" % (r.get("shot_id"), _norm_media(r.get("media_type")),
                                                         r.get("attempt_no")))
    put("OS-C4", "FAIL" if bad4 else "PASS", "attempt_no ≥ 2 必须带导演授权",
        bad4[:20] if bad4 else "全部带授权")
    for x in bad4:
        issues.append({"check_id": "OS-C4", "message": x})

    # ---- OS-C5 ----
    bad5 = []
    for (sid, mt), n in cnt.items():
        if (sid, mt) in auth_map:
            allowed = 1 + auth_map[(sid, mt)]
            if n > allowed:
                bad5.append("%s/%s 提交 %d 次，超授权上限 %d" % (sid, mt, n, allowed))
    put("OS-C5", "FAIL" if bad5 else "PASS", "授权重做次数 ≤ 授权候选数",
        bad5[:20] if bad5 else "全部在授权范围内")
    for x in bad5:
        issues.append({"check_id": "OS-C5", "message": x})

    # ---- OS-C6 ----
    bad6 = []
    for k, lst in byk.items():
        if len(lst) >= 2 and k not in auth_map:
            bad6.append("%s/%s 出现 %d 条记录（应为 1）——涉嫌失败自动重发/自行重跑" % (k[0], k[1], len(lst)))
    put("OS-C6", "FAIL" if bad6 else "PASS", "失败记录未被自动重发",
        bad6[:20] if bad6 else "无自动重发痕迹")
    for x in bad6:
        issues.append({"check_id": "OS-C6", "message": x})

    _emit(proj, args.version, checks, issues)
    return 1 if any(c["status"] == "FAIL" for c in checks) else 0


def _emit(proj, version, checks, issues):
    fails = [c for c in checks if c["status"] == "FAIL"]
    overall = "FAIL" if fails else ("SKIPPED" if all(c["status"] == "SKIPPED" for c in checks) else "PASS")
    result = {
        "gate_id": GATE_ID,
        "gate_type": "专项闸门（ONE-SHOT 生成纪律，v1.24.20）",
        "project": proj,
        "checked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "rule_source_version": "v1.24.20",
        "overall_status": overall, "blocking": bool(fails), "blocking_fail_count": len(fails),
        "checks": checks, "failed_checks": [c["check_id"] for c in fails],
        "issue_detail": issues,
        "next_action": ("按 ONE-SHOT 政策修复：删除自动重发；重做须先登记导演授权" if fails
                        else "符合「每镜只准生成一次」纪律"),
    }
    out = os.path.join(proj, "12-质检")
    os.makedirs(out, exist_ok=True)
    json.dump(result, open(os.path.join(out, "one_shot_generation_gate_闸门结果_%s.json" % version),
                           "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    lines = ["# ONE-SHOT 生成台账闸门 · 汇总 %s" % version, "",
             "- 项目：%s" % proj, "- 检查时间：%s" % result["checked_at"],
             "- **总判定：%s**（阻断 %d 条）" % (overall, len(fails)), "",
             "| check | 结论 | 说明 |", "|---|---|---|"]
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        lines.append("| %s %s | %s | %s |" % (c["check_id"], c["label"], c["status"], act[:200]))
    lines += ["", "唯一真源：`standards/one_shot_generation_policy.json`", ""]
    open(os.path.join(out, "one_shot_generation_gate_闸门汇总_%s.md" % version),
         "w", encoding="utf-8").write("\n".join(lines))
    print("[one-shot gate] %s  阻断项 %d" % (overall, len(fails)))
    for c in checks:
        print("  %s %-8s %s" % (c["check_id"], c["status"], str(c["actual"])[:120]))


if __name__ == "__main__":
    sys.exit(main())
