# Release and commercial model: should this be paid today

> 中文: [release-model.md](release-model.md)（the same content in Chinese, also at the end of this file）

Bottom line: **the core stays MIT and free; nothing is charged today.** Not for lack of appetite — three pieces of
evidence are still short of the threshold. If it is ever paid, the only defensible shape is "team compliance pack +
hosted board", and only after adoption grows by an order of magnitude.

## 1. The facts today

| Metric | Value | Source |
| --- | --- | --- |
| npm downloads per month | 3,237 (about 461/week) | `api.npmjs.org` last-month, 2026-10-11 → 2026-11-09 |
| Release cadence | 4.4.5 → 4.5.0, two feature releases in two weeks | `CHANGELOG.md` |
| User profile | single machine, single repository, individual developers | samples in the report page and panel |
| Runtime dependencies | zero (Node >= 18 and git only) | `package.json` |
| Billing infrastructure | no account, no server, no metering | product constraint (the verdict cannot be bought) |

## 2. Three candidate segments

| Segment | Demand signal | Existing substitute | Reason to pay | Does the pay point sit inside this tool? |
| --- | --- | --- | --- | --- |
| Teams / large collaboration (5–200 people) | weak to medium: cross-repo consistency, re-checking after someone leaves, shared wording | free hook layers (peers B1/B2/B3), built-in CI checks | aggregating evidence and audit export, not "one more hook" | no: needs a server and accounts |
| AI clusters / agent farms | growing: agents need a machine-readable verdict and quotas | home-grown scripts, CI matrices | policy distribution, rate limits, cost attribution | no: also server-side |
| Compliance procurement (finance, health, large enterprise) | weak: needs a third-party audit and a contracting entity first | commercial SAST/SCA suites | transfer of liability (contract, SLA, caps) | partly: needs a company and an audit, not code |

All three share one property: **the verdict itself has no pricing power**, because free peers already compete for the
same `pre-commit` hook. What can be sold is evidence, policy and liability around the verdict.

## 3. Teams: real need, but not inside the CLI

- The pain is "can a third party re-check this" and "can I see a dozen repositories in one table".
- Both need an aggregator: who, when, which repository, which gates, and whether anything was bypassed.
- An aggregator implies accounts, permissions, retention and revocation — in direct conflict with "no account, no
  network, local only".
- So it can only be an **optional product** (hosted or self-hosted), never something the CLI depends on.

## 4. AI clusters: demand is growing, but not for another hook

- What agents need is machine-readable output; `--json` and `signoff mcp` already provide it and must stay free,
  otherwise the agent ecosystem will not adopt it.
- At cluster scale the scarce resource is quota, concurrency and cost attribution, not judgement logic; that belongs
  to the scheduler, and this tool only supplies the verdict input.
- Current evidence: about 3,237 downloads a month means real use is still individual; on the agent side there is a
  technical requirement but no measurable willingness to pay.

## 5. If it is charged, only two shapes survive

| Shape | Sells | Does not sell | Price hypothesis (unverified) |
| --- | --- | --- | --- |
| Hosted board (SaaS) | multi-repo aggregation, retention, permissions, audit export | the verdict, pass or fail | 60–120 USD per seat per year; team tier per org |
| Team compliance pack (self-hosted + support) | policy templates, audit material, response time, liability caps | any switch that turns red into green | from 3,000–10,000 USD per org per year |

No per-run billing: it rewards skipping runs, which is the opposite of guarding the process.
And no "pay to pass": that would turn the verdict into a commodity and break the first red line.

## 6. What is explicitly not being done now

- No billing system (before adoption, it is pure liability).
- No telemetry (it would erase the "local, no account" difference and add privacy compliance cost).
- No license change for revenue: the core stays MIT, paid products live in their own repository or service.

## 7. When to re-evaluate

Re-evaluate when both are true; with only one, keep watching:

1. weekly npm downloads above 5,000 for four consecutive weeks (today about 461/week — one order of magnitude away);
2. three or more organisations explicitly ask for procurement, compliance or an SLA, with a budget window.

## 8. Version branches: the detailed case

### 8.1 Where usage actually sits

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

### 8.2 Three explanations, no verdict yet

| Explanation | How to disprove it | Status |
| --- | --- | --- |
| Lockfiles pin the version (`npm ci` does not upgrade) | see whether `latest` also has traffic; people who pin do not install latest | latest has no traffic → pinning fits |
| Mirrors or crawlers fetch specific versions | mirrors follow `latest`, they do not pick 4.1.9 | 4.1.9, 4.1.1, 4.1.2 each have hundreds, which mirrors do not do |
| Something after 4.2 put people off | check whether 4.2.0 is marked breaking in the CHANGELOG | 0 of 73 sections carry `BREAKING`, so it cannot be answered |

None of the three is established, and all three point at the same operational conclusion: **upgrade friction is the main
problem**.

### 8.3 The data overturns my previous conclusion

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

### 8.4 Three gaps in the upgrade path

| Gap | Today | Fix | Cost |
| --- | --- | --- | --- |
| Breaking changes are invisible | 0 of 73 CHANGELOG sections carry `BREAKING` | mark each one and add the migration step | docs, one-off |
| No "you are N minors behind" hint | `signoff doctor` only checks the environment | add a local version comparison (network optional, skipped offline) | a dozen lines |
| No single migration guide | upgrading means reading five CHANGELOGs | `docs/upgrade.md`: per version, what changes and which line to edit | docs, one-off |

None of these creates a branch, adds CI jobs or needs an account, and each acts directly on the 70.5% group.

### 8.5 What a branch really costs: minutes and attention

| Item | Size | Note |
| --- | --- | --- |
| One CI run | median 1.7 minutes (14 parallel jobs, 5 successful runs sampled) | parallel, so wall time is not the main cost |
| Extra job runs per year | 12 releases × 14 ≈ 168 | quota and failure surface, not money |
| Docs | the Chinese body embeds the English text, so one edit touches three places | fixed cost of bilingual docs |
| CHANGELOG | two lines accumulate | readers must work out whether their version got the fix |
| Attention | one maintainer, one more line to remember the state of | the scarce resource |

Conclusion: a branch is not unaffordable — it would simply fix the wrong thing today. It patches old-line
vulnerabilities while the problem is upgrades.

### 8.6 Channels: add `snapshot`, not `next` / `maintenance`

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

### 8.7 If it is ever paid, branches turn into an asset

| Shape | Relation to branches | Recovers its cost |
| --- | --- | --- |
| Free `latest` | no branch needed | — |
| Free `snapshot` | no branch needed, only a release routine | — |
| Paid "pinned version + 12 months of fixes" | **requires a maintenance line** | yes: the contract term is the commitment |
| Paid hosted board | no branch needed, needs a server | unrelated to branches |

This is the only shape where a branch pays for itself, and it is where condition C in 8.8 comes from.

### 8.8 Revised triggers

| Condition | Threshold | What to do |
| --- | --- | --- |
| A usage | an old minor above 30% of downloads for four weeks | fix the upgrade path (the three items in 8.4), no branch |
| A + B | that old line has a security or data issue that must be fixed | open a maintenance branch and pay the cost in 8.5 |
| C commercial | a paying customer asks for "pinned version + fix window" | open the branch and put the promise in the contract |
| D security event | one high-severity issue needing fixes on two lines | fix both by hand first, then decide whether to formalise |

### 8.9 Reproducing

The 4.7.0 rollback removed `tools/release-cadence.mjs`; the script itself is still in history:
`git show d7cee80:tools/release-cadence.mjs > tools/release-cadence.mjs`.
Without it, `curl https://api.npmjs.org/versions/signoff-cli/last-week` and aggregate by minor.
