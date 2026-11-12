## Unreleased

### 界面：金额带词、版面有据可查

- 侧栏任务行的金额从裸 `$0.02` 改成 `费用 $0.02`（英文 `cost $0.02`）；看板上的每一处金额同样先出词再出数，
  `class="cost"` 的可见文本一律形如 `费用 $…`。
- 看板的「花费」表头统一成「费用」，与行内标签同一个词；中文小节标题不再被 `text-transform: uppercase`
  拉成「TOKEN 与费用」。
- 新增 `docs/DESIGN.md`：间距、字号、状态色、文案口径，以及提交前要自问的三句。
- 新增 `node tools/ui-shot.js`：用本机常驻浏览器给看板出图（`docs/ui/board-{zh,en}.png`），改版面先看图。
- 新增 `jsconfig.json` + `npm run typecheck`（`typescript` / `@types/node` 只在开发时用，运行时依赖仍是零）。


- 新：看板加「Token 与费用」——累计 token、金额、按天、每组任务、每条提交的 agent 花费；
  `signoff tokens` 在终端问同一件事（`--json` / `--md`）。数据取自本机 DSH 会话记录里的
  `assistant/message.usage`（只读，不含外链、不发请求），金额按 DeepSeek 官方峰/谷价估算，
  `.signoff/prices.json` 可覆盖价格。读不到会话记录时这一块写明原因而不是显示 0；
  闸门本身不消耗 token，文案说的始终是「产出提交的 agent 花费」。新增契约条款 C12（契约版本 2）。

- 修（看板自相矛盾）：任务组原来显示全期的「N 次提交 · 过闸 M」，百分比却按安装点以来的窗口算，
  于是同一句里 17/19 的分子分母与那个百分比对不上。现在三个数字取同一个窗口：窗口与全期不同时写作
  「安装点以来 N 次提交 · 过闸 M · 过闸率 X% · 全期 N 次提交 · 过闸 M」，看板照抄的这行不再自相矛盾。

- 修：`fix` 回滚会删掉补丁自己新建、但被 `.gitignore` 挡住的文件（`git clean -fd` 不碰它们，
  留下就是半回滚，下一次 fix 会把残留当基线）；只删打补丁前不存在的路径，用户原有的未跟踪/
  被忽略文件不动，空出来的父目录才收。
- 修：`patterns` 不再把 `fix`/`dispute`/`review` 的「没通过」算成门失败——回滚、被推翻、被拒
  都是正确结果，现在记作 `tool:<name>`，`gate:<name>` 只留给真正的判定门。

- 修（P0，静默放行三处）：`integrity`、`review`、`fix` 原来都拿正则去啃 git 的人类可读输出，
  路径含中文/空格时被 `core.quotepath` 转义成八进制，匹配不上就被当成"没有改动"——删掉
  `tests/测试.test.js` 的断言仍判 clean，中文名 diff 被说成 `nothing to review`，`Lib/P1.js`
  能覆盖 `lib/p1.js`。现统一走 `git -z`（`core.gitNameStatus` / `gitNameOnly`），黑名单先归一
  大小写与分隔符，并把 `dispute`/`review`/`patterns`/`detect`/`runslog`/`package.json` 及锁文件
  一并列入判定路径；只有 signoff-cli 自己的仓库才把整个 `lib/` 当判定路径。
- 修：`dispute` 不再把拼错的命令当证据（命令解析不到记 not-run，不计 pass/fail、不写记录，退出 2；
  判断不靠 stderr 文本，cp936 下 cmd.exe 的提示是乱码），`--budget` 现在带 timeout 与 SIGKILL。
- 修：`integrity` 的 base 默认改成 `HEAD`，只判这次要提交的内容；之前用 merge-base/`HEAD~1`，
  一个合法删断言的提交会让它之后每次提交都红。
- 修：`SIGNOFF_ENGINE=python` 跑 p1 时补判一次 `integrity`——python 参考门里没有反作弊，换引擎
  不该等于换一套判据。
- 修：`uninstall` 收走新增状态（`reviews.jsonl`、`fix-log.jsonl`、`cache/`、`disputes/`），`--all`
  连 `integrity-allow.json` 一起删并报出豁免条数，剩下的每一件都在 `kept:` 里点名。
- 修：`doctor` 新增 `integrity-allow` 检查，写坏的豁免不再被静默吞成空数组。
- 修：`fix` 认引号+八进制转义的补丁路径、重命名两侧、`--scope` 的反斜杠与 `.`，`git apply`
  因 CRLF 失败时按 `--ignore-whitespace` 重试并明说换行不一致。
- 修：`review` 的存证落仓库根（子目录 review 也能在根 `--verify`），哈希前抹掉 `index` 行，
  CRLF 被提交进库不再让存证失效。
- 文档：README（中英）、`docs/gates.md`（中英）、`integrations/skill/SKILL.md` 补上
  `review`/`fix`/`dispute`/`patterns`；MCP 新增 `signoff_review`、`signoff_fix`（仅 `--check`
  预览）、`signoff_dispute`、`signoff_patterns` 四个工具。

本机自用，未发布。以下五项只在本仓库检出里生效，
pm 上的 latest 仍是 4.7.1。

- **p1 反作弊**：与新基线比对，抓「测试被改软」——新增 skip/only、断言被删、阈值被改小；判定路径
  之外允许声明式豁免（.signoff/integrity-allow.json，理由至少 20 字）。
- **signoff fix**：只仲裁补丁能不能留。基线必须红、补丁限在 --scope、判定路径不许被它改、
  改完必须红转绿且反作弊 clean 且无补丁之外的改动，否则整单回滚；判定写 .signoff/fix-log.jsonl。
- **signoff dispute**：同一复现步骤重复跑。全过=成立(0)，全不过=推翻(1)，时好时坏=不定(3)；
  证据含每次退出码、耗时、stdout 摘要与环境指纹，--replay 可复核。
- **signoff review**：把评审绑到 diff 哈希，改一字节即失效；--verify 校验「审过的=要发的」。
  --by/--model 是自述，工具只保证绑定关系。
- **signoff patterns**：读 runs.log 与账本，把「同一处反复红」聚成模式并排序；--md 导出。

## 4.7.1

**声明退后，验证上前。**

- 发布走 CI：新增 `.github/workflows/publish.yml`，tag 触发、`id-token: write`、`npm publish --provenance`，
  发布前硬校验 tag 等于 `package.json` 版本；`publishConfig.provenance` 打开，本地裸发布会被拒。
- 发布闸门补三处：`--pre` 增 `changelog-version`、`citation-version`，`--post` 增 `git-tag`。版本号写在四份
  文档里就必须四处一致，从此不靠人记。
- 声明去重：README 不再复制 © 行，只指向 `NOTICE` 与 `TRADEMARK.md`；`©` 只剩两处同步点（`LICENSE`、
  `NOTICE`）。标志去掉边款——128px 下字高只有 2.73px，读不出的东西不留在图里。
- 新增 `TRADEMARK.md`（能说什么、不能做什么、标志授权、未注册的事实）与 `docs/verify-release.md`
  （provenance、integrity、tag 一致性，附处置表）。
- 供应链收紧：第三方 actions 钉到 commit SHA、CI 不再执行 `@latest`、mcp-publisher 下载加 sha256、
  `ci`/`signoff` 收窄为只读 token、补 `CODEOWNERS` 与 `dependabot`。
- 元数据回真：`CITATION.cff` 从 4.3.1 回到本版、`ARCH-HEALTH` 版本、pre-commit 的包名与 rev、
  `action.yml` 默认版本不再浮动在 `latest`。
- 包体瘦身：`files` 加 `!docs/diagrams/`，4.3MB 文档配图与 `test/` 不再进包。
- npm 侧：4.7.0 已 `deprecate`（无 tag、无 changelog、代码已回滚），本版取 4.7.1 以高于它并成为 `latest`。
- 自测 491 passed / 0 failed。

### English

**Declarations step back; verification steps forward.**

- Publishing moves to CI: a new `.github/workflows/publish.yml` runs on tags with `id-token: write` and
  `npm publish --provenance`, failing hard unless the tag equals the `package.json` version.
  `publishConfig.provenance` is on, so a bare local publish is refused.
- Three new release gates: `changelog-version` and `citation-version` in `--pre`, `git-tag` in `--post`.
  A version named in four documents must now agree in all four.
- Declarations deduplicated: the READMEs no longer copy the copyright line and point at `NOTICE` and
  `TRADEMARK.md` instead; `©` has exactly two places to keep in sync (`LICENSE`, `NOTICE`). The mark
  lost its side-inscription: at 128px it was 2.73px tall, so nothing readable was lost.
- New `TRADEMARK.md` (what others may say, must not do, logo permission, the unregistered fact) and
  `docs/verify-release.md` (provenance, integrity, tag agreement, with a disposition table).
- Supply chain tightened: third-party actions pinned to commit SHAs, no `@latest` in CI, sha256 check
  on the mcp-publisher download, read-only default token in `ci`/`signoff`, plus `CODEOWNERS` and
  `dependabot`.
- Metadata corrected: `CITATION.cff` moves from 4.3.1 to this version, `ARCH-HEALTH` version,
  the pre-commit package name and rev, and `action.yml` no longer floats on `latest`.
- Smaller package: `!docs/diagrams/` keeps 4.3MB of documentation images and `test/` out of the tarball.
- npm side: 4.7.0 is deprecated (no tag, no changelog, reverted); this release is 4.7.1 to sit above it
  and become `latest`.
- 491 passed / 0 failed.

## 4.6.2

**把首行徽章放回去（含 CI 状态）。**

- 4.5.0 重写 README 时丢了首行的五枚徽章：npm 版本、周下载、Node 版本、**CI 状态**、许可。
  现在中英两个 README 都把徽章放在标题正下方，并加了自测断言——少一枚就红，不会再被一次改写带走。
- 自测 459 passed / 0 failed（新增十枚徽章断言）。判定逻辑没动。

### English

**The badge row is back, CI status included.**

- The 4.5.0 README rewrite dropped the five badges on the first line: npm version, weekly downloads, Node version,
  **CI status** and license. Both READMEs now carry them directly under the title, and a self-test assertion fails if
  any is missing, so another rewrite cannot take them away silently.
- 459 passed / 0 failed (ten new badge assertions). Verdict logic untouched.

## 4.6.1

**修一个只在 CI 上暴露的回归：中英同步把 CRLF 检出误判成「没同步」。**

- 4.6.0 引入的 `tools/sync-bilingual.mjs` 假设 `\n` 行尾。Windows runner 的 `core.autocrlf=true` 会把仓库检出成 CRLF，
  于是自测报 `README.md out of sync`，三个矩阵任务全红（本机因为文件本来就是 LF 而没暴露）。
  现在比较与写入都与行尾无关：CRLF 检出照常通过，写回时保持该文件原有行尾，不产生 `\r\r\n`。
- 新增 `.gitattributes`（`* text=auto eol=lf`，图片与压缩包标 binary），仓库不再随检出机器的行尾设置变形。
- 自测仍是 449 passed / 0 failed；另外用「把 README 转成 CRLF 再跑 `--check`」复现并验证了这次修复。

### English

**Fixes a regression that only showed up on CI: the bilingual sync treated a CRLF checkout as out of sync.**

- The `tools/sync-bilingual.mjs` added in 4.6.0 assumed `\n` line endings. A Windows runner with
  `core.autocrlf=true` checks the repo out with CRLF, so the self-test reported `README.md out of sync` and all three
  matrix jobs went red (locally the files were already LF, so it never showed). Comparison and writing are now
  line-ending agnostic: a CRLF checkout passes, writing keeps the file's existing endings, and no `\r\r\n` is produced.
- New `.gitattributes` (`* text=auto eol=lf`, binaries marked) so the repository no longer changes shape with the
  checkout machine's line-ending settings.
- Still 449 passed / 0 failed, and the fix was reproduced by converting the README to CRLF and running `--check`.

## 4.6.0

**说明文档中英同页、两张图回到原位；许可与法律声明按全球适用范围做了脱敏；发行与商业化有了可核对的论证。**

- **中英同页**：`README.md` 与六篇 `docs/*.md` 在中文正文之后，原样嵌入对应 `.en.md` 全文（标题降一级，`## English` 一节），
  仍保留开头的 `English: ….en.md` 指路。英文正文只有一个源头（`.en.md`），由 `tools/sync-bilingual.mjs` 同步，
  自测用 `--check` 防止两边漂移。
- **图回到原位**：架构图 `signoff-1-capability.png` 回到「七道关」一节，工作原理图 `signoff-4-flow.png` 回到「看板」一节；
  英文侧用 `-en.png` 孪生件。`docs/diagrams/README.md` 补上 flow / competitors 两行与英文产物说明。
- **许可与法律**：`LICENSE` 著作权人改为 `SignOff contributors`（不写个人姓名与邮箱）；新增 `NOTICE`（名字与图标不随 MIT 授权、
  第三方商标不背书、本机无遥测、按现状提供）；新增 `docs/legal.md` 与英文版，写清 MIT 覆盖什么、不覆盖什么、
  隐私与数据留在本机、使用者侧的出口管制/行业合规、贡献与管辖口径。`SECURITY.md` 去掉个人邮箱，改走 GitHub 私密通道。
- **发行与商业化论证**：新增 `docs/release-model.md`，用可核对的数字（npm 月下载 3 237、零运行时依赖、免费钩子层同行）
  论证团队协作与 AI 集群两类需求、为什么判定本身没有定价空间、如果收费只有「托管看板」与「团队合规包」两种形态，
  以及重新评估的两个触发条件（周下载连续四周 >5 000、三家以上组织提出采购或 SLA）。
- 自测 449 passed / 0 failed：新增中英同页、图在位、许可与 NOTICE、法律与发行文档五类断言。
- 判定逻辑没动。

### English

**Docs are bilingual on one page, both diagrams are back in place, the license and legal notice are de-identified for
worldwide use, and the release/commercial model now has a checkable argument.**

- **Bilingual on one page**: `README.md` and six `docs/*.md` files now carry the full English text (from the matching
  `.en.md`, headings demoted, under a `## English` section) right after the Chinese body, while the leading
  `English: ….en.md` pointer stays. The English text has a single source (`.en.md`), synced by
  `tools/sync-bilingual.mjs`, and a self-test (`--check`) prevents drift.
- **Diagrams restored**: the architecture image `signoff-1-capability.png` is back in the gates section and the
  workflow image `signoff-4-flow.png` back in the board section, with the `-en.png` twins on the English side.
  `docs/diagrams/README.md` now lists the flow and competitors images and their English twins.
- **License and legal**: `LICENSE` names `SignOff contributors` instead of a person; a new `NOTICE` states that the
  name and icons are not part of the MIT grant, that third-party marks imply no endorsement, that the tool runs
  locally with no telemetry, and that it is provided as is. `docs/legal.md` (with an English twin) covers what MIT
  does and does not cover, privacy, user-side export-control and sector compliance, contributions, and jurisdiction.
  `SECURITY.md` drops the personal mailbox in favour of the GitHub private channel.
- **Release and commercial model**: new `docs/release-model.md` argues, with checkable numbers (3,237 monthly npm
  downloads, zero runtime dependencies, free hook-layer peers), why teams and AI clusters have a need but the verdict
  itself has no pricing power, that only a hosted board and a team compliance pack are defensible paid shapes, and what
  would trigger a re-evaluation (weekly downloads above 5,000 for four weeks; three or more organisations asking for
  procurement or an SLA).
- 449 passed / 0 failed, with new assertions for bilingual pages, diagram placement, license and NOTICE, and the legal
  and release documents.
- Verdict logic untouched.

## 4.5.0

**看板一页看全，剩下点开；对外说明重排成中英同构的七段。**

- **DSH 面板**：一个仓库一张卡，列一页数据（判决、过闸率、提交数、组任务数、最近一次跑闸、七关徽章、组任务行），
  挡路项最多 3 行、组任务补满到 9 行；**只有还没画完时才出现「打开完整页面（还有 N 组）」**，装得下就不显示按钮。
  只读：不跑关、不写状态、不改阈值；文案跟浏览器语言。面板 1.1.0。
- **说明文档重排**：`README.md` 与新 `README.en.md` 同为七段（上手 / 七关 / 看板 / 接入 / 匿名对照 / 边界 / 索引）；
  `docs/gates.md`、`docs/integrations.md`、`docs/trust.md` 按同一骨架重写，各有一份 `.en.md` 孪生件。
- **删掉过时内容**：`docs/release-notes-4.4.0.md`（CHANGELOG 里已有对应条目）、`docs/metrics-sample.md`（一次性数据样板）、
  `docs/threat-model.md`（并入 `docs/trust.md`）；`gates.md` 里早已不存在的 `gates/*.py` 路径改成 `lib/p*.js`。
- **修掉会把人带沟里的说明**：`SKILL.md` 教的 `signoff run` 不存在（改为 `signoff guard` / `signoff all`）；
  MCP 的 `signoff_run` 工具原本转发给 `signoff run`，现在转发 `signoff guard`（`full: true` → `--full`）。
- 自测 432 passed / 0 failed：新增面板浅渲染（`test/panel-smoke.js`）、文档英文孪生件、相对链接零断链、
  SKILL/MCP 口径四类断言。
- 判定逻辑没动。

### English

**The board fits one page and only then offers more; the published docs are regrouped into the same seven sections
in both languages.**

- **DSH panel**: one card per repository, one page of data (verdict, pass rate, commits, task groups, last gate run,
  seven gate badges, task rows). Blockers take at most 3 rows and task rows fill up to 9; **"Open full page (N more)"
  appears only when something is left over**. Read-only: runs no gate, writes no state, changes no threshold; text
  follows the browser language. Panel 1.1.0.
- **Docs regrouped**: `README.md` and the new `README.en.md` share seven sections (start / gates / board /
  integrations / anonymous comparison / limits / index); `docs/gates.md`, `docs/integrations.md` and
  `docs/trust.md` were rewritten on the same skeleton, each with an `.en.md` twin.
- **Stale material removed**: `docs/release-notes-4.4.0.md` (the CHANGELOG has the same entry), `docs/metrics-sample.md`
  (one-off sample), `docs/threat-model.md` (merged into `docs/trust.md`); the long-gone `gates/*.py` paths in
  `gates.md` now point at `lib/p*.js`.
- **Fixed instructions that led people astray**: `SKILL.md` taught `signoff run`, which does not exist (now
  `signoff guard` / `signoff all`); the MCP `signoff_run` tool forwarded to `signoff run` and now forwards to
  `signoff guard` (`full: true` → `--full`).
- 432 passed / 0 failed, with new assertions for the panel smoke render (`test/panel-smoke.js`), English twins,
  zero broken relative links, and the SKILL/MCP wording.
- Verdict logic untouched.

## 4.4.5

**看板按项目名说话：最近一次跑闸、按任务都写成「SignOff 项目更新 4.4.x 版」。**

- `report --json` 新增顶层 `project`；每组任务新增 `label`：组内最新提交标题里有 `x.y.z` 时写
  「<项目> 项目更新 <版本> 版」（英文页写 `<project> project update <version>`），没有版本时写「<项目> · <区域>」。
- 「最近一次跑闸」这个 mark 的 `label` 同样按项目名，`detail` 变成「最近一次跑闸 · 全过 · 0.61s」。
- 项目名解析：`.signoff/config.json` 的 `project` → `package.json` 的 `productName` / `displayName` / `name`
  → 仓库目录名，再去掉 `@scope/` 与 `-cli|-app|-mcp|-server` 后缀；本仓库加 `productName: "SignOff"`。
- `label` 只做展示：`id`、`title`、`--task` 的筛选语义不变，原始区域名仍在 `title` 与页面 meta 里。
- 契约新增 C11（任务与跑闸按项目名说话）；自测 420 passed / 0 failed，新增 4 条断言。
- 判定逻辑没动。

### English

**The board speaks in project names: the last gate run and every task group now read "SignOff project update 4.4.x".**

- `report --json` gains a top-level `project`, and every task group gains a `label`: when the newest commit subject
  in the group contains `x.y.z` it becomes `<project> project update <version>` (Chinese: `<项目> 项目更新 <版本> 版`),
  otherwise `<project> · <area>`.
- The "last gate run" mark is labelled the same way, and its detail reads "最近一次跑闸 · 全过 · 0.61s".
- Project name resolution: `.signoff/config.json` `project` → `package.json` `productName` / `displayName` / `name`
  → repository directory name, then strip `@scope/` and `-cli|-app|-mcp|-server`; this repo now sets
  `productName: "SignOff"`.
- `label` is display-only: `id`, `title` and `--task` filtering keep their meaning, and the original area name stays
  in `title` and in the page meta.
- Contract clause C11 added; `npm test` 420 passed / 0 failed with four new assertions.
- Verdict logic untouched.

## 4.4.4

**修 `tools/arch-health.mjs`：Windows 上四条规则一直是空转，Linux CI 却红在第一个环上。**

- `listJs()` 在 Windows 返回 `lib\\report.js`，`requiresOf()` 返回 `lib/report.js`，两边对不上，依赖图整张是空的：
  本机永远"0 违规、38/40"，CI（Linux）第一次真跑就抛 `comp.join is not a function`。现在两边都规范成 `/`。
- `requiresOf()` 只认顶层 require。写在函数体里的 require 是惰性的，不构成模块初始化期的环；
  以前把 `bootstrap.js → guard.js`、`checkpoint.js → p4.js` 这类懒加载判成 R1 环，属于误报。
- `cycles()` 的返回值是"分量数组的数组"，原来 `for (const [comp] of …)` 把分量拆碎，遇到环就崩；改成整份取用。
- 基线 `docs/arch-health-baseline.json` 的键同样是反斜杠，导致两个超限文件一直被当成"新增"；键已统一成 `/`。
- 新增 3 条自测（退出码、路径分隔符、不把懒加载判成环），`npm test` 416 passed / 0 failed。
- 判定逻辑没动。

### English

**Fixes `tools/arch-health.mjs`: on Windows all four rules were no-ops, while Linux CI went red on the first cycle.**

- `listJs()` returned `lib\\report.js` on Windows while `requiresOf()` returned `lib/report.js`, so the dependency
  graph was empty: locally it always said "0 violations, 38/40", and CI (Linux) crashed with
  `comp.join is not a function` on its first real run. Both sides now normalise to `/`.
- `requiresOf()` only counts top-level requires. A require inside a function body is lazy and cannot form a
  module-initialisation cycle; previously `bootstrap.js → guard.js` and `checkpoint.js → p4.js` were reported as R1.
- `cycles()` returns an array of components; `for (const [comp] of …)` split each component apart and crashed on the
  first cycle. It now takes the component whole.
- The keys in `docs/arch-health-baseline.json` had the same backslash problem, so the two oversize files were always
  treated as new; they are normalised too.
- Three new self-tests (exit code, path separators, lazy requires are not cycles): `npm test` 416 passed / 0 failed.
- Verdict logic untouched.

## 4.4.3

**匿名再收紧：对比表与象限图只剩编号，能反推到具体项目的信息都删掉。**

- 4.4.2 只把名字换成了 B1/B2/B3，但表里还写着"Node 钩子安装器""Python 钩子框架""Go 钩子运行器"、每家精确周下载，
  象限图的点也带着同样后缀——这些足够反推出具体项目，等于没匿名。
- 现在：对比表只剩"给判决 / 留证据 / 采用量级"三列，量级只写"千万级/周以上"；象限图四个点只标 `B1` `B2` `B3` `C`；
  每格理由里的"单二进制""跨语言"这类实现描述一并删掉。
- README 与两份对比文档里的象限图链接加 `?v=4.4.3`：GitHub 的图片代理会缓存旧图，不换 URL 看到的还是旧版。
- 行为无变化：判定、退出码 0/1/2、账本与页面结构都没动。

### English

**Anonymity, properly: the comparison table and quadrant keep only labels — anything traceable to a specific
project is gone.**

- 4.4.2 swapped names for B1/B2/B3 but still said "Node hook installer", "Python hook framework", "Go hook
  runner" and listed each peer's exact weekly downloads; the quadrant points carried the same suffixes. That is
  enough to identify every one of them, which defeats the point.
- Now: the table has three columns — verdict, evidence, adoption magnitude ("tens of millions/week or more"); the
  four quadrant points are labelled `B1` `B2` `B3` `C`; implementation details such as "single binary" and
  "cross-language" are removed from the per-cell reasoning.
- The quadrant links in the README and both comparison docs now carry `?v=4.4.3`, because GitHub's image proxy
  caches the old file under the old URL.
- No behaviour change: verdicts, exit codes, ledger format and page structure are untouched.

## 4.4.2

**对比一律匿名：同行只说类型（A–F），不点名、不列对方的星标与下载数。**

- 同一套匿名标记贯穿全部对外文字：A 平台级、B 钩子层（B1/B2/B3）、C 密钥扫描、D 文本规则、E 供应链证明、
  F 覆盖率。`docs/COMPARISON.md`、`COMPARISON.en.md`、README 第八节、`docs/trust.md`、`docs/promotion.md`
  全部改用这套标记；采用规模只留量级（"数千万/周""数万 star 级"），不再逐家列数字。
- 象限图重画：`docs/diagrams/src/quadrant.mmd` 的四个点改成 B1/B2/B3/C；`signoff-3-user*.mmd` 里
  "仓库已有 husky 等钩子"改成"已装别人的钩子（B1 类安装器）"。
- 规则写进 `docs/prerequisites.md` 与 `docs/COMPARISON.md` 开头，以后新写的对比照此办理。
  例外只留给机械标识：`--engine gitleaks` 这类命令行取值、`.pre-commit-config.yaml` 这类文件名，
  以及"怎么和已有钩子共存"的操作步骤。
- 行为无变化：判定、退出码 0/1/2、账本格式、页面结构都没动。

### English

**Comparisons are anonymous from here on: peers are labelled by type (A–F), with no vendor names and no
per-peer star or download figures.**

- One label scheme across every outward-facing text: A platform, B hooks (B1/B2/B3), C secret scan, D prose rules,
  E supply chain, F coverage. `docs/COMPARISON.md`, `COMPARISON.en.md`, section 8 of the README, `docs/trust.md`
  and `docs/promotion.md` all use it; adoption is stated as a magnitude ("tens of millions/week") instead of a
  per-vendor table.
- Redrawn quadrant: the four points in `docs/diagrams/src/quadrant.mmd` are now B1/B2/B3/C, and
  `signoff-3-user*.mmd` says "another hook layer (a B1-style installer)" instead of naming one.
- The rule is recorded in `docs/prerequisites.md` and at the top of `docs/COMPARISON.md`; future comparisons
  follow it. The only exceptions are mechanical identifiers: CLI values such as `--engine gitleaks`, file names
  such as `.pre-commit-config.yaml`, and the how-to steps for coexisting with an existing hook.
- No behaviour change: verdicts, exit codes, ledger format and page structure are untouched.

## 4.4.1

**只改文档：把 4.4.0 的对比与象限说明带进 npm 页面。判定逻辑与代码未改。**

- 新增 `docs/COMPARISON.md` / `docs/COMPARISON.en.md`：六个维度打分、竞品真实星标与周下载、象限读法、场景边界。
- 新增 `docs/diagrams/src/{quadrant,before-after}.mmd` 与渲染图；README 第八节引用象限图。
- 版本号推进的原因：npm 页面展示的是**发布时刻**的 README，4.4.0 发布早于这批文档，需要一次内容同步。
- 实测：`npm test` 413 passed、`signoff p5` PASS、`release --pre` 14/14、`release --post` 17/17。

### English

**Documentation only: bring the 4.4.0 comparison and quadrant notes onto the npm page. No code or verdict change.**

- Adds `docs/COMPARISON.md` and `COMPARISON.en.md` (six scored dimensions, real stars and weekly downloads,
  quadrant reading, fit and non-fit), plus Mermaid sources and rendered diagrams.
- The version bump exists because npm renders the README as of the publish moment; 4.4.0 shipped before these docs.

## 4.4.0

**接口与自治理：下游字段契约、架构体检、威胁模型、贡献度量化。判定逻辑未变。**

- 新增 `signoff report --schema`（`docs/report.schema.v1.json`）：字段分 `stable` / `additive` / `experimental` 三级，
  下游可机器校验；`docs/INTEGRATION-CONTRACT.md` 写明三个出口与上下游红线。
- 新增 `tools/arch-health.mjs` + `docs/arch-health-baseline.json`：无环、基座不反向依赖、不向上依赖入口、
  超限必须登记；只挡基线之外的新增，退出码 1。
- 新增 `tools/signoff-metrics.mjs` + `docs/metrics-sample.md`：翻案率、返工轮次、跳过率实测
  （dsh-signoff 61 次提交 / 74 次跑闸 / 7 次红 / 翻案率 42.9% / 返工 2.33 轮）。
- 新增 `SECURITY.md`（审计状态=未通过第三方审计、披露渠道、响应时限）、`docs/trust.md`
  （A1–A7 攻击与测试位置、4 条非目标、9 项审计就绪清单）、`docs/deletion.md`（D1–D4）。
- README 顶部：徽章、60 秒验证、GitHub Action / pre-commit / MCP 三种接法；`files[]` 加 `SECURITY.md`、`CITATION.cff`。
- 行为不变：五关判定、退出码语义（0/1/2）、钩子与账本格式均未改。

### English

**Interfaces and self-governance: a downstream field contract, architecture health, threat model, and
value metrics. No change to the verdict logic.**

- `signoff report --schema` publishes `docs/report.schema.v1.json` with per-field stability levels;
  `docs/INTEGRATION-CONTRACT.md` defines the three read-only outlets and the upstream/downstream red lines.
- `tools/arch-health.mjs` checks cycles, base-module direction, upward imports and oversized files;
  it fails only on regressions against a registered baseline.
- `tools/signoff-metrics.mjs` quantifies what an invisible tool actually caught (flip rate, rework rounds, skip rate).
- `SECURITY.md`, `docs/trust.md` (A1–A7, non-goals, audit-ready checklist) and `docs/deletion.md`.
- Unchanged: the five gates, the exit-code semantics (0/1/2), the hooks and the ledger format.

## 4.3.1

**修 4.3.0 在英文系统里自测变红。**

- 4.3.0 的页面语言默认跟随系统，而自测里大量断言写的是中文页面；CI（`LANG=en_US.UTF-8`）与任何英文
  系统上 `node test/selftest.js` 因此失败。测试现在把 `SIGNOFF_LANG=zh` 固定进子进程环境，断言与系统语言无关；
  `--lang` 的两条用例仍然显式传 `--lang en` / `--lang de` 覆盖它。
- 行为没有变化：页面默认仍跟随系统语言。

### English

**Fixes 4.3.0 turning its own suite red on an English system.**

- Since 4.3.0 the page follows the system language, while the suite asserts on Chinese page text. On CI
  (`LANG=en_US.UTF-8`) and on any English machine, `node test/selftest.js` therefore failed. The subprocess
  environment now pins `SIGNOFF_LANG=zh`, so the assertions no longer depend on the host locale; the two `--lang`
  cases still pass `--lang en` / `--lang de` explicitly and override it.
- No behaviour change: the page still follows the system language by default.

## 4.3.0

**看板说两种语言：`--lang zh|en|auto`，默认跟随系统。**

- `signoff report` 新增 `--lang`（`zh` / `en` / `auto`）。`auto` 依次看 `SIGNOFF_LANG`、`LC_ALL`/`LC_MESSAGES`/`LANG`、
  系统区域（`Intl`），都没有就中文；未知值报用法错（退出码 2），不悄悄给中文。
- 页面里每一句面向读者的话都走 `lib/i18n.js`：标题、判定、七关详情、阻塞项、月历、任务、守卫体检、页脚。
  中文输出与 4.2.3 逐字节一致（时间戳与未提交数除外）——翻译是加了一层，不是另起一版。
- DSH 侧栏面板按窗口语言切：`integrations/dsh-panel/client.js` 内置中英两份文案，不依赖宿主接口。
- 自测 +8：`--lang en` 出 `<html lang="en">` 且页脚为英文、`--lang zh` 保持中文、`--lang de` 退出码 2、
  **每个 `T("…")` 都必须在词表里有英文**（漏翻即红）。`npm test` 413 passed / 0 failed。

### English

**The board speaks two languages: `--lang zh|en|auto`, following the system by default.**

- `signoff report` gains `--lang` (`zh` / `en` / `auto`). `auto` reads `SIGNOFF_LANG`, then `LC_ALL`/`LC_MESSAGES`/`LANG`,
  then the system locale (`Intl`), and falls back to Chinese; an unknown value is a usage error (exit 2) instead of a
  silent fallback.
- Every reader-facing string goes through `lib/i18n.js`: headline, verdict, the seven gate details, blockers, calendar,
  tasks, guard health, footer. Chinese output stays byte-identical to 4.2.3 (bar timestamps and the dirty count) —
  this adds a layer rather than forking the page.
- The DSH side panel switches on the window language: `integrations/dsh-panel/client.js` carries both tables and needs
  no host API.
- Seven new self-tests: `--lang en` yields `<html lang="en">` with an English footer, `--lang zh` stays Chinese,
  `--lang de` exits 2, and **every `T("…")` must have an English entry** (a missed translation turns the suite red).
  `npm test` 413 passed / 0 failed.

## 4.2.3

**`release --post` 不再把同一个仓库的两种写法判成两个仓库。**

- `lib/release.js`：`server-repo` 改成按「目标」比较（去 `git+` 前缀、`.git` 后缀、尾部斜杠，忽略大小写）。
  以前 npm 把 `package.json` 规范成 `git+https://….git`、而 `server.json` 写给人看的 `https://…`，
  一条完全正常的发布也会被判 FAIL。
- 顺带把 npm 发布时规范化的 `package.json`（`repository.type` 与 `git+…git` 写法）收进仓库，
  以后发布不再留下工作区改动。
- 自测 +2（两种写法算同一个仓库、不同仓库仍然不同）：`npm test` 406 passed / 0 failed，
  `signoff release --post` 17/17。

### English

**`release --post` no longer mistakes one repository for two.**

- `lib/release.js`: `server-repo` now compares targets rather than spellings — it drops a leading `git+`,
  a trailing `.git` and any trailing slash, and ignores case. npm normalises `package.json` to
  `git+https://….git` while `server.json` carries the human form `https://…`, and that mismatch used to
  fail a perfectly good release.
- The `package.json` that npm normalises during publish (`repository.type`, the `git+…git` form) is now
  committed, so a publish no longer leaves the working tree dirty.
- Two new self-tests (the two spellings are one repo, different repos still differ): `npm test`
  406 passed / 0 failed, `signoff release --post` 17/17.

## 4.2.2

**判定不再说「能不能发」，直接说哪几项没过；p2 那片红也一并修掉了。**

- 措辞：页面标题、DSH 面板徽章、`report --json` 的 `headline` 统一成 `1 项未过：覆盖率` /
  `1 项没跑过：危险动作` / `7 项全过`。「现在不能发 / 可以发」读起来像在征求许可，底下的事实只是
  「七项闸门里有几项是红的」，说不清是哪一项。
- p2 覆盖率：仓库补了 `verify/scenarios/` 四张场景卡（report-page / report-mount / gates-exit-codes /
  release-surface，共 25 条断言），`signoff p2` 现在是 `scenario` 级、`PASS apps=1 scenario=1 assertions=25`。
- 自测守住场景卡不注水：卡里点名的每个断言，必须在 `test/selftest.js` 里真实存在，否则自测变红。
- p2 的修复提示不再硬编码 `--min-scenario 3`（单应用仓库永远够不到 3）：场景为 0 时提示
  「补 verify/scenarios/*.json」，够数后按实际应用数给 `--min-scenario N`。
- `npm test` 404 passed / 0 failed。

### English

**The verdict no longer asks permission — it names the gates that are red, and p2's red is gone.**

- Wording: the page title, the DSH panel badge and `headline` in `report --json` now read
  `1 项未过：覆盖率` / `1 项没跑过：危险动作` / `7 项全过`. "Cannot ship / can ship" sounded like a
  permission question; the underlying fact is just how many of the seven gates are red — and which.
- p2 coverage: four scenario cards under `verify/scenarios/` (report-page, report-mount,
  gates-exit-codes, release-surface — 25 assertions), so `signoff p2` is `scenario` level and
  `PASS apps=1 scenario=1 assertions=25`.
- The self-test keeps the cards honest: every assertion a card names must exist as a real check in
  `test/selftest.js`, or the suite goes red.
- The p2 fix hint is no longer a hardcoded `--min-scenario 3` (a single-app repo can never reach 3):
  with zero scenarios it says "add verify/scenarios/*.json"; once there are cards it derives the
  number from the apps actually found.
- `npm test` 404 passed / 0 failed.

## 4.2.1

**修一个只在 macOS 上现身的截断：大的 `--json` 输出会丢尾巴。**

- `lib/out.js`：用 `fs.writeSync(1, …)` 分块写完再返回，不再用 `process.stdout.write` 之后立刻退出。
  macOS / Linux 的管道每次约 64 KB，进程退出不等管道排空，`signoff report --json | …` 可能收到半份文档——
  4.2.0 的 CI 就在 `macos-latest, node 20` 上报 `SyntaxError: Unexpected end of JSON input`。
  Windows 的管道是同步写的，本机看不出来。
- `report --json` 与 `report --contract` 改走这条写路径；其余小输出不动。
- 自测加两项：40 万字符的文档必须完整到达读取方；写完之后的退出码不受影响（`--gate p9` 仍是 2）。
- 看板本体（页面 / DSH 侧栏面板 / MCP）在下一条 4.2.0 里，4.2.1 是首个在这条上干净通过的版本。

### English

**Fix a truncation that only showed up on macOS: a large `--json` document could lose its tail.**

- `lib/out.js` writes through `fs.writeSync(1, …)` in chunks and returns only after the reader has taken them,
  replacing `process.stdout.write` followed by an immediate exit. A macOS / Linux pipe takes about 64 KB per
  write and the process does not wait for it to drain, so `signoff report --json | …` could arrive cut in half —
  the `SyntaxError: Unexpected end of JSON input` that 4.2.0 hit on `macos-latest, node 20`. Windows writes
  pipes synchronously, which is why the machine that built it never saw this.
- `report --json` and `report --contract` use that path; small outputs are untouched.
- Two self-tests: a 400 KB document must arrive whole, and writing it must not change the exit code
  (`--gate p9` still exits 2).
- The boards themselves (page, DSH panel, MCP) are in the 4.2.0 entry below; 4.2.1 is the first version that
  passes everywhere.

## 4.2.0

**新增 `signoff report`：一页只读看板（能不能发 + 月历 + 按任务），数据全在本地算。**

- 结论先行：一句话判定「现在能不能发 / 还有关没跑 / 可以发」，只列阻塞项与修复命令；已过的关压成一行，不再是一张要走读的关表格。
- 守卫体检：最近一次全绿（距今多少提交）、安装点以来过闸率、绕过闸门数（带名单）、守卫在位（钩子 3/3 + CI）——回答「这层守卫有没有在真的保护你」，而不是「上一次结果是什么」。
- 默认黑底：`color-scheme: dark`，正文 `#e9eaed`，过 / 红 / 待跑分别是 `#4ade80` / `#f87171` / `#fbbf24`；白底在这个场景里既刺眼又把三色压平。
- 跑闸趋势：每次跑闸往 `.signoff/runs.log` 追加一行 `{ts, gate, ok, ms}`，页面按项画出「最近 30 次」的绿红条与通过率、最近耗时——这是唯一新增的状态文件，`jsonl` 追加、坏了不影响闸。
- 每组过闸率：任务组现在带 `过闸率`，并把「工作方式本身在绕闸」的组（≥3 次提交却没有全绿）单列一行，点名 + 次数。
- 危险动作打在哪：P4 票据按目录聚类，列出记录最多、被拒最多的目录。
- 多仓库：`--repos a,b` / `--scan DIR` 一页看多个仓库，先比「谁挡住你」，再逐个展开。
- 发布项接上过闸记录：`tag` 之后每个提交都带 trailer 才算可发，detail 直接写「tag 之后 N 个提交，未走闸 M」。
- `--would-block`：只读预演当前工作树会被哪些离线关挡住（密钥 / 文档 / 覆盖率缓存），并写明哪些项必须真跑。
- `report --mount [DIR]`：把页面挂到固定位置（默认 `~/.signoff/reports`），每仓一份 `latest.html` + `report.json`，
  根目录 `index.html` / `index.json` 汇总；`--open` 用系统默认浏览器打开索引页（三平台各用自己的 opener）。
  挂载只写自己的目录，不碰被检查的仓库。
- MCP 新增 `signoff_report` 工具：任何 MCP 客户端（Claude Desktop / Cursor / Codex / DSH）零渲染拿到结论与阻塞项。
- `docs/REPORT-CONTRACT.md`：报告页的书面契约（C1…C10），配 `AGENTS.md` / `CLAUDE.md` / Copilot / Cursor 四个薄壳指针，
  以及 `signoff report --contract`（随包分发、与正文逐字节一致）；自测会校验指针存在、薄壳够薄、正文无本机路径。
- 七项而不是五关：测试 / 覆盖率 / 并发任务 / 危险动作 / 文档 / 密钥 / **发布**。发布项没有状态文件，用 `package.json`、`server.json`、`CHANGELOG.md` 与 `git tag` 现算，并标出「tag 之后还有 N 个提交」。
- 月历：有记录的日子带计数，点某天看那天的事件，默认今天，可翻月 / 回今天。
- 按任务：自动整理出全部任务组（P3 任务卡 ∪ 提交范围 `feat(report)` → `report`），默认收起，一次只展开一个。
- 查询靠参数：`--days / --since / --until / --task / --gate / --limit`；`--json` 给脚本。
- 「无标记」只在安装点之后计数：带 `Signoff-Pass:` 是过闸，带 `Signoff-Skip:` 是显式跳过，都没有就是 `--no-verify` 的形状。
- 离线单文件：内联 CSS、无外链；页内脚本只切换视图，不发请求；没有任何能通过 / 跳过 / 放宽某一关的控件。

- 看板三处落点，判定只算一处：`--mount` 的单文件页面、DSH 侧栏面板、MCP 的 `signoff_report`；
  三处读的是同一份数据，不会出现「面板说能发、页面说不能发」。
- `integrations/dsh-panel/`（随包分发）——DSH 侧栏面板：侧栏导航第 4 行「SignOff 看板」，红底白勾图标；
  点开是每个已挂载仓库的判定、阻塞项与修法、过闸率、提交数与任务组数、七项通过标记，
  右上「打开完整页面」交给系统 opener 打开该仓 `latest.html`。
- 面板数据走宿主的两个只读路由：`/signoff-board/state`（读 `~/.signoff/reports/index.json` 与各仓 `report.json`）
  与 `/signoff-board/open`（校验 slug 后交给系统浏览器）。不探测工作区路径，所以不会认错仓库。
- 面板只读：没有跑闸 / 跳过 / 改阈值的控件，与 `docs/REPORT-CONTRACT.md` 的 C2 是同一条线。
- 两个踩坑写进 `integrations/dsh-panel/README.md`：桌面端在 `/api` 上有一个 prefix 网关会接走未注册子路径
  （回 `not found`，浏览器里是 403），所以面板路由不能挂在 `/api` 下面；同进程重复注册同一 prefix 会抛
  `duplicate prefix route`，热重载时要兜住。
- `docs/SURFACES.en.md`：投递矩阵的英文对照（页面 / DSH 面板 / MCP / 终端 / CI / 编辑器）。

### English

- Three surfaces, one verdict: the single-file page from `--mount`, the DSH sidebar panel, and the
  `signoff_report` MCP tool all read the same data, so a panel can never say "ready" while the page says "blocked".
- `integrations/dsh-panel/` (shipped in the package) is the DSH sidebar panel: the fourth row of the sidebar
  navigation, "SignOff 看板", with a red seal icon. It lists every mounted repository with its verdict,
  blockers and the command that clears them, pass rate, commit and task-group counts, and the seven check marks;
  "Open full page" hands the repository's `latest.html` to the system opener.
- The host half serves two read-only routes: `/signoff-board/state` (reads `~/.signoff/reports/index.json` plus
  each repository's `report.json`) and `/signoff-board/open` (validates the slug, then opens the page).
  It never guesses a workspace path, so it cannot point at the wrong repository.
- Read-only by construction: no control can run a gate, skip one, or relax a threshold — the same line as C2 in
  `docs/REPORT-CONTRACT.md`.
- Two traps are documented in `integrations/dsh-panel/README.md`: the desktop build registers a prefix route on
  `/api` that answers `not found` for anything it does not know (browsers get 403), so the panel route must live
  outside `/api`; and registering the same prefix twice in one process throws `duplicate prefix route`, which a
  hot reload has to tolerate.
- `docs/SURFACES.en.md`: the English counterpart of the delivery matrix (page, DSH panel, MCP, terminal, CI, editor).

## 4.1.10

**把 4.1.9 漏发的两件东西补进发布物：幽灵版本检查与退休工作流。**

- `release --post` 的 `registry-versions-exist`、`.github/workflows/mcp-registry-retire.yml`、
  以及对应自测断言只在仓库里，npm 上的 4.1.9 不含它们；本版号重发，保证仓库与包一致。

## 4.1.9

**注册表里"存在但 npm 上不存在"的版本，现在是硬失败；并加了一条退休通道。**

- `release --post` 新增 `registry-versions-exist`：遍历注册表里状态为 active 的每个版本，逐个查
  npm，404 即红。4.1.7 正是这种幽灵版本（被暂存记录挡在 npm 之外）。
- 新增 `mcp-registry-retire.yml`（workflow_dispatch + 版本号入参）：本地 `mcp-publisher status`
  需要设备码登录，CI 用 OIDC 就能无人值守地把幽灵版本标记为 deleted。

## 4.1.9

**收尾改名：把文档与安装说明里剩下的 `dsh-signoff` 全部换成 `signoff-cli`。**

- README（也是 npm 页正文）：`--allow-scripts=dsh-signoff` → `signoff-cli`（两处）、`npx -y dsh-signoff mcp` → `npx -y signoff-cli mcp`、`devDependencies` 两处说明同步
- `gates/guard.py`：钩子里解析 CLI 时先找 `node_modules/signoff-cli`，找不到再回落旧名；缺 CLI 的提示与 CI 片段改成 `signoff-cli`
- `docs/promotion.md` 的下载量口径、`integrations/mcp/README.md` 的示例路径、`lib/core.js` 与 `lib/secrets.js` 的注释同步
- 钩子标记 `# generated by dsh-signoff` **保持不变**：改了会让老仓库的钩子认不出自己；老名兼容逻辑（`node_modules/dsh-signoff` 回落、devDependencies 同时认两个名字）也一律保留

## 4.1.8

**4.1.7 在 npm 上被一条不可见、也不可覆盖的暂存记录占号，同内容换号发布。**

- 现象：`npm publish` 返回 `E409 Cannot publish over previously staged version "4.1.7"`，
  而 `npm stage list`（含带包名的调用）都返回空——这条暂存记录不属于当前 token。
- 处理：内容不变，版本号升到 4.1.8 重新发布；`4.1.7` 的 tag 与 commit 保留为历史。

## 4.1.7

**与 4.1.6 内容相同；4.1.6 在 npm 上有一条无法覆盖的暂存记录（`E409 Cannot publish over previously staged version`，而 `npm stage list` 对当前所有 token 均返回空），因此换号重发。**

- 代码、测试与 server.json 与 4.1.6 一致，仅版本号递增
- 4.1.6 的 GitHub release 与 tag 一并删除，不留「有 release 没有包」的悬空版本

## 4.1.6

**给注册表工作流本身加断言，防止"等待 npm"那一步被悄悄删掉。**

- 自测新增三条：工作流里必须存在等待 npm 的步骤、tag 与 `server.json#version` 不一致必须红、
  发布必须带 4 次重试。

## 4.1.5

**注册表工作流不再依赖手动重跑。**

- 新增 `Wait for npm to serve this version`：从 `server.json` 取版本，轮询
  `https://registry.npmjs.org/<pkg>/<version>` 直到 200（最多 10 分钟）；release 事件的 tag 与
  `server.json#version` 不一致直接红。
- 发布失败后重试 4 次、退避 20/40/60 秒，每次重试前再核一次 npm。
- 原因：npm 是分段发布，`npm publish` 返回成功时 registry 仍可能 404；此前每个版本都要人工
  rerun 一次工作流才成功。

## 4.1.4

**把 4.1.3 之后的两处文档修订也发进包里，避免仓库与发布物不一致。**

- `integrations/skill/SKILL.md` 保持全英文（4.1.3 的包内还留着一行中文），并补上 `signoff release`。
- 能力图标题由 `v3.9.7` 升到 `v4.1.3`，中英两张图重新渲染。

## 4.1.3

**中英文说明文档对齐 4.1.x 的事实。**

- README 中英双语：包名/仓库名口径统一（`signoff-cli`，仓库 4.1.0 起改名、老地址 301）；五关的承诺旁边
  写明"发版另加第六道 `signoff release`"；发布闸门章节移到各自语言的正文里（原先挂在 License 之后）。
- 能力图（中/英）的 CLI 入口补上 `release`，两张图重新渲染。
- `docs/integrations.md` 的注册表名改为 `io.github.ayuanxx-max/signoff-cli`，并标注旧条目的 3.9.4 指向问题。
- `integrations/mcp/README.md` 说明 4.1.2 起 `integrations/` 随包发布，`signoff mcp` 安装后即可用。

## 4.1.2

**新增 `signoff release`：闸门第一次覆盖到"发布物"，它第一次运行就抓到一个真缺陷。**

- `signoff release --pre`：清单自洽（name/version/bin/files/server.json/mcpName/repository）、`npm pack` 成功、
  压缩包内含 `bin/lib/integrations`、装到临时目录后 `--version` 与 `mcp` 握手都成立。
- `signoff release --post`：发布后核对 npm `dist-tags.latest`、注册表 `isLatest` 与 `packages[0].version`、
  README 里每个 raw 链接是否 200。
- **它抓到的第一个缺陷**：`files[]` 漏了 `integrations/`，所以从 3.9.3 起所有装出来的包
  `signoff mcp` 都是 `MODULE_NOT_FOUND` —— 而注册表恰好让人用 `npx signoff-cli mcp`。已补进 `files[]`。

## 4.1.1

**修注册表归属校验：`package.json` 的 `mcpName` 还指向旧仓库名。**

- 现象：注册表返回 400 `Expected mcpName 'io.github.ayuanxx-max/signoff-cli', got 'io.github.ayuanxx-max/signoff'`。
- 修法：`mcpName` 跟随仓库改名；自测新增一条断言，`server.json#name` 与 `package.json#mcpName` 不一致即红。

## 4.1.0

**仓库改名为 `ayuanxx-max/signoff-cli`，与 npm 包名对齐。**

- GitHub 仓库 `dsh-signoff` → `signoff-cli`；网页、`git clone`、pre-commit 的 `repo:`、`uses:` 由 GitHub 301 承接，
  老地址仍可用（实测 `raw.githubusercontent` 老路径同样返回 200）。
- MCP 注册表条目改为 `io.github.ayuanxx-max/signoff-cli`（注册表名与仓库名绑定）；旧条目
  `io.github.ayuanxx-max/signoff` 保留为历史，不再更新。
- `package.json#repository`、`server.json#repository.url`、README/文档里的完整链接、`signoff.json` 的 schema URL
  全部指向新仓库。
- 包名、命令（`signoff`）、功能集不变。

## 4.0.2

**修 MCP 注册表发布：`server.json` 里 `packages[0].version` 一直停在 3.9.4。**

- 现象：注册表返回 400 `version '3.9.4' was not found`，所以 4.x 一直注册不上，`isLatest` 卡在 3.15.3。
- 修法：`server.json` 的两个版本字段都由 `package.json` 派生；自测新增三条断言，版本漂移在提交前就会被拦下。
- 这一版没有改任何功能，只让注册表能被正确发布。

## 4.0.1

**修 4.0.0 的 npx 入口：`npx signoff-cli` 找不到可执行文件。**

- `bin` 增加同名别名 `signoff-cli`，`npx signoff-cli` 直接可用。
- 生成的 CI workflow 改成 `npx --yes --package=signoff-cli@latest signoff ...`，不依赖 bin 名与包名一致。
- 4.0.0 的 `npm i -g` 与本地命令本身正常，只有 npx 这条路径坏。

## 4.0.0

**改名：`dsh-signoff` → `signoff-cli`。命令 `signoff`、仓库地址、功能集都不变。**

- 新包名 `signoff-cli`。`@signoff/cli` 因 npm scope 归属不可用（发布返回 404），改用等价的 `signoff-cli`。
  旧包 `dsh-signoff` 标记 deprecated，`npm i -g dsh-signoff`
  仍能装到旧版本，但提示改投新包。
- 钩子与 CI 文件头改成 `# generated by signoff-cli`；**旧文件头仍被识别为自家产物**
  （`markedByUs` 同时认两种），升级不会把老钩子当外来文件覆盖或丢弃。
- 生成的 CI workflow 改用 `npx --yes signoff-cli@latest`；`action.yml`、`smithery.yaml`、
  `server.json`（MCP 注册表 identifier）同步改为 `signoff-cli`。
- 仓库内 `node_modules` 查找同时支持 `signoff-cli` 与 `dsh-signoff` 两种布局。

## 3.15.3

**中英文说明补齐：新特性、能力矩阵、匿名竞品、两张图各出中英两版。**

- README 新增「能力矩阵与匿名竞品」与英文对照段：8 项能力 × 落印 + 6 类匿名竞品（A 平台级、
  B 钩子框架、C 密钥扫描、D 文本规则、E 供应链证明、F 覆盖率单点），并写明最后两行是短板。
- 新增两张框架图，各出中英文：`signoff-4-flow`（一次提交的完整路径与四层证据）、
  `signoff-5-competitors`（覆盖广度 vs 生态采用度，匿名坐标）。
- 检查点段落补 3.15.2 的三件事：`p4 path`、guard 后自动续签、BOM 容忍。

## 3.15.2

**把两个分发清单真的装进 tarball。**（3.15.1 被 npm 暂存发布卡住，改用 3.15.2 落地）

- `files` 里补上 `.pre-commit-hooks.yaml` 与 `action.yml`：3.15.0 的 tarball 里没有它们，
  审计当场抓到（"package ships ..." 两条红）。仓库里有、包里没有，属于发布漏项，不是文档问题。
- 审计脚本里两条版本断言写死了旧版本号，一并修掉（自身 bug，会让"最新版"永远红）。

## 3.15.0

**加了"可核对外部"的那一层：签名检查点 + 锚点。**

- `signoff p4 checkpoint`：把账本第 N 条的 `head` 与 Merkle `root` 签成一个文件；
  `signoff p4 anchor` 打出一行 `signoff1:<seq>:<head12>:<root16>` 供发布。
- `signoff p4 verify --checkpoint [--anchor LINE]`：账本被截断、被改写、签名不属于
  `allowed_signers`、锚点对不上，各自给出不同的失败原因。
- `signoff p4 path`：打印账本与检查点的实际位置（脚本用）。
- guard 通过后自动续签检查点（同一份账本不重复签），所以"用起来"不需要多一条命令。
- 账本读取容忍 BOM（Windows 编辑器与 `Set-Content -Encoding utf8` 常见）。
- 分发面：`.pre-commit-hooks.yaml`（3 个 hook）、`action.yml`（复合 Action）、`docs/integrations.md`。
- 测试 290 条：新增 17 条检查点断言、5 条分发清单断言、4 条确定性 fuzz 断言。

## 3.14.1

**修：`tests/` 目录不再抢走 `package.json` 的 `test` 脚本。**

- 实测（全新全局安装 + 真仓库）：一个 JS 仓库只要有 `tests/` 目录，P1 会去跑
  `python -m pytest tests -q`，在没有 pytest 的机器上 30 ms 失败——而 npm 项目带 `tests/` 极其常见。
- 现在：`package.json` 的 `test` 脚本优先（明确的意图声明），`pytest-tests` 必须同时有 Python 证据
  （`tests/*.py`、`pyproject.toml`、`setup.py`、`requirements.txt`、`tox.ini`、`pytest.ini`、`conftest.py`）。
  只有 `tests/` 目录的项目不再被误判成任何 runner。
- 3 条回归测试覆盖三种输入（261 tests）。

## 3.14.0

**P2：规则包、场景预设、编辑器集成。**（258 tests）

- P5 规则包：`--pack zh|en|both`；中文词表仍是默认值，`en` 用 Unicode 词边界匹配，
  `both` 两套同跑并按行去重。`--rules` 追加自定义词表，也可写进 `config.json#p5` 或 `signoff.json#p5`。
- 场景预设：`signoff init --preset node|python|go|java`，置预算/文档/覆盖率阈值/规则包，
  `test_cmd` 继续自动探测（不锁死脚本）。
- 编辑器：`signoff init --editor vscode` 生成 `.vscode/tasks.json` 与 problem matcher，
  已存在任务只合并不覆盖。
- `DEFAULT_CONFIG` 显式列出 `secrets/cache/docsFast/coverage/sign`，不再靠 `!== false` 推断。

## 3.13.0

**P1：签名判决、增量行覆盖率、CI 注解。**（235 tests）

- `signoff init --sign`：仓库本地 ed25519 密钥；`commit-msg` 追加 `Signoff-Key:` + `Signoff-Sig:`，
  对完整 tree 签名，单行 base64 做 trailer。无密钥则保持未签名，不阻塞提交。
- `signoff audit --verify` / `--require-signed`：逐提交验签；身份锚点是提交进仓库的
  `.signoff/allowed_signers`（或 `signoff.json` 的 `allowed_signers`）。不在名单只报 `self-signed`。
- `signoff cov --diff --min N`：只统计本次改动新增行的覆盖，读 lcov / istanbul / python coverage json，
  没有覆盖率文件时报"未测"（退出 2）而不是通过；`--allow-missing` 可放行。
- `GITHUB_ACTIONS=true` 时输出 `::error file=…,line=…` 注解 + `$GITHUB_STEP_SUMMARY` 表格。

## 3.12.0

**P0：密钥扫描门 + 运行器探测扩展 + 结果缓存。**（210 tests）

- `signoff secrets`：16 条高信号规则扫暂存区，命中即退出 1；值在输出里打码（`AKIA…EF`）。
  `--engine gitleaks` 可换用本机 gitleaks 的全套规则，不装也能跑。
- 守护顺序改成 **secrets → P5 → P1 → …**：密钥泄露不排在测试后面。
- 机器层守护在未 opt-in 的仓库也会先扫密钥（`--no-state`，不写任何状态）。
- P1 运行器探测从 2 种扩到 11 种：go / cargo / maven / gradle / dotnet / ruby / elixir / php / make。
- P1 结果缓存：同一暂存树 + 同一命令 + 同版本 → 0 ms 命中；纯文档提交直接跳过测试。
  开关：`SIGNOFF_NO_CACHE=1`、`SIGNOFF_NO_FAST=1`。

## 3.11.2（2026-11-07）

- 测试修复：安装点补 sha 的用例在 CI 上失败，因为夹具仓库里那次提交触发的是 signoff 自己的钩子，
  而 runner 上没有全局 `signoff` 可执行文件。改用 `git commit --no-verify`：那次提交只需要产生一个 `HEAD`。
  （本地因为有全局 junction 而通过，是典型的"只在本机能过"的用例。）

## 3.11.1（2026-11-07）

- 修复：机器层的自动安装在**首次提交**时就跑起来了，那时 `HEAD` 还不存在，`installed.json` 记成了空 sha，
  导致 `audit --since-install` 从此不可用（CI 的 smoke job 就是这样红的）。
  现在提交之后再跑一次 `signoff init` 会把安装点补上，并说明「首次 bootstrap 早于这次提交」。
- `audit --since-install` 遇到空 sha 时给出可执行的提示，而不是笼统的「没有安装点」。
- `.github/workflows/mcp-registry.yml` 加三次重试：registry 偶尔拒绝云端出口连接，一次失败不该让版本靠人手补发。
- 测试：新增「首次提交前 init → 提交 → 再 init 补 sha → audit 可用」用例（`npm test` 188 passed）。

## 3.11.0（2026-11-07）

- **仓库声明 `signoff.json`**：`signoff init --share` 在仓库根写一份声明并提交它，`.signoff/` 仍是 gitignore 的；
  任何人克隆后第一次 commit，机器层看到声明就自动把 hooks / config / CI 建好并跑全套 P1–P5，克隆方零操作。
  声明只认 `gates`（文档用）、`test_cmd`、`budget`、`docs`、`pre_push` 五个字段，schema 见 `docs/signoff.schema.json`；
  默认不锁测试运行器，避免克隆机器上没有那个 runner 时全线飘红。
- **MCP Registry 发布进 CI**：新增 `.github/workflows/mcp-registry.yml`，用 GitHub Actions OIDC
  (`mcp-publisher login github-oidc`) 在 release 发布时自动推 `server.json`，不再依赖每 30 分钟失效的设备码。
- 测试：`npm test` 增加声明生效、声明红关拦截、`init --share` 三个用例。

## 3.10.1（2026-11-07）

- 兜底：npm 11 把 `postinstall` 放进脚本 allowlist 提示，可能不执行；现在**仓库里第一次跑任何一关**
  （`signoff p1..p5`、`all`、`guard`）会自动把 hooks / config / CI / ledger 装好，第二次起静默。
- 只读命令（`doctor`、`status`、`explain`、`audit`）与钩子路径不做自动安装：前者不该改现场，
  后者是机器层的轻量关，未 opt-in 的仓库只跑 P1。
- 文档：补 `--allow-scripts=dsh-signoff` 与首关兜底的说明（中英双语）。
- 测试：`npm test` 177 passed（夹具默认 `SIGNOFF_NO_BOOTSTRAP=1`，只有 ensure 用例显式打开）。

## 3.10.0（2026-11-07）

**零接触安装**：`npm i -g dsh-signoff` 之后不再需要 `signoff init`。

- 新增 `signoff ensure [--global] [--json] [--quiet]`：幂等安装，仓库层 + 机器层。
- 新增 `lib/bootstrap.js`：机器层用 `core.hooksPath` 指向 `~/.signoff/hooks`，本机所有仓库（含新克隆）
  下一次 commit 就受约束；派发脚本先执行仓库自带的 `.git/hooks/<stage>`，判决仍归仓库。
- `package.json` 增加 `postinstall`：全局安装时自动装机器层，在仓库内安装时顺便把该仓库五关装好；
  postinstall 不会失败（失败也 exit 0，不会弄坏别人的 npm install）。
- 未 opt-in 的仓库只跑 P1（测试），不写 `.signoff/config.json`、不写 marker、不带 trailer：
  机器层不会把「没同意过 P2–P5 规矩」的仓库拦在门外。
- 两个逃生阀：`SIGNOFF_NO_BOOTSTRAP=1`、`SIGNOFF_NO_MACHINE=1`；撤销机器层用 `signoff uninstall --global`。
- 测试：新增 ensure / 机器层 / 轻量关 的用例（`npm test` 177 passed）。

## 3.9.8（2026-11-07）

- 文档：英文版两张图（能力图、用户路径图）从中文段落移到 `## English` 段内，英文读者按自己的语言路径阅读，
  不再需要先翻过中文内容。
- 版本号同步：`package.json` / `server.json` 3.9.8。

## 3.9.7（2026-11-07）

- 图表：三张框架图补齐**英文版**（`signoff-1-capability-en` / `signoff-2-market-en` / `signoff-3-user-en`），
  与中文版同结构、同配色、同源目录，`diagram.py` 一次渲染六张。
- 文档：README 增补 `### At a glance (English)`，英文读者不必先读中文；`docs/diagrams/README.md`
  列出中英对照表。
- 一致性：中文图 1 标题版本号同步到 3.9.7。

## 3.9.6（2026-11-07）

- 与 3.9.5 内容相同：3.9.5 因 npm 侧 staged 占用未能公开，改以 3.9.6 发布。

## 3.9.5（2026-11-07）

- 文档：README 顶部新增「一张图看懂」，用 Mermaid 生成的能力全景图与用户路径图解释五关、边界与已知坑。
- 图表：三张图全部改为 Mermaid 源文件（`docs/diagrams/src/*.mmd`），可 diff、可重渲；旧的 HTML 拼版已移除。
- 一致性：图里的判定标准与 `docs/diagrams/README.md`、`signoff explain p1..p5` 的文案同源，避免图文漂移。

# Changelog

## 3.9.4 — 2026-11-06

- `package.json` 增加 `mcpName: io.github.ayuanxx-max/signoff`：官方 MCP Registry 会校验已发布包的
  这个字段，缺失时拒绝发布（`NPM package 'dsh-signoff' is missing required 'mcpName' field`）。
- `server.json` 与包版本同步到 3.9.4。
- 自查 164 项、Python 对等 30 项全过。

## 3.9.3 — 2026-11-06

- 新增 `signoff mcp`：一条命令把五关挂到 stdio MCP 上，`npx -y dsh-signoff mcp` 即可被任何 MCP 客户端调用。
- 新增 `server.json`（官方 MCP Registry 清单）与 `smithery.yaml`（Smithery 配置），registry 名称 `io.github.ayuanxx-max/signoff`。
- `signoff explain` 与 MCP 工具描述同步指向同一套判定说明。
- 自查 164 项、Python 对等 30 项全过。

## 3.9.2 — 2026-11-06

- 新增 `signoff explain p1..p5`（`--json`）：每关查什么、怎么判、怎么修，答案与代码放在一起。
- 新增 `integrations/skill/SKILL.md`：给 agent 的技能说明书，只写模型容易做错的三件事（退出码是判决、不许绕过红关、先 doctor 再 explain）。
- 新增 `integrations/mcp/server.js`：零依赖 stdio MCP 服务器，五个工具（run/status/doctor/audit/explain），`isError` 跟随退出码；`initialize` / `tools/list` / `tools/call` 已实测。
- 新增 `docs/integrations.md`（四种形态对比，含“为什么不做宿主插件”）与 `docs/promotion.md`（GitHub 可发现性、清单收录、度量）。
- README 增加接入方式（中英两版）。
- 自查 164 项、Python 对等 30 项全过。

## 3.9.1 — 2026-11-06

- 修 `audit --since-install` 会在安装点不是 HEAD 祖先时静默给出偏大范围：现在先 `git cat-file -e <sha>^{commit}` + `git merge-base --is-ancestor`，对不上退 2 并说明原因（rebase / 强推 / 换了克隆），提示改用 `signoff init --reset-install` 或 `--range`。审计结论不可信比审计报错更糟。
- 新增 `signoff init --reset-install`：把安装点重写为当前 HEAD（历史被改写后唯一的正确修法）。
- 新增 `signoff init --lock-test`：把识别到的测试命令写进 `test_cmd`，换机器不再从 vitest 漂到 pytest。
- 钩子锁从 `open(..., "wx")` 改为 `mkdir` + `owner.json`：`mkdir` 在 SMB/NFS 上仍是原子的，`O_EXCL` 不是；3.9.0 写的文件形状继续被识别，旧锁不会卡住新版本。
- 自查 164 项、Python 对等 30 项全过。

## 3.9.0 — 2026-11-06

- 修 `--chain` 在 Windows 上跑不了非 shell 钩子：串接文件保留 `.py`/`.js`/`.ps1`/`.cmd` 后缀，生成的钩子按后缀用 `python`/`node`/`powershell`/`cmd` 启动，`.local` 仍排第一（3.9.0 之前装的仓库不受影响）；`uninstall` 按同一顺序找回并还原。
- 新增 `signoff p4 export --format {md,json,csv}`（默认 md）：json 是记录数组，csv 是带表头的一行一条。
- 新增 `signoff doctor --fix`：重装缺失或被占的钩子、给 POSIX 钩子补执行位、删掉“什么都没暂存却留着”的 `.signoff/passed`；修完重新体检再出报告，没有可修的会明说。
- 自查 157 项、Python 对等 30 项全过。

## 3.8.0 — 2026-11-06

- 新增 `docs/gates.en.md`：与 `docs/gates.md` 一一对应的英文版（五关参数、P1 识别顺序、P4 `--merge`、钩子锁、运行时），两份互加链接；顺手修掉 gates.md 标题里的旧名「执印」。
- 新增钩子单实例锁 `.signoff/lock`：同一个仓库并发提交时，第二个 `pre-commit` / `pre-push` 退 1 并报出持有者 pid、阶段、时间；持有进程已死或锁超过 10 分钟自动作废；`SIGNOFF_LOCK_WAIT_MS` 可调等待（默认 8000 ms）。`commit-msg` 不加锁，它不能把 git 已接受的提交再挡回去。
- 自查 147 项、Python 对等 30 项全过。

## 3.7.0 — 2026-11-06

- 新增 `lib/detect.js`：P1 的测试命令改成“识别 + 说明来源”，顺序为 `package.json` 的 `test` 脚本 → vitest / jest / mocha 依赖 → `Cargo.toml` → `go.mod` → `Makefile` 的 `test` 目标 → pytest → unittest。`init` / `status` 打印 `<命令>  (<来源>)`，`doctor` 多一条 `test-runner` 检查。
- 修：空 `tests/` 目录不再被当成测试套件（以前会让 p1 空跑一场、pytest 退 5 报“没收集到用例”）。目录里没有 `.py` 文件就不算。
- 新增 `signoff p4 export --merge OTHER...`：把别的仓库的 `audit.log` 合并成一张带 `repo` 列的表；每份都独立重算哈希链，链断的会警告并以 1 退出。
- 新增 `signoff uninstall --keep-config`：卸钩子 + CI，并清掉 `passed` / `cache.json` / `installed.json` 这些运行时状态，保留配置与账本。默认 `uninstall` 也开始清 `passed` 标记（以前会留一个让 `status` 看着像已安装）。
- 自查 143 项、Python 对等 30 项全过。

## 3.6.0 — 2026-11-06

- 新增 `signoff init --chain`：仓库已有钩子时不再只备份，而是存成 `<name>.local` 并在我们的钩子里**先执行**；它失败就停，`signoff uninstall` 把它原样装回 `<name>`。默认行为不变（`<name>.signoff-backup`，不串接）。
- 修：生成的 CI 工作流在浅克隆下会红。`git rev-parse HEAD~1` 找不到对象时会把名字原样打印到 stdout，导致 `audit --range "HEAD~1..HEAD"` 解析失败退 2。现在工作流 `fetch-depth: 0`、用 `git cat-file -e "$BASE^{commit}"` 判断、必要时 `--unshallow`，取不到就打印跳过。
- 修：`signoff --version` / `-v` 之前落到“未知命令”退 2；现在打印版本退 0。HELP 里的旧名「一诺过五关」改回「落印」。
- 新增 `.github/workflows/ci.yml`：node 18/20/22 × ubuntu/macos/windows 矩阵跑 `node test/selftest.js`，另一个 job 跑 python 对等，再一个 job 做 `npm pack` + 全局安装 + `init`/`commit`/`audit --since-install`/`doctor` 冒烟。
- 自查 126 项（新增 `--version`、HELP 名字、CI 取全历史、CI 取已验证 rev、串接 8 项）全过，Python 对等 30 项全过。

## 3.5.1 — 2026-11-06

- 修：重复 `signoff init` 时把 `.signoff/installed.json` 里的 `version` 更新成当前钩子版本（`sha`/`ts` 仍保留第一次安装点）。否则 `doctor` 每次升级后都会报一条永久的 `install-version` 警告——那正是 doctor 要避免的噪音。
- 自查新增 1 项（重复 init 后版本跟随钩子），共 112 项全过。
## 3.5.0 — 2026-11-06

- 新增 `signoff doctor [--json] [--quiet]`：回答“为什么它没按预期生效”，只读、不装不改不删。
- 检查项：Node 版本、git 是否在 PATH、引擎、钩子三件套是否在且可执行、钩子的旧钩子备份（备份了但没串接会警告）、`signoff` 是否在非交互 shell 的 PATH 里、CLI 版本与安装点记录是否一致、`config.json` 字段合法性、`test_cmd` 是否可启动、`.signoff/passed` 残留、`skips.log` 条数、账本链与别仓库条目、安装点之后的缺失提交。
- 组合既有命令（`status` / `audit --since-install` / `p4 verify`）而不是重算逻辑：doctor 说 ok 和闸门后面判绿不会互相矛盾。
- 退出码：全绿 0，有失败 1，不在 git 仓库 2；`--quiet` 只打非 ok 项。
- 自查新增 8 项（未装仓库判 1、装好判 0、`--json` 结构、`--quiet` 过滤、非仓库判 2、标记残留只警告且能被看见），共 111 项全过。

## 3.4.0 — 2026-11-06

- `signoff init` 记录安装点 `.signoff/installed.json`（`{sha, ts, version}`）；重复 init 不覆盖第一个安装点——装钩子之前的历史是历史，不是失败。
- `signoff audit --since-install`：从安装点起算，不再手写 `--range`；没有安装点时直接报错退出 2，不猜。
- 普通 `audit` 遇到装钩子之前的缺失提交会多打一行：`N of M missing commit(s) predate the install point (<sha12>); use --since-install`；`--json` 增加 `install: {sha, pre_install_missing}`。
- 自查新增 5 项（安装点存在、带 sha、`--since-install` 空区间通过、重复 init 不改安装点、装钩子之前的缺失提交给出提示），共 103 项全过。

## 3.3.0 — 2026-11-06

- **账本改为仓库级**：默认写 `<repo>/.signoff/audit.log`（非仓库目录退回 `~/.signoff/audit.log`，`SIGNOFF_HOME` 仍可强制指定）。原来的用户级账本会把 A 仓库的回滚点拿去 B 仓库校验，`p4 verify` 在除写入者之外的任何仓库都报 `missing`。
- **记录新增 `repo` 字段**（参与哈希）：`verify` 只校验属于本仓库的条目，别仓库的条目跳过。3.3.0 之前的记录没有 `repo`，仍按旧的 6 个字段重算哈希，所以老账本照常通过。
- **自动迁移**：第一次在某个仓库里用到账本时，若用户级 `~/.signoff/audit.log` 的整条链在本仓库全部能解析，就整份复制进来；有任何一条解析不了（说明它属于别的仓库）就不复制，从空链开始。
- `test/selftest.js` 新增 5 项：仓库级落点、`repo` 字段、旧链迁移、别仓库条目跳过、本仓库条目仍会红。96 项全过；Python 对等 30 项全过。

## 3.2.1 — 2026-11-06

- 中文名从「执印」改为 **落印**：动作词（印落纸面才算数），与英文名 SignOff 的“签了才放行”对应；曾用名「一诺过五关」「执印」。
- 只改展示名与描述，命令 `signoff`、包名 `dsh-signoff`、行为均不变。

## 3.2.0 — 2026-11-06

- 中文名定为 **执印**，原名「一诺过五关」保留为曾用名。英文名 SignOff、命令 `signoff`、包名 `dsh-signoff` 不变。
- 定名依据：GitHub 星标 >2000 的 34 022 个仓库里，按星标取前 1 000 个逐页扫描，名字含中文的为 0 个；中文开源项目成功的是「ASCII slug + 2–3 字中文品牌」（积木 48 389 / 芋道 40 278 / 若依 8 640），所以中文名取两字，五个字以上留给口号。
- README、`docs/gates.md`、`package.json` 描述同步；其余行为无改动。

## 3.1.2 — 2026-11-06

- `pre-push` 不再写 `.signoff/passed`：标记是 `pre-commit` 交给 `commit-msg` 的一次性凭据，push 时留下会让仓库里多一个与提交无关的残片。
- 自查补 1 项（pre-push 不留标记），共 91 项全绿。

## 3.1.1 — 2026-11-06

- 提交标记改为严格一次性：`commit-msg` 无论标记是否匹配当前树都会消费掉它，`pre-commit` 写新标记前先清旧的。原来“树变了”的标记会留在 `.signoff/passed`，下一次同树提交可能重复追加 trailer。
- 自查补 3 项（无标记、陈旧标记、陈旧标记被消费），共 89 项全绿。

## 3.1.0 — 2026-11-06

- 新增 `commit-msg` 钩子与提交标记：闸门通过后在提交信息里写 `Signoff-Pass: <tree>`，`SIGNOFF_SKIP=1` 时写 `Signoff-Skip:`——`git commit --no-verify` 从此不再是“无记录”，而是“没有标记的提交”。
- 新增 `signoff audit [--range A..B] [--json] [--strict]`：逐个提交核对标记与提交树是否一致；缺失判红，`--strict` 时“有记录的跳过”也判红；合并提交跳过并计数。生成的 CI 工作流自带这一步。
- `signoff init` 升级：安装第三个钩子、新增 `--quiet` 与 `--prepare`（把 `signoff init --quiet` 并入 `package.json` 的 `prepare`，队友 `npm install` 后自动装钩子，幂等）；`status` 显示 `commit-msg` 与 `trailer` 状态。
- 自查 81 项（原 30 项 + 标记/审计/prepare/真实提交用例），Python 对拍仍 30/30。

## 3.0.0 — 2026-11-06

- 五关与自动守护全部改为纯 Node 实现（`lib/p1..p5.js`、`lib/guard.js`），**不再需要 Python**：`npm i -g dsh-signoff` 之后任何有 Node 18+ 的机器都能跑完整 P1–P5，没有降级模式、没有缺失的关。
- 与 Python 参考实现逐字节对拍：P1 43 例、P2 126 例、P3、P4 29 例（含真账本 7 条与混合引擎链）、P5 26 例；`npm test` 跑 Node 版 30 项自查，`npm run parity` 保留 Python 对拍。
- 自动守护同步改为 Node：钩子仍调 `signoff hook <stage>`，内部用 `node bin/signoff.js` 跑闸门；测试命令优先取 `package.json` 的 test，只在解释器可用时才探测 pytest。
- 修 Windows 上 `windowsHide` 导致 `cmd.exe` 输出 GBK 乱码、与 Python 不一致的问题。

## 2.0.2 — 2026-11-06

- CI 模式（`signoff guard --ci`）不再只看暂存区：改为对 `.signoff/config.json` 里声明的全部文档跑 P5，再跑 P1 与（有场景 fixture 时的）P2、P4。钩子模式仍只看本次暂存改动。
- 自查 30/30。

## 2.0.1 — 2026-11-06

- 修复：`guard --full`（pre-push 用的就是它）此前会强制跑 P2 `--strict`，导致没有 `verify/scenarios/` 的仓库（例如本项目）在 push 时被误判为覆盖不足。现在 P2 只在仓库确实有场景 fixture（或配置里声明了 `apps`）时才参与。
- 自查 30/30，行为其余不变。

## 2.0.0 — 2026-11-06

- 新增自动守护：`signoff init` 一次安装，写入 `.git/hooks/pre-commit`、`.git/hooks/pre-push`、`.github/workflows/signoff.yml`、`.signoff/config.json`，并把 `.signoff/` 加进 `.gitignore`。
- 新增 `signoff guard`（钩子与 CI 实际调用的入口）、`signoff status`、`signoff uninstall`；`signoff doctor` 增加 guard 一行。
- 稳定性：同一暂存树只判一次（缓存命中约 0 ms）；失败只打印失败关的尾部，完整日志在 `.signoff/hook.log`；超预算判红；CLI 缺失判红；`SIGNOFF_SKIP=1` 跳过并记入 `.signoff/skips.log`。
- 自查 30/30（原 17 项 + 13 项 guard 用例：安装、缓存、失败阻断、跳过留痕、卸载、dry-run）。
- 只新增能力，五关的判定逻辑未变。

## 1.0.4 — 2026-11-06

- 承诺句改为与 P1–P5 实际边界一致的表述：「你照常干活；它不替你判断对错，只把“做完了”变成能核对的东西。」中英同步。
- 只改文档，五个 gate 与 CLI 行为未变；自测仍 17 passed / 0 failed。

## 1.0.3 — 2026-11-06

- 承诺句改为 HTML 二级标题（与「一、案例」同级大小）并带红色内联样式，中英同步。
- 只改文档，五个 gate 与 CLI 行为未变；自测仍 17 passed / 0 failed。

## 1.0.2 — 2026-11-06

- 承诺句改回纯文字（加粗、左对齐、正文大小），中英同步；移除 PNG 图片与 docs/assets/。
- 只改文档，五个 gate 与 CLI 行为未变；自测仍 17 passed / 0 failed。

## 1.0.1 — 2026-11-06

- README 第一节改为案例式标题：本次 DSH 2.0.22-next 升级后修复 dsh-session-fork-tree 0.9.34 的 bug 里五关各自做了什么（中英同步）。
- 第一节末尾新增红色加粗承诺句（PNG，18 px 左对齐）：而你不需要做什么，照常进行任务，由它来守护这个过程；英文同款。
- 只改文档与图片，五个 gate 与 CLI 行为未变；自测仍 17 passed / 0 failed。

## 1.0.0 — 2026-11-06

- 首个发布版本：五道关各一条命令，退出码即判决。
- P1 `p1_verify.py`：跑项目的检查命令（可重复 `--run`），计时、解析用例数、写 `.signoff/p1.json`；`--install-hook` 写 git pre-commit 钩子。
- P2 `p2_coverage.py`：扫 `verify/scenarios/*.json`，四级分类（scenario / harness / smoke / missing），统计断言数，支持 `--strict`、`--min-scenario`、`--min-assertions`、`--md`。
- P3 `p3_queue.py`：任务卡校验（id / goal / scope / acceptance / rollback）、scope 冲突分波、`collect` 抓越界改动与空卡。
- P4 `p4_ledger.py`：单次取票（10 分钟过期）→ 消费 → 哈希链记账 → `verify` 复算链并校验回滚点必须是真实 git ref；`export` 出 Markdown 账本。
- P5 `p5_slop.py`：六条规则（`placeholder` / AI 味词表 / `绝对`化断言 / 空副词 / 无数字的`已验证` / 缺回滚），跳过代码块与表格行。
- 自测 `test/selftest.py`：在临时仓库里跑五关，17 条断言全覆盖（含篡改检测、假回滚点拒绝、票单次使用）。
- 兼容 Node 18+ 与 Python 3.9+；Windows 控制台输出全 ASCII，避免 GBK 乱码把 PASS 显示成乱码。
