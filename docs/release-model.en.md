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

## 8. Release branches today

| Channel | Content | Who |
| --- | --- | --- |
| `latest` (default) | stable release; every release has a tag, a GitHub Release and an npm publish | everyone |
| `--pre` / prerelease | packs, installs into a temp dir, runs `--version` and an MCP handshake before publishing | maintainers |
| Branches | `master` is the release branch; features land from short branches, no long-lived parallel versions | maintainers |

Reason: a single maintainer with zero runtime dependencies gets more cost than benefit from long-lived LTS branches;
the real compatibility promise is `contractVersion` in `docs/REPORT-CONTRACT.md`, which is the answer to "what may I
depend on".
