# The review pipeline: five layers, ratios, order, cost

This document answers one question: **what the "review" in this repository is made of, when each layer takes part, what it costs, and what it does not do.**

It adds no product promise: `signoff` still decides by exit code only, still has zero runtime dependencies, and is still offline by default.
Model review from outside (L3 below) always sits outside the evidence chain — it produces **candidate assertions**, not verdicts.

## 1. Five layers, one question each

| Layer | Form | The only question it can answer | What it cannot answer |
| --- | --- | --- | --- |
| L0 static | `node --check`, lint, `tsc`, semgrep | do syntax/type/pattern errors exist | is the behaviour right |
| L1 assertions (the only scoring layer) | self-test cases (630 today) | does the behaviour **I thought of** still hold | behaviour I did not think of |
| L2 disproof | negative control (NC), mutation testing | **can** these assertions go red | do the assertions cover the requirements |
| L3 independent review | hosted model / audit subagent / local model | what did I **not** think of | deterministic judgement (it drifts) |
| L4 environment matrix | multi-point CI | does it still work on another OS/Node | is the logic right |
| L5 human | you | ship or not | correctness of details |

Criterion: a review layer earns its place only when it can say no, can be recomputed, and does not share a blind spot with the others.

**Scoring rule: only L1 and L2 score. L3 yields candidate assertions, never verdicts; L4 only proves the environment is reproducible; L5 only has a veto.**
Mixing layers — letting L4 green speak for L1 — is where "it looks reviewed" comes from.

## 2. Ratio: allocated by the surface being changed

| Surface | L0 | L1 | L2 | L3 | L4 | L5 |
| --- | --- | --- | --- | --- | --- | --- |
| docs / copy | no | p5 | no | absent | push | release |
| tests only | yes | always | always | 30% | push | release |
| single-file logic | yes | always | when tests touched | 30% | push | release |
| cross-file contract / refactor | yes | always | yes | always | push | release |
| gate semantics / exit codes / security / release scripts | yes | always | yes | always + two people | push | required |
| dependencies / build | yes | always | yes | always | push | release |

As participation per iteration: L1 and L4 every time; L2 about half (only when tests change); **L3 about 20–30%**; L5 only at release.

L3 has the least marginal value where assertions can express the problem, and the most where they cannot. Running L3 on everything is waste; skipping it on the high-risk surface means meeting the problem at release time.

**A layer that does not take part has to print `skip` and the reason** (`signoff guard` does this): the ratio itself is not the problem, silent downgrade is.

## 3. Order: four things that cannot be swapped

```text
write → freeze the diff → L0 static → L3 independent review → turn comments into assertions → L2 disproof → L1 full → push (L4) → L5 sign-off
```

| If you swap it | Consequence |
| --- | --- |
| L4 before L3 | CI just repeats the local run; review comments arrive too late to become assertions |
| assertions before L3 | anchoring: review reads through the existing assertions and misses everything outside them |
| changing the diff after L3 | what was reviewed is not what ships (this is what `signoff review --verify` exists for) |
| no L2 after asserting | you get an assertion that is always green, which is worse than none |

## 4. Effect on quality and time (estimates, with assumptions)

Estimates use measurements from this machine: 98.8k tokens of context per step, 94.7% cache hit rate, about 45 steps per iteration, diffs of 62–231 lines.

| Change | Quality effect | Time effect |
| --- | --- | --- |
| add L3 (high-risk surface only) | better: all 13 findings of this round's audit landed on the high-risk surface (`lib/guard.js`, `lib/p2.js`, `lib/release.js`, `action.yml`, version snapshots) | review call 15–30 s; reading the comments 1–3 min (only in 20–30% of iterations) |
| feed L3 the diff only, not the repo | **may get worse**: less context makes cross-file defects harder to see. Not measured; needs a replay set | 16× fewer input tokens |
| merge independent read-only calls (45 → 25 steps) | unchanged: only independent read-only calls are merged, gate commands are not | about 44% less model time |
| diff size cap of 400 lines | better (industry rule of thumb, not measured here) | one extra split, about +2 min |
| mutation testing | better: it measures whether the assertions have teeth | 15–30 min locally, can run in parallel |

Honest conclusion: **quality does not drop because layers participate selectively**, since the participation is visible. What can drop quality is "feed L3 only the diff", which buys 16× fewer tokens and needs a replay set before it is kept.

## 5. Cost model

Price assumptions: V4.1-Flash at 0.05 / 0.20 per million tokens (input/output), cache hits at 1/10; frontier at 3 / 15 (US dollars). These are list-price assumptions, not an invoice.

| Item | Per iteration | Note |
| --- | --- | --- |
| baseline: 45 steps × 98.8k | **about 0.27** (about 1.6 without a cache discount) | CNY; this is where the cost is |
| L3 hosted diff review (once) | 0.002 (Flash) / 0.15 (frontier) | 3k in / 0.8k out |
| L3 audit subagent (one in five) | 0.006 (Flash) / 0.39 (frontier) | 10k in / 1.6k out |
| L3 local model (once) | 0.02–0.27 | electricity + hardware amortisation |
| L2 mutation testing (local) | 0 | time only |
| L4 private-repo CI, one more tier | 0.72 | public repos are 0 |

Two combinations:

| Combination | Per iteration | Versus baseline |
| --- | --- | --- |
| cheap: local model resident + hosted review of high-risk only + audit one in five | 0.31–1.65 | about +10% |
| frontier: hosted review every time + frontier audit one in five | 0.82–2.14 | +33% to +190% |

Levers for cost, largest first: **cut steps** (45 → 25 saves about 44%), **keep the cache** (94.7% down to 80% costs about 3×), feed only the diff (16×), trigger by layer, run L0 first to drop low-level noise, cap review output length, and move already-asserted comments into a replay set.

## 6. What it does not do

- it does not put a model inside `signoff`, and does not change any gate's exit code;
- it does not let an L3 "looks fine" replace any assertion;
- it does not go online on the default path;
- it does not promise detection rates: the best model on the planted-defect review task reaches an F1 around 32.3, so L3 is a supplement, never the criterion.

## 7. Where it stands

| Item | Status |
| --- | --- |
| absent layers print skip and the reason | already mechanism (`signoff guard`) |
| review attestation bound to the diff hash | already mechanism (`signoff review --verify`) |
| optional pre-push review check | already mechanism (`review_on_push`) |
| risk grading → decides L3 strength | discipline (human judgement) |
| diff size cap | discipline (to become a check) |
| mutation testing | tool in place (`node tools/mutate.js`). Measured baseline: 8 sampled mutants, 3 killed (37.5%); the first 8 sites (formatting helpers) all survived (0/8). The CLI-parsing and output-format branches of p2/cov are not watched by any assertion |
| defect replay set | in place (`node tools/replay.js`): four historical defects, each must go red as soon as it is put back |
| defect density / escape rate metrics | not implemented |
