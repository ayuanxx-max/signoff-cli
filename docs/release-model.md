# 发行与商业化：现在该不该收费

> English: [release-model.en.md](release-model.en.md)（同一份内容的英文版，也在本文末尾）

先给结论：**核心保持 MIT 免费，今天不收费。** 不是不想收，是三组证据都还没到能收费的门槛；
真要做付费，唯一站得住的形态是「团队合规包 + 托管看板」，前提是采用量先跨过一个数量级。

## 1. 现在的事实

| 指标 | 数值 | 来源 |
| --- | --- | --- |
| npm 月下载 | 3 237（约 461/周） | `api.npmjs.org` last-month，2026-10-11 ~ 2026-11-09 |
| 版本节奏 | 4.4.5 → 4.5.0 两周内两个功能版 | `CHANGELOG.md` |
| 使用者画像 | 单机、单仓、个人开发者为主 | 报告页与面板里的样本 |
| 运行时依赖 | 0（仅 Node ≥ 18 与 git） | `package.json` |
| 现有收费基础设施 | 无账号、无服务端、无计费 | 产品约束（三条红线之一：判定不能被买通） |

## 2. 三个候选客群：需求信号与付费点

| 客群 | 需求信号 | 现有替代 | 愿意付钱的理由 | 付费点是否落在本工具能力内 |
| --- | --- | --- | --- | --- |
| 团队与大规模协作（5~200 人） | 弱到中：多仓一致性、离职后复核、跨团队口径 | 免费钩子层（同行 B1/B2/B3）、CI 自带检查 | 证据汇总与审计导出，不是"再一个钩子" | 否：需要服务端与账号 |
| AI 集群 / agent 农场 | 增长中：agent 需要机器可读判决与配额 | 自建脚本、CI 矩阵 | 策略下发、限流、成本归集 | 否：同样在服务端 |
| 合规采购（金融/医疗/大型企业） | 弱：先要有第三方审计与合同主体 | 商业 SAST/SCA 套件 | 责任转移（合同、SLA、赔偿上限） | 部分：需要公司与审计，不是代码 |

三行的共同点：**判定本身没有定价空间**，因为免费同行已经在抢同一个 `pre-commit` 钩子；能卖的是判定之外的
「证据、策略、责任」。

## 3. 团队与大规模协作：需求存在，但不在 CLI 里

- 团队真正的痛点是「这个结论能不能被第三方复核」与「十几个仓库的结论能不能一张表看完」。
- 这两件事都需要一个汇总端：谁在什么时候、哪个仓库、过了哪几关、有没有被绕过。
- 汇总端一旦存在，就会要求账号、权限、留存与吊销 —— 与「无账号、无网络、纯本机」的设计直接冲突。
- 所以它只能是**可选产品**（托管看板 / 私有部署），不能塞进 CLI，更不能因此让 CLI 依赖网络。

## 4. AI 集群：需求在长，但卖点不是「多一个钩子」

- agent 侧真正需要的是机器可读：`--json` 与 `signoff mcp` 已经给了；这部分必须保持免费，否则 agent 生态不会接。
- 集群规模下稀缺的是配额、并发与成本归集，不是判定逻辑；这些属于调度层，工具只提供判决输入。
- 现状证据：月下载 3 237 说明真实使用仍以个人为主；agent 侧目前没有可测的付费意愿，只有技术诉求。

## 5. 如果收费，只有两种形态站得住

| 形态 | 卖什么 | 不卖什么 | 价格假设（未验证） |
| --- | --- | --- | --- |
| 托管看板（SaaS） | 多仓汇总、留存、权限、审计导出 | 判定本身、通过与否 | 每座位每年 60~120 美元；团队版按组织计 |
| 团队合规包（私有部署 + 支持） | 策略模板、审计材料、响应时限、赔偿上限 | 让红变绿的任何开关 | 每组织每年 3 000~10 000 美元起 |

不做按次计费：按次会诱导「少跑一次省一笔」，与"守护过程"的目标相反。
也不做「付费解锁通关」：那等于把判决变成商品，三条红线里的第一条就破了。

## 6. 现在明确不做的事

- 不建计费系统（采用量不足时，计费系统只是负债）。
- 不加遥测（会毁掉「本机、无账号」这个差异点，也带来隐私合规成本）。
- 不为收费改许可：核心继续 MIT，付费产品放在独立仓库/独立服务里。

## 7. 什么时候重新评估

同时满足两条就重新评估，只满足一条继续观察：

1. npm 周下载连续四周超过 5 000（现在是约 461/周，差一个数量级）；
2. 出现三家以上组织明确提出采购、合规或 SLA 诉求，且有预算窗口。

## 8. 版本发行分支：现在的做法

| 通道 | 内容 | 谁能用 |
| --- | --- | --- |
| `latest`（默认） | 稳定版，每次发版 tag + GitHub Release + npm | 所有人 |
| `--pre` / 预发布 | 发版前把包装进临时目录跑 `--version` 与 MCP 握手 | 维护者 |
| 分支 | `master` 即发布分支；功能在短分支上做完即合并，不发长期并行版本 | 维护者 |

理由：单维护者 + 零运行时依赖，长期并行分支（LTS）带来的成本大于收益；真正的兼容性承诺写在
`docs/REPORT-CONTRACT.md` 的 `contractVersion` 上，那里才是「谁能依赖什么」的答案。

<!-- EN-BEGIN auto-embedded from docs/release-model.en.md; edit that file and run node tools/sync-bilingual.mjs -->

## English

## Release and commercial model: should this be paid today

> 中文: [release-model.md](release-model.md)（the same content in Chinese, also at the end of this file）

Bottom line: **the core stays MIT and free; nothing is charged today.** Not for lack of appetite — three pieces of
evidence are still short of the threshold. If it is ever paid, the only defensible shape is "team compliance pack +
hosted board", and only after adoption grows by an order of magnitude.

### 1. The facts today

| Metric | Value | Source |
| --- | --- | --- |
| npm downloads per month | 3,237 (about 461/week) | `api.npmjs.org` last-month, 2026-10-11 → 2026-11-09 |
| Release cadence | 4.4.5 → 4.5.0, two feature releases in two weeks | `CHANGELOG.md` |
| User profile | single machine, single repository, individual developers | samples in the report page and panel |
| Runtime dependencies | zero (Node >= 18 and git only) | `package.json` |
| Billing infrastructure | no account, no server, no metering | product constraint (the verdict cannot be bought) |

### 2. Three candidate segments

| Segment | Demand signal | Existing substitute | Reason to pay | Does the pay point sit inside this tool? |
| --- | --- | --- | --- | --- |
| Teams / large collaboration (5–200 people) | weak to medium: cross-repo consistency, re-checking after someone leaves, shared wording | free hook layers (peers B1/B2/B3), built-in CI checks | aggregating evidence and audit export, not "one more hook" | no: needs a server and accounts |
| AI clusters / agent farms | growing: agents need a machine-readable verdict and quotas | home-grown scripts, CI matrices | policy distribution, rate limits, cost attribution | no: also server-side |
| Compliance procurement (finance, health, large enterprise) | weak: needs a third-party audit and a contracting entity first | commercial SAST/SCA suites | transfer of liability (contract, SLA, caps) | partly: needs a company and an audit, not code |

All three share one property: **the verdict itself has no pricing power**, because free peers already compete for the
same `pre-commit` hook. What can be sold is evidence, policy and liability around the verdict.

### 3. Teams: real need, but not inside the CLI

- The pain is "can a third party re-check this" and "can I see a dozen repositories in one table".
- Both need an aggregator: who, when, which repository, which gates, and whether anything was bypassed.
- An aggregator implies accounts, permissions, retention and revocation — in direct conflict with "no account, no
  network, local only".
- So it can only be an **optional product** (hosted or self-hosted), never something the CLI depends on.

### 4. AI clusters: demand is growing, but not for another hook

- What agents need is machine-readable output; `--json` and `signoff mcp` already provide it and must stay free,
  otherwise the agent ecosystem will not adopt it.
- At cluster scale the scarce resource is quota, concurrency and cost attribution, not judgement logic; that belongs
  to the scheduler, and this tool only supplies the verdict input.
- Current evidence: about 3,237 downloads a month means real use is still individual; on the agent side there is a
  technical requirement but no measurable willingness to pay.

### 5. If it is charged, only two shapes survive

| Shape | Sells | Does not sell | Price hypothesis (unverified) |
| --- | --- | --- | --- |
| Hosted board (SaaS) | multi-repo aggregation, retention, permissions, audit export | the verdict, pass or fail | 60–120 USD per seat per year; team tier per org |
| Team compliance pack (self-hosted + support) | policy templates, audit material, response time, liability caps | any switch that turns red into green | from 3,000–10,000 USD per org per year |

No per-run billing: it rewards skipping runs, which is the opposite of guarding the process.
And no "pay to pass": that would turn the verdict into a commodity and break the first red line.

### 6. What is explicitly not being done now

- No billing system (before adoption, it is pure liability).
- No telemetry (it would erase the "local, no account" difference and add privacy compliance cost).
- No license change for revenue: the core stays MIT, paid products live in their own repository or service.

### 7. When to re-evaluate

Re-evaluate when both are true; with only one, keep watching:

1. weekly npm downloads above 5,000 for four consecutive weeks (today about 461/week — one order of magnitude away);
2. three or more organisations explicitly ask for procurement, compliance or an SLA, with a budget window.

### 8. Release branches today

| Channel | Content | Who |
| --- | --- | --- |
| `latest` (default) | stable release; every release has a tag, a GitHub Release and an npm publish | everyone |
| `--pre` / prerelease | packs, installs into a temp dir, runs `--version` and an MCP handshake before publishing | maintainers |
| Branches | `master` is the release branch; features land from short branches, no long-lived parallel versions | maintainers |

Reason: a single maintainer with zero runtime dependencies gets more cost than benefit from long-lived LTS branches;
the real compatibility promise is `contractVersion` in `docs/REPORT-CONTRACT.md`, which is the answer to "what may I
depend on".

<!-- EN-END -->
