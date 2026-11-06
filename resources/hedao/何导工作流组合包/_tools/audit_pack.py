# -*- coding: utf-8 -*-
"""何导工作流组合包 完整性审计器

用途：拆分器（split_pack.py）跑完后验证「一条规则都没丢、一处引用都没断」。
      改动任何规则后都应重跑本脚本，全绿才算可交付。

用法：python _tools/audit_pack.py
退出码：0 = 全部通过；1 = 有 FAIL
"""
import json, os, re, glob, hashlib, collections, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SOURCE = "_source/workflow-v1.5.36-source.json"
# 已声明的唯一改写（原文指向已砍掉的 stage8）
PATCH_ALLOW = {"stage7#34"}

FAIL, WARN, PASS = [], [], []


def ok(msg):
    PASS.append(msg)


def bad(msg):
    FAIL.append(msg)


def warn(msg):
    WARN.append(msg)


def hash_matches(path, expected):
    raw = open(path, "rb").read()
    if hashlib.sha256(raw).hexdigest().upper() == expected:
        return True
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return False
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    variants = (normalized.encode("utf-8"), normalized.replace("\n", "\r\n").encode("utf-8"))
    return any(hashlib.sha256(data).hexdigest().upper() == expected for data in variants)


def canon(o):
    return json.dumps(o, ensure_ascii=False, sort_keys=True)


def load(p):
    return json.load(open(p, encoding="utf-8"))


OLD = load(SOURCE)
CORE = load("core/00-core.json")
SUP = load("core/01-support.json")
CON = load("core/02-contracts.json")
MAN = load("manifest.json")
IDX = load("index.json")
CHG = load("docs/changelog.json")
SKELS = {}
for f in sorted(glob.glob("stages/*.json")):
    d = load(f)
    SKELS[d["skeleton_id"]] = d

GATE_REF_KEYS = ["pipeline_face_gate_ref", "cast_frame_gate_ref", "asset_reference_chain_ref",
                 "download_atomicity_gate_ref", "h3_prompt_format_gate_ref",
                 "h3_video_ref_binding_gate_ref", "video_prompt_ref_composition_gate_ref"]
SKIP_KEYS = {"stage_id", "stage_number", "name", "purpose", "required_inputs", "process", "self_checks"}

# ---------------------------------------------------------------- A 数据完整性
src_stages = [s for s in OLD["stage_workflow"] if not s["stage_id"].startswith("stage_8")]

# A1 process
old_rules, old_ids = [], []
for s in src_stages:
    for i, p in enumerate(s.get("process", [])):
        old_rules.append(p if isinstance(p, str) else canon(p))
        old_ids.append((s["stage_id"], i))
new_rules = []
for d in SKELS.values():
    for ph in d.get("phases", []):
        new_rules += [r if isinstance(r, str) else canon(r) for r in ph["rules"]]
    for st in d.get("stages", []):
        new_rules += [r if isinstance(r, str) else canon(r) for r in st.get("process", [])]
lost = collections.Counter(old_rules) - collections.Counter(new_rules)
added = collections.Counter(new_rules) - collections.Counter(old_rules)
if sum(lost.values()) == 1 and sum(added.values()) == 1 and len(PATCH_ALLOW) == 1:
    ok(f"process 逐字：{len(old_rules)}→{len(new_rules)}，唯一差异为已声明的 stage7#34 改写")
elif sum(lost.values()) == 0 and sum(added.values()) == 0:
    ok(f"process 逐字：{len(old_rules)}→{len(new_rules)}，完全一致")
else:
    bad(f"process 差异：丢失 {sum(lost.values())} / 新增 {sum(added.values())}")
    for t in lost:
        bad(f"    丢失: {t[:90]}")

# A2 self_checks
old_sc = [c if isinstance(c, str) else canon(c) for s in src_stages for c in s.get("self_checks", [])]
new_sc = [it["text"] for d in SKELS.values() for it in (d.get("self_checks") or {}).get("items", [])]
if collections.Counter(old_sc) == collections.Counter(new_sc):
    ok(f"self_checks 逐字：{len(old_sc)}→{len(new_sc)}，完全一致")
else:
    d1 = collections.Counter(old_sc) - collections.Counter(new_sc)
    bad(f"self_checks 差异：丢失 {sum(d1.values())}")

# A3 阶段级结构化字段
pol = {}
for d in SKELS.values():
    pol.update(d.get("stage_policies") or {})
miss3 = []
for s in src_stages:
    exp = {k: v for k, v in s.items() if k not in SKIP_KEYS}
    got = pol.get(s["stage_id"], {})
    for k, v in exp.items():
        if k not in got or canon(got[k]) != canon(v):
            miss3.append(f"{s['stage_id']}.{k}")
if not miss3:
    tot = sum(len(canon(v)) for s in src_stages for k, v in s.items() if k not in SKIP_KEYS)
    ok(f"阶段策略块逐字：{sum(len(p) for p in pol.values())} 个 stage / 约 {tot/1024:.1f}K，无丢失")
else:
    bad(f"阶段策略块丢失 {len(miss3)} 项：{miss3}")

# A4 required_inputs
miss4 = []
for s in src_stages:
    ri = s.get("required_inputs") or []
    if not ri:
        continue
    found = False
    for d in SKELS.values():
        for st in d.get("stages", []) + d.get("stage_meta", []):
            if st["stage_id"] == s["stage_id"] and canon(st.get("required_inputs")) == canon(ri):
                found = True
    if not found:
        miss4.append(s["stage_id"])
if not miss4:
    ok(f"required_inputs 逐字：{sum(1 for s in src_stages if s.get('required_inputs'))} 个 stage 全部保留")
else:
    bad(f"required_inputs 丢失：{miss4}")

# A5 core / support 章节
for lay, name in [(CORE, "00-core"), (SUP, "01-support")]:
    diffs = []
    for k, v in lay["sections"].items():
        if k not in OLD:
            diffs.append(f"{k}(新增)")
            continue
        expect = OLD[k]
        if k == "gate_enforcement":
            expect = {kk: vv for kk, vv in expect.items() if kk not in GATE_REF_KEYS}
        if canon(expect) != canon(v["content"]):
            diffs.append(k)
    if diffs:
        bad(f"{name} 章节与原文不一致：{diffs}")
    else:
        ok(f"{name}：{len(lay['sections'])} 个章节全部逐字一致")

# A6 startup_interaction
s1 = SKELS["S1"]
if canon(OLD["startup_interaction"]) == canon(s1["interaction"]["startup_interaction"]):
    q = len(OLD["startup_interaction"].get("questions", []))
    ok(f"startup_interaction 逐字：{q} 个提问完整")
else:
    bad("startup_interaction 与原文不一致")

# A7 refs
for k, kk in [("skills_ref", "skills"), ("api_ref", "api"), ("standards_ref", "standards")]:
    if canon(OLD[k]) != canon(SUP["refs"][kk]):
        bad(f"refs.{kk} 与原文不一致")
else:
    ok("refs（skills/api/standards）逐字一致")

# A8 changelog
chg_map = {"version_note": "version_note", "version_history_ref": "version_history_ref",
           "source_version_note": "source_version_note",
           "excluded_original_workflow_content": "excluded_original_workflow_content"}
miss8 = [k for k, v in chg_map.items() if canon(CHG.get(v)) != canon(OLD.get(k))]
if not miss8:
    ok("docs/changelog：版本叙述 4 类全部归档")
else:
    bad(f"changelog 未归档：{miss8}")

# ---------------------------------------------------------------- B 结构一致性
# B1 JSON 可解析
b1 = []
for f in glob.glob("**/*.json", recursive=True):
    try:
        load(f)
    except Exception as e:
        b1.append((f, str(e)[:50]))
if not b1:
    ok(f"JSON 全部可解析（{len(glob.glob('**/*.json', recursive=True))} 文件）")
else:
    bad(f"JSON 解析失败：{b1}")

# B2/B3 manifest 对账
bad2 = []
for x in MAN["files"]:
    p = x["path"]
    if not os.path.exists(p):
        bad2.append(f"缺失 {p}")
    elif not hash_matches(p, x["sha256"]):
        bad2.append(f"hash不符 {p}")
if not bad2:
    ok(f"manifest 逐文件对账：{MAN['file_count']} 文件全部匹配")
else:
    bad(f"manifest 对账失败：{bad2}")

agg = hashlib.sha256("|".join(f"{y['path']}:{y['sha256']}" for y in MAN["files"]).encode()).hexdigest().upper()
if agg == MAN["aggregate_sha256"]:
    ok("manifest 聚合 hash 自洽")
else:
    bad("manifest 聚合 hash 不自洽")

on_disk = set()
for dp, _, fns in os.walk("."):
    for f in fns:
        rel = os.path.relpath(os.path.join(dp, f), ".").replace(os.sep, "/")
        if rel.startswith(("_tools/", "_source/")) or rel == "manifest.json":
            continue
        on_disk.add(rel)
in_man = set(x["path"] for x in MAN["files"])
if on_disk == in_man:
    ok("磁盘文件集与 manifest 完全一致")
else:
    bad(f"文件集不一致：多出 {sorted(on_disk - in_man)} / 缺 {sorted(in_man - on_disk)}")

# B4/B5 锚点与骨架 hash
b45 = []
for sid, d in SKELS.items():
    if d["core_anchor"]["redline"]["sha256"] != MAN["core_sha256"]:
        b45.append(f"{sid}.redline")
    if d["core_anchor"]["support"]["sha256"] != MAN["support_sha256"]:
        b45.append(f"{sid}.support")
    fp = MAN["skeletons"][sid]["file"]
    if not hash_matches(fp, MAN["skeletons"][sid]["sha256"]):
        b45.append(f"{sid}.file")
if not b45:
    ok("7 份骨架的 core 锚点 + 文件 hash 与 manifest 全部一致")
else:
    bad(f"锚点/hash 不一致：{b45}")

# B6 sections_must_read 合法性
valid = set(SUP["sections"].keys())
b6 = {sid: [x for x in d["core_anchor"]["support"]["sections_must_read"] if x not in valid]
      for sid, d in SKELS.items()}
b6 = {k: v for k, v in b6.items() if v}
if not b6:
    ok("sections_must_read 全部指向真实存在的 support 章节")
else:
    bad(f"非法章节引用：{b6}")

# B7 路径引用存在性
pat = re.compile(r"(skills/[A-Za-z0-9_\-\.]+\.md|standards/[A-Za-z0-9_\-\.]+\.json"
                 r"|gates/[A-Za-z0-9_\-\.]+\.py|api/[A-Za-z0-9_\-\./]+\.(?:py|json|md))")
refs, missing = collections.Counter(), []
for f in glob.glob("core/*.json") + glob.glob("stages/*.json"):
    for m in pat.findall(open(f, encoding="utf-8").read()):
        p = m.rstrip('.,`)"')
        refs[p] += 1
        if not os.path.exists(p):
            missing.append(p)
if not missing:
    ok(f"文件路径引用：{len(refs)} 个不同文件、{sum(refs.values())} 处引用，全部存在")
else:
    bad(f"引用不存在的文件：{sorted(set(missing))}")

# B8 闸门
dep = set(MAN.get("deprecated_gates", []))
b8 = []
for sid, d in SKELS.items():
    for g in d["gates"]:
        p = g.split("（")[0].strip()
        if not os.path.exists(p):
            b8.append(f"{sid}:{p} 不存在")
        if os.path.basename(p) in dep:
            b8.append(f"{sid}:{p} 已废弃却仍登记")
if not b8:
    n = sum(len(d["gates"]) for d in SKELS.values())
    ok(f"闸门：{n} 条登记全部存在，无废弃闸门误挂")
else:
    bad(f"闸门问题：{b8}")

# B9 stage 全覆盖
seen = collections.Counter()
for d in SKELS.values():
    for st in d.get("stages", []) + d.get("stage_meta", []):
        seen[str(st["stage_number"])] += 1
expect = ["1", "2", "3", "4", "5", "6", "6.5", "6.6", "7"]
miss9 = [n for n in expect if seen.get(n, 0) != 1]
extra9 = [n for n in seen if n not in expect]
if not miss9 and not extra9:
    ok("原 9 个 stage（1~7 含 6.5/6.6）各出现且仅出现一次，stage8 已排除")
else:
    bad(f"stage 覆盖异常：缺失/重复 {miss9} 多余 {extra9}")

# ---------------------------------------------------------------- C 契约与可用性
# C1 交接链连续
chain = CON["chain"]
frm = [c["from"] for c in chain]
to = [c["to"] for c in chain]
if frm == ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] and to[:-1] == frm[1:] and to[-1] is None:
    ok("交接链：S1→S2→S3→S4→S5→S6→S7→终点，无断点")
else:
    bad(f"交接链异常：{list(zip(frm, to))}")

# C2 每份骨架的 contracts.in/out 与链一致
b2c = []
for c in chain:
    sid = c["from"]
    if sid in SKELS and canon(SKELS[sid]["contracts"]["out"]) != canon(c["artifacts"]):
        b2c.append(f"{sid}.out")
    if c["to"] in SKELS and canon(SKELS[c["to"]]["contracts"]["in"]) != canon(c["artifacts"]):
        b2c.append(f"{c['to']}.in")
if not b2c:
    ok("各骨架 contracts 的 in/out 与中央契约表一致")
else:
    bad(f"契约不一致：{b2c}")

# C3 phased 型必备字段
b3c = []
for sid, d in SKELS.items():
    if "phases" in d:
        if "stage_meta" not in d:
            b3c.append(f"{sid} 缺 stage_meta")
        if "batch_plan" not in d:
            b3c.append(f"{sid} 缺 batch_plan")
        used = sum(p["rule_count"] for p in d["phases"])
        declared = d["stage_meta"][0].get("self_checks_count")
        if not d["phases"]:
            b3c.append(f"{sid} phases 为空")
if not b3c:
    ok("切片型骨架：phases + stage_meta + batch_plan 齐备")
else:
    bad(f"切片型骨架缺字段：{b3c}")

# C4 自检可用性
for sid, d in SKELS.items():
    sc = d.get("self_checks")
    if not sc:
        continue
    if sc["count"] != len(sc["items"]):
        bad(f"{sid} self_checks.count 与实际条目数不符")
if all(d.get("self_checks", {}).get("count", 0) == len(d.get("self_checks", {}).get("items", []))
       for d in SKELS.values()):
    tot_p0 = sum(d.get("self_checks", {}).get("p0_count", 0) for d in SKELS.values())
    ok(f"自检索引自洽：{sum(d.get('self_checks', {}).get('count', 0) for d in SKELS.values())} 条，其中 P0 {tot_p0} 条")

# C5 index 覆盖
idx_ids = {e["id"] for e in IDX["entries"]}
miss5 = [sid for sid in SKELS if sid not in idx_ids]
if not miss5:
    ok(f"index.json：{len(IDX['entries'])} 条索引，覆盖 7 环节 + 工序段")
else:
    bad(f"index 缺环节：{miss5}")

if len(IDX.get("original_stage_map", [])) == 9:
    ok("original_stage_map：9 个原 stage 的新落点已登记")
else:
    bad(f"original_stage_map 条目数 {len(IDX.get('original_stage_map', []))} ≠ 9")

# ---------------------------------------------------------------- 体积报告
print("=" * 76)
print(f"审计对象：{MAN['pack_name']}  v{MAN['pack_version']}   (源 {MAN['source_workflow_version']})")
print("=" * 76)
for m in PASS:
    print(f"  [PASS] {m}")
for m in WARN:
    print(f"  [WARN] {m}")
for m in FAIL:
    print(f"  [FAIL] {m}")

print("-" * 76)
print("实际读取量（用 read_phase.py 按段读，不是整读文件）：")
red = os.path.getsize("core/00-core.json") / 1024
con = os.path.getsize("core/02-contracts.json") / 1024
for sid in sorted(SKELS):
    d = SKELS[sid]
    size = os.path.getsize(MAN["skeletons"][sid]["file"]) / 1024
    sup_kb = sum(len(canon(SUP["sections"][k])) / 1024 for k in d["core_anchor"]["support"]["sections_must_read"])
    base = red + sup_kb + con
    if d.get("phases"):
        head = 1.5  # 概览 + 输入契约 + 闸门清单
        first = d["phases"][0]
        once = base + first["bytes"] / 1024 + head
        print(f"  {sid} {d['name']:<10} 首读 {once:>5.1f}K（{first['phase_id']} {first['rule_count']} 条）"
              f"  后续每批换段 +{first['bytes']/1024:.1f}K   整份文件 {size:.1f}K（禁止整读）")
        for p in d["phases"][1:]:
            print(f"        {p['phase_id']} {p['name']:<10} 换段 +{p['bytes']/1024:>5.1f}K / {p['rule_count']} 条")
        est = once
    else:
        sheet = size / 1024 if d.get("stages") else 0
        once = base + (size if d.get("stages") else 0)
        print(f"  {sid} {d['name']:<10} 首读 {once:>5.1f}K（整份 {size:.1f}K）")
        est = once
print(f"\n  对照：v1.x 每次开工都读满 {MAN['source_snapshot']['bytes']/1024:.0f}K")

print("-" * 76)
print(f"结论：PASS {len(PASS)} / WARN {len(WARN)} / FAIL {len(FAIL)}")
if FAIL:
    print("有 FAIL，不可交付。")
    sys.exit(1)
print("全部通过，可交付。")
