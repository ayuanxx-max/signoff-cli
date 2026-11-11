# The seven gates: verdict and fix

> 中文: [gates.md](gates.md) · Report contract: [REPORT-CONTRACT.md](REPORT-CONTRACT.md)

One command per gate. The verdict is written to `.signoff/pN.json` and the exit code is 0 pass / 1 red /
2 usage or environment. Everything is Node (`lib/p1.js` … `lib/p5.js`, `lib/guard.js`, `lib/secrets.js`) and needs
only Node 20+: there is no Python build and no degraded mode.

## p1 Tests

`signoff p1 [--run CMD]... [--budget SEC] [--install-hook] [--json] [--quiet]`

- Default command: pytest when `tests/` exists, otherwise `npm test --silent`; `--run` is repeatable and runs in order.
- `--budget` is the total number of seconds for all commands (180 by default). Over budget is red; there is no
  "count fewer cases" fallback.
- Result shape: `{"gate":"p1","ok":true,"elapsedMs":39,"budgetMs":180000,"cases":3}`. The case count is the largest
  number found in `N passed` / `N tests` / `N checks`.

## p2 Coverage

`signoff p2 [--min-scenario N] [--min-assertions N] [--strict] [--md FILE] [--json]`

Scans the root plus any directory under `packages/` and `apps/` that has a `package.json` or `verify/`:

| Level | Evidence |
| --- | --- |
| `scenario` | every `verify/scenarios/*.json` parses and at least one has a `checks` array |
| `harness` | only pages under `verify/` |
| `smoke` | only `package.json` |
| `missing` | none of the above |

`--strict` turns `harness` / `smoke` / `missing` red. `--md FILE` writes the coverage table.

## p3 Parallel tasks

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

## p4 Risky actions

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

## p5 Docs

`signoff p5 [FILES...] [--pack zh|en|both] [--rules FILE] [--allow RULE] [--json]`

Defaults to `README.md CHANGELOG.md docs/`. Rules: placeholders, AI filler, absolute claims without a number,
stacked empty adverbs, and "covered"/"all pass" style claims with no number. Fenced code and table rows starting with
`|` are skipped. `--allow` waives one rule; `--rules` loads an extra word list.

## sec Secrets

`signoff secrets [--staged|--all] [--json]`. The default engine is built in (word list + high-entropy detection);
when gitleaks is installed, `--engine gitleaks` can be used as an independent cross-check.

## release

`signoff release --pre|--post`. `--pre` packs, installs into a temp directory, runs `--version` and completes an
`mcp` handshake. `--post` checks npm `latest`, registry `isLatest` and `packages[].version`, plus README image links.
Four things must agree: the `package.json` version, the `server.json` version, the top `CHANGELOG.md` entry, the git tag.

## The guard: which gates run in the hook

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

## Audit boundary

`signoff audit [--range A..B] [--strict] [--since-install]`. `--since-install` looks only at commits after the install
point, and first checks that the point is an ancestor of HEAD. After a rebase, force-push or fresh clone it exits 2;
move the boundary with `signoff init --reset-install`.
