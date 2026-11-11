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
| 运行时依赖 | 0（仅 Node ≥ 20 与 git） | `package.json` |
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

## 8. 版本与分支：深入论证

分支不是「有版本号就该有」的东西。开一条并行分支的成本可以算，收益也必须算得出来。
这一节先量自己的事实，再量外部信号，最后给决策和触发条件。

### 8.1 自己的发行事实

| 指标 | 数值 | 怎么得到 |
| --- | --- | --- |
| tag 数量 | 70 | `git tag` |
| tag 指向提交的日期跨度 | 2026-11-06 → 2026-11-11（相差 5 天，落在同一周） | `git log -1 --format=%cs <tag>` |
| 相邻版本间隔 | 中位数 0 天，最长 2 天，65/69 为同日 | 同上 |
| CHANGELOG 节数 / 其中标注 `BREAKING` | 73 / 0 | 搜 `BREAKING`、`不兼容`、`破坏性` |
| npm dist-tags | 只有 `latest` | `npm view signoff-cli dist-tags` |
| 一次 CI 的 job 数 | 14（9 个 OS×Node 矩阵 + arch-health + 打包安装 + python 对齐 + arm64 + 容器） | 运行记录 |

判读：70 个版本全部落在同一周内，这是「做出来就发」的迭代节奏，不是运营节奏。
用它论证「几个月一版、需要 LTS」没有说服力；拿它当「马上要开维护分支」的理由同样站不住。
能支撑分支决策的是下面三条外部信号。

### 8.2 信号一：用户停在哪一版

npm 按版本统计的最近一周下载（同一接口内的相对分布）：

| 版本 | 周下载 |
| --- | --- |
| 4.0.2 | 298 |
| 4.1.9 | 249 |
| 4.1.1 | 238 |
| 4.1.2 | 236 |
| 4.0.0 | 226 |
| 4.0.1 | 222 |
| `latest`（4.6.2） | 不在前六 |

两种解释都成立：lockfile 把版本钉死，或者镜像与爬虫在抓具体版本。它们指向同一件事：
**升级不会自动发生**。今天发 4.7.0，4.0.x 上那批人不会跟上来。

诚实边界有两条。其一，按版本计数含镜像与 CI 流量，分不出真人。其二，按版本接口与按月总量接口的口径对不上
（按月两点查询给出 3 237/月，按版本前六名一周就合计 1 469），所以这里只用分布形状，不用总量做推导。

### 8.3 信号二：Node 支持面

| 项 | 原先写的 | 实际测的 | 冲突 |
| --- | --- | --- | --- |
| Node 版本 | `engines.node = ">= 20"` | CI 矩阵只有 20 / 22 / 24 | 18 从未在 CI 上跑过 |
| 18 的生命周期 | — | 2025-04-30 已 EOL | 声明了一个停止维护的运行时 |

承诺一个从未测过的支持面，比不承诺更糟：用户按 `>=18` 装在 18 上，出问题我们既没测过也修不了。
决定：`engines.node` 改为 `>=20`，与 CI 矩阵对齐；18 从声明里去掉。这条不是分支问题，是承诺问题，
但它决定了「维护分支要覆盖哪些运行时」——支持面每多一档，并行分支的测试成本就多一组。

### 8.4 信号三：接口面有几层，哪一层必须能回旧分支修

| 层 | 示例 | 变化频率 | 破坏半径 |
| --- | --- | --- | --- |
| 判决 | 退出码 `0/1/2` | 几乎不变 | 所有脚本与钩子 |
| CLI 参数 | `--staged`、`--json`、`--lang` | 中 | 写死命令的 CI |
| `--json` 字段 | `contractVersion`、`checks[]`、`tasks[]` | 中 | 面板、MCP、外部看板 |
| 报告契约 | C1…C11 | 低，但每次都要改契约与自测 | 所有读报告的人 |
| 落盘格式 | `.signoff/audit.log`、`checkpoint.json` | 极低 | 已有仓库的历史数据 |

五层里只有「报告契约」带显式版本（`contractVersion`），其余靠语义化版本。
真正可能需要回旧分支修的，只有判决与参数层的安全、数据损坏类问题；报告与落盘格式的变更本来就该向前兼容。
这也是为什么现在不开分支也不致命：破坏性变更集中在低频层，而高频层是向前兼容的。

### 8.5 通道设计：一条够不够

| 通道 | 给谁 | 成本 | 现在要不要 |
| --- | --- | --- | --- |
| `latest` | 所有人 | 已有 | 保持（现状） |
| `snapshot`：每次 master 绿 CI 的 tarball | AI 集群、内部镜像、要 pin 构建的团队 | 近乎零：同一份产物多打一个 dist-tag | **要**，见 8.7 |
| `next`：预发布，提前 24 小时 | 想提前验证的团队 | 中：多一条发布路径、多一份说明 | 等触发条件 |
| `maintenance`：旧 minor 只接安全修复 | 钉死旧版本的团队 | 高：14 个 job × 分支、CHANGELOG 分叉、双语文档多处同步 | 等触发条件 |

`snapshot` 值得先加，是因为它不产生分支，只产生一个可 pin 的坐标。集群侧要的是「这次构建对应哪个确定产物」，
不是「再维护一条 4.6 线」；后者解决的是「旧版本的漏洞谁来补」，那是另一件事，不该混在一起做。

### 8.6 真开并行分支的成本

以 `maintenance` 为例，一次安全修复要付这些：

| 成本项 | 量级 |
| --- | --- |
| CI | 每次多 14 个 job（9 个矩阵 + 5 个独立 job） |
| 文档 | 中英各一份，且中文正文里嵌着英文全文，改一处要同步三处 |
| CHANGELOG | 两条线各自累加，读者要自己判断「我这版修了没有」 |
| 合并冲突 | 修复要落 master 与旧线两处，冲突概率随分叉时间上升 |
| 承诺 | 写了「维护 12 个月」之后，漏一次就是信用损失 |

在 461 周下载的量级下，这五项支出换不回对应的留存或收入。不是做不到，是现在付不起。

### 8.7 决策：N-1 支持面 + 一条 `snapshot`，暂不建 LTS

| 版本面 | 修复承诺 | 时长 | 定位 |
| --- | --- | --- | --- |
| 最新 minor 及其 patch（如 4.7.x） | 功能、缺陷、安全全接 | 到下一个 minor | 主战场 |
| 上一个 minor（如 4.6.x） | 只接安全与数据损坏类 | 90 天 | 给来不及升级的人缓冲 |
| 更早的版本 | 不修，给升级路径 | — | 明确说不修，比含糊承诺诚实 |
| `snapshot` 通道 | 不承诺稳定，只承诺「对应某次绿 CI」 | — | 给集群 pin 构建用 |

配套两条规则：

1. **破坏性变更必须标 `BREAKING`**。73 节 CHANGELOG 里现在 0 处标注，等于让读者自己猜。
   从 4.7.0 起，改判决、改参数、改 `--json` 字段、改落盘格式，条目必须带 `BREAKING` 与迁移步骤。
2. **semver 的边界写死在契约里**：`contractVersion` 变 → 至少 minor；退出码语义变 → major。
3. **`engines` 收紧标 `BREAKING` 但按 minor 发布**（4.7.0 收到 `>=20`）。去掉一个已 EOL、且从未进过 CI 矩阵的运行时，
   不会让任何在受支持运行时上的用户受损；将来真要砍掉受支持的版本，那一次才发 major。

### 8.8 什么时候必须开分支

三条可测条件，命中任意一条就开，不再凭感觉：

| 条件 | 阈值 | 为什么是这个阈值 |
| --- | --- | --- |
| 旧版本占比 | 某个旧 minor 连续四周超过总下载的 30% | 说明有一批人钉死在旧版本上，修复得回到那条线 |
| 企业侧诉求 | 三家以上组织要求「固定版本 + 修复承诺」 | 有承诺才谈得上续约与合同 |
| 安全事件 | 一次需要同时修两条线的高危问题 | 已经在做，分支只是把它制度化 |

不命中时，`maintenance` 分支是负债：多一条线要养、多一份文档要同步、多一次「我这版修了吗」的解释。
命中时，成本那一栏已经在 8.6 里算过，照着付就行。

### 8.9 复现这一节的数字

```bash
node tools/release-cadence.mjs          # tag 数、间隔中位数、BREAKING 计数、engines 与 CI 矩阵是否一致
node tools/release-cadence.mjs --npm    # 外加按版本的周下载（需要联网）
```

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
| Runtime dependencies | zero (Node >= 20 and git only) | `package.json` |
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

### 8. Version branches: the detailed case

A parallel branch is not something you owe the world because you have version numbers. The cost of opening one is
computable; so must the benefit be. This section measures our own record, then the external signals, then states the
decision and its triggers.

#### 8.1 Our own release record

| Metric | Value | How |
| --- | --- | --- |
| Tags | 70 | `git tag` |
| Span of the commits the tags point at | 2026-11-06 → 2026-11-11 (5 days, one week) | `git log -1 --format=%cs <tag>` |
| Gap between adjacent releases | median 0 days, max 2, 65 of 69 same day | same |
| CHANGELOG sections / of which marked `BREAKING` | 73 / 0 | search `BREAKING`, `不兼容`, `破坏性` |
| npm dist-tags | `latest` only | `npm view signoff-cli dist-tags` |
| Jobs per CI run | 14 (9 OS×Node matrix + arch-health + pack/install + python parity + arm64 + container) | run record |

Reading: all 70 releases land inside one week. That is "build it, ship it" iteration, not operations cadence.
It does not support "a release every few months, therefore LTS", and it does not support "we need a maintenance branch
right now" either. What can support a branching decision is the three external signals below.

#### 8.2 Signal one: which version people stay on

npm downloads per version for the last week (relative shape within one endpoint):

| Version | Weekly downloads |
| --- | --- |
| 4.0.2 | 298 |
| 4.1.9 | 249 |
| 4.1.1 | 238 |
| 4.1.2 | 236 |
| 4.0.0 | 226 |
| 4.0.1 | 222 |
| `latest` (4.6.2) | not in the top six |

Two explanations both hold: lockfiles pin the version, or mirrors and crawlers fetch specific versions. They point the
same way: **upgrades do not happen by themselves.** Ship 4.7.0 today and the 4.0.x group will not follow.

Two honest limits. First, per-version counts include mirrors and CI traffic, so humans cannot be separated out.
Second, the per-version endpoint and the monthly point endpoint do not agree (the monthly point says 3,237/month, the
top six versions already sum to 1,469 in a week), so only the shape is used here; no conclusion rests on the absolute.

#### 8.3 Signal two: the Node support surface

| Item | Was written | Actually tested | Conflict |
| --- | --- | --- | --- |
| Node version | `engines.node = ">= 20"` | CI matrix only 20 / 22 / 24 | 18 never ran in CI |
| Lifecycle of 18 | — | EOL since 2025-04-30 | declaring an unmaintained runtime |

Promising an untested support surface is worse than promising nothing: a user installs on 18 because the metadata
allows it, and when it breaks we have neither tested nor fixed anything. Decision: `engines.node` becomes `>=20`,
aligned with the CI matrix, and 18 leaves the claim. This is not a branching question, it is a promise question, but it
does set what a maintenance branch would have to cover: every extra runtime multiplies the branch test cost.

#### 8.4 Signal three: how many interface layers, and which must be fixable on an old branch

| Layer | Example | Rate of change | Blast radius |
| --- | --- | --- | --- |
| Verdict | exit codes `0/1/2` | almost never | every script and hook |
| CLI flags | `--staged`, `--json`, `--lang` | medium | CI that hard-codes commands |
| `--json` fields | `contractVersion`, `checks[]`, `tasks[]` | medium | panel, MCP, external boards |
| Report contract | C1…C11 | low, but every change touches contract and tests | everyone reading the report |
| On-disk format | `.signoff/audit.log`, `checkpoint.json` | very low | history in existing repositories |

Only the report contract carries an explicit version (`contractVersion`); the rest ride on semver. What might genuinely
need a fix on an old branch is security and data corruption in the verdict and flag layers; report and on-disk changes
are supposed to be forward compatible. That is also why running without branches is not fatal today: breaking changes
concentrate in the slow layers, and the fast layers are forward compatible.

#### 8.5 Channels: is one enough

| Channel | For whom | Cost | Needed now |
| --- | --- | --- | --- |
| `latest` | everyone | already there | keep |
| `snapshot`: tarball from every green master CI | AI clusters, internal mirrors, teams pinning a build | near zero: one more dist-tag on the same artifact | **yes**, see 8.7 |
| `next`: prerelease, 24 hours ahead | teams that want early verification | medium: another publish path and another explanation | on trigger |
| `maintenance`: old minor, security fixes only | teams pinned to an old version | high: 14 jobs per branch, CHANGELOG fork, bilingual docs in several places | on trigger |

`snapshot` is worth adding first because it creates no branch, only a pinnable coordinate. What a cluster wants is "which
exact artifact does this build correspond to", not "maintain a 4.6 line"; the latter answers "who patches vulnerabilities
in old versions", which is a different problem and should not be bundled with it.

#### 8.6 The real cost of a parallel branch

Taking `maintenance` as the example, one security fix pays for:

| Cost | Size |
| --- | --- |
| CI | 14 more jobs per run (9 matrix + 5 standalone) |
| Docs | one copy per language, and the Chinese body embeds the English text, so one edit touches three places |
| CHANGELOG | two lines accumulate separately and readers must work out whether their version got the fix |
| Merge conflicts | the fix lands on master and on the old line, and conflicts grow with time since the fork |
| Promise | once "maintained for 12 months" is written, one miss is a credibility loss |

At roughly 461 downloads a week, those five costs do not buy back retention or revenue. Not impossible — just not
affordable now.

#### 8.7 Decision: an N-1 support surface plus `snapshot`, no LTS yet

| Surface | Fix promise | Duration | Role |
| --- | --- | --- | --- |
| Newest minor and its patches (e.g. 4.7.x) | features, defects, security | until the next minor | the main line |
| Previous minor (e.g. 4.6.x) | security and data corruption only | 90 days | a buffer for people who cannot upgrade yet |
| Older than that | no fixes, only an upgrade path | — | saying no is more honest than vague promises |
| `snapshot` channel | no stability promise, only "corresponds to a green CI run" | — | pinning a build in a cluster |

Two companion rules:

1. **Breaking changes must be marked `BREAKING`.** 0 of 73 CHANGELOG sections say so today, which leaves readers
   guessing. From 4.7.0 on, a change to the verdict, a flag, a `--json` field or the on-disk format must carry
   `BREAKING` and the migration step.
2. **The semver boundary is written into the contract**: a `contractVersion` change means at least a minor; a change in
   exit-code semantics means a major.
3. **Raising `engines` is marked `BREAKING` but ships as a minor** (4.7.0 raises it to `>=20`). Dropping a runtime that
   reached EOL and was never in the CI matrix does not cost a user on a supported runtime anything; if a supported
   version is ever dropped, that one goes out as a major.

#### 8.8 When a branch becomes mandatory

Three measurable conditions; hitting any one opens the branch, no judgement call:

| Condition | Threshold | Why that threshold |
| --- | --- | --- |
| Old-version share | one old minor above 30% of total downloads for four weeks | a real population is pinned there, so fixes must go back |
| Enterprise demand | three or more organisations asking for "pinned version plus fix commitment" | commitment is what a contract and a renewal are built on |
| Security event | one high-severity issue that must be fixed on two lines at once | we already do it by hand; a branch just formalises it |

Below those thresholds a `maintenance` branch is a liability: one more line to feed, one more doc to keep in sync, one
more "did my version get this" to explain. Above them, the cost is already computed in 8.6 — pay it and move on.

#### 8.9 Reproducing these numbers

```bash
node tools/release-cadence.mjs          # tags, median gap, BREAKING count, engines vs CI matrix
node tools/release-cadence.mjs --npm    # plus per-version weekly downloads (needs network)
```

<!-- EN-END -->
