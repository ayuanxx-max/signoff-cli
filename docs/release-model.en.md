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
| Runtime dependencies | zero (Node >= 20 and git only) | `package.json` |
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

A parallel branch is not something you owe the world because you have version numbers. The cost of opening one is
computable; so must the benefit be. This section measures our own record, then the external signals, then states the
decision and its triggers.

### 8.1 Our own release record

| Metric | Value | How |
| --- | --- | --- |
| Tags | 70 | `git tag` |
| Span of the commits the tags point at | 2026-11-06 → 2026-11-11 (5 days, one week) | `git log -1 --format=%cs <tag>` |
| Gap between adjacent releases | median 0 days, max 2, 65 of 69 same day | same |
| CHANGELOG sections / of which marked `BREAKING` | 73 / 0 | search `BREAKING`, `不兼容`, `破坏性` |
| npm dist-tags | `latest` only | `npm view signoff-cli dist-tags` |
| Jobs per CI run | 14 (9 OS×Node matrix + arch-health + pack/install + python parity + arm64 + container) | run record |

Reading: all 70 releases land inside one week. That is "build it, ship it" iteration, not operations cadence.
It does not support "a release every few months, therefore LTS", and it does not support "we need a maintenance branch
right now" either. What can support a branching decision is the three external signals below.

### 8.2 Signal one: which version people stay on

npm downloads per version for the last week (relative shape within one endpoint):

| Version | Weekly downloads |
| --- | --- |
| 4.0.2 | 298 |
| 4.1.9 | 249 |
| 4.1.1 | 238 |
| 4.1.2 | 236 |
| 4.0.0 | 226 |
| 4.0.1 | 222 |
| `latest` (4.6.2) | not in the top six |

Two explanations both hold: lockfiles pin the version, or mirrors and crawlers fetch specific versions. They point the
same way: **upgrades do not happen by themselves.** Ship 4.7.0 today and the 4.0.x group will not follow.

Two honest limits. First, per-version counts include mirrors and CI traffic, so humans cannot be separated out.
Second, the per-version endpoint and the monthly point endpoint do not agree (the monthly point says 3,237/month, the
top six versions already sum to 1,469 in a week), so only the shape is used here; no conclusion rests on the absolute.

### 8.3 Signal two: the Node support surface

| Item | Was written | Actually tested | Conflict |
| --- | --- | --- | --- |
| Node version | `engines.node = ">= 20"` | CI matrix only 20 / 22 / 24 | 18 never ran in CI |
| Lifecycle of 18 | — | EOL since 2025-04-30 | declaring an unmaintained runtime |

Promising an untested support surface is worse than promising nothing: a user installs on 18 because the metadata
allows it, and when it breaks we have neither tested nor fixed anything. Decision: `engines.node` becomes `>=20`,
aligned with the CI matrix, and 18 leaves the claim. This is not a branching question, it is a promise question, but it
does set what a maintenance branch would have to cover: every extra runtime multiplies the branch test cost.

### 8.4 Signal three: how many interface layers, and which must be fixable on an old branch

| Layer | Example | Rate of change | Blast radius |
| --- | --- | --- | --- |
| Verdict | exit codes `0/1/2` | almost never | every script and hook |
| CLI flags | `--staged`, `--json`, `--lang` | medium | CI that hard-codes commands |
| `--json` fields | `contractVersion`, `checks[]`, `tasks[]` | medium | panel, MCP, external boards |
| Report contract | C1…C11 | low, but every change touches contract and tests | everyone reading the report |
| On-disk format | `.signoff/audit.log`, `checkpoint.json` | very low | history in existing repositories |

Only the report contract carries an explicit version (`contractVersion`); the rest ride on semver. What might genuinely
need a fix on an old branch is security and data corruption in the verdict and flag layers; report and on-disk changes
are supposed to be forward compatible. That is also why running without branches is not fatal today: breaking changes
concentrate in the slow layers, and the fast layers are forward compatible.

### 8.5 Channels: is one enough

| Channel | For whom | Cost | Needed now |
| --- | --- | --- | --- |
| `latest` | everyone | already there | keep |
| `snapshot`: tarball from every green master CI | AI clusters, internal mirrors, teams pinning a build | near zero: one more dist-tag on the same artifact | **yes**, see 8.7 |
| `next`: prerelease, 24 hours ahead | teams that want early verification | medium: another publish path and another explanation | on trigger |
| `maintenance`: old minor, security fixes only | teams pinned to an old version | high: 14 jobs per branch, CHANGELOG fork, bilingual docs in several places | on trigger |

`snapshot` is worth adding first because it creates no branch, only a pinnable coordinate. What a cluster wants is "which
exact artifact does this build correspond to", not "maintain a 4.6 line"; the latter answers "who patches vulnerabilities
in old versions", which is a different problem and should not be bundled with it.

### 8.6 The real cost of a parallel branch

Taking `maintenance` as the example, one security fix pays for:

| Cost | Size |
| --- | --- |
| CI | 14 more jobs per run (9 matrix + 5 standalone) |
| Docs | one copy per language, and the Chinese body embeds the English text, so one edit touches three places |
| CHANGELOG | two lines accumulate separately and readers must work out whether their version got the fix |
| Merge conflicts | the fix lands on master and on the old line, and conflicts grow with time since the fork |
| Promise | once "maintained for 12 months" is written, one miss is a credibility loss |

At roughly 461 downloads a week, those five costs do not buy back retention or revenue. Not impossible — just not
affordable now.

### 8.7 Decision: an N-1 support surface plus `snapshot`, no LTS yet

| Surface | Fix promise | Duration | Role |
| --- | --- | --- | --- |
| Newest minor and its patches (e.g. 4.7.x) | features, defects, security | until the next minor | the main line |
| Previous minor (e.g. 4.6.x) | security and data corruption only | 90 days | a buffer for people who cannot upgrade yet |
| Older than that | no fixes, only an upgrade path | — | saying no is more honest than vague promises |
| `snapshot` channel | no stability promise, only "corresponds to a green CI run" | — | pinning a build in a cluster |

Two companion rules:

1. **Breaking changes must be marked `BREAKING`.** 0 of 73 CHANGELOG sections say so today, which leaves readers
   guessing. From 4.7.0 on, a change to the verdict, a flag, a `--json` field or the on-disk format must carry
   `BREAKING` and the migration step.
2. **The semver boundary is written into the contract**: a `contractVersion` change means at least a minor; a change in
   exit-code semantics means a major.
3. **Raising `engines` is marked `BREAKING` but ships as a minor** (4.7.0 raises it to `>=20`). Dropping a runtime that
   reached EOL and was never in the CI matrix does not cost a user on a supported runtime anything; if a supported
   version is ever dropped, that one goes out as a major.

### 8.8 When a branch becomes mandatory

Three measurable conditions; hitting any one opens the branch, no judgement call:

| Condition | Threshold | Why that threshold |
| --- | --- | --- |
| Old-version share | one old minor above 30% of total downloads for four weeks | a real population is pinned there, so fixes must go back |
| Enterprise demand | three or more organisations asking for "pinned version plus fix commitment" | commitment is what a contract and a renewal are built on |
| Security event | one high-severity issue that must be fixed on two lines at once | we already do it by hand; a branch just formalises it |

Below those thresholds a `maintenance` branch is a liability: one more line to feed, one more doc to keep in sync, one
more "did my version get this" to explain. Above them, the cost is already computed in 8.6 — pay it and move on.

### 8.9 Reproducing these numbers

```bash
node tools/release-cadence.mjs          # tags, median gap, BREAKING count, engines vs CI matrix
node tools/release-cadence.mjs --npm    # plus per-version weekly downloads (needs network)
```
