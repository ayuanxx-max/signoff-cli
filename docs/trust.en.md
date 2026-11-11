# Trust and threat model: why it deserves the hook

> 中文: [trust.md](trust.md)

Two questions, one document, because the answers constrain each other: **did this commit really pass** (evidence),
and **why should a judging tool be let into a repository** (permission boundary). Evidence can never exceed the access.

## 1. Where it sits

With the hook installed, its power is close to "the repository's CI, but on your machine, as you":

| It can | Because |
| --- | --- |
| read your work tree | it must compute the staged tree, scan secrets, read scenario files |
| run commands as you | p1 runs the test suite, p3 reads collection results |
| write `.signoff/` | marker, ledger, checkpoints, cache |
| install or change git hooks | `init`, `ensure`, machine-wide `core.hooksPath` |
| stop one commit | a non-zero exit code is the verdict |

So the trust boundary is not "a CLI", it is "code that runs by itself when I commit".

## 2. Four layers of evidence

| Layer | Content | How it is faked |
| --- | --- | --- |
| 1 marker | `.signoff/passed` = `{tree, mode, ts}`, tree is the 40-char `git write-tree` hash | change the staged content and the tree changes; the marker no longer applies |
| 2 trailer | commit message trailer `Signoff-Pass: <tree12>` + `Signoff-Key` + `Signoff-Sig` | the signature covers the full 40-char tree; one changed character fails |
| 3 ledger | `.signoff/audit.log`, each entry `hash = sha256(prev + body)` | edit content → that entry's hash fails; reorder → prev fails |
| 4 checkpoint | `.signoff/checkpoint.json` = `{seq, head, root, key, sig}`, root is the Merkle root | delete trailing entries → seq and root disagree |

Layer 4 closes the blind spot of the first three: **delete the last few entries and the chain still looks consistent**.
A checkpoint freezes "what the ledger looked like after entry N", and one anchor line can be published outside the repo:

```
signoff1:12:9f2c1ab34d0e:71b0c9d2e4a85f61
```

## 3. Tampering and the answer

| Attack | Result |
| --- | --- |
| edit the trailer in a commit message | `audit --verify` reports `bad-signature` |
| edit one ledger record | `p4 verify` reports `content hash mismatch` |
| delete trailing ledger records | `p4 verify --checkpoint` reports `records were removed` |
| re-sign with another key | counts as `self-signed` unless the key is in `.signoff/allowed_signers` |
| paste the anchor somewhere it does not match | `p4 verify --checkpoint --anchor <line>` reports a mismatch |

## 4. Attack list

All seven require "fail must fail", not "success must succeed": the classic failure of a gate is letting a red case through.

| # | Attack | Expected |
| --- | --- | --- |
| A1 | edit `Signoff-Pass` in a commit message | `bad-signature` |
| A2 | edit a ledger record | `content hash mismatch` |
| A3 | delete the last N records | `records were removed` |
| A4 | re-sign with another key | `self-signed` unless the key is in `allowed_signers` |
| A5 | reuse a stale marker for this commit | no trailer is written |
| A6 | skip silently with `--no-verify` | the commit lands, but `audit` reports `skipped` |
| A7 | paste the anchor where it does not match | mismatch |

Each has an exit-code assertion in `test/selftest.js`; `npm test` is where they live.

## 5. How to use it

```bash
signoff p4 checkpoint     # once per repository: write the first checkpoint
signoff guard             # every later pass re-signs (the same ledger is not signed twice)
signoff p4 anchor         # publish this line outside the repo: release notes, CI summary, a message
signoff p4 verify --checkpoint --anchor signoff1:12:9f2c1ab34d0e:71b0c9d2e4a85f61
```

## 6. What it does not prove

- **Not "who"**: self-signed inside the repo by default. To bind an identity, put the public key in `.signoff/allowed_signers`.
- **Not "a human did the work"**: tests can be fake; it proves "this command set passed at that moment".
- **Not key-leak proof**: whoever holds the private key can re-sign; an anchor makes a history rewrite visible.
- **Rewriting the ledger and the checkpoint together, re-signing, with no anchor ever published** is invisible locally.
- **No command sandbox**: it runs commands the repository declares (test suite, collection script); isolation belongs to a container or CI.
- **Not code review**: it stops "unverified, declared done", not "ugly but working code".
- **No product judgement**: seven green gates mean seven things were done and recorded.

## 7. Audit-readiness checklist

Buying an audit is a budget question; being auditable is an engineering question. Each row is something an auditor
can reproduce without asking:

| # | Item | Status | Where |
| --- | --- | --- | --- |
| 1 | threat model and trust boundary | written | this document |
| 2 | attack list with matching tests | written (A1–A7) | this document + `test/selftest.js` |
| 3 | negative cases: red must stay red | present (420 cases) | `npm test` |
| 4 | secret and credential handling | written | `lib/secrets.js`, `docs/gates.md` |
| 5 | dependency surface | zero runtime deps (Node + git only) | `package.json` |
| 6 | architecture self-check | present | `tools/arch-health.mjs`, `docs/ARCH-HEALTH.md` |
| 7 | reproducible release artifact | written | `signoff release --pre/--post` |
| 8 | vulnerability disclosure and response time | written | `SECURITY.md` |
| 9 | third-party audit report | **not done** | — |

Row 9 is the missing one. Rows 1–8 mean an auditor does not have to spend two weeks learning the boundary first —
not that the project is already safe.
