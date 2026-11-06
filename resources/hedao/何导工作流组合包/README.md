# 何导工作流组合包 v2.1.1（环节化）

> v1.x 是「一份 413KB 骨架装 10 个阶段」。v2.x 拆成 **红线 + 支撑 + 契约 + 7 份环节骨架**。
> 执行某一环节时只读该环节；环节内再按工序分段读。旧单体骨架移入 `_source/`，**执行时禁止读取**。

---

## 一、执行方式（照这个做）

```bash
python _tools/read_phase.py                     # 看 7 个环节清单
python _tools/read_phase.py S3                  # 看 S3 概览：输入/交付/闸门/工序段
python _tools/read_phase.py S3 3a               # 读 3a 建组期（只出这一段 16K）
python _tools/read_phase.py S3 3c --checks      # 读 3c 校验期 + 批内必过自检
python _tools/read_phase.py S3 --fullfilm       # 全部批次做完后，查全片级自检
python _tools/read_phase.py S3 --policy duration_calculation   # 取某个策略块全文
python _tools/read_phase.py S4 --full           # 非切片环节：正文+策略清单+P0自检 一次给全
```

**不要用 Read 工具整读 `stages/S3-*.json`（117.9K）或 `S7-*.json`（106.3K）**——整读等于没切片，这就是「一边跑一边忘」的根源。用上面的命令按段取。

开工前的固定三件事（每环节都写在骨架 `core_anchor` 里）：
1. `core/00-core.json` 全文（8 节红线，必读）
2. `core/01-support.json` 的 `sections_must_read` 所列章节
3. `core/02-contracts.json` 本环节的 `in` / `out`

---

## 二、目录

| 路径 | 内容 | 体积 | 什么时候读 |
|---|---|---|---|
| `core/00-core.json` | **红线层**：纪律、全局规则、状态、输入缺失、回滚、自检协议、密钥 | 25.4K | 每环节开工第一件事，读全文 |
| `core/01-support.json` | **支撑层**：执行环境坑、目录结构、运行配置、闸门总则、引用索引 | 37.1K | 按骨架列的章节读，可跨环节复用 |
| `core/02-contracts.json` | **交接契约**：S1→…→S7 每道交接的 path + schema | 5.8K | 每环节读本环节 in/out |
| `stages/S1~S7-*.json` | 7 份环节骨架 | 6.8–117.9K | **只读当前环节** |
| `_tools/read_phase.py` | 分段读取器 | — | 上面那套命令 |
| `_tools/audit_pack.py` | 完整性审计器 | — | 改过规则后必跑 |
| `_tools/split_pack.py` | 拆分器（从 `_source/` 重建全部产物） | — | 改完 core 后重跑 |
| `_source/` | v1.5.36 单体骨架原样快照 | 413K | **不读**，仅回溯 |
| `docs/changelog.json` | v1.x 版本叙述与已排除内容 | — | 不读 |
| `manifest.json` | 逐文件 sha256 + 聚合 hash + 版本锁 | — | 开工前核对版本 |
| `skills/` `standards/` `gates/` `api/` | 技能、标准、闸门脚本、接口配置 | — | 用到才读 |

---

## 三、7 个环节

| 环节 | 含原 stage | 骨架 | 模式 |
|---|---|---|---|
| **S1** 立项与运行配置 | 1 安装 + 2 目录命名 + 15 个启动提问 | 46.6K | 一次性 |
| **S2** 剧本 | 3 剧本生成 | 6.8K | 一次性（上传或生成） |
| **S3** 分镜拆解 | 4 分镜拆解 | 117.9K | **按镜头组批次**，批内 3a→3b→3c |
| **S4** 资产与声音 | 5 资产提示词与资产生成 | 35.3K | 一次性 |
| **S5** 分镜图 | 6 分镜图提示词与出图 | 48.0K | 一次性 |
| **S6** 图册与 COS 上传 | 6.5 URL 托管 + 6.6 图册生成 | 35.4K | 两事同步 |
| **S7** 出视频 | 7 视频提示词、H3 生成与下载 | 106.3K | **按批次**，7a→7b→7c→7d |

**S3 工序段**：3a 建组期 14.5K / 3b 填卡期 17K / 3c 校验期 2.5K
**S7 工序段**：7a 提示词 23K / 7b 提交前闸门 / 7c 提交与出片 / 7d 收尾

原先一次读 413K，现在（按段读的实际量）：
- S2 首读 ≈ 44K，S3 ≈ 64K，S7 ≈ 73K，S4 ≈ 77K，S6 ≈ 78K，S5 ≈ 90K，S1 ≈ 95K
- S3 之后每批换段 +14.5K，S7 之后每批换段 +23K

---

## 四、骨架里有什么（读之前知道字段含义）

| 字段 | 说明 |
|---|---|
| `core_anchor` | 红线/支撑/契约的 sha256 + 必读章节清单。sha 与 manifest 不符即停止 |
| `contracts.in / out` | 本环节输入与交付，缺任一项按输入缺失协议处理 |
| `phases` | **仅 S3/S7**：工序段。每条规则带 `[3a-01]` 式编号，与原文顺序一致 |
| `stage_meta` | **仅 S3/S7**：原 stage 的身份与 `required_inputs`（切片型骨架没有 `stages[]`，靠它保交接） |
| `stages[]` | 其余环节：整段正文 + `required_inputs` |
| `stage_policies` | 阶段级硬策略块：`engine_routing_policy`、`duration_calculation`、`url_rules`、`album_review_gate` 等 54 块。做判定时按 key 查，不必背 |
| `self_checks` | 298 条自检，含 `p0` 标记与 `scope`（`batch` 批内查 / `full_film` 全片查） |
| `gates` | **必跑**闸门（来自 `stage_gate_map` + 人工补充） |
| `gates_mentioned` | 正文提到但不属必跑的闸门，是否执行以规则原文为准 |
| `batch_plan` | **仅 S3/S7**：批次切分、跨批状态写法、批内禁令 |

---

## 五、两条硬规则

**1. `gates` 与 `gates_mentioned` 不是一回事。**
`gates` 是必须跑的。`gates_mentioned` 只表示正文提过——比如 S5 正文里提到 `h3_video_ref_binding_gate.py`，但那是提交视频阶段的闸门，在分镜图环节跑会缺产物报错。别混。

**2. `stage_policies` 是硬约束，不是注释。**
`engine_routing_policy`（4.5K）决定按 `video_engine` 路由哪套技能，`duration_calculation` 决定时长怎么加，`url_rules` 决定什么算 verified——这些原来在 stage 对象上，第一版拆分漏搬了 32.5K，v2.1.1 已补回并逐字校验。

---

## 六、审计与维护

```bash
python _tools/audit_pack.py     # 24 项检查，全 PASS 才算可交付
```

覆盖：process 184 条逐字 / 自检 298 条逐字 / 54 块策略逐字 / required_inputs 9 段 / core 12 章节逐字 / 15 个提问 / refs / changelog / manifest 70 文件 hash / 锚点 / 路径引用 145 处 / 13 条闸门 / 交接链 / 覆盖 9 段 stage。

**改规则的唯一路径**：
- 贯穿规则 → 改 `core/00-core.json`
- 环节规则 → 改 `_source/workflow-v1.5.36-source.json` 对应 stage，再重跑 `split_pack.py`
- 不要手改 `stages/*.json`，会被覆盖

重跑后必须：`split_pack.py` → `audit_pack.py` → 全 PASS → 递增 `PACK_VERSION`。

---

## 七、已知边界（不藏着）

1. **返工环节已砍**（原 stage8）。出片即交付，`gates/stage_8_interaction_gate.py` 已列入 `manifest.deprecated_gates`，不要调用。回滚协议保留在红线层，供 S3–S7 内部重做单镜。
2. **全片复核没有卡点**。角色名前后统一、全片时长对账、台词归属——没有任何环节负责，靠人工把关。
3. **唯一一处改写**：stage7 P34 原文「不得视为终点，必须进入 stage_8」改为「本环节即终点」（因为 stage8 已砍）。其余全部逐字搬运。
4. **`_source/` 与 `_tools/` 不进 manifest**，不参与执行。
