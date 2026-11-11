## 4.4.0 — 接口与自治理（判定逻辑未变）

**这一版没有改判定。** 五关、退出码语义（0 通过 / 1 有红 / 2 用法或环境错）、钩子与账本格式全部照旧。
改的是三件事：**给下游一个能信的字段契约、给自己一次架构体检、给"无痕"一个可量的口径。**

### 新增用法

```bash
signoff report --schema      # 打印 v1 字段契约（JSON Schema）
signoff report --json        # 同一份数据
signoff mcp                  # 交给 MCP 客户端
node tools/arch-health.mjs   # 仓库自身的四项架构体检
node tools/signoff-metrics.mjs <repo>...   # 翻案率 / 返工轮次 / 跳过率
```

### 前后对比

| 维度 | 4.3.1 | 4.4.0 |
| --- | --- | --- |
| 下游如何依赖 | 读 `report --json`，字段靠猜 | `--schema` 给出三级稳定性（stable / additive / experimental） |
| 上下游边界 | 口头约定 | `docs/INTEGRATION-CONTRACT.md`：上游只产生输入、下游只消费输出，六条事件草案 |
| 架构自检 | 无（只管别人） | `arch-health` 四规则 + 存量基线台账，只挡新增违规 |
| 价值度量 | 无 | 翻案率 / 返工轮次 / 跳过率；dsh-signoff 实测 42.9% / 2.33 轮 / 0% |
| 安全披露 | 无 `SECURITY.md` | 明写"未通过第三方审计"、72h/7d/30d 响应、A1–A7 攻击与测试位置 |
| 删除纪律 | 无 | `docs/deletion.md` D1–D4 |
| 包内元数据 | 无引用信息 | `CITATION.cff`、徽章、三种接法片段（Action / pre-commit / MCP） |

### 实测

- `npm test`：413 passed / 0 failed
- `signoff p5`：PASS（16 个文档，0 命中）
- `node tools/arch-health.mjs`：26 文件 / 8,744 行 / 新增违规 0 / 38 分（满分 40）
- `signoff release --pre`：14/14

安装：

```bash
npm i -g signoff-cli@4.4.0
```

---

## English

**No verdict change.** The five gates, the exit-code semantics (0 pass / 1 red / 2 usage or environment),
the hooks and the ledger format are untouched. This release adds a downstream field contract, a
self-architecture check, and a way to measure what an invisible tool actually caught.

### What is new

- `signoff report --schema` — a v1 JSON Schema with per-field stability (`stable` / `additive` / `experimental`).
- `docs/INTEGRATION-CONTRACT.md` — three read-only outlets, upstream/downstream red lines, six draft events.
- `tools/arch-health.mjs` — cycles, base-module direction, upward imports, oversized-file registry;
  fails only on new regressions against a committed baseline (score 38/40 today).
- `tools/signoff-metrics.mjs` — flip rate, rework rounds, skip rate from local `.signoff/runs.log`.
- `SECURITY.md` (audit status: no third-party audit), `docs/threat-model.md` (A1–A7 with test locations,
  four non-goals, nine-item audit-ready checklist), `docs/deletion.md`.
- Package metadata: `CITATION.cff`, badges, and copy-paste snippets for GitHub Action, pre-commit and MCP.

### Verification

`npm test` 413 passed · `signoff p5` PASS · arch-health 0 new violations / 38 of 40 · `release --pre` 14/14.

```bash
npm i -g signoff-cli@4.4.0
```
