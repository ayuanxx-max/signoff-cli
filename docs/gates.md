# 七道关：判定与修法

> English: [gates.en.md](gates.en.md) · 报告契约：[REPORT-CONTRACT.md](REPORT-CONTRACT.md)

每关一条命令，判决写 `.signoff/pN.json`，退出码 0 过 / 1 红 / 2 用法或环境。全部是 Node 实现
（`lib/p1.js`…`lib/p5.js`、`lib/guard.js`、`lib/secrets.js`），只要求 Node 20+，没有 Python 版本，也没有降级模式。

## p1 测试

`signoff p1 [--run CMD]... [--budget SEC] [--install-hook] [--json] [--quiet]`

- 缺省命令：有 `tests/` 用 pytest，否则 `npm test --silent`；`--run` 可重复，按给定顺序跑。
- `--budget` 是所有命令合计的秒数（默认 180），超时判红；不按「用例少就算过」折中。
- 结果形如 `{"gate":"p1","ok":true,"elapsedMs":39,"budgetMs":180000,"cases":3}`，用例数从
  `N passed` / `N tests` / `N checks` 里取最大值。
- `--install-hook` 写 `.git/hooks/pre-commit`（内容就是 `signoff p1`）。

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

<!-- EN-BEGIN auto-embedded from docs/gates.en.md; edit that file and run node tools/sync-bilingual.mjs -->

## English

## The seven gates: verdict and fix

> 中文: [gates.md](gates.md) · Report contract: [REPORT-CONTRACT.md](REPORT-CONTRACT.md)

One command per gate. The verdict is written to `.signoff/pN.json` and the exit code is 0 pass / 1 red /
2 usage or environment. Everything is Node (`lib/p1.js` … `lib/p5.js`, `lib/guard.js`, `lib/secrets.js`) and needs
only Node 20+: there is no Python build and no degraded mode.

### p1 Tests

`signoff p1 [--run CMD]... [--budget SEC] [--install-hook] [--json] [--quiet]`

- Default command: pytest when `tests/` exists, otherwise `npm test --silent`; `--run` is repeatable and runs in order.
- `--budget` is the total number of seconds for all commands (180 by default). Over budget is red; there is no
  "count fewer cases" fallback.
- Result shape: `{"gate":"p1","ok":true,"elapsedMs":39,"budgetMs":180000,"cases":3}`. The case count is the largest
  number found in `N passed` / `N tests` / `N checks`.

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

<!-- EN-END -->
