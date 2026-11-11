# SignOff

> You do not have to change anything. Keep working as usual — this thing guards the process for you.

SignOff turns "done" into **a verdict someone else can re-check**: all seven gates pass, or the commit is stopped
on the spot with a fix you can act on. Pure Node (>= 18) — no network, no account, no Python. The verdict is an exit
code: `0` pass, `1` red, `2` usage or environment error.

中文: [README.md](README.md)

---

## 1. Up and running in 30 seconds

```bash
npm i -g signoff-cli
cd your-repo
signoff init            # installs pre-commit / commit-msg hooks + CI, then you can forget it
signoff status          # is this repository guarded right now?
signoff report --html   # one read-only page (writes .signoff/report.html by default)
```

Once per machine is enough: `signoff ensure` idempotently fills in hooks, config and CI for every new clone.

---

## 2. The seven gates: what actually blocks you

| Gate | Name | What it blocks | When it is red |
| --- | --- | --- | --- |
| p1 | Tests | tests not run, run and failed, or over budget | fix the failing case, do not raise the budget |
| p2 | Coverage | code changed but no scenario covers it | add `verify/scenarios/*.json` |
| p3 | Tasks | two parallel tasks touching the same file | split them by task-card scope |
| p4 | Risky actions | drop-database / permission / publish actions with no record | run `signoff p4 ask` first |
| p5 | Docs | absolute claims with no number behind them | say it plainly, add the number |
| sec | Secrets | a real credential in the staged set | delete the value, or allow that one rule in `.signoff/config.json` |
| release | Release | version / `server.json` / `CHANGELOG` / tag disagree | align all four, then `signoff release --pre` |

The judgement rules live in one place: [docs/gates.en.md](docs/gates.en.md) (中文: [docs/gates.md](docs/gates.md)).
Ask the same question in the terminal: `signoff explain p1`.

![SignOff architecture: who calls, who judges, where the result lands, what it depends on](docs/diagrams/signoff-1-capability-en.png)

Three red lines are never relaxed in any mode: `--no-verify`, `SIGNOFF_SKIP=1`, and moving a threshold to turn red into green.

---

## 3. The board: one page first, then open the rest

- `signoff report --html`: a single self-contained file (opens offline, no external references) with seven badges,
  a month calendar and a task view.
- **It speaks in project names**: every task group reads "SignOff project update 4.4.x", and the last gate run is
  labelled the same way; a group with no version falls back to "SignOff · area".
- **The SignOff panel in the DSH menu**: lists one page of data (verdict, seven gates, last gate run, task groups) and
  only shows "Open full page" once that page is full.
- Several repositories: `signoff report --repos a,b` or `signoff report --scan ~/code` — each repo keeps its own verdict.
- For another machine or another agent: `signoff report --html --mount` writes to `~/.signoff/reports`, which is what
  the panel reads.

![How it works: commit -> guard picks the gates -> verdict -> four layers of evidence](docs/diagrams/signoff-4-flow-en.png)

Platforms and thin shells: one core, several entry points — see [docs/SURFACES.en.md](docs/SURFACES.en.md).

---

## 4. Integrations: one verdict, six entry points

| Entry | In one line |
| --- | --- |
| Local hooks | `signoff init` installs pre-commit / commit-msg; they run on every commit |
| GitHub Actions | `signoff init` also writes the workflow (`--no-ci` skips it) |
| pre-commit | one hook line in `.pre-commit-config.yaml` |
| lefthook / husky | repos that already have hooks use `signoff init --chain`; your hooks stay |
| VS Code | `signoff init --editor vscode` writes tasks + a problem matcher |
| MCP | `signoff mcp` serves the same gates over stdio |

Step-by-step: [docs/integrations.en.md](docs/integrations.en.md) (中文: [docs/integrations.md](docs/integrations.md)).

---

## 5. Versus the neighbours (always anonymous)

The comparable thing is not a code-review tool; it is **whatever else can grab the same `pre-commit` hook**. Only
decidable behaviour and order of magnitude stay in the table:

| Peer | Verdict | Evidence | Adoption |
| --- | --- | --- | --- |
| B1 | no (exit code only) | no | tens of millions / week and up |
| B2 | half (records that it ran) | no | tens of millions / week and up |
| B3 | no | no | tens of millions / week and up |
| C | single-gate finding | scan report only | tens of thousands of stars |
| **SignOff** | **yes** | **yes** | thousands / week |

No implementation language, no package name, no exact peer numbers: any of those makes the label pointless.
Full table: [docs/COMPARISON.en.md](docs/COMPARISON.en.md).

---

## 6. Limits: what it does not promise

- **It does not decide for you.** Seven green gates mean seven things were done and recorded — not that the product is right.
- **The scale gap is real.** Peers sit at tens of millions of runs per week; this tool sits at thousands.
  **If you buy by adoption, you should not pick it today.**
- **No third-party audit.** The ledger is self-signed on this machine: it shows nobody quietly edited it, not that the
  person running it is trustworthy.
- **It is not code review.** It stops "unverified, declared done", not "ugly but working code".

Trust model and what it does not prove: [docs/trust.en.md](docs/trust.en.md).

---

## 7. Documentation index

**For users**

| Doc | Content |
| --- | --- |
| [docs/gates.en.md](docs/gates.en.md) | judgement rules and fixes for the seven gates (single authority) |
| [docs/integrations.en.md](docs/integrations.en.md) | hooks / CI / MCP / editor wiring |
| [docs/trust.en.md](docs/trust.en.md) | evidence chain, tamper answers, threat model |
| [docs/COMPARISON.en.md](docs/COMPARISON.en.md) | anonymous comparison (with the quadrant image) |
| [docs/SURFACES.en.md](docs/SURFACES.en.md) | platform shells at a glance |

**For maintainers**

| Doc | Content |
| --- | --- |
| [docs/ARCH-HEALTH.md](docs/ARCH-HEALTH.md) | architecture self-check: dependency cycles, oversized files, baseline |
| [docs/deletion.md](docs/deletion.md) | uninstall and data-deletion boundary |
| [docs/promotion.md](docs/promotion.md) | how the project is described in public |
| [docs/diagrams/README.md](docs/diagrams/README.md) | diagram sources and redraw command |

**Contracts (read before changing code)**

| Doc | Content |
| --- | --- |
| [docs/REPORT-CONTRACT.md](docs/REPORT-CONTRACT.md) | report page and `--json` contract (C1…C11), Chinese only |
| [docs/INTEGRATION-CONTRACT.md](docs/INTEGRATION-CONTRACT.md) | wiring contract for each platform shell, Chinese only |

The English and Chinese sets are structurally identical: every doc above has an `.en.md` twin except the two contracts,
which are Chinese-only by design.

---

## License

MIT. See [LICENSE](LICENSE).
