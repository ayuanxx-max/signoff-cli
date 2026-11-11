# SignOff 报告契约（REPORT-CONTRACT）

> 这份文件是 `signoff report` 的唯一权威说明。任何 agent、任何平台、任何模型在改动
> `lib/report.js`、`lib/report-page.js` 或页面样式之前，先读这一份；改动后，`test/selftest.js`
> 里对应的断言必须一起改。**正文只有这一份，其它位置都是指过来的薄壳。**

- 契约版本：`1`
- 冻结日期：2026-11-10
- 适用范围：`signoff report`（`--html` / `--json` / `--repos` / `--scan` / `--would-block`）

## 形式约定（为什么是 Markdown）

1. 纯 Markdown、UTF-8、LF 或 CRLF 都可读；不含 HTML 嵌套、不含平台私有语法（DSH 的 `@file`、
   OpenViking 的 `viking://` 只出现在"挂载点"一节，不作为正文依赖）。
2. 不带本机路径、不带用户名、不带时间敏感的截图；只有条款编号（C1…C11）是稳定的锚点。
3. 条款编号发布后不改含义；新增从 C11 起，废弃写"废止"而保留编号。

## 条款

### C1 只读

`report` 不得写入被检查的仓库，不得新增/修改/删除 `.signoff/` 下的任何文件，不得执行任何关。
唯一例外是 `--would-block` 的只读扫描，它同样不写任何文件。页面本身不写任何东西。
挂载（`--mount [DIR]`）只写它自己的目录（默认用户主目录下的 `.signoff/reports`，或调用者给的 DIR），
不写被检查的仓库；`index.json` 里的路径是相对链接，目录整体拷到别的机器仍然可用。

### C2 没有授权控件

页面里不得出现能通过、跳过或放宽某一关的控件。允许的交互只有导航：

- `<button>` 必须带 `data-step`（翻月 / 回今天）；
- 不得有 `<form>`、`<input>`、`type="checkbox"`、`type="submit"`；
- 不得有"重跑 / 忽略 / 跳过 / 通过"之类的动作按钮。

### C3 离线单文件

页面必须是单个 HTML 文件：CSS 内联；不得有外链 `src=` / `href=`；脚本不得 `fetch`、
`XMLHttpRequest`、`WebSocket`、`sendBeacon`。离线打开、断网打开都必须可用。

### C4 七项固定集合

判定项固定为七项，顺序与 id 固定：`p1 测试`、`p2 覆盖率`、`p3 并发任务`、`p4 危险动作`、
`p5 文档`、`sec 密钥`、`release 发布`。任何新增项都必须同时更新契约、`GATES` 与自测。

### C5 判定可推导

`verdict` 只能由七项状态推导：有红即 `blocked`；无红但有未跑即 `unknown`；七项都过即 `ready`。
`blocked` 时 `blockers` 至少一条，且每条必须带可执行的 `fix`。页面不得出现与闸状态矛盾的结论。

### C6 无脚本也能读

默认日（今天）的事件列表由服务端渲染；脚本失败、被 CSP 拦截、被打印成 PDF 时，页面仍能回答
"最近一次通过 / 过闸率 / 哪一组在绕闸"。脚本只用于切换视图。

### C7 一切来自仓库的字符串都转义

`repoName`、提交标题、作者、分支名、票据 target、任务标题一律经过 `escapeHtml`（含 `& < > " '`）。
自测里必须有一条断言：把恶意字符串塞进 `repoName` 后，页面不出现未转义的标签。

### C8 证据只增不改

`.signoff/runs.log` 由各关追加，`report` 只读。页面不得提供"清理历史"之类的能力；
历史只能由人手工删，且不属于本契约范围。

### C9 多仓模式同规则

`--repos` / `--scan` 下每个仓库单独判定、单独渲染；不得把多个仓库的状态合并成一个 verdict。
某个仓库读不出来时跳过它，而不是让整页失败。

### C10 跨平台

路径用 `path.join`，不手拼分隔符；HTML 以 UTF-8 写出；不写入本机路径（盘符用户目录、类 Unix 的用户主目录）；
时间统一用本机时区并在页面上标注 `+08:00` 形式的偏移。

### C11 任务与跑闸按项目名说话

`--json` 的顶层 `project` 是项目显示名，解析顺序：`.signoff/config.json` 的 `project` → `package.json` 的
`productName` / `displayName` / `name` → 仓库目录名；结果再去掉 `@scope/` 前缀与 `-cli` / `-app` /
`-mcp` / `-server` 后缀。

- 每组任务的 `label`：组内**最新一条提交标题**里出现 `x.y.z` 时写「<项目> 项目更新 <版本> 版」
  （英文页面写 `<project> project update <version>`），否则写「<项目> · <区域>」。
- 「最近一次跑闸」这个 mark 的 `label` 同上，`detail` 以「最近一次跑闸 ·」开头。
- `label` 只用于展示：`id`、`title`、`--task` 的取值与筛选语义都不变；原始区域名保留在 `title`
  与页面 meta 里，点开一组仍能看出它原本属于哪个区域。
- 项目名与版本号都来自仓库内的字符串，进页面一律走 `escapeHtml`（受 C7 约束）。

## 变更流程

1. 改代码的同时改这份契约（条款与编号）；
2. 改契约的同时改 `test/selftest.js` 里对应的断言——**没有断言通过的契约等于没写**；
3. `signoff report --contract` 打印的内容必须与本文件字节一致（自测会比对）；
4. 版本号与 `package.json` 一起走，契约版本只在语义变化时 +1。

## 挂载点（同一份内容的多个入口）

| 入口 | 谁读 | 作用 |
| --- | --- | --- |
| `docs/REPORT-CONTRACT.md` | 人 / 任意 agent | 唯一权威正文 |
| `AGENTS.md`、`CLAUDE.md`、`.github/copilot-instructions.md`、`.cursor/rules/signoff-report.mdc` | Codex / Claude Code / Copilot / Cursor / DSH | 薄壳指针，指向本文件 |
| `signoff report --contract` | 运行时 / 无仓库上下文的 agent | 打印本文件原文（随 npm 包分发） |
| `test/selftest.js`（契约与报告断言） | CI / 预提交钩子 | 让违约变成红色 |
| OpenViking `viking://resources/dsh/signoff-report-contract.md` | 跨会话、跨机器检索 | 让没有本仓库的 agent 也能取到 |

## 语言（4.3.0 起）

页面语种在**生成时**决定：`signoff report --lang zh|en|auto`。这不违反 C2/C3——语言只换文字，不新增任何控件，
页面脚本仍只做「切换视图」。所有面向读者的文案必须经过 `lib/i18n.js` 的 `T("…")`，词表缺英文时自测会红。
