# 七道关：判定与修法

> English: [gates.en.md](gates.en.md) · 报告契约：[REPORT-CONTRACT.md](REPORT-CONTRACT.md)

每关一条命令，判决写 `.signoff/pN.json`，退出码 0 过 / 1 红 / 2 用法或环境。全部是 Node 实现
（`lib/p1.js`…`lib/p5.js`、`lib/guard.js`、`lib/secrets.js`），只要求 Node 18+，没有 Python 版本，也没有降级模式。

## p1 测试

`signoff p1 [--run CMD]... [--budget SEC] [--install-hook] [--json] [--quiet]`

- 缺省命令：有 `tests/` 用 pytest，否则 `npm test --silent`；`--run` 可重复，按给定顺序跑。
- `--budget` 是所有命令合计的秒数（默认 180），超时判红；不按「用例少就算过」折中。
- 结果形如 `{"gate":"p1","ok":true,"elapsedMs":39,"budgetMs":180000,"cases":3}`，用例数从
  `N passed` / `N tests` / `N checks` 里取最大值。
- `--install-hook` 写 `.git/hooks/pre-commit`（内容就是 `signoff p1`）。

反作弊（`lib/integrity.js`）：p1 除了问「测试过没过」，还要问「测试还是不是原来那个测试」。
拿工作区与 base（`SIGNOFF_BASE`，否则 `origin/master` 的 merge-base，再否则 `HEAD~1`）比对测试文件，
命中三条之一即红：

| 判据 | 说明 |
| --- | --- |
| 新增 `skip` / `only` / `todo` / `xit` / `@pytest.mark.skip` | `only` 让同文件其他用例静默不跑，同样算 |
| 断言被删且同文件没有等量新增 | 删除的行数多于新增的行数 |
| 同一断言的数字阈值被改小 | 例如 `>= 80` 改成 `>= 60`，数字取自代码部分，忽略字符串 |

字符串字面量会先被剥掉，所以断言消息里出现 `test.skip(` 不算作弊。要显式放宽，写进
`.signoff/integrity-allow.json`（`file` / `kind` / `needle` / `reason`，理由 ≥20 字），
声明留在 diff 里供评审——闸门禁止的是"悄悄地"放宽。缓存命中与 docs-only 快路径同样会跑这一步。

## p2 覆盖率

`signoff p2 [--min-scenario N] [--min-assertions N] [--strict] [--md FILE] [--json]`

扫描根目录与 `packages/`、`apps/` 下带 `package.json` 或 `verify/` 的目录，按证据强弱分四级：

| 级别 | 判据 |
| --- | --- |
| `scenario` | `verify/scenarios/*.json` 全部可解析，且至少有一个 `checks` 数组 |
| `harness` | 只有 `verify/` 下的页面 |
| `smoke` | 只有 `package.json` |
| `missing` | 都没有 |

`--strict` 让 `harness` / `smoke` / `missing` 一律判红；`--md FILE` 导出覆盖表。

## p3 并发任务

`signoff p3 {validate|plan|collect} [--cards DIR] [--changed FILES...] [--json]`

任务卡默认 `tasks/<id>/card.json`：

```json
{"id":"t1","goal":"修菜单","scope":["client.js"],"acceptance":["menu 11/11"],"rollback":"v0.9.34"}
```

| 子命令 | 行为 |
| --- | --- |
| `validate` | 五个字段齐全、id 不重复、scope 是字符串数组 |
| `plan` | scope 前缀或通配相交的卡排进不同波，输出 wave 列表 |
| `collect --changed` | 每个改动文件都必须被某张卡认领，并列「改了却没交东西」的卡 |

## p4 危险动作

`signoff p4 {ask|confirm|verify|checkpoint|anchor|path|export}`

动作类别固定 `config` / `profile` / `publish`。账本按仓库隔离：仓库内 `.signoff/audit.log`，非仓库目录退回
`~/.signoff/audit.log`（`SIGNOFF_HOME` 可强制指定）。

| 子命令 | 行为 |
| --- | --- |
| `ask --action --target [--ttl]` | 发票据，单次使用，默认 600 秒过期 |
| `confirm --ticket --decision allow\|deny [--detail] [--rollback]` | 消费票据并追加哈希链条目；`deny` 也记账，退出码 1 |
| `verify [--checkpoint [--anchor LINE]]` | 复算链（`prev` + 内容哈希）、校验回滚点是存在的 git ref |
| `checkpoint [--no-sign]` | 给当前账本写签名检查点（Merkle 根 + 序号） |
| `anchor` | 打印一行可对外发布的锚点 |
| `export --out FILE [--format md\|json\|csv]` | 导出账本，可 `--merge` 多次 |

条目形如 `{"ts":…,"action":"publish","target":"x@1.0.0","rollback":"v1.0.0","decision":"allow","prev":"<sha256>","hash":"<sha256>"}`。

## p5 文档空话

`signoff p5 [FILES...] [--pack zh|en|both] [--rules FILE] [--allow RULE] [--json]`

默认扫 `README.md CHANGELOG.md docs/`。规则：占位标记、AI 套话、只有结论没有数字的断言、空副词堆叠、
把「做完了」写成口号。跳过 fenced code 与 `|` 开头的表格行。`--allow` 放行单条规则，`--rules` 加载额外词表。

## sec 密钥

`signoff secrets [--staged|--all] [--json]`。默认引擎是内置规则（内置词表 + 高熵检测）；装了 gitleaks 时可用
`--engine gitleaks` 对拍，两者判决独立。

## release 发布

`signoff release --pre|--post`。`--pre` 打包、装进临时目录、跑 `--version`、完成 `mcp` 握手；
`--post` 核 npm `latest`、注册表 `isLatest` 与 `packages[].version`、README 图链。
四件事必须一致：`package.json` 版本、`server.json` 版本、`CHANGELOG.md` 顶部条目、git tag。

## 守卫：钩子里实际跑哪几关

`signoff init` 之后，`pre-commit` / `pre-push` / CI 都调 `signoff guard`：

| 场景 | 跑的关 |
| --- | --- |
| 暂存了 README、`docs/` 下的文件 | p5 |
| 探到测试命令（`package.json` 的 test，或 pytest） | p1 |
| 存在 `verify/scenarios/` | p2 `--strict` |
| 存在账本（仓库内或 `~/.signoff/audit.log`） | p4 `verify` |
| 暂存内容里有疑似密钥 | sec |

`.signoff/cache.json` 以 `git write-tree` 的结果为键：同一份暂存内容重复提交只判一次，所以第二次是「最近一次跑闸」那种毫秒级。
`SIGNOFF_SKIP=1` 跳过并写 `.signoff/skips.log`；`git commit --no-verify` 不写任何记录——所以 **CI 是唯一不可绕过的边界**。

## 审计边界

`signoff audit [--range A..B] [--strict] [--since-install]`：默认看全部提交，`--since-install` 只看安装点之后，
且会先确认安装点是 HEAD 的祖先；rebase、强推、换克隆后对不上会退 2，用 `signoff init --reset-install` 把边界挪到当前 HEAD。

## signoff fix 修复循环

`signoff fix --patch FILE [--scope PREFIX]... [--run CMD]... [--budget SEC] [--check] [--json]`

不假装会写代码：它只仲裁「改完能不能留」。留下的条件只有四条，缺一条就整单回滚：

1. **基线必须是红的**——没有复现的修复只是在增加变更量，所以基线绿直接退出 2；
2. **patch 只能落在 `--scope` 声明的范围里**，越界拒绝；
3. **判定路径不许被这个循环改**：`bin/`、`lib/p1..p5`/`guard`/`core`/`integrity`/`secrets`/`fix`、
   `gates/`、`.github/workflows/`、`.signoff/`。改闸门要走正常提交，由人看 diff；
4. **改完必须红转绿、反作弊 clean、没有 patch 之外的改动**（新出现的未跟踪文件也算越界）。

工作区必须没有「被跟踪的改动」（回滚点是 HEAD）；未跟踪文件不挡路。判定结果写
`.signoff/fix-log.jsonl`：patch、文件、前后两次运行的退出码、反作弊结论、留下还是回滚、原因。

退出码：`0` 留下，`1` 回滚，`2` 拒绝动手（用法、脏工作区、基线已绿、越界、判定路径）。

## signoff dispute 分歧仲裁

`signoff dispute --claim TEXT --run CMD [--expect pass|fail] [--repeat N] [--budget SEC] [--json]`
`signoff dispute --replay FILE [--json]`

「它到底过不过」不靠说，靠同一个复现步骤在同一棵树上重复跑。三种结论，都有自己的退出码：

| 重复跑的结果 | 结论 | 退出码 |
| --- | --- | --- |
| N 次全过 | 主张成立 | 0 |
| N 次全不过 | 主张被推翻 | 1 |
| 过也有、不过也有 | 不定：这个问题还没有可复现的说法 | 3 |

第三种是最常被跳过的格子。它把「时好时坏」从一个形容词变成一个分数（p/N），并在证据里留下每一次的
退出码、耗时、stdout 摘要哈希与尾部。没有复现步骤（`--run`）或没有说清主张（`--claim`）时直接退出 2；
总耗时超过 `--budget` 时不硬凑结论，同样退出 2 并说明跑了几次。

证据写到 `.signoff/disputes/<时间>-<id>.json`，含环境指纹（node 版本、平台、架构、git 短哈希、目录）。
`--replay` 读回记录重跑同样的命令，比对结论：一致退出 0，变了退出 1。

## signoff review 评审存证

`signoff review --by ID [--model PROVIDER/MODEL] [--verdict approve|reject] [--note TEXT] [--json]`
`signoff review --verify` · `signoff review --status` · `signoff review --list [--limit N]`

存证能证明的只有一件事，但这件很关键：**评审过的 diff 和要发布的 diff 是同一份**。diff 的
sha256 短哈希与评审一起写进 `.signoff/reviews.jsonl`；改动一个字节，hash 就变，旧评审自动失效。

`--by` 与 `--model` 是**自述**——任何工具的「我审过了」都只是自述，这里不装作能验证谁真的读了代码。
它验证的是绑定关系：`--verify` 重算当前暂存 diff（没有暂存改动则看工作区）的哈希，只有当存在一份
针对该哈希的 `approve` 时才退出 0，否则退出 1 并打印「上次被批准的是哪个哈希」。

## signoff patterns 失败模式库

`signoff patterns [--min N] [--top N] [--since DAYS] [--md FILE] [--json]`

读 `.signoff/runs.log`（每次闸门运行的 gate / ok / 耗时）与账本 `.signoff/audit.log`（action /
decision），把散落的失败按「同一个地方反复红」聚成模式，按出现次数排序。单条失败没有信息量，
重复出现才有：它说明上次的修法没有碰到原因。`--min`（默认 2）决定几次算重复。

输出形如（本仓库实测，423 条运行记录）：

```
[patterns] gate:p5 x18/114 (16%) last ... recurring
[patterns]   same gate failed 18 times — the previous fix probably did not touch the cause
[patterns] gate:p1 x6/115 (5%) last ... recurring
```

`--md FILE` 导出 Markdown 表，供周报或复盘引用。

<!-- EN-BEGIN auto-embedded from docs/gates.en.md; edit that file and run node tools/sync-bilingual.mjs -->

## English

## The seven gates: verdict and fix

> 中文: [gates.md](gates.md) · Report contract: [REPORT-CONTRACT.md](REPORT-CONTRACT.md)

One command per gate. The verdict is written to `.signoff/pN.json` and the exit code is 0 pass / 1 red /
2 usage or environment. Everything is Node (`lib/p1.js` … `lib/p5.js`, `lib/guard.js`, `lib/secrets.js`) and needs
only Node 18+: there is no Python build and no degraded mode.

### p1 Tests

`signoff p1 [--run CMD]... [--budget SEC] [--install-hook] [--json] [--quiet]`

- Default command: pytest when `tests/` exists, otherwise `npm test --silent`; `--run` is repeatable and runs in order.
- `--budget` is the total number of seconds for all commands (180 by default). Over budget is red; there is no
  "count fewer cases" fallback.
- Result shape: `{"gate":"p1","ok":true,"elapsedMs":39,"budgetMs":180000,"cases":3}`. The case count is the largest
  number found in `N passed` / `N tests` / `N checks`.
- Anti-tamper (`lib/integrity.js`): p1 asks not only "do the tests pass" but "is it still the same
  test". It compares the working tree against a base (`SIGNOFF_BASE`, else the merge-base with
  `origin/master`, else `HEAD~1`) and goes red on any of three things:

  | Signal | Meaning |
  | --- | --- |
  | A new `skip` / `only` / `todo` / `xit` / `@pytest.mark.skip` | `.only` silences the rest of the file, so it counts too |
  | More assertions deleted than added in the same file | a rewrite that keeps the count is fine |
  | A numeric threshold on the same assertion got smaller | `>= 80` becoming `>= 60`; numbers are read from code, not from strings |

  String literals are stripped first, so `test.skip(` inside an assertion message is not a finding.
  Deliberate weakening is allowed but must be declared in `.signoff/integrity-allow.json`
  (`file` / `kind` / `needle` / `reason`, reason at least 20 characters): the declaration stays in
  the diff for review. The gate forbids quiet weakening, not weakening. A cache hit and the
  docs-only fast path run this step too.

### p2 Coverage

`signoff p2 [--min-scenario N] [--min-assertions N] [--strict] [--md FILE] [--json]`

Scans the root plus any directory under `packages/` and `apps/` that has a `package.json` or `verify/`:

| Level | Evidence |
| --- | --- |
| `scenario` | every `verify/scenarios/*.json` parses and at least one has a `checks` array |
| `harness` | only pages under `verify/` |
| `smoke` | only `package.json` |
| `missing` | none of the above |

`--strict` turns `harness` / `smoke` / `missing` red. `--md FILE` writes the coverage table.

### p3 Parallel tasks

`signoff p3 {validate|plan|collect} [--cards DIR] [--changed FILES...] [--json]`

Task cards live in `tasks/<id>/card.json`:

```json
{"id":"t1","goal":"fix the menu","scope":["client.js"],"acceptance":["menu 11/11"],"rollback":"v0.9.34"}
```

| Subcommand | Behaviour |
| --- | --- |
| `validate` | five fields present, ids unique, scope is an array of strings |
| `plan` | cards whose scopes intersect by prefix or wildcard go into different waves; prints the waves |
| `collect --changed` | every changed file must be claimed by a card, and cards that changed nothing are listed |

### p4 Risky actions

`signoff p4 {ask|confirm|verify|checkpoint|anchor|path|export}`

Action kinds are fixed: `config` / `profile` / `publish`. The ledger is per repository (`.signoff/audit.log`), falling
back to `~/.signoff/audit.log` outside a repository (`SIGNOFF_HOME` overrides).

| Subcommand | Behaviour |
| --- | --- |
| `ask --action --target [--ttl]` | issue a single-use ticket, 600 seconds by default |
| `confirm --ticket --decision allow\|deny [--detail] [--rollback]` | consume the ticket and append a hash-chained entry; `deny` is also recorded and exits 1 |
| `verify [--checkpoint [--anchor LINE]]` | recompute the chain and require the rollback point to be a real git ref |
| `checkpoint [--no-sign]` | write a signed checkpoint (Merkle root + sequence) |
| `anchor` | print the one line you can publish elsewhere |
| `export --out FILE [--format md\|json\|csv]` | export the ledger; `--merge` repeats |

### p5 Docs

`signoff p5 [FILES...] [--pack zh|en|both] [--rules FILE] [--allow RULE] [--json]`

Defaults to `README.md CHANGELOG.md docs/`. Rules: placeholders, AI filler, absolute claims without a number,
stacked empty adverbs, and "covered"/"all pass" style claims with no number. Fenced code and table rows starting with
`|` are skipped. `--allow` waives one rule; `--rules` loads an extra word list.

### sec Secrets

`signoff secrets [--staged|--all] [--json]`. The default engine is built in (word list + high-entropy detection);
when gitleaks is installed, `--engine gitleaks` can be used as an independent cross-check.

### release

`signoff release --pre|--post`. `--pre` packs, installs into a temp directory, runs `--version` and completes an
`mcp` handshake. `--post` checks npm `latest`, registry `isLatest` and `packages[].version`, plus README image links.
Four things must agree: the `package.json` version, the `server.json` version, the top `CHANGELOG.md` entry, the git tag.

### The guard: which gates run in the hook

After `signoff init`, `pre-commit` / `pre-push` / CI all call `signoff guard`:

| Situation | Gates |
| --- | --- |
| staged README or files under `docs/` | p5 |
| a test command was detected (`package.json` test, or pytest) | p1 |
| `verify/scenarios/` exists | p2 `--strict` |
| a ledger exists (in-repo or `~/.signoff/audit.log`) | p4 `verify` |
| something in the staged set looks like a credential | sec |

`.signoff/cache.json` is keyed by the result of `git write-tree`, so the same staged content is judged once — that is why
the second run is the millisecond-level "last gate run" you see on the board.
`SIGNOFF_SKIP=1` skips and writes `.signoff/skips.log`; `git commit --no-verify` writes nothing at all — **CI is the only
boundary that cannot be bypassed.**

### Audit boundary

`signoff audit [--range A..B] [--strict] [--since-install]`. `--since-install` looks only at commits after the install
point, and first checks that the point is an ancestor of HEAD. After a rebase, force-push or fresh clone it exits 2;
move the boundary with `signoff init --reset-install`.

### signoff fix: the bounded repair loop

`signoff fix --patch FILE [--scope PREFIX]... [--run CMD]... [--budget SEC] [--check] [--json]`

It does not pretend to write code; it decides whether a patch may stay. Four conditions, and a
missed one rolls the whole thing back:

1. **the baseline must be red** — a fix without a reproducer is just extra change, so a green
   baseline exits 2;
2. **the patch must stay inside `--scope`**; anything else is refused;
3. **the verdict path cannot be patched by this loop**: `bin/`, `lib/p1..p5`/`guard`/`core`/
   `integrity`/`secrets`/`fix`, `gates/`, `.github/workflows/`, `.signoff/`. Gate changes go through a
   normal commit with a human reading the diff;
4. **after the patch it must be red -> green, with anti-tamper clean and nothing else moved**
   (a new untracked file counts as moved).

The tree must have no tracked modifications (HEAD is the rollback point); untracked files do not
block it. Every decision is appended to `.signoff/fix-log.jsonl`: the patch, the files, both exit
codes, the anti-tamper verdict, kept or rolled back, and why.

Exit codes: `0` kept, `1` rolled back, `2` refused (usage, dirty tree, already green, out of scope,
verdict path).

### signoff dispute: reproduction is the evidence

`signoff dispute --claim TEXT --run CMD [--expect pass|fail] [--repeat N] [--budget SEC] [--json]`
`signoff dispute --replay FILE [--json]`

Whether "it passes" is not settled by argument but by running the same reproducer on the same tree,
repeatedly. Three outcomes, each with its own exit code:

| Repeated result | Verdict | Exit |
| --- | --- | --- |
| passes N of N | the claim holds | 0 |
| fails N of N | the claim is refuted | 1 |
| some pass, some fail | unresolved: there is no reproducible claim yet | 3 |

The third row is the one people skip. It turns "flaky" from an adjective into a score (p/N) and keeps
the exit code, duration, stdout digest and tail of every attempt. No reproducer (`--run`) or no stated
claim (`--claim`) exits 2; if the total time exceeds `--budget` it refuses to force a verdict, exits 2
and says how many attempts ran.

Evidence goes to `.signoff/disputes/<time>-<id>.json` with an environment fingerprint (node version,
platform, arch, git short hash, directory). `--replay` reads a record, reruns the same commands and
compares verdicts: same exits 0, changed exits 1.

### signoff review: attestation bound to a diff hash

`signoff review --by ID [--model PROVIDER/MODEL] [--verdict approve|reject] [--note TEXT] [--json]`
`signoff review --verify` · `signoff review --status` · `signoff review --list [--limit N]`

An attestation proves exactly one thing, and it is the thing that matters: **the diff that was
reviewed is the diff being shipped**. The sha256 short hash of the diff is stored with the review in
`.signoff/reviews.jsonl`; change one byte and the hash changes, so the old approval stops applying.

`--by` and `--model` are self-declared — any tool saying "I reviewed it" is only saying so, and this
does not pretend to verify that someone actually read the code. What it verifies is the binding:
`--verify` recomputes the hash of the staged diff (or the working diff when nothing is staged) and
exits 0 only when an `approve` exists for that exact hash, otherwise 1, printing which hash was last
approved.

### signoff patterns: the failure-pattern library

`signoff patterns [--min N] [--top N] [--since DAYS] [--md FILE] [--json]`

Reads `.signoff/runs.log` (gate / ok / duration per run) and the ledger `.signoff/audit.log`
(action / decision), groups scattered failures into patterns of "the same place going red again" and
sorts by count. One failure carries no information; repetition does — it means the last fix did not
touch the cause. `--min` (default 2) sets what counts as repetition.

From this repository (423 run records):

```
[patterns] gate:p5 x18/114 (16%) last ... recurring
[patterns]   same gate failed 18 times — the previous fix probably did not touch the cause
[patterns] gate:p1 x6/115 (5%) last ... recurring
```

`--md FILE` exports a Markdown table for a weekly review.

<!-- EN-END -->
