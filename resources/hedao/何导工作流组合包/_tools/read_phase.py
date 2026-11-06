# -*- coding: utf-8 -*-
"""分段读取器 —— 让执行体只读当前工序那一段，不把整份骨架塞进上下文

为什么需要：S3 骨架 117.9K、S7 106.3K，直接整读文件等于没切片。
本工具按 JSON 路径取子集，只输出当前段落的规则文本。

用法：
  python _tools/read_phase.py                     # 列出 7 个环节与各自的工序段
  python _tools/read_phase.py S3                  # 看 S3 的工序段清单 + 闸门 + 必读章节
  python _tools/read_phase.py S3 3a               # 读 3a 建组期的规则全文
  python _tools/read_phase.py S3 3c --checks      # 读 3c + 批内必过的 P0 自检
  python _tools/read_phase.py S4                  # 非切片环节：给入口信息，正文按 stages 读

约定：读出来的就是本次要遵守的全部规则；没读的段落本次不适用，不要凭记忆补。
"""
import json, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def load(sid):
    hit = glob.glob(f"stages/{sid}-*.json")
    if not hit:
        sys.exit(f"找不到环节 {sid}，可选：S1~S7")
    return json.load(open(hit[0], encoding="utf-8")), hit[0]


def kb(n):
    return round(n / 1024, 1)


def write(s=""):
    sys.stdout.write(str(s) + "\n")


def brief():
    write("何导工作流组合包 — 环节清单")
    write("=" * 72)
    for f in sorted(glob.glob("stages/*.json")):
        d = json.load(open(f, encoding="utf-8"))
        size = os.path.getsize(f) / 1024
        write(f"\n{d['skeleton_id']}  {d['name']}   {size:.1f}K   {d['purpose']}")
        if d.get("phases"):
            write(f"   切片环节，必须分段读（整读等于没切）：")
            for p in d["phases"]:
                write(f"     {p['phase_id']:<3} {p['name']:<12} {p['bytes']/1024:>6.1f}K  {p['rule_count']:>2} 条   {p['read_rule']}")
        else:
            write(f"   整环节读取（体积可控）：stages[{len(d.get('stages', []))} 段正文]")
        if d.get("gates"):
            write(f"   必跑闸门 {len(d['gates'])}：{', '.join(g.split('（')[0].replace('gates/', '') for g in d['gates'])}")
    write("\n" + "=" * 72)
    write("下一步：python _tools/read_phase.py S3 3a")


def show(sid, phase_id=None, with_checks=False):
    d, path = load(sid)
    # 指定了工序段就只给要点头，不重复整页概览（省上下文）
    if phase_id:
        ph = next((p for p in d["phases"] if p["phase_id"] == phase_id), None) if d.get("phases") else None
        if d.get("phases") and not ph:
            sys.exit(f"{sid} 没有工序段 {phase_id}，可选：{[p['phase_id'] for p in d['phases']]}")
        if ph:
            ca = d["core_anchor"]
            write(f"### {d['skeleton_id']} {d['name']} · {ph['phase_id']} {ph['name']}")
            write(f"前提：已读 {ca['redline']['file']} 全文 + {ca['support']['file']} 的 "
                  f"{'/'.join(ca['support']['sections_must_read'])} + {ca['contracts']['file']} 本环节 in/out")
            if d["contracts"]["in"]:
                write("输入：" + "；".join(f"{a['name']}@{a['path']}" for a in d["contracts"]["in"]))
            if d["gates"]:
                write("必跑闸门：" + "、".join(g.split("（")[0].replace("gates/", "") for g in d["gates"]))
            write(f"本段范围：{ph['read_rule']}")
            write("")
            for i, r in enumerate(ph["rules"], 1):
                write(f"[{ph['phase_id']}-{i:02d}] {r}")
                write("")
            if d.get("stage_policies"):
                write("本环节策略块（硬约束，做判定时按 key 取全文：--policy <key>）：")
                for sid2, pol in d["stage_policies"].items():
                    for k in sorted(pol):
                        write(f"  {k}  ({len(json.dumps(pol[k], ensure_ascii=False))}B)")
                write("")
            if d.get("skills_hint"):
                write("技能（原文里的 embedded_skills.xxx 对应该文件）：" + "; ".join(d["skills_hint"]))
                write("")
            if with_checks:
                sc = d.get("self_checks") or {}
                batch_p0 = [it for it in sc.get("items", []) if it["p0"] and it["scope"] == "batch"]
                write(f"===== 批内必过自检（P0 且 scope=batch，共 {len(batch_p0)} 条）=====")
                for it in batch_p0:
                    write(f"  [{it['id']}] {it['text']}")
                write("")
                write(f"全片级 {sc.get('full_film_count', 0)} 条留到全部批次做完："
                      f"python _tools/read_phase.py {sid} --fullfilm")
            else:
                write(f"收尾校验时加 --checks 读批内必过自检（本环节 P0 共 {d.get('self_checks', {}).get('p0_count', 0)} 条）")
            write("")
            write(f"未读的段落本次不适用：{', '.join(p['phase_id'] for p in d['phases'] if p['phase_id'] != phase_id)}")
            return

    write(f"### {d['skeleton_id']} {d['name']}   （{path}）")
    write(f"目的：{d['purpose']}")
    if d.get("note"):
        write(f"说明：{d['note']}")
    write("")
    write("开工前必读：")
    ca = d["core_anchor"]
    write(f"  1) {ca['redline']['file']} 全文（sha256 {ca['redline']['sha256'][:16]}…，必须与 manifest 一致）")
    write(f"  2) {ca['support']['file']} 的章节：{', '.join(ca['support']['sections_must_read'])}")
    write(f"  3) {ca['contracts']['file']}：本环节 in / out")
    write("")

    c_in = d["contracts"]["in"]
    c_out = d["contracts"]["out"]
    if c_in:
        write(f"输入契约（{len(c_in)} 项，缺一即按输入缺失协议处理）：")
        for a in c_in:
            write(f"  - {a['name']}  →  {a['path']}   [{a['schema']}]")
    if c_out:
        write(f"交付契约（{len(c_out)} 项，必须按 path+schema 落盘）：")
        for a in c_out:
            write(f"  - {a['name']}  →  {a['path']}   [{a['schema']}]")
            if a.get("must_contain"):
                write(f"      必含：{', '.join(a['must_contain'])}")
            if a.get("hard_rule"):
                write(f"      硬规则：{a['hard_rule']}")
    write("")

    if d.get("gates"):
        write("必跑闸门：")
        for g in d["gates"]:
            write(f"  - {g}")
    if d.get("gates_mentioned"):
        write("正文提及但非必跑（以规则原文为准）：")
        for g in d["gates_mentioned"]["list"]:
            write(f"  - gates/{g}")
    if d.get("skills_hint"):
        write(f"技能：{'; '.join(d['skills_hint'])}")
    if d.get("api_hint"):
        write(f"接口：{'; '.join(d['api_hint'])}")
    write("")

    if not d.get("phases"):
        write("本环节未切片，正文结构：")
        for i, st in enumerate(d.get("stages", [])):
            write(f"  stages[{i}] stage{st['stage_number']} {st['name']}  {len(st.get('process', []))} 条规则 / {st['self_checks_count']} 条自检")
        if d.get("stage_policies"):
            write(f"  另有 stage_policies：{', '.join(k for k in d['stage_policies'])}")
            keys = sorted({k for v in d["stage_policies"].values() for k in v})
            write(f"    策略块：{', '.join(keys)}")
        sc = d.get("self_checks") or {}
        if sc:
            write(f"  自检 {sc['count']} 条（P0 {sc['p0_count']}，全片级 {sc['full_film_count']}）")
        write("\n读正文：python _tools/read_phase.py %s --full" % sid)
        return

    if not phase_id:
        write("工序段（按当前批次所处阶段只读一段）：")
        for p in d["phases"]:
            write(f"  {p['phase_id']:<3} {p['name']:<12} {p['bytes']/1024:>6.1f}K  {p['rule_count']:>2} 条   {p['read_rule']}")
        write("")
        write(f"批次规则：{d['batch_plan']['batch_size_rule']}")
        write(f"跨批状态：{d['batch_plan']['cross_batch_state']}")
        write("")
        write(f"读某段：python _tools/read_phase.py {sid} {d['phases'][0]['phase_id']}")
        return
    # 指定工序段的情况已在函数开头处理并 return，此行不可达
    return


def policy(sid, key=None):
    """输出 stage_policies 指定 key 的全文（策略块是硬约束，必须能取到原文）"""
    d, _ = load(sid)
    pols = d.get("stage_policies") or {}
    flat = {}
    for sid2, pol in pols.items():
        for k, v in pol.items():
            flat[k] = v
    if not key:
        write(f"### {sid} 策略块清单")
        for k, v in sorted(flat.items()):
            write(f"  {k}  ({len(json.dumps(v, ensure_ascii=False))}B)")
        return
    if key not in flat:
        sys.exit(f"{sid} 没有策略块 {key}，可选：{sorted(flat)}")
    write(f"### {sid} · {key}")
    v = flat[key]
    write(json.dumps(v, ensure_ascii=False, indent=1) if not isinstance(v, str) else v)


def full(sid):
    d, path = load(sid)
    write(f"### {d['skeleton_id']} {d['name']} 全量正文（{path}）")
    ca = d["core_anchor"]
    write(f"前提：已读 {ca['redline']['file']} 全文 + {ca['support']['file']} 的 "
          f"{'/'.join(ca['support']['sections_must_read'])} + {ca['contracts']['file']} 本环节 in/out")
    if d["contracts"]["in"]:
        write("输入：" + "；".join(f"{a['name']}@{a['path']}" for a in d["contracts"]["in"]))
    if d["contracts"]["out"]:
        write("交付：" + "；".join(f"{a['name']}@{a['path']}" for a in d["contracts"]["out"]))
    if d.get("gates"):
        write("必跑闸门：" + "；".join(d["gates"]))

    it = d.get("interaction")
    if it and it.get("startup_interaction"):
        si = it["startup_interaction"]
        qs = si.get("questions", [])
        write(f"\n----- 启动提问（{len(qs)} 问，逐条问完再开工）-----")
        for i, q in enumerate(qs, 1):
            write(f"[Q{i}] {json.dumps(q, ensure_ascii=False) if not isinstance(q, str) else q}")
        if si.get("rule") or si.get("notes"):
            write(f"规则：{si.get('rule') or si.get('notes')}")
    if it and it.get("runtime_commands"):
        rc = it["runtime_commands"]
        write("\n----- 运行中改配置（换引擎/换推进方式）-----")
        if rc.get("purpose"):
            write(f"用途：{rc['purpose']}")
        for k in ("commands", "update_process"):
            if rc.get(k):
                write(f"{k}: {json.dumps(rc[k], ensure_ascii=False)}")
    if it and it.get("refs_index"):
        write(f"\n引用索引：{it['refs_index']['read']}")

    for i, st in enumerate(d.get("stages", [])):
        write(f"\n----- stages[{i}] stage{st['stage_number']} {st['name']} -----")
        if st.get("required_inputs"):
            write(f"输入：{'; '.join(st['required_inputs'])}")
        for j, r in enumerate(st.get("process", []), 1):
            write(f"[{st['stage_id']}-{j:02d}] {r}\n")

    if d.get("phases"):
        write("\n" + "!" * 68)
        write("注意：本环节是切片环节。下面是全部工序段原文，仅供通读/排查。")
        write("实际执行请按批只读当前段：python _tools/read_phase.py %s <phase_id>" % sid)
        write("!" * 68)
        for meta in d.get("stage_meta", []):
            write(f"\n----- stage{meta['stage_number']} {meta['name']} -----")
            if meta.get("required_inputs"):
                write(f"输入：{'; '.join(meta['required_inputs'])}")
        for ph in d["phases"]:
            write(f"\n===== {ph['phase_id']} {ph['name']}（{ph['rule_count']} 条）=====")
            write(f"本段范围：{ph['read_rule']}\n")
            for k, r in enumerate(ph["rules"], 1):
                write(f"[{ph['phase_id']}-{k:02d}] {r}\n")

    if d.get("stage_policies"):
        write("\n----- 策略块（硬约束，取全文：--policy <key>）-----")
        for sid2, pol in d["stage_policies"].items():
            for k in sorted(pol):
                write(f"  {k}  ({len(json.dumps(pol[k], ensure_ascii=False))}B)")

    sc = d.get("self_checks") or {}
    if sc:
        p0 = [x for x in sc.get("items", []) if x["p0"]]
        ff = [x for x in sc.get("items", []) if x["scope"] == "full_film"]
        write(f"\n----- 自检：共 {sc['count']} 条，P0 {len(p0)} 条，全片级 {len(ff)} 条 -----")
        for x in p0:
            write(f"  [P0][{x['id']}] {x['text']}")
        if ff:
            write(f"  全片级 {len(ff)} 条（收尾时查）：python _tools/read_phase.py {sid} --fullfilm")
        rest = [x for x in sc.get("items", []) if not x["p0"] and x["scope"] != "full_film"]
        if rest:
            write(f"  其余 {len(rest)} 条非 P0 批内项：同上，按 id 抽查。")


def fullfilm(sid):
    d, _ = load(sid)
    sc = d.get("self_checks") or {}
    items = [it for it in sc.get("items", []) if it["scope"] == "full_film"]
    write(f"===== 全片级自检（{len(items)} 条，全部批次做完后才查）=====")
    for it in items:
        write(f"  [{it['id']}]{' P0' if it['p0'] else '   '} {it['text']}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    if not args:
        brief()
    elif "--policy" in flags:
        key = next((a for a in args[1:]), None)
        policy(args[0], key)
    elif "--full" in flags:
        full(args[0])
    elif "--fullfilm" in flags:
        fullfilm(args[0])
    else:
        show(args[0], args[1] if len(args) > 1 else None, "--checks" in flags)
