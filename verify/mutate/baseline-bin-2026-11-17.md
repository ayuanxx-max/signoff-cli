# `bin/signoff.js` 变异基线（2026-11-17）

- 范围：`bin/signoff.js`，54 个活点，无等价排除
- 结果：**30 杀 / 24 活 = 55.6%**
- 怎么跑：两个 worktree 各一半（`--offset 0/27`），每个先验基线全绿（727 条自检）
- 单点复算：`node tools/mutate.js --files bin/signoff.js --max 1 --offset N`

## 为什么这么低

这个文件是 CLI 入口：它把退出码、闸门分派、缓存、失败兜底全串在一起，
而现有测试几乎都是「跑一条命令、看 stdout/退出码」的端到端断言——
**路径走过了，分支没被逼到**。变异版把 `if (sc !== 0) code = sc;` 取反，
聚合退出码就永远停在 0：闸门红了，命令却报成功。这类点只有专门喂失败输入才会转红。

## 存活点（按危险程度）

| 行 | 变异 | 被改的是 | 危险度 |
| --- | --- | --- | --- |
| `:21` | `true->false` | `bootstrap").ensureRepo({ quiet: true });` | 低：提示文案、平台细节 |
| `:22` | `and->or` | `if (r.installed && !process.argv.includes("--json"))` | 低：提示文案、平台细节 |
| `:84` | `ge->gt` | `Requires Node >= 18 only; no Python. Options` | 低：提示文案、平台细节 |
| `:88` | `eq->ne` | `PYTHON \|\| (process.platform === "win32" ? "python" : "` | 中：引擎与阈值选择 |
| `:88` | `or->and` | `process.env.SIGNOFF_PYTHON \|\| (process.platform` | 中：引擎与阈值选择 |
| `:97` | `and->or` | `SIGNOFF_ENGINE !== "python" && jsGate(name))` | 中：引擎与阈值选择 |
| `:101` | `and->or` | ``signoff: ${name} failed: ${e && e.message}`);` | 低：提示文案、平台细节 |
| `:115` | `eq->ne` | `const rc = r.status === null ? 1 : r.status;` | 高：退出码/缓存聚合，会让红变绿或反过来 |
| `:118` | `eq->ne` | `if (rc === 0 && name === "p1") {` | 高：退出码/缓存聚合，会让红变绿或反过来 |
| `:118` | `and->or` | `if (rc === 0 && name === "p1") {` | 高：退出码/缓存聚合，会让红变绿或反过来 |
| `:128` | `and->or` | `integrity check skipped (${e && e.message})`);` | 低：提示文案、平台细节 |
| `:141` | `true->false` | `windowsHide: true,` | 低：提示文案、平台细节 |
| `:143` | `ne->eq` | `if (inside.status !== 0) return 0;` | 高：退出码/缓存聚合，会让红变绿或反过来 |
| `:144` | `or->and` | `secrets.js").run(["--json"]) \|\| 0;` | 低：提示文案、平台细节 |
| `:146` | `and->or` | ``signoff: secrets failed: ${e && e.message}`);` | 低：提示文案、平台细节 |
| `:156` | `or->and` | `config.json"), "utf8")) \|\| {};` | 低：提示文案、平台细节 |
| `:161` | `eq->ne` | `const covMin = typeof covCfg === "object" && covCfg` | 中：引擎与阈值选择 |
| `:161` | `ne->eq` | `covCfg.min !== undefined ? covCfg.min : 80;` | 中：引擎与阈值选择 |
| `:161` | `and->or` | `covCfg.min !== undefined ? covCfg.min : 80;` | 中：引擎与阈值选择 |
| `:176` | `ne->eq` | `if (sc !== 0) code = sc;` | 高：退出码/缓存聚合，会让红变绿或反过来 |
| `:180` | `ne->eq` | `if (c !== 0) code = c;` | 高：退出码/缓存聚合，会让红变绿或反过来 |
| `:191` | `and->or` | `guard failed: ${e && e.message}`);` | 低：提示文案、平台细节 |
| `:201` | `eq->ne` | `return r.status === null ? 1 : r.status;` | 高：退出码/缓存聚合，会让红变绿或反过来 |
| `:242` | `and->or` | `audit failed: ${e && e.message}`);` | 低：提示文案、平台细节 |

## 已销（本轮）

`:206`（帮助的四个条件用 `or` 连接）：把 `or` 改成 `and` 后，光敲 `signoff` 什么都不打印、
直接掉到未知命令。**这是新人做的第一件事**，之前没有任何断言。补了四条：裸调用退出 0、
裸调用打印同一份帮助、`help` 这个词、`-h`。

