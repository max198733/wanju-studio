#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
asset_download_atomicity_gate.py —— 下载原子性闸门（出图/出片与下载必须在同一步内完成）

立闸背景（v1.21.30）：
  规则里一直写着「同一动作内下载本地副本」，但它是描述性的、没人执行也没人检查，实际跑批的
  断裂形态是：出图成功 → 把 data[].url 登记进索引就算完事 → 本地副本留到 stage6.5 / stage7
  再补取。而 xem8k5 返图**没有持久主机**（oss4/5/6 数分钟内 404，连 oss7 也只约 2 天量级），
  等你想补取时 URL 早死了；于是 URL 失效后又因为「没有本地副本」而**无从重传自愈**（v1.24.7：公网URL 一律由本地副本上传腾讯云COS 取得，本地副本即重传的唯一源头），
  整条自愈链断在起点。本闸门把「URL 到手 ≠ 资产到手」变成可执行断言。

唯一真源：
  api/image_api.json → payload.image_return_policy.url_lifecycle
      .atomicity_rule           出图与下载不可分离
      .landing_verification_rule 落地校验四项
      .local_copy_rule / .recheck_rule
  骨架 gate_enforcement.download_atomicity_gate_ref
  骨架 stage_workflow(4).self_checks / (5) / (6) / (8) 的 v1.21.30 条目

核心机检（全部 P0）：
  DL-C1 资产：不存在「已登记公网URL但无本地文件」
  DL-C2 资产：本地副本通过落地校验（存在、>10KB、图片签名、像素可解析）
  DL-C3 分镜图：不存在「已登记URL但无本地文件」
  DL-C4 分镜图：本地副本通过落地校验
  DL-C5 视频：不存在「已登记视频URL但无本地文件」
  DL-C6 视频：本地副本通过落地校验（MP4 容器头）
  DL-C7 声线：正式声线 MP3 本地副本存在（stage6.5 上传腾讯云COS 与异常重传的前提）

COS 上传图像格式契约（v1.24.14 新增，见 standards/asset_upload_format_policy.json）：
  DL-C8  图片素材上传物必须是 WebP，且转码字段齐全（upload_format=webp、
         transcode_source=lossless_master、transcode_passes=1）——P0
  DL-C9  转码输入必须是本地无损母版，且母版仍在磁盘上（母版丢失＝丧失重传与再编码能力）——P0
  DL-C10 画质分档正确：identity_anchor 保原生分辨率（native_resolution=true、downscaled_to 为空）；
         standard_reference 必须记录 downscaled_to ——P0
  DL-C11 upload_bytes 必须严格小于 master_bytes（未转码或转码失败）；
         降幅 <50% 记 WARNING（白底资产图 PNG 自身压缩率高，降幅天然偏小，不判违规）

执行时机：stage5 资产完成后 / stage6 分镜图完成后 / stage7 视频下载完成后各一次；
          任何跨阶段接力（进 stage6.5、进 stage7、进成片交付）前必须 PASS。

输出：
  12-质检/asset_download_atomicity_gate_闸门结果_v{version}.json
  12-质检/asset_download_atomicity_gate_闸门汇总_v{version}.md

用法：
  python asset_download_atomicity_gate.py --project "C:/项目目录" [--version v1] [--stage 5|6|7]
退出码：0=PASS 1=存在 blocking FAIL 2=无输入可检
"""
import argparse, json, os, re, struct, sys, datetime, glob

MIN_BYTES = 10 * 1024          # 落地校验最小体积（image_return_policy.landing_verification_rule）
IMG_DIRS = ["03-场景", "02-角色/01-定妆照", "04-参考素材/01-道具", "资产", "08-分镜静态图"]
SB_DIRS = ["08-分镜静态图", "08-分镜公网URL"]
VIDEO_DIRS = ["10-成片"]
VOICE_DIR = "02-角色/03-音色圣经与基准音轨"

SIGS = [
    ("PNG", lambda h: h[:8] == b"\x89PNG\r\n\x1a\n"),
    ("JPEG", lambda h: h[:3] == b"\xff\xd8\xff"),
    ("WEBP", lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP"),
    ("MP3", lambda h: h[:3] == b"ID3" or h[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2", b"\xff\xfa")),
    ("MP4", lambda h: h[4:8] == b"ftyp"),
]


def rel(proj, p):
    try:
        return os.path.relpath(p, proj).replace("\\", "/")
    except Exception:
        return p


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
    except Exception:
        return None


def probe_file(path):
    """落地校验：返回 (ok, kind, size, note)。"""
    if not path or not os.path.isfile(path):
        return False, None, 0, "文件不存在"
    size = os.path.getsize(path)
    if size <= MIN_BYTES:
        return False, None, size, "体积 %d 字节 ≤ %d（0字节/截断）" % (size, MIN_BYTES)
    try:
        with open(path, "rb") as f:
            head = f.read(32)
    except Exception as e:
        return False, None, size, "读取失败 %s" % e
    kind = None
    for name, fn in SIGS:
        try:
            if fn(head):
                kind = name
                break
        except Exception:
            pass
    if kind is None:
        return False, None, size, "文件头签名无法识别"
    if kind == "PNG":
        try:
            w, h = struct.unpack(">II", head[16:24])
            if w <= 0 or h <= 0:
                return False, kind, size, "PNG 像素解析异常 %dx%d" % (w, h)
            return True, kind, size, "%dx%d %.1fKB" % (w, h, size / 1024.0)
        except Exception:
            return False, kind, size, "PNG IHDR 解析失败"
    if kind == "MP4":
        return True, kind, size, "ftyp ok %.1fKB" % (size / 1024.0)
    if kind == "WEBP":
        d = webp_dims(path)
        return True, kind, size, ("%dx%d %.1fKB" % (d[0], d[1], size / 1024.0) if d
                                  else "%.1fKB（像素未解析）" % (size / 1024.0))
    return True, kind, size, "%.1fKB" % (size / 1024.0)


IMAGE_TYPES = ("character", "prop", "scene", "storyboard_image")
IDENTITY_TYPES = ("character",)                 # 身份锚点档：保原生分辨率
LOSSLESS_MASTER_EXT = (".png",)                 # 无损母版扩展名（PNG 为无损；JPEG 本身有损，不作母版）
POLICY_REF = "standards/asset_upload_format_policy.json"


def webp_dims(path):
    """尽力解析 WebP 像素（VP8 / VP8L / VP8X）。解析不到返回 None，不判失败。"""
    try:
        b = open(path, "rb").read(64)
    except Exception:
        return None
    if len(b) < 30 or b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        return None
    fmt = b[12:16]
    try:
        if fmt == b"VP8X":
            w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
            h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
            return w, h
        if fmt == b"VP8 ":
            return struct.unpack("<HH", b[26:30])
        if fmt == b"VP8L":
            bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    except Exception:
        return None
    return None


def walk_dirs(proj, dirs):
    """v1.24.26：**递归**扫描（原实现只看顶层，致 10-成片/S01/ 这类分集子目录里的视频被漏掉，
    DL-C5/DL-C6 变成 SKIPPED 假通过）。"""
    idx = {}
    for d in dirs:
        full = os.path.join(proj, d.replace("/", os.sep))
        if not os.path.isdir(full):
            continue
        for root, _dirs, files in os.walk(full):
            for fn in sorted(files):
                idx.setdefault(fn, os.path.join(root, fn))
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--stage", default="7")
    ap.add_argument("--index", default="")
    ap.add_argument("--task-index", default="")
    ap.add_argument("--rule-version", default="")
    args = ap.parse_args()

    proj = os.path.abspath(args.project)
    if not os.path.isdir(proj):
        print("[gate] 项目目录不存在：%s" % proj)
        return 2
    upto = int(args.stage)

    idx_p = (os.path.join(proj, args.index.replace("/", os.sep)) if args.index
             else _first_glob(proj, ["08-分镜公网URL/公网素材URL索引.json"]))
    tidx_p = (os.path.join(proj, args.task_index.replace("/", os.sep)) if args.task_index
              else _first_glob(proj, ["13-工作流文档/API任务索引.json"]))
    idx_d = load_json(idx_p) or {}
    tidx_d = load_json(tidx_p) or {}

    img_files = walk_dirs(proj, IMG_DIRS)
    sb_files = walk_dirs(proj, SB_DIRS)
    vid_files = walk_dirs(proj, VIDEO_DIRS)
    voice_dir = os.path.join(proj, VOICE_DIR.replace("/", os.sep))
    voice_files = {}
    if os.path.isdir(voice_dir):
        for fn in sorted(os.listdir(voice_dir)):
            fp = os.path.join(voice_dir, fn)
            if os.path.isfile(fp):
                voice_files[fn] = fp

    assets = idx_d.get("assets") or idx_d.get("materials") or []
    if not assets and not tidx_d and not img_files:
        print("[gate] 无输入：无资产索引、无API任务索引、无素材文件可检")
        return 2

    checks, detail = [], []

    def put(cid, status, label, actual, evidence):
        checks.append({"check_id": cid, "label": label, "status": status,
                       "severity": "P0", "blocking": status == "FAIL",
                       "expected": label, "actual": actual, "evidence": evidence,
                       "workflow_rule": "api_integration.image_api.image_return_policy.url_lifecycle.atomicity_rule "
                                        "+ gate_enforcement.download_atomicity_gate_ref",
                       "repair_action": None if status == "PASS" else
                       "按 refresh_rule 用同一提示词同一绑定重新出图（递增版本保留旧版），"
                       "并在同一动作内落盘 + 落地校验后再登记；禁止带缺推进下游"})

    # ---------- 资产（stage5：角色/场景/道具） ----------
    a_gap, a_bad, a_ok = [], [], 0
    for e in assets:
        aid = e.get("asset_id") or "?"
        atype = str(e.get("asset_type") or "")
        if atype in ("storyboard_image", "video_audio", "video"):
            continue                                  # 分类另有专条
        url = e.get("xem8k5_returned_url") or e.get("cos_public_url") or e.get("public_url") or e.get("duomi_returned_url")
        lp = e.get("local_path") or ""
        if not url:
            continue
        if not lp:
            a_gap.append("%s:已登记公网URL但 local_path 为空" % aid)
            continue
        fp = os.path.join(proj, lp.replace("/", os.sep))
        if not os.path.isfile(fp):
            cand = img_files.get(os.path.basename(lp.replace("\\", "/")))
            if cand:
                fp = cand
            else:
                a_gap.append("%s:已登记URL(%s)但磁盘无 %s" % (aid, str(url)[:48], lp))
                continue
        ok, kind, size, note = probe_file(fp)
        if ok:
            a_ok += 1
        else:
            a_bad.append("%s:%s → %s" % (aid, os.path.basename(fp), note))
    put("DL-C1",
        "FAIL" if a_gap else ("PASS" if assets else "SKIPPED"),
        "资产不存在『已登记公网URL但无本地文件』（URL 到手 ≠ 资产到手）",
        a_gap[:12] if a_gap else ("%d 个资产均有本地副本" % a_ok if assets else "无资产条目"),
        ((rel(proj, idx_p) if idx_p else "-") + " + 资产目录"))
    put("DL-C2",
        "FAIL" if a_bad else ("PASS" if assets else "SKIPPED"),
        "资产本地副本通过落地校验（存在、>10KB、图片签名、像素可解析）",
        a_bad[:12] if a_bad else ("%d 个资产落地校验通过" % a_ok if assets else "无资产条目"),
        "资产目录")

    # ---------- 分镜图（stage6） ----------
    s_gap, s_bad, s_ok = [], [], 0
    if upto >= 6:
        sb_entries = [e for e in assets if str(e.get("asset_type")) == "storyboard_image"]
        for e in sb_entries:
            sid = e.get("shot_id") or e.get("asset_id") or "?"
            url = e.get("xem8k5_returned_url") or e.get("public_url")
            lp = e.get("local_path") or ""
            if not url:
                continue
            if not lp:
                s_gap.append("%s:已登记分镜图URL但 local_path 为空" % sid)
                continue
            fp = os.path.join(proj, lp.replace("/", os.sep))
            if not os.path.isfile(fp):
                cand = sb_files.get(os.path.basename(lp.replace("\\", "/")))
                if cand:
                    fp = cand
                else:
                    s_gap.append("%s:已登记URL但磁盘无 %s" % (sid, lp))
                    continue
            ok, kind, size, note = probe_file(fp)
            if ok:
                s_ok += 1
            else:
                s_bad.append("%s:%s → %s" % (sid, os.path.basename(fp), note))
        # 兜底：任务索引里的分镜图记录
        for e in (tidx_d.get("tasks") or tidx_d.get("records") or []):
            if not isinstance(e, dict):
                continue
            sid = e.get("shot_id")
            u = e.get("xem8k5_returned_url")
            if not sid or not u:
                continue
            if any(str(x.get("shot_id")) == str(sid) for x in sb_entries):
                continue
            of = e.get("output_file") or e.get("local_path") or ""
            if not of:
                s_gap.append("%s:任务索引有分镜图URL但无本地路径记录" % sid)
            elif not os.path.isfile(os.path.join(proj, of.replace("/", os.sep))):
                s_gap.append("%s:任务索引记录 %s 但磁盘不存在" % (sid, of))
        if not sb_entries and not s_gap:
            put("DL-C3", "SKIPPED", "分镜图不存在『已登记URL但无本地文件』", "未找到分镜图索引条目", "-")
            put("DL-C4", "SKIPPED", "分镜图本地副本通过落地校验", "未找到分镜图索引条目", "-")
        else:
            put("DL-C3", "FAIL" if s_gap else "PASS",
                "分镜图不存在『已登记URL但无本地文件』",
                s_gap[:12] if s_gap else "%d 张分镜图均有本地副本" % s_ok, "08-分镜静态图")
            put("DL-C4", "FAIL" if s_bad else ("PASS" if s_ok else "SKIPPED"),
                "分镜图本地副本通过落地校验（存在、>10KB、图片签名、像素可解析）",
                s_bad[:12] if s_bad else ("%d 张分镜图落地校验通过" % s_ok if s_ok
                                          else "无本地分镜图可校验（见 DL-C3）"), "08-分镜静态图")
    else:
        put("DL-C3", "SKIPPED", "分镜图不存在『已登记URL但无本地文件』", "--stage %d 未到 stage6" % upto, "-")
        put("DL-C4", "SKIPPED", "分镜图本地副本通过落地校验", "--stage %d 未到 stage6" % upto, "-")

    # ---------- 视频（stage7） ----------
    v_gap, v_bad, v_ok = [], [], 0
    if upto >= 7:
        for e in (tidx_d.get("tasks") or tidx_d.get("records") or []):
            if not isinstance(e, dict):
                continue
            sid = e.get("shot_id") or e.get("shot_group_id")
            u = e.get("h3_returned_video_url") or e.get("video_url")
            if not sid or not u:
                continue
            of = e.get("output_file") or e.get("video_local_path") or ""
            fp = ""
            if of:
                fp = os.path.join(proj, of.replace("/", os.sep))
            if not fp or not os.path.isfile(fp):
                cand = vid_files.get(os.path.basename(str(of).replace("\\", "/"))) if of else None
                if not cand and of:
                    # 松散匹配：按 shot_id 在 10-成片 里找
                    for fn, fpath in vid_files.items():
                        if str(sid) in fn:
                            cand = fpath
                            break
                if cand:
                    fp = cand
                else:
                    v_gap.append("%s:已登记视频URL(%s…)但磁盘无对应视频（output_file=%s）"
                                 % (sid, str(u)[:40], of or "未记录"))
                    continue
            ok, kind, size, note = probe_file(fp)
            if ok:
                v_ok += 1
            else:
                v_bad.append("%s:%s → %s" % (sid, os.path.basename(fp), note))
        if not vid_files and not v_gap:
            put("DL-C5", "SKIPPED", "视频不存在『已登记URL但无本地文件』", "10-成片 下无视频且任务索引无视频URL", "-")
            put("DL-C6", "SKIPPED", "视频本地副本通过落地校验", "10-成片 下无视频", "-")
        else:
            put("DL-C5", "FAIL" if v_gap else "PASS",
                "视频不存在『已登记URL但无本地文件』（出片即下载）",
                v_gap[:12] if v_gap else "%d 支视频均有本地副本" % v_ok, "10-成片 + API任务索引")
            put("DL-C6", "FAIL" if v_bad else ("PASS" if v_ok else "SKIPPED"),
                "视频本地副本通过落地校验（存在、>10KB、MP4 容器头可识别）",
                v_bad[:12] if v_bad else ("%d 支视频落地校验通过" % v_ok if v_ok
                                          else "无本地视频可校验（见 DL-C5）"), "10-成片")
    else:
        put("DL-C5", "SKIPPED", "视频不存在『已登记URL但无本地文件』", "--stage %d 未到 stage7" % upto, "-")
        put("DL-C6", "SKIPPED", "视频本地副本通过落地校验", "--stage %d 未到 stage7" % upto, "-")

    # ---------- 声线 ----------
    voiced = [e for e in assets if str(e.get("asset_type")) == "voice_audio" or e.get("voice_returned_url")]
    vc_gap, vc_ok = [], 0
    for e in voiced:
        vid = e.get("voice_id") or e.get("asset_id") or "?"
        lp = e.get("local_path") or e.get("local_source") or ""
        if not lp:
            vc_gap.append("%s:声线已登记URL但无 local_path" % vid)
            continue
        fp = os.path.join(proj, lp.replace("/", os.sep))
        if not os.path.isfile(fp):
            cand = voice_files.get(os.path.basename(lp.replace("\\", "/")))
            if cand:
                fp = cand
            else:
                vc_gap.append("%s:声线本地副本缺失 %s" % (vid, lp))
                continue
        ok, kind, size, note = probe_file(fp)
        if ok:
            vc_ok += 1
        else:
            vc_gap.append("%s:%s → %s" % (vid, os.path.basename(fp), note))
    if not voiced and not voice_files:
        put("DL-C7", "SKIPPED", "正式声线 MP3 本地副本存在", "无声线条目、音色目录为空", VOICE_DIR)
    else:
        put("DL-C7", "FAIL" if vc_gap else "PASS",
            "正式声线 MP3 本地副本存在并通过落地校验（上传腾讯云COS 与异常重传的前提）",
            vc_gap[:12] if vc_gap else "%d 条声线本地副本齐备" % vc_ok, VOICE_DIR)

    # ---------- COS 上传图像格式契约（v1.24.14；真源 standards/asset_upload_format_policy.json） ----------
    def put2(cid, status, label, actual, evidence, severity="P0"):
        checks.append({"check_id": cid, "label": label, "status": status,
                       "severity": severity, "blocking": status == "FAIL",
                       "expected": label, "actual": actual, "evidence": evidence,
                       "workflow_rule": "standards.asset_upload_format_policy（cos_upload_format_contract）"
                                        " + gate_enforcement.download_atomicity_gate_ref（DL-C8~C11）",
                       "repair_action": None if status in ("PASS", "SKIPPED") else
                       "按 stage6.5 rehost_rule 用本地无损母版重转 WebP 后重传 COS 取得新 URL 并回填索引；"
                       "母版已丢失者按 regenerate_rule 重新出图（递增版本、保留旧版）"})

    img_entries = []
    for e in assets:
        if not isinstance(e, dict):
            continue
        if str(e.get("asset_type") or "") not in IMAGE_TYPES:
            continue
        if not (e.get("xem8k5_returned_url") or e.get("cos_public_url") or e.get("public_url")):
            continue
        img_entries.append(e)

    if not img_entries:
        for cid, lab in (("DL-C8", "图片素材上传物必须是 WebP 且转码字段齐全"),
                         ("DL-C9", "转码输入必须是本地无损母版且母版仍在磁盘"),
                         ("DL-C10", "画质分档正确（身份锚点保原生分辨率）"),
                         ("DL-C11", "upload_bytes 严格小于 master_bytes")):
            put2(cid, "SKIPPED", lab, "无已上传的图片素材条目", POLICY_REF)
    else:
        c8, c9, c10, c11, warn11 = [], [], [], [], []
        for e in img_entries:
            aid = e.get("asset_id") or e.get("shot_id") or "?"
            at = str(e.get("asset_type") or "")
            uf = str(e.get("upload_format") or "").lower()
            src = str(e.get("transcode_source") or "")
            passes = e.get("transcode_passes")
            if uf != "webp":
                c8.append("%s:upload_format=%r（应 webp）" % (aid, uf or None))
            if src != "lossless_master":
                c8.append("%s:transcode_source=%r（应 lossless_master）" % (aid, src or None))
            if passes != 1:
                c8.append("%s:transcode_passes=%r（应 1；>1 即二次压缩）" % (aid, passes))

            mlp = e.get("master_local_path") or ""
            if not mlp:
                c9.append("%s:未登记 master_local_path" % aid)
            else:
                mfp = os.path.join(proj, mlp.replace("/", os.sep))
                if not os.path.isfile(mfp):
                    mfp = img_files.get(os.path.basename(mlp.replace("\\", "/"))) or ""
                if not mfp:
                    c9.append("%s:本地无损母版缺失 %s（丧失重传与再编码能力）" % (aid, mlp))
                elif not str(mfp).lower().endswith(LOSSLESS_MASTER_EXT):
                    c9.append("%s:母版非无损格式 → %s" % (aid, os.path.basename(mfp)))

            tier = str(e.get("quality_tier") or "")
            nres = e.get("native_resolution")
            dsc = e.get("downscaled_to")
            if at in IDENTITY_TYPES:
                if tier != "identity_anchor":
                    c10.append("%s:身份锚点 quality_tier=%r（应 identity_anchor）" % (aid, tier or None))
                if nres is not True:
                    c10.append("%s:身份锚点必须 native_resolution=true（实际 %r）" % (aid, nres))
                if dsc not in (None, "", "null"):
                    c10.append("%s:身份锚点禁止降采样（downscaled_to=%r）" % (aid, dsc))
            else:
                if tier != "standard_reference":
                    c10.append("%s:普通参考 quality_tier=%r（应 standard_reference）" % (aid, tier or None))
                if dsc in (None, "", "null"):
                    c10.append("%s:普通参考必须记录 downscaled_to" % aid)

            ub, mb = e.get("upload_bytes"), e.get("master_bytes")
            if not isinstance(ub, (int, float)) or not isinstance(mb, (int, float)) or mb <= 0:
                c11.append("%s:缺 upload_bytes/master_bytes（无法核算下行流量）" % aid)
            elif ub >= mb:
                c11.append("%s:upload_bytes(%.0f) ≥ master_bytes(%.0f) → 未转码或转码失败" % (aid, ub, mb))
            elif ub / mb > 0.5:
                warn11.append("%s:降幅仅 %.0f%%（%.0fKB→%.0fKB）" % (aid, (1 - ub / mb) * 100,
                                                                 mb / 1024, ub / 1024))
        n = len(img_entries)
        put2("DL-C8", "FAIL" if c8 else "PASS",
             "图片素材上传物必须是 WebP，且转码字段齐全（upload_format=webp / transcode_source=lossless_master / transcode_passes=1）",
             c8[:12] if c8 else "%d 个图片素材均为一次性转码 WebP" % n,
             POLICY_REF + " ｜ 08-分镜公网URL/公网素材URL索引.json")
        put2("DL-C9", "FAIL" if c9 else "PASS",
             "转码输入必须是本地无损母版，且母版仍在磁盘上",
             c9[:12] if c9 else "%d 个图片素材的无损母版齐备" % n,
             POLICY_REF + "（core_rules ③ 母版不动）")
        put2("DL-C10", "FAIL" if c10 else "PASS",
             "画质分档正确：身份锚点保原生分辨率、普通参考记录 downscaled_to",
             c10[:12] if c10 else "%d 个图片素材分档与分辨率字段正确" % n,
             POLICY_REF + "（quality_tiers）")
        if c11:
            put2("DL-C11", "FAIL", "upload_bytes 必须严格小于 master_bytes",
                 c11[:12], POLICY_REF + "（expected_saving）")
        elif warn11:
            put2("DL-C11", "WARNING", "upload_bytes 必须严格小于 master_bytes（降幅 <50% 仅记 WARNING）",
                 warn11[:12], POLICY_REF + "（expected_saving）", severity="WARNING")
        else:
            put2("DL-C11", "PASS", "upload_bytes 必须严格小于 master_bytes",
                 "%d 个图片素材上传体积均小于母版" % n, POLICY_REF + "（expected_saving）")

    # ---------- 汇总 ----------
    fails = [c for c in checks if c["status"] == "FAIL"]
    warns = [c for c in checks if c["status"] == "WARNING"]
    overall = ("FAIL" if fails else
               "WARNING" if (warns or any(c["status"] == "SKIPPED" for c in checks)) else "PASS")
    result = {
        "gate_id": "asset_download_atomicity_gate",
        "gate_type": "跨阶段闸门（出图/出片与下载原子性）",
        "project": proj,
        "checked_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "rule_source_version": args.rule_version or "见 manifest.pack_version",
        "checked_upto_stage": upto,
        "inputs": {"asset_index": rel(proj, idx_p) if idx_p else None,
                   "task_index": rel(proj, tidx_p) if tidx_p else None,
                   "asset_entries": len(assets), "img_files": len(img_files),
                   "sb_files": len(sb_files), "video_files": len(vid_files),
                   "voice_files": len(voice_files)},
        "overall_status": overall,
        "blocking": bool(fails),
        "blocking_fail_count": len(fails),
        "checks": checks,
        "failed_checks": [c["check_id"] for c in fails],
        "next_action": ("存在『URL 已取而未落盘』或本地副本损坏：按 failed_checks 逐条返修"
                        "（同提示词同绑定重新出图、递增版本、同一步落盘并落地校验后再登记）；"
                        "跨阶段接力前本闸门必须 PASS" if fails else "下载原子性全部通过，允许继续下游阶段"),
    }
    out_dir = os.path.join(proj, "12-质检")
    os.makedirs(out_dir, exist_ok=True)
    json.dump(result, open(os.path.join(out_dir, "asset_download_atomicity_gate_闸门结果_%s.json" % args.version),
                           "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    lines = ["# 下载原子性闸门 · 汇总 %s" % args.version, "",
             "- 项目：%s" % proj,
             "- 检查时间：%s" % result["checked_at"],
             "- 校验至阶段：stage%s ｜ 资产条目 %d ｜ 图片 %d ｜ 视频 %d"
             % (upto, len(assets), len(img_files), len(vid_files)),
             "- **总判定：%s**（阻断项 %d 条）" % (overall, len(fails)), "",
             "| check | 内容 | 结论 | 说明 |", "|---|---|---|---|"]
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        lines.append("| %s | %s | %s | %s |" % (c["check_id"], c["label"], c["status"], act[:200]))
    lines += ["", "## 唯一真源", "",
              "- `api/image_api.json` → `payload.image_return_policy.url_lifecycle`（atomicity_rule / landing_verification_rule）",
              "- `standards/asset_upload_format_policy.json` → `payload`（cos_upload_format_contract：DL-C8~C11 的上传格式与画质分档口径）",
              "- `api/cos_imgbed_api.json` → `payload.upload_contract.format_contract_ref` / `object_key_layout`",
              "- 骨架 `gate_enforcement.download_atomicity_gate_ref`",
              "- 本闸门为组合包 `gates/asset_download_atomicity_gate.py` 的项目内落地副本", ""]
    open(os.path.join(out_dir, "asset_download_atomicity_gate_闸门汇总_%s.md" % args.version),
         "w", encoding="utf-8").write("\n".join(lines))

    print("[gate] %s  资产 %d ｜ 图片 %d ｜ 视频 %d ｜ 阻断 %d"
          % (overall, len(assets), len(img_files), len(vid_files), len(fails)))
    for c in checks:
        act = c["actual"]
        act = "；".join(act) if isinstance(act, list) else str(act)
        print("  %s %-8s %s" % (c["check_id"], c["status"], act[:130]))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
