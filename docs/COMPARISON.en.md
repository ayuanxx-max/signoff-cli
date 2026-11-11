# How SignOff compares: position, quadrant, scores

> Anonymity rule (in force since 2026-11-11, for every comparison we publish): peers are labelled by category
> only — A platform, B hooks (the three implementations are B1/B2/B3), C secret scan, D prose rules, E supply chain,
> F coverage. No vendor names, no published mapping, no per-peer star or download figures; magnitudes at most.
> The per-dimension scores are my judgement, with the reasoning in each row — not a third-party benchmark.

## 1. Position first

SignOff is not a linter, not a formatter, not a code reviewer. It answers one question:
**did this commit actually pass — and if it did, on what evidence?**

So the real peers are not "find bugs for you" reviewers. They are the layer that decides whether a commit
may enter: the hook layer (B1 / B2 / B3). They compete with SignOff for the same file: `.git/hooks/pre-commit`.

## 2. Adoption size (magnitudes only)

| Peer | Gives a verdict | Keeps evidence | Adoption |
| --- | --- | --- | --- |
| B1 | no (exit code only) | no | tens of millions/week+ |
| B2 | partial (records that it ran) | no | tens of millions/week+ |
| B3 | no | no | tens of millions/week+ |
| C | one-gate result | scan report only | tens of thousands of stars |
| **SignOff** | **yes** | **yes** | **a few thousand/week** |

The table keeps only checkable behaviour and magnitude: **no implementation language, no package names, no exact
per-peer numbers.** Anything that can be traced back to a specific project defeats the anonymous labels.

Two things a reader sees immediately:

1. **Four to five orders of magnitude apart.** Not "built worse" — a **distribution** gap:
   B1 ships inside the `package.json` of tens of thousands of scaffolds; SignOff has to be installed on purpose.
2. **SignOff is the only one here that both decides and keeps evidence — and it is the least used.** Both are true.

## 3. Six dimensions (0–5)

Scored on behaviour that can be checked in each project's own documentation, not on marketing copy.

| Dimension | B1 | B2 | B3 | C | SignOff |
| --- | --- | --- | --- | --- | --- |
| Verdict (machine-readable conclusion about "done") | 1 | 2 | 1 | 3 | **5** |
| Evidence (records you can re-check later) | 0 | 1 | 0 | 1 | **5** |
| Coverage (how many delivery failures one run covers) | 1 | 2 | 1 | 1 | **5** |
| Footprint (fewer dependencies scores higher) | 5 | 4 | 5 | 5 | 4 |
| Agent fit (MCP / exit code / no interaction) | 2 | 3 | 2 | 3 | **5** |
| Scale (adoption, external data) | **5** | **5** | 4 | **5** | 1 |
| **Total** | 14 | 17 | 13 | 18 | **25** |

Why each cell:

- **B1**: installs the hook and calls your command. A non-zero exit blocks the commit; beyond that it neither
  explains nor records anything. Almost no dependencies, one line of config — hence the full footprint score.
- **B2**: adds a layer of "hook source + version + runtime" management and can run hooks supplied by others, so
  coverage and footprint are a notch better. It records *that* it ran, not what the verdict for this commit was.
- **B3**: parallel execution, fast start. Same position as B1, and the same zero for verdict and evidence.
- **C**: deep in one place (secrets), with its own rules and baselines, so the verdict score is 3 — but it answers
  only "is there a secret".
- **SignOff**: one gate per class of failure, the verdict is the exit code, and a pass leaves a marker + a signed
  trailer + a hash-chained ledger + an anchored checkpoint. Loses one footprint point: needs Node 18+ and a git
  repo, and installing the hook takes one `signoff init`.

## 4. Four quadrants

![Verdict trustworthiness vs adoption](https://raw.githubusercontent.com/ayuanxx-max/signoff-cli/master/docs/diagrams/quadrant.png?v=4.4.3)

The horizontal axis is external adoption, the vertical axis is "verdict + evidence". The quadrant names are the
conclusion:

- **Bottom right (large, decides nothing)**: B1 / B3 / C. They make checks run; they do not declare completion.
- **Top right (large and verifiable)**: empty today. That is not a position SignOff holds — it is one it cannot reach.
- **Top left (verifiable, nobody uses it)**: SignOff sits here now. Honestly, products in this quadrant disappear
  most easily — not because they are wrong, but because nobody needs them yet.
- **Bottom left**: a hook installed that decides nothing, which is the same as no hook.

The point of the picture: **SignOff's problem is not capability, it is that demand has not caught up.**
Moving right means either being carried by someone else's defaults (distribution) or being forced by a real
situation (scenario).

## 5. Where it fits

**Fits**

| Situation | Why this |
| --- | --- |
| Repos where agents deliver code | "I'm done" is the claim with the least evidence; the five gates map to the five usual overclaims |
| Several agents editing one repo | P3 catches colliding files before the commit, not after CI breaks |
| Answering "did that one pass?" months later | ledger + checkpoint + anchor, re-checkable entry by entry |
| Last step before a release | `signoff release --pre` runs 14 offline consistency checks |
| Small language-agnostic teams | Node 18+ and git only; no Python/Go/container requirement |

**Does not fit**

| Situation | Use instead |
| --- | --- |
| Not a git repository | no hook, and no tree to sign |
| "Fix it until it is green" | a verdict tool should not be a participant; use a linter/fixer |
| Runtime sandboxing against hostile commands | container/CI isolation; see the "what we do not do" list in `docs/trust.md` |
| Build orchestration for a huge monorepo | CI matrices and caching; SignOff only decides, it does not build |

## 6. What changed from 4.3.1 to 4.4.0

![4.3.1 to 4.4.0](https://raw.githubusercontent.com/ayuanxx-max/signoff-cli/master/docs/diagrams/before-after.png)

| Dimension | 4.3.1 | 4.4.0 |
| --- | --- | --- |
| How downstream depends on it | read `report --json`, guess the fields | `signoff report --schema` states three levels of stability |
| Upstream/downstream boundary | verbal | `docs/INTEGRATION-CONTRACT.md`: upstream only produces inputs, downstream only consumes outputs |
| Architecture self-check | none | `arch-health` with four rules + a baseline ledger (38/40 today) |
| Value measurement | none | reversal rate 42.9% / rework 2.33 rounds / skip rate 0% (dsh-signoff sample) |
| Security disclosure | no `SECURITY.md` | states "not third-party audited" + A1–A7 + a 9-item readiness list |
| Deletion discipline | none | D1–D4 |
| Verdict logic | — | **unchanged** (exit codes 0/1/2, five gates, ledger format all as before) |

## 7. The honest gaps

1. **This tool: single-digit stars, a few thousand weekly downloads. B1: tens of thousands of stars, tens of
   millions of weekly downloads.** Four to five orders of magnitude — not something one release closes; it takes
   getting into other people's default configuration.
2. Of those few thousand weekly downloads, how many are CI and npx repeats is unknown to me; the real user count is not.
3. **No third-party security audit** (`SECURITY.md` says so) and no external user case studies.
4. "Scale" is one of the six dimensions and SignOff scores 1 on it — **if you choose by adoption, today is not the
   day to pick it.** The only reason is that you need the verdict and evidence nobody else provides.

Chinese original: [`COMPARISON.md`](COMPARISON.md)
