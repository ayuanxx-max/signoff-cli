# 接入契约：上下游只准读，不准改判定

这份文件是给**下游**（看板、通知、发布助手、任务系统）和**上游**（场景卡生成器、pre-flight 提示）看的。
一句话规矩：**SignOff 的判定只有一份，任何外部能力只能消费它的输出，不能参与它的判定。**

违规的典型形态（都不接受 PR）：
- 页面/插件里出现"跳过这一关""调阈值""批量放行"的控件；
- 下游自己重算一遍判定，然后显示一个和 CLI 不一样的结论；
- 上游自动修改测试、自动补断言，让红变绿。

## 1. 三个出口

| 出口 | 形态 | 稳定性 | 适合谁 |
| --- | --- | --- | --- |
| `signoff report --json` | 一次性的结构化快照 | **v1 契约**（见下） | 脚本、CI、非 MCP 的集成 |
| `signoff report --schema` | 同一个契约的 JSON Schema | 与 v1 同步 | 需要校验字段的消费者 |
| `signoff mcp` → `signoff_report` | MCP 工具，返回同一份数据 | 与 v1 同步 | Claude Desktop / Cursor / DSH 等 MCP 客户端 |

三者输出**必须一致**：新增平台只能包一层渲染，不能长出第二套判定（依据 `docs/SURFACES.md`）。

## 2. 字段稳定性分级

`docs/report.schema.v1.json` 里每个字段都带 `stability`：

| 级别 | 含义 | 消费者该怎么做 |
| --- | --- | --- |
| `stable` | 不改名、不删、类型不变 | 可以直接依赖 |
| `additive` | 只新增，不改旧字段 | 允许依赖，但要忽略未知字段 |
| `experimental` | 可能变、可能删 | 不要写进对外承诺，别拿它做自动化决策 |

**版本策略**：v1 内只加不删。删字段、改语义 = 主版本 +2，且旧版本至少保留一个次版本周期。

退出码语义固定，不属于契约变更范围：**0 通过 / 1 有红 / 2 用法或环境错**。
下游不许把 1 渲染成黄色警告，也不许把 2 当成"通过"。

## 3. 上游：只产生输入

允许新增的上游能力，判据是"它是否改变判定"：

| 能力 | 允许 | 为什么 |
| --- | --- | --- |
| 场景卡/任务卡生成器（写 `.signoff/scenes/`） | 是 | 只提供 P2 的输入 |
| 提交前风险提示（pre-flight，只读，不判定） | 是 | 提示与判定分离 |
| `--no-verify` 之后记录原因（`p4 backfill --why`） | 是 | 记录事实，不是补签 |
| 自动补断言、自动改测试、自动放行 | **否** | 等于让被判定者自己判卷 |

## 4. 下游：只消费输出

| 接入方式 | 做法 | 前置 |
| --- | --- | --- |
| MCP 客户端 | 调 `signoff_report`，按 `verdict.ok` 显示结论 | `signoff mcp` 已注册 |
| CLI + JSON | `signoff report --json`，用 `--schema` 校验 | 装 CLI |
| GitHub Action | 见仓库根 `action.yml` | 仓库里有 `.signoff/` |
| CI 归档 | `signoff report --html --mount`，把 `~/.signoff/reports` 当 artifact | 无 |

渲染三条硬要求（沿用 `docs/REPORT-CONTRACT.md` C1/C3/C5）：

1. **只读**：不给跑闸、跳过、改阈值的控件；要跑闸就让用户显式调 `signoff run`。
2. **不美化红灯**：1 就是有红，不能画成"需要注意"。
3. **可推导**：页面上每个结论都要能说清来自哪个字段，不引入 CLI 里没有的判断。

## 5. 事件（已规划，未实现）

将来 `signoff watch --emit ndjson` 会输出下面六个事件，字段以此为草案；实现前不对外承诺：

| 事件 | 触发 | 关键字段 |
| --- | --- | --- |
| `gate.pass` | 某闸通过 | `gate`, `ts`, `ms` |
| `gate.fail` | 某闸判红 | `gate`, `ts`, `exitCode`, `firstLine` |
| `gate.skip` | 用户绕过 | `gate`, `ts`, `reason` |
| `checkpoint.advanced` | 检查点续签 | `seq`, `root`, `anchor` |
| `release.blocked` | release 闸判红 | `phase`, `failedChecks` |
| `verify.mismatch` | 复验发现不一致 | `kind`, `expected`, `actual` |

事件只做通知，**不携带判定权**：订阅方不能因为收到 `gate.pass` 就替用户宣布"可以发"。

## 6. 现在就能接的三行

```bash
signoff report --json | jq '.verdict'          # 结论
signoff report --schema > report.v1.json       # 字段契约
signoff mcp                                    # 交给 MCP 客户端
```

## 看板面板（4.5.0 起）

面板是报告数据的**只读薄壳**，不跑关、不写状态：

- 一个仓库一张卡：判决、过闸率、提交数、组任务数、最近一次跑闸（label + detail）、七关徽章、组任务行。
- **一页规则**：挡路项最多占 3 行，组任务补满到 9 行；只有还有没画完的组任务时，才出现
  「打开完整页面（还有 N 组）」。全部装得下时，按钮不出现。
- 数据只来自 `signoff report --html --mount` 写出的 `~/.signoff/reports/{index.json,<slug>/report.json}`；
  路径与 slug 规则由报告侧决定，面板不自己拼。
- 中英文案跟随浏览器语言，不依赖宿主接口；面板与页面必须说同一件事（同一 `label`、同一判决）。
