# Reviewing with a local model, then pinning that step into signoff

`signoff review` contains no model and grades nothing. It records *who looked at which diff, when*, and
`--verify` answers one question: **is the diff about to be shipped the same diff that was reviewed?**
Which model you review with is your choice; the tool neither picks one for you nor pretends to.

## What it proves, and what it does not

| Proves | Does not prove |
| --- | --- |
| The attestation is bound to a sha256 short hash of the diff; one byte of change invalidates it | That the review was any good |
| `--verify` exits 0 when an `approve` covers the current diff, 1 otherwise | That `--by` / `--model` tell the truth (they are self-reported) |
| The record lives at `.signoff/reviews.jsonl` in the repo root, visible from any subdirectory | That the reviewer read the code |

Every tool's "I reviewed it" is a self-report. signoff cannot make that true; it only guarantees that
*the reviewed diff and the shipped diff are the same one*.

## Three steps

1. Serve a model that can answer (any OpenAI-compatible endpoint works, not only Ollama):

```bash
ollama pull qwen2.5-coder:7b
ollama serve        # 127.0.0.1:11434 by default
```

2. Let a review tool produce comments (`ocr` is one option; your agent or editor works too):

```bash
ocr config set provider ollama-local
ocr review          # reads the git diff; produces no signoff attestation by itself
```

3. After a human has read the comments, record the step:

```bash
signoff review --by "me" --model "ollama-local/qwen2.5-coder:7b" --note "7B flagged 2 unused vars; rest checked by hand"
signoff review --verify     # 0 = the current diff has an approve; 1 = it does not
```

## Making it a gate before push (optional, off by default)

Add one line to `.signoff/config.json`:

```json
{
  "review_on_push": true
}
```

Then `git push` asks one more question after the gates pass:

- the repo has no attestation yet → print the reason and skip (do not scare a freshly installed repo);
- there is an attestation but the current diff is not approved → red, and it names the hash that was approved.

It is off by default for a concrete reason: once on, **every change needs a fresh review** (an attestation
binds a hash, not a repository). That is the user's decision, not the tool's default.

## Splitting the work between models (a reproducible arrangement)

1. A small always-on model (7B class) sweeps formatting, unused variables, obvious null derefs, and
   assertions someone commented out in tests;
2. Anything it catches **must become a test that fails** before it counts — add one assertion in
   `test/selftest.js`;
3. Architecture calls it cannot make stay with a human. Never let it sign off for you.

Moving to 14B or 32B changes the hit rate of step 1 and nothing else. That is what "a model is an
accelerator, not a guarantee" means in practice.

## The three red lines do not move

`--no-verify`, `SIGNOFF_SKIP=1`, and lowering a threshold to turn red into green: none of them is relaxed
in any mode, and `review_on_push` does not relax them either.
