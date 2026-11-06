#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
stage_8_interaction_gate.py —— stage8 交互闸门（纯交互闸门阶段专用）

唯一真源：何导工作流 stage_workflow(9).end_confirmation_interaction
                     + stage_workflow(9).decision_record_schema
                     + gate_enforcement.interactive_gate_rule
                     + self_check_protocol.status_mapping

本闸门解决的问题：stage8 无生成产物、无技能，过去在通用阶段流程上「空转」，
被折叠为「无产物，直接完成」，导致『是否有镜头需要修改 / 抽卡还是全路重做』
这一用户决策闸门从不提问。按 interactive_gate_rule，该类阶段的有序产出就是
「问答答复落盘文件」，本闸门校验该文件的结构完整性并据此判定。

覆盖 10 项可机检断言：
  STG8-C1  记录文件存在且可解析
  STG8-C2  answers 覆盖三问（stage8_need_revision / stage8_redo_method / stage8_shot_list），无缺项、无重复、无未知问项
  STG8-C3  已触发问项字段完整：answer 非空、answered_at 为合法 ISO 8601
  STG8-C4  answer_source=user：无 default / memory / history / inference 顶替
  STG8-C5  未触发问项标 answer_status=not_triggered 且写明 not_triggered_reason
  STG8-C6  条件一致性：need_revision=否→后两问 not_triggered；=是→redo_method 已答；redo_method 已答→shot_list 已答
  STG8-C7  成片交付清单存在、可解析，且清单内视频文件在 10-成片 下真实存在
  STG8-C8  收尾前置：最终收尾（final_completed=true）必须满足 need_revision=否 且 C7 通过
  STG8-C9  返工路径：need_revision=是 时 13-工作流文档/回滚记录.json 存在且含 trigger_stage=stage_8 条目
  STG8-C10 人工清单：不可机检的语义自检项已在 manual_checklist 逐项勾选并回填 evidence（或记 n/a 并给理由）

覆盖口径（gate_enforcement.coverage_rule）：implemented_checks + manual_checks = workflow_selfcheck_total
  workflow_selfcheck_total 从项目 13-工作流文档 内的真源 JSON 读取（stage_8 的 self_checks 条数），不硬编码。
  self_checks 中可机检项映射到 STG8-C*，语义项映射到 manual_checklist（本脚本内置映射表 SELFCHECK_KIND）。

输出（遵循 gate_enforcement.outputs 命名）：
  12-质检/stage_8_revision_confirmation_and_redo_闸门结果_v{version}.json
  12-质检/stage_8_revision_confirmation_and_redo_闸门汇总_v{version}.md

用法：
  python stage_8_interaction_gate.py --project "C:/项目目录" [--version v1]
         [--record 13-工作流文档/stage8_决策记录_v1.json]
         [--delivery 10-成片/成片交付清单_v1.json]
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检
"""
import argparse, datetime, json, os, re, sys, glob

STAGE_ID = "stage_8_revision_confirmation_and_redo"
GATE_NAME = "stage_8_interaction_gate"
Q_IDS = ["stage8_need_revision", "stage8_redo_method", "stage8_shot_list"]
BAD_SOURCES = ["default", "memory", "history", "inference", "assumed", "guess", "推测", "默认", "记忆"]
YES_WORDS = ["是", "yes", "y", "true", "有", "需要", "需要修改", "需修改"]
NO_WORDS = ["否", "no", "n", "false", "无", "不需要", "不需要修改", "没有", "不用"]

# 不可机检的语义自检项（按 stage_8.self_checks 索引）→ 人工清单键
SELFCHECK_KIND = {
    0: "machine", 1: "machine", 2: "machine",
    3: "manual", 4: "manual", 5: "manual",
    6: "machine", 7: "machine",
}
MANUAL_LABELS = {
    3: "抽卡路径：提示词与原版本逐字一致、请求参数与素材URL与原任务一致、API任务索引已登记 retry_of、视频已下载至10-成片",
    4: "全路重做路径：重做镜头已按 stage4→stage5→stage6→stage6.5→stage6.6→stage7 全流程执行，各阶段产物均出新版本且旧版本保留",
    5: "全路重做后 redo_multi_reference_audit 全部通过（多参成功、无参错、xem8k5 未出问题、URL 均为新版本 verified）",
}


def norm(s):
    return re.sub(r"[\s。.！!？?，,、]+", "", str(s or "")).lower()


def is_yes(s):
    return norm(s) in [norm(x) for x in YES_WORDS]


def is_no(s):
    return norm(s) in [norm(x) for x in NO_WORDS]


def iso_ok(s):
    if not s or not isinstance(s, str):
        return False
    try:
        datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        return True
    except Exception:
        return False


def load_json(path):
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f), None
    except Exception as e:
        return None, str(e)


def find_workflow_json(proj):
    """在 13-工作流文档 下找真源 JSON（含 stage_workflow 的那个），用于读取 self_checks 条数。"""
    d = os.path.join(proj, "13-工作流文档")
    for p in sorted(glob.glob(os.path.join(d, "*"))):
        j, _ = load_json(p)
        if isinstance(j, dict) and isinstance(j.get("stage_workflow"), list):
            return j, p
    return None, None


def selfcheck_total(proj):
    j, p = find_workflow_json(proj)
    if not j:
        return None, None
    for s in j["stage_workflow"]:
        if s.get("stage_id") == STAGE_ID:
            return len(s.get("self_checks", [])), p
    return None, p


def find_record(proj, version, explicit):
    if explicit:
        q = explicit if os.path.isabs(explicit) else os.path.join(proj, explicit)
        return q if os.path.exists(q) else None
    d = os.path.join(proj, "13-工作流文档")
    cands = sorted(glob.glob(os.path.join(d, "stage8_决策记录_*.json")))
    if version:
        for c in cands:
            if version in os.path.basename(c):
                return c
    return cands[-1] if cands else None


def find_delivery(proj, version, explicit):
    if explicit:
        q = explicit if os.path.isabs(explicit) else os.path.join(proj, explicit)
        return q if os.path.exists(q) else None
    d = os.path.join(proj, "10-成片")
    cands = sorted(glob.glob(os.path.join(d, "成片交付清单_*.json")))
    if version:
        for c in cands:
            if version in os.path.basename(c):
                return c
    return cands[-1] if cands else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--record", default=None)
    ap.add_argument("--delivery", default=None)
    args = ap.parse_args()
    proj = os.path.abspath(args.project)
    now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")

    rec_path = find_record(proj, args.version, args.record)
    if not rec_path:
        print(f"[gate] 无输入：未找到 stage8 决策记录（13-工作流文档/stage8_决策记录_*.json）。"
              f"stage8 必须先逐条实际提问并把答复落盘，本闸门方可执行。")
        return 2

    checks, issues = [], []

    def add(cid, label, status, expected, actual, blocking, repair, wrule, evidence):
        checks.append({
            "check_id": cid, "label": label, "status": status,
            "severity": "P0" if blocking else "P1", "blocking": bool(blocking and status == "FAIL"),
            "expected": expected, "actual": actual, "repair_action": repair if status == "FAIL" else None,
            "workflow_rule": wrule, "evidence": evidence,
        })
        if status == "FAIL":
            issues.append({"check_id": cid, "message": str(actual)[:300]})

    rec, err = load_json(rec_path)
    # C1
    add("STG8-C1", "决策记录文件存在且可解析", "PASS" if rec else "FAIL",
        "13-工作流文档/stage8_决策记录_v*.json 存在且为合法 JSON",
        (rec_path if rec else f"解析失败：{err}"), True,
        "先按 stage8 process[0] 逐条实际提问并把答复写入决策记录文件，再重跑本闸门",
        "stage_workflow(9).outputs / decision_record_schema", rec_path)
    if not rec:
        return finish(proj, args.version, checks, issues, now, rec_path, None, None)

    answers = rec.get("answers")
    if not isinstance(answers, list):
        answers = []

    def get(qid):
        for a in answers:
            if isinstance(a, dict) and a.get("question_id") == qid:
                return a
        return None

    # C2
    got = [a.get("question_id") for a in answers if isinstance(a, dict)]
    missing = [q for q in Q_IDS if q not in got]
    dup = [q for q in Q_IDS if got.count(q) > 1]
    unknown = [q for q in got if q not in Q_IDS]
    c2_ok = not missing and not dup and not unknown and len(got) == len(Q_IDS)
    add("STG8-C2", "三问齐全（无缺项/无重复/无未知问项）", "PASS" if c2_ok else "FAIL",
        "answers 恰好含 " + " / ".join(Q_IDS), f"实得 {got}；缺 {missing} 重复 {dup} 未知 {unknown}", True,
        "补齐 answers：未触发的问项也要落条并标 answer_status=not_triggered",
        "stage_workflow(9).decision_record_schema.rules[0]", rec_path)

    # C3 / C4 / C5
    bad3, bad4, bad5 = [], [], []
    for q in Q_IDS:
        a = get(q)
        if not a:
            continue
        st = a.get("answer_status")
        if st == "not_triggered":
            if not str(a.get("not_triggered_reason") or "").strip():
                bad5.append(q)
            continue
        if not str(a.get("answer") or "").strip() or not iso_ok(a.get("answered_at")):
            bad3.append(f"{q}(answer={a.get('answer')!r}, answered_at={a.get('answered_at')!r})")
        src = str(a.get("answer_source") or "").strip().lower()
        if any(b in src for b in BAD_SOURCES):
            bad4.append(f"{q}→answer_source={src!r}")
    add("STG8-C3", "已触发问项字段完整（answer 非空 + 合法时间戳）", "FAIL" if bad3 else "PASS",
        "每个 answered 问项含非空 answer 与 ISO 8601 answered_at", bad3 or "全部完整", True,
        "补填 answer（用户答复原文）与 answered_at（实际答复时间）", "decision_record_schema.answer_item", rec_path)
    add("STG8-C4", "answer_source=user（无默认值顶替）", "FAIL" if bad4 else "PASS",
        "answer_source 必须为 user", bad4 or "全部为 user", True,
        "禁止用默认值/记忆/历史批次/推断顶替答复：必须真实提问后记录用户答复原文",
        "stage_workflow(9).decision_record_schema.rules[1] / end_confirmation_interaction.forbidden", rec_path)
    add("STG8-C5", "未触发问项已标 not_triggered 并说明原因", "FAIL" if bad5 else "PASS",
        "not_triggered 问项必含 not_triggered_reason", bad5 or "全部合规", True,
        "为 not_triggered 的问项补 not_triggered_reason（写明哪一问的答复导致未触发）",
        "stage_workflow(9).decision_record_schema.rules[0]", rec_path)

    # C6 条件一致性
    a_need, a_redo, a_shot = get(Q_IDS[0]), get(Q_IDS[1]), get(Q_IDS[2])
    bad6 = []
    if a_need and a_need.get("answer_status") != "not_triggered":
        if is_no(a_need.get("answer")):
            for q, a in ((Q_IDS[1], a_redo), (Q_IDS[2], a_shot)):
                if a and a.get("answer_status") != "not_triggered":
                    bad6.append(f"{q} 应为 not_triggered（need_revision=否）")
        elif is_yes(a_need.get("answer")):
            if not a_redo or a_redo.get("answer_status") == "not_triggered":
                bad6.append("need_revision=是 但 stage8_redo_method 未作答")
            if a_redo and a_redo.get("answer_status") != "not_triggered" \
               and (not a_shot or a_shot.get("answer_status") == "not_triggered"):
                bad6.append("redo_method 已作答 但 stage8_shot_list 未作答")
        else:
            bad6.append(f"stage8_need_revision 答复无法归一为是/否：{a_need.get('answer')!r}")
    add("STG8-C6", "条件一致性（是/否与追问链匹配）", "FAIL" if bad6 else "PASS",
        "否→后两问 not_triggered；是→redo_method 已答；redo_method 已答→shot_list 已答",
        bad6 or "一致", True,
        "核对答复链并修正 answers：条件未满足的问项须标 not_triggered，条件满足的必须真实作答",
        "stage_workflow(9).decision_record_schema.rules[3]", rec_path)

    # C7 交付清单
    dl_path = find_delivery(proj, args.version, args.delivery or rec.get("delivery_list"))
    dl, dl_err = load_json(dl_path) if dl_path else (None, "文件不存在")
    miss_files, dl_items = [], 0
    if isinstance(dl, dict):
        items = dl.get("items") or dl.get("videos") or dl.get("成片清单") or []
        if isinstance(items, list):
            dl_items = len(items)
            for it in items:
                rel = it.get("file") if isinstance(it, dict) else it
                if not rel:
                    continue
                rel = str(rel).replace("\\", "/")
                if not os.path.isabs(rel):
                    rel = os.path.join(proj, rel)
                if not os.path.exists(rel):
                    miss_files.append(rel)
    c7_ok = bool(dl) and dl_items > 0 and not miss_files
    add("STG8-C7", "成片交付清单存在且清单内视频真实存在", "PASS" if c7_ok else "FAIL",
        "10-成片/成片交付清单_v*.json 含 ≥1 条，且每条视频文件在磁盘存在",
        (f"清单 {dl_path}；条目 {dl_items}；缺失文件 {miss_files[:5]}" if dl_path else f"未找到交付清单（{dl_err}）"),
        True, "产出/修正 成片交付清单（全部成片路径与镜号一一对应），并确保视频已落盘 10-成片",
        "stage_workflow(9).outputs / process 末步", dl_path or "10-成片/成片交付清单_v*.json")

    # C8 收尾前置
    final_done = bool(rec.get("final_completed") is True
                      or str(rec.get("stage_status") or "").lower() == "completed")
    bad8 = []
    if final_done:
        if not (a_need and a_need.get("answer_status") != "not_triggered" and is_no(a_need.get("answer"))):
            bad8.append("final_completed=true 但 stage8_need_revision 非『否』")
        if not c7_ok:
            bad8.append("final_completed=true 但成片交付清单未通过校验")
    add("STG8-C8", "收尾前置（收尾必须基于用户答复『否』）", "FAIL" if bad8 else "PASS",
        "final_completed=true ⇒ need_revision=否 且 交付清单通过", bad8 or ("未声明收尾" if not final_done else "合规"),
        True, "禁止在用户未答复『否』或交付清单缺失时标记整体 completed",
        "stage_workflow(9).end_confirmation_interaction.forbidden / self_checks(2)", rec_path)

    # C9 返工路径回滚记录
    rb_path = os.path.join(proj, "13-工作流文档", "回滚记录.json")
    need_redo = bool(a_need and a_need.get("answer_status") != "not_triggered" and is_yes(a_need.get("answer")))
    bad9 = []
    if need_redo:
        rb, rb_err = load_json(rb_path)
        if not rb:
            bad9.append(f"回滚记录.json 缺失或不可解析（{rb_err}）")
        else:
            recs = rb if isinstance(rb, list) else (rb.get("records") or rb.get("回滚记录") or [])
            hit = [r for r in recs if isinstance(r, dict) and str(r.get("trigger_stage", "")).startswith("stage_8")]
            if not hit:
                bad9.append("回滚记录.json 中无 trigger_stage=stage_8 的条目")
    add("STG8-C9", "返工路径已登记回滚记录", "FAIL" if bad9 else "PASS",
        "need_revision=是 ⇒ 回滚记录.json 含 trigger_stage=stage_8 条目",
        bad9 or ("不适用（用户答复否）" if not need_redo else "已登记"), True,
        "按 stage8 process 末步更新 13-工作流文档/回滚记录.json（rollback_id / trigger_stage=stage_8 / scope / affected_ids / 新版本号 / reason）",
        "stage_workflow(9).process 末步 / self_checks(6)", rb_path)

    # C10 人工清单
    mc = rec.get("manual_checklist")
    bad10 = []
    if not isinstance(mc, dict):
        bad10.append("manual_checklist 缺失（语义自检项无处回填 evidence）")
    else:
        for idx, label in MANUAL_LABELS.items():
            key = f"self_checks[{idx}]"
            e = mc.get(key)
            if e is None:
                bad10.append(f"{key} 未登记")
                continue
            if not isinstance(e, dict):
                bad10.append(f"{key} 结构不合法")
                continue
            st = e.get("result")
            if st == "n/a":
                if not str(e.get("reason") or "").strip():
                    bad10.append(f"{key} 记 n/a 但未给 reason")
            elif st is True or st == "pass":
                if not str(e.get("evidence") or "").strip():
                    bad10.append(f"{key} 通过但未回填 evidence")
            else:
                bad10.append(f"{key} 未勾选通过（result={st!r}）")
    add("STG8-C10", "人工清单已逐项勾选并回填 evidence", "FAIL" if bad10 else "PASS",
        "manual_checklist 覆盖 3 项语义自检，逐项 result=true+evidence 或 result=n/a+reason",
        bad10 or "全部合规", True,
        "在决策记录中补 manual_checklist：self_checks[3]/[4]/[5] 逐项勾选并填 evidence（不适用则记 n/a 并给理由）",
        "gate_enforcement.coverage_rule", rec_path)

    # ---- 覆盖口径 ----
    total, wf_path = selfcheck_total(proj)
    if total is None:
        impl, manual, total = 7, 3, 10
    else:
        manual = sum(1 for i in range(total) if SELFCHECK_KIND.get(i) == "manual")
        impl = total - manual
    fails = [c for c in checks if c["status"] == "FAIL"]
    overall = "PASS" if not fails else "FAIL"
    return finish(proj, args.version, checks, issues, now, rec_path, dl_path,
                  {"total": total, "impl": impl, "manual": manual, "overall": overall,
                   "fails": fails, "wf_path": wf_path})


def finish(proj, version, checks, issues, now, rec_path, dl_path, cov):
    if cov is None:
        cov = {"total": None, "impl": None, "manual": None,
               "overall": "FAIL", "fails": [c for c in checks if c["status"] == "FAIL"], "wf_path": None}
    fails = cov["fails"]
    result = {
        "workflow_id": os.path.basename(proj),
        "stage_id": STAGE_ID,
        "stage_version": version,
        "checked_at": now,
        "overall_status": cov["overall"],
        "blocking": bool(fails),
        "partial_progress": False,
        "workflow_selfcheck_total": cov["total"],
        "implemented_checks": cov["impl"],
        "manual_checks": cov["manual"],
        "rule_source_version": (load_json(cov["wf_path"])[0] or {}).get("skill_version") if cov.get("wf_path") else None,
        "checks": checks,
        "failed_checks": [c["check_id"] for c in fails],
        "warnings": [c["check_id"] for c in checks if c["status"] == "WARNING"],
        "issue_detail": issues,
        "evidence_files": [p for p in [rec_path, dl_path] if p],
        "rollback": {"required": bool(fails), "target_stage": STAGE_ID if fails else None,
                     "scope": "stage" if fails else None},
        "next_action": ("存在阻断项：按 repair_action 逐条修复后重跑本闸门；通过前禁止将 stage8 标记 passed/completed"
                        if fails else
                        "全部通过：stage8 可标记 passed/completed（用户答复『否』时整体收尾；答复『是』时按抽卡/全路重做执行后回到第1问）"),
    }
    out_json = os.path.join(proj, "12-质检", f"{STAGE_ID}_闸门结果_{version}.json")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    lines = [f"# stage8 交互闸门 · 汇总 {version}", "",
             f"- 项目：{proj}", f"- 检查时间：{now}",
             f"- 决策记录：{rec_path or '（未找到）'}", f"- 交付清单：{dl_path or '（未找到）'}",
             f"- **总判定：{cov['overall']}**（阻断项 {len(fails)} 条）",
             f"- 覆盖：workflow_selfcheck_total={cov['total']} = 机检 {cov['impl']} + 人工 {cov['manual']}", "",
             "| check | 结论 | 说明 |", "|---|---|---|"]
    for c in checks:
        lines.append(f"| {c['check_id']} {c['label']} | {c['status']} | {str(c['actual'])[:160]} |")
    if issues:
        lines += ["", "## 问题明细与修复动作", "", "| check | 问题 | 修复动作 |", "|---|---|---|"]
        for c in fails:
            lines.append(f"| {c['check_id']} | {str(c['actual'])[:160]} | {c['repair_action']} |")
    lines += ["", "## 唯一真源", "",
              "- 闸门定义：`gate_enforcement.interactive_gate_rule`（纯交互闸门阶段专用）",
              "- 问答与落盘：`stage_workflow(9).end_confirmation_interaction` / `.decision_record_schema`",
              "- 本闸门为组合包 `gates/stage_8_interaction_gate.py` 的参考实现，项目内落至 `11-工作流脚本/workflow_gates/`", ""]
    out_md = os.path.join(proj, "12-质检", f"{STAGE_ID}_闸门汇总_{version}.md")
    with open(out_md, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"[gate] {cov['overall']}  阻断项 {len(fails)} 条")
    for c in checks:
        print(f"  {c['check_id']} {c['status']}  {c['label']}")
    for c in fails:
        print(f"   - {c['check_id']} {str(c['actual'])[:200]}  → {c['repair_action']}")
    print(f"  输出：{out_json}")
    print(f"        {out_md}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
