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

## 8. 版本与分支：深入论证

### 8.1 先看用量落在哪

npm 按版本的最近一周下载，按 minor 聚合（15 个版本有量，合计 3 237）：

| minor | 周下载 | 占比 |
| --- | --- | --- |
| 4.1.x | 2 282 | 70.5% |
| 4.0.x | 746 | 23.0% |
| 0.0.x（远古） | 209 | 6.5% |
| 4.2 ~ 4.6 | 合计不足 1% | — |
| `latest`（4.6.2） | 不在前六 | — |

关键不是「有人在用」，是「有人停在 4.1」。4.1.x 与 latest 之间隔着 4.2、4.3、4.4、4.5、4.6 五个 minor。

### 8.2 三种解释，先别选

| 解释 | 怎么证伪 | 现状 |
| --- | --- | --- |
| lockfile 把版本钉死（`npm ci` 不升级） | 看 `latest` 是否也有量；pin 的人不会去装 latest | latest 无量 → 更像 pin |
| 镜像 / 爬虫在抓具体版本 | 镜像通常只跟 `latest`，不挑 4.1.9 这种具体版本 | 4.1.9、4.1.1、4.1.2 各有两三百，不像镜像 |
| 4.2 之后有劝退变化 | 查 4.2.0 的 CHANGELOG 是否标了破坏性 | 73 节里 0 处 `BREAKING`，无法判断 |

三条都不确定，但都指向同一个操作结论：**升级摩擦是主要矛盾**。

### 8.3 这条数据推翻了我上一版的结论

上一版的触发条件写的是「旧 minor 占比连续四周超过 30% → 开维护分支」。现在 4.1.x 一家占 70.5%，按字面已经命中。

命中之后要先问一句：那条线上有什么要修？没有已知安全或数据损坏问题，开分支只是把 4.1 的旧代码再养一遍，
既不解决升级，也不解决安全。所以阈值本身要修：**占比是必要条件，不是充分条件**。

| 条件 | 内容 | 现在 |
| --- | --- | --- |
| A（必要） | 某个旧 minor 连续四周占总下载 30% 以上 | 已满足（4.1.x 70.5%） |
| B（必要） | 该版本上存在需要回补的修复：安全、数据损坏、A 级缺陷 | 未满足（无已知问题） |
| 开分支 | A 与 B 同时满足 | 不开 |
| 只满足 A | 问题在升级路径，不在分支 | 先修 8.4 的三个缺口 |

### 8.4 升级路径的三个缺口

| 缺口 | 现状 | 修法 | 成本 |
| --- | --- | --- | --- |
| 破坏性变更不可见 | 73 节 CHANGELOG 里 0 处 `BREAKING` | 每条加 `BREAKING` 标记与迁移步骤 | 写文档，一次性 |
| 没有「你落后几版」的提示 | `signoff doctor` 只查环境 | 加一条本地版本对比提示（联网可查，离线跳过） | 十几行代码 |
| 没有一段式迁移说明 | 升级要自己翻 5 个版本的 CHANGELOG | `docs/upgrade.md`：按版本列「会变什么、改哪一行」 | 写文档，一次性 |

这三件事都不产生分支、不增加 CI、不需要账号，但直接作用在 70.5% 那批人身上。

### 8.5 分支的真实成本：按分钟和注意力算

| 项 | 量级 | 说明 |
| --- | --- | --- |
| 一次 CI | 中位 1.7 分钟（14 个 job 并行，5 次成功运行采样） | 并行，所以墙钟时间不是主要成本 |
| 一年多出的 job 次 | 12 次发版 × 14 ≈ 168 | 额度与失败面，不是钱 |
| 文档 | 中文正文里嵌着英文全文，改一处要同步三处 | 双语文档的固定成本 |
| CHANGELOG | 两条线各自累加 | 读者要自己判断「我这版修了没」 |
| 注意力 | 单维护者，多一条线就多一份要记的状态 | 真正稀缺的资源 |

结论：分支不是「付不起」，是「现在付了没用」——它解决的是旧线漏洞，而眼下的问题是升级。

### 8.6 通道：现在加 `snapshot`，不加 `next` / `maintenance`

| 通道 | 命令 | 给谁 | 现在 |
| --- | --- | --- | --- |
| `latest` | 已有 | 所有人 | 保持 |
| `snapshot` | `npm dist-tag add signoff-cli@<ver> snapshot` | 内部镜像、想跟最新绿构建的团队 | 可加，零分支成本 |
| `next` | 预发布通道 | 想提前验证的团队 | 等有人要 |
| `maintenance` | 旧 minor 安全修复 | 钉死旧版本的团队 | 等 A+B |

关于 `snapshot` 要说清一件事：dist-tag 是可变的，所以 `signoff-cli@snapshot` 不能当可复现坐标。
集群侧真要可复现，得钉具体版本号加 `integrity` 哈希，例如
`npm i signoff-cli@4.6.2 --save-exact`，再把 tarball 与哈希镜像进内部 registry。
`snapshot` 的作用是「让人知道该钉哪个版本」，不是「替代钉版本」。

### 8.7 如果将来收费，分支才会变成资产

| 形态 | 与分支的关系 | 能不能收回成本 |
| --- | --- | --- |
| 免费 latest | 不需要分支 | — |
| 免费 snapshot | 不需要分支，只要发版流程 | — |
| 付费「固定版本 + 12 个月修复」 | **需要一条 maintenance 线** | 是：合同期就是承诺期 |
| 付费托管看板 | 不需要分支，需要服务端 | 与分支无关 |

这是唯一一种「开分支能收回成本」的情形，也是 8.8 里第三个触发条件的来源。

### 8.8 修正后的触发条件

| 条件 | 阈值 | 命中后做什么 |
| --- | --- | --- |
| A 用量 | 某个旧 minor 连续四周占总下载 30% 以上 | 修升级路径（8.4 三件事），不开分支 |
| A + B | 旧的线上有需要回补的安全/数据问题 | 开 maintenance 分支，按 8.5 的成本付 |
| C 商业 | 一个付费客户要求「固定版本 + 修复窗口」 | 开分支并把承诺写进合同 |
| D 安全事件 | 一次需要同时修两条线的高危问题 | 先手工双线修，再决定是否制度化 |

### 8.9 复现

回滚 4.7.0 时把 `tools/release-cadence.mjs` 一并撤掉了，脚本本体仍留在历史里：
`git show d7cee80:tools/release-cadence.mjs > tools/release-cadence.mjs`。
不跑脚本也能手工复现：`curl https://api.npmjs.org/versions/signoff-cli/last-week`，按 minor 聚合即可。

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

### 8. Version branches: the detailed case

#### 8.1 Where usage actually sits

npm downloads per version for the last week, aggregated by minor (15 versions have traffic, 3,237 total):

| minor | weekly | share |
| --- | --- | --- |
| 4.1.x | 2,282 | 70.5% |
| 4.0.x | 746 | 23.0% |
| 0.0.x (ancient) | 209 | 6.5% |
| 4.2 – 4.6 | under 1% together | — |
| `latest` (4.6.2) | not in the top six | — |

The point is not that people use it; the point is that people stopped at 4.1. Between 4.1.x and `latest` sit five minors:
4.2, 4.3, 4.4, 4.5, 4.6.

#### 8.2 Three explanations, no verdict yet

| Explanation | How to disprove it | Status |
| --- | --- | --- |
| Lockfiles pin the version (`npm ci` does not upgrade) | see whether `latest` also has traffic; people who pin do not install latest | latest has no traffic → pinning fits |
| Mirrors or crawlers fetch specific versions | mirrors follow `latest`, they do not pick 4.1.9 | 4.1.9, 4.1.1, 4.1.2 each have hundreds, which mirrors do not do |
| Something after 4.2 put people off | check whether 4.2.0 is marked breaking in the CHANGELOG | 0 of 73 sections carry `BREAKING`, so it cannot be answered |

None of the three is established, and all three point at the same operational conclusion: **upgrade friction is the main
problem**.

#### 8.3 The data overturns my previous conclusion

The earlier trigger said: an old minor above 30% for four weeks means open a maintenance branch. 4.1.x alone is at 70.5%,
so by that sentence the trigger has fired.

The next question is what would be fixed on that line. With no known security or data corruption issue, a branch would
just keep 4.1's old code on life support: it fixes neither upgrades nor security. So the threshold itself needs fixing:
**share is necessary, not sufficient**.

| Condition | Content | Today |
| --- | --- | --- |
| A (necessary) | an old minor above 30% of downloads for four weeks | met (4.1.x 70.5%) |
| B (necessary) | a fix that must go back to that version: security, data corruption, A-level defect | not met (nothing known) |
| Open a branch | A and B together | not now |
| Only A | the problem is the upgrade path, not branches | fix the three gaps in 8.4 |

#### 8.4 Three gaps in the upgrade path

| Gap | Today | Fix | Cost |
| --- | --- | --- | --- |
| Breaking changes are invisible | 0 of 73 CHANGELOG sections carry `BREAKING` | mark each one and add the migration step | docs, one-off |
| No "you are N minors behind" hint | `signoff doctor` only checks the environment | add a local version comparison (network optional, skipped offline) | a dozen lines |
| No single migration guide | upgrading means reading five CHANGELOGs | `docs/upgrade.md`: per version, what changes and which line to edit | docs, one-off |

None of these creates a branch, adds CI jobs or needs an account, and each acts directly on the 70.5% group.

#### 8.5 What a branch really costs: minutes and attention

| Item | Size | Note |
| --- | --- | --- |
| One CI run | median 1.7 minutes (14 parallel jobs, 5 successful runs sampled) | parallel, so wall time is not the main cost |
| Extra job runs per year | 12 releases × 14 ≈ 168 | quota and failure surface, not money |
| Docs | the Chinese body embeds the English text, so one edit touches three places | fixed cost of bilingual docs |
| CHANGELOG | two lines accumulate | readers must work out whether their version got the fix |
| Attention | one maintainer, one more line to remember the state of | the scarce resource |

Conclusion: a branch is not unaffordable — it would simply fix the wrong thing today. It patches old-line
vulnerabilities while the problem is upgrades.

#### 8.6 Channels: add `snapshot`, not `next` / `maintenance`

| Channel | Command | For whom | Now |
| --- | --- | --- | --- |
| `latest` | exists | everyone | keep |
| `snapshot` | `npm dist-tag add signoff-cli@<ver> snapshot` | internal mirrors, teams following the newest green build | can add, no branch cost |
| `next` | prerelease channel | teams wanting early verification | when someone asks |
| `maintenance` | security fixes on an old minor | teams pinned to an old version | after A + B |

One thing to be explicit about: a dist-tag is mutable, so `signoff-cli@snapshot` is not a reproducible coordinate. A
cluster that needs reproducibility should pin the exact version plus `integrity`, e.g.
`npm i signoff-cli@4.6.2 --save-exact`, then mirror the tarball and its hash into an internal registry. `snapshot` tells
you which version to pin; it does not replace pinning.

#### 8.7 If it is ever paid, branches turn into an asset

| Shape | Relation to branches | Recovers its cost |
| --- | --- | --- |
| Free `latest` | no branch needed | — |
| Free `snapshot` | no branch needed, only a release routine | — |
| Paid "pinned version + 12 months of fixes" | **requires a maintenance line** | yes: the contract term is the commitment |
| Paid hosted board | no branch needed, needs a server | unrelated to branches |

This is the only shape where a branch pays for itself, and it is where condition C in 8.8 comes from.

#### 8.8 Revised triggers

| Condition | Threshold | What to do |
| --- | --- | --- |
| A usage | an old minor above 30% of downloads for four weeks | fix the upgrade path (the three items in 8.4), no branch |
| A + B | that old line has a security or data issue that must be fixed | open a maintenance branch and pay the cost in 8.5 |
| C commercial | a paying customer asks for "pinned version + fix window" | open the branch and put the promise in the contract |
| D security event | one high-severity issue needing fixes on two lines | fix both by hand first, then decide whether to formalise |

#### 8.9 Reproducing

The 4.7.0 rollback removed `tools/release-cadence.mjs`; the script itself is still in history:
`git show d7cee80:tools/release-cadence.mjs > tools/release-cadence.mjs`.
Without it, `curl https://api.npmjs.org/versions/signoff-cli/last-week` and aggregate by minor.

<!-- EN-END -->
