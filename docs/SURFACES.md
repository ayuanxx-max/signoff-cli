# 看板的接法：一个核心，多个薄壳

核心只有两个只读出口，判定逻辑都在 `lib/` 里：

- `signoff report --json` —— 结构化数据：判定、阻塞项与修法、七项、过闸率、任务组、跑闸趋势。
- `signoff mcp` → 工具 `signoff_report` —— 同一份数据走 MCP，MCP 客户端可以直接调。

每个平台的「看板」都只是把这份数据渲染出来，不重写判定，所以七个平台看到的结论不会互相矛盾。

## 平台对照

| 平台 / agent | 入口 | 数据来自 | 前置 |
| --- | --- | --- | --- |
| DSH（本机） | 侧栏导航第 4 行「SignOff 看板」（插件 / 自动化任务 / **SignOff 看板** / 更多），数据走 `/signoff-board/state` | `~/.signoff/reports/index.json` 与 `<仓库>/report.json` | 仓库里跑过一次 `--mount` |
| MCP 客户端（Claude Desktop、Cursor、Codex 等） | 调用 `signoff_report` | 同一条 CLI | 客户端里登记 `signoff mcp` |
| 终端 / 脚本 | `signoff report --json` | `.signoff/*.json` + `.signoff/audit.log` + git | 无 |
| 浏览器 / 存档 / 分享 | `signoff report --html --mount`，页面是单文件 | 同上 | 一个浏览器 |
| CI | 同一条命令，把 `~/.signoff/reports` 当 artifact 上传 | 同上 | runner 装 npm 包 |
| 编辑器 | `signoff init --editor` 生成的 tasks | 同一条 CLI | 无 |

## 新增一个平台要做的三件事

1. **取数据**：优先 MCP `signoff_report`；没有 MCP 就 spawn `signoff report --json`。
2. **渲染**：判定按退出码语义（0 通过 / 1 有红 / 2 用法或环境错），不把「红」画成警告。
3. **只读**：不给跑闸、跳过、改阈值的控件；要跑闸就显式调用 `signoff run`。

## 为什么这样切

判定只有一份，页面、面板、MCP 都读它的输出；新增平台不会长出第二套判定，也不会出现
「面板说能发、页面说不能发」。这与 `docs/REPORT-CONTRACT.md` 的 C1（只读）、C5（判定可推导）、
C9（多仓同规则）是同一条线：契约管内容，这份文件管投递。
