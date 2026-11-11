# The seven gates: verdict and fix

> 中文: [gates.md](gates.md) · Report contract: [REPORT-CONTRACT.md](REPORT-CONTRACT.md)

One command per gate. The verdict is written to `.signoff/pN.json` and the exit code is 0 pass / 1 red /
2 usage or environment. Everything is Node (`lib/p1.js` … `lib/p5.js`, `lib/guard.js`, `lib/secrets.js`) and needs
only Node 18+: there is no Python build and no degraded mode.

## p1 Tests

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

## signoff fix: the bounded repair loop

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

## signoff dispute: reproduction is the evidence

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

## signoff review: attestation bound to a diff hash

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

## signoff patterns: the failure-pattern library

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
