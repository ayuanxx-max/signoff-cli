---
name: signoff-gates
description: Run the SignOff gates (tests, coverage, parallel tasks, risky-action ledger, doc claims, secrets) before claiming work is done, read the board, and repair a red gate. Use when a repo has .signoff/config.json, when the user says "run the gates" / "落印" / "prove it", or before a commit or push in a guarded repo.
---

# SignOff gates

`signoff` is a CLI (`npm i -g signoff-cli`). It answers one question: does this change deserve the word "done"?
The exit code is the verdict — `0` pass, `1` a gate failed, `2` usage or environment error. Never describe a failure
from memory: run the command and quote its output.

## The one loop

```bash
signoff guard      # the same gate set the hooks run, right now (staged scope)
signoff all        # p1, p2, p5, then p4 verify (the full local sweep)
```text

- Read the failing gate id (`p1` … `p5`, `sec`, `release`) from the output, fix the cause, run again.
- `signoff guard --full` is the pre-push scope; `--json` on every gate gives one machine-readable line.
- Do not get past a red gate with `SIGNOFF_SKIP=1` or `git commit --no-verify`: the first is logged to
  `.signoff/skips.log`, the second is invisible locally but `signoff audit --since-install` reports the missing trailer.
  If the gate itself is wrong, fix the config, not the verdict.

## Review, repair, arbitration

```bash
signoff review --verify          # is the diff being shipped the one that was approved? (0 yes / 1 no)
signoff review --by me --model provider/model --note "checked the loop bound"
signoff fix --patch fix.patch --check   # preview: red baseline, inside --scope, verdict path untouched
signoff dispute --claim "it passes" --run "npm test" --repeat 5   # 0 supported / 1 refuted / 3 unresolved
signoff patterns                 # failures that repeat in the same place (where the last fix missed)
```

- `review` proves one thing: the reviewed diff and the shipped diff are the same (hash-bound). `--by`
  is self-declared; do not present it as proof that a human read the code.
- `fix` never writes code itself and never keeps a change unless the baseline was red, the patch stayed
  in scope, the verdict path was untouched, and the run turned red -> green with anti-tamper clean.
- `dispute` exits 2 when the command cannot even run: a typo is not evidence.

## The board

```bash
signoff report --html                 # one self-contained page: verdict, calendar, task groups
signoff report --html --mount         # also index it under ~/.signoff/reports (the DSH panel reads this)
signoff report --json                 # the same data for a script
signoff report --task report          # one group only
```

- The page and the panel speak in project names: a task group reads `SignOff 项目更新 4.4.5 版`, and so does the
  last gate run. `label` is display-only; `id`, `title` and `--task` keep their meaning (contract C11).
- The DSH panel lists one page of data and only shows "Open full page" when there is more. It is read-only.

## When the output is not enough

```bash
signoff status                 # installed? which hooks, which config, last run
signoff doctor                 # why is it not doing what you expect (read-only)
signoff doctor --fix           # repair what can be proved (hooks, exec bit, stale marker)
signoff explain <gate>         # what this gate checks and how it decides
signoff audit --since-install  # did the commits that landed actually pass?
signoff p4 export --format md  # the ledger, for a human
```

`audit --since-install` refuses an install point that is not an ancestor of HEAD (rebase, force-push, fresh clone);
the fix is `signoff init --reset-install`.

## Installing into a repo

```bash
signoff init                 # hooks + .github/workflows/signoff.yml + .signoff/config.json
signoff init --chain         # keep an existing hook: it runs first, then signoff
signoff init --lock-test     # pin the detected test command into test_cmd
signoff uninstall            # remove hooks and CI; --keep-config or --all for state too
```

`signoff init` is idempotent: a second run only rewrites the hooks and the recorded version.

## Reporting back

Report the gate ids and their verdicts, plus the exact command that produced them. "Tests pass" without the gate
output is not a report; `signoff guard` exiting 0 is.
