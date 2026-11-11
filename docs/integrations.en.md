# Integrations: one verdict, six entry points

> 中文: [integrations.md](integrations.md)

The verdict and the exit code are identical everywhere: 0 pass / 1 red / 2 usage or environment. Every entry below
works on its own and they compose; **whichever layer you install, the verdict comes from the same `lib/`**.

## 1. Local hooks (fastest)

```bash
npm i -g signoff-cli && cd your-repo && signoff init
```

`git commit` is gated from then on. If the repository already uses lefthook / husky / a hand-written hook, add
`--chain`: it appends one line to your hook instead of replacing it. `signoff status` tells you whether it is
installed and where the hook points.

## 2. GitHub Actions

`signoff init` writes `.github/workflows/signoff.yml` (`--no-ci` skips it). By hand:

```yaml
- uses: ayuanxx-max/signoff-cli@v4.4.5
  with:
    args: all
```

Red gates emit `::error file=…,line=…` annotations and a step summary.

## 3. pre-commit

```yaml
repos:
  - repo: https://github.com/ayuanxx-max/signoff-cli
    rev: v4.4.5
    hooks:
      - id: signoff-guard
```

## 4. lefthook

```yaml
pre-commit:
  commands:
    signoff:
      run: signoff guard
```

## 5. husky

```bash
echo 'signoff guard' > .husky/pre-commit
```

On 4.x prefer `signoff init --chain`: it recognises the husky directory and leaves `.husky/pre-commit` in a shape
husky still understands.

## 6. VS Code

```bash
signoff init --editor vscode
```

Writes tasks and a problem matcher, so red gates land in the Problems panel.

## 7. MCP

`signoff mcp` serves the same gates over stdio: command `signoff`, argument `mcp`.
Registry entry: `io.github.ayuanxx-max/signoff-cli` (the old `io.github.ayuanxx-max/signoff` is frozen at 4.0.2 —
do not install from it).

## How the release gate checks itself

`signoff release --pre` packs, installs into a temp directory, runs `--version` and completes the MCP handshake;
`signoff release --post` checks npm `latest`, registry `isLatest` and `packages[].version`, plus README image links.
Both live inside `signoff release`; no extra script is needed.
