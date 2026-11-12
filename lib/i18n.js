// 页面与看板的语言。选择顺序：--lang > SIGNOFF_LANG > LC_ALL/LC_MESSAGES/LANG > 系统区域 > 中文。
// 页面产物是静态文件，所以语言在「生成时」决定；要看另一种语言就重新生成一次。
const EN = {
  "项目更新": "project update",
  "版": "",
  "清单": "manifest",
  "之后": "after",
  "个提交，未走闸": "commits, not gated:",
  "之后还有": "more commits after the tag:",
  "个提交": "commits",
  "发布": "Release",
  "测试": "Tests",
  "个用例 · 预算": "cases · budget",
  "这个仓库还没跑过": "this repository has not run yet",
  "覆盖率": "Coverage",
  "应用 · 场景": "apps · scenarios",
  "断言": "assertions",
  "还没量过": "not measured yet",
  "补 verify/scenarios/*.json，再跑 signoff p2": "add verify/scenarios/*.json, then run signoff p2",
  "并发任务": "Tasks",
  "张任务卡 · 问题": "cards · problems",
  "没有任务卡": "no task cards",
  "危险动作": "Risky actions",
  "条审计记录": "audit records",
  "文档": "Docs",
  "个文件": "files",
  "处问题": "problems",
  "文档还没扫过": "docs not scanned yet",
  "密钥": "Secrets",
  "还没扫过": "not scanned yet",
  "未跑": "not run",
  "已记录": "recorded",
  "过": "pass",
  "不过": "fail",
  "安装点": "install point",
  "账本检查点": "ledger checkpoint",
  "最近一次跑闸": "last gate run",
  "其他": "Other",
  "其他提交": "other commits",
  "扫不了: ": "cannot scan: ",
  "只能看上次缓存": "showing the last cached result",
  "改代码要重跑": "rerun after changing code",
  "没有缓存结果": "no cached result",
  "本地报告": "Local report",
  "更新于": "updated",
  "个仓库 · 这个目录可以整个拷走，也可以交给 CI 当": "repos · this directory can be copied whole, or handed to CI as an",
  "仓库": "repository",
  "结论": "Verdict",
  "阻塞项": "Blockers",
  "过闸率": "Pass rate",
  "还没有可用的会话记录：这一块在跑过 agent 之后才有数": "no session records yet - this block fills in after the agent has run",
  "DeepSeek 官方价（含峰谷）· 可覆盖 .signoff/prices.json": "DeepSeek list price (peak/off-peak) · override in .signoff/prices.json",
  "没有可归属的提交": "no attributable commit",
  "这次提交之前的 agent 花费": "agent spend before this commit",
  "产出这组提交的 agent 花费": "agent spend for this task group",
  "调用": "calls",
  "花费": "cost",
  "费用": "cost",
  "token": "tokens",
  "日期": "date",
  "输出": "output",
  "缓存": "cache",
  "输入": "input",
  "次调用 · 峰时": "calls · peak",
  "价格表": "price table",
  "最近一次提交": "latest commit",
  "估算花费": "estimated cost",
  "累计 token": "total tokens",
  "来自 DSH 会话记录，只读；闸门本身不消耗 token": "from DSH session records, read-only; gates spend no tokens",
  "Token 与费用": "Tokens & cost",
  "全期": "all time",
  "安装点以来": "since install",
  "数据": "Data",
  "刷新：在仓库里跑": "Refresh: run inside the repository",
  "用法": "usage",
  "或让 MCP 客户端调用": "or call it from an MCP client",
  " 等": " etc.",
  "项未过": "failed",
  "项没跑过": "unmeasured",
  "项全过": "all passed",
  "没跑过": "not measured",
  "发布票据（tag / 清单）": "Release ticket (tag / manifest)",
  "参数": "options",
  "(自动探测)": "(auto-detected)",
  "没有记录": "no records",
  "次提交 · 过闸": "commits · passed",
  "最近": "recent",
  "个仓库有项未过": "repositories with a failed gate",
  "个仓库没跑全": "repositories not fully measured",
  "全部通过": "all passed",
  "多仓库": "Multi-repo",
  "落印": "Seal",
  "生成于": "generated",
  "本机时区）": "local timezone)",
  "个仓库 · 区间": "repositories · range",
  "先看哪个仓库挡住你": "which repository is blocking you",
  "最近全绿": "last green",
  "逐个看": "per repository",
  "生成 · 每个仓库的判定与单仓页面一致 · 页内脚本只切换视图，不发请求": "generated · every verdict matches the single-repo page · in-page scripts only switch views and make no requests",
  "只看": "showing only",
  "只算": "counting only",
  "没有阻塞项。七项都跑过且没有红。": "No blockers. All seven gates ran and none is red.",
  "已过": "passed",
  "还没有任何一项拿到过结果。": "No gate has produced a result yet.",
  "区间": "Range",
  "这层守卫有没有在真的保护你": "is this guard actually protecting you",
  "最近一次全绿": "last green run",
  "安装点以来过闸率": "pass rate since the install point",
  "个提交带 trailer（过闸或显式跳过）": "commits carry a trailer (passed or explicitly skipped)",
  "绕过闸门": "bypassed the gate",
  "守卫在位": "guard in place",
  "钩子": "hooks",
  "跑闸趋势": "gate trend",
  "最近 30 次一组）": "last 30 runs per bar)",
  "近况": "Recent",
  "通过率": "pass rate",
  "最近耗时": "last duration",
  "每次跑闸追加一行；没有记录说明这个仓库还没跑过，或跑的是旧版本。": "One line per gate run; no records means this repository has not run yet, or ran an older version.",
  "哪一天发生了什么": "what happened on which day",
  "条记录 · 点月历换一天": "records · click the calendar to change day",
  "上个月": "previous month",
  "下个月": "next month",
  "今天": "today",
  "按任务（共": "by task (",
  "组，默认收起，一次只展开一个）": " groups, collapsed, one open at a time)",
  "自动整理自": "auto-grouped from",
  "每组含提交、过闸与无标记计数。": "Each group counts commits, passes and unmarked ones.",
  "守卫状态": "Guard status",
  "机器层守卫": "machine-wide guard",
  "测试命令": "test command",
  "预算": "budget",
  "未提交": "uncommitted",
  "这一页只读：没有任何东西能让某一关变绿。": "This page is read-only: nothing here can turn a gate green.",
  "调阈值都只会让这里更红。": "Lowering a threshold only makes this redder.",
  "无标记": "unmarked",
  "安装点之后既没有": "no",
  "也没有": "and no",
  "的提交。": " commits since the install point.",
  "查询靠参数": "query with flags",
  "生成 · 数据来自": "generated · data from",
  "与 git（本机时区）· 页内脚本只切换视图，不发请求": "and git (local timezone) · in-page scripts only switch views and make no requests",
  "个仓库": "repositories",
  "提交": "commits",
  "组任务": "task groups",
  " 没有记录</div>": " no records</div>",
  " · 安装于 ": " · installed ",
  " · 没有安装记录": " · no install record",
  "<tr><td colspan=\"5\" class=\"meta\">还没有挂载任何仓库</td></tr>": "<tr><td colspan=\"5\" class=\"meta\">no repository mounted yet</td></tr>",
  "CI 在位": "CI in place",
  "CI 缺失": "CI missing",
  "P3 任务卡": "P3 task cards",
  "一": "M",
  "二": "T",
  "三": "W",
  "四": "T",
  "五": "F",
  "六": "S",
  "日": "S",
  "一致": "consistent",
  "不一致": "inconsistent",
  "不会挡": "would not block",
  "不知道": "unknown",
  "会挡住": "would block",
  "之后又有": "then",
  "还有": "plus",
  "全过": "all green",
  "有红": "red",
  "这个仓库还没有带 Signoff-Pass 的提交": "no Signoff-Pass commits in this repository yet",
  "工作方式本身在绕闸的组": "groups that bypass the gate by design",
  "次无标记）": " unmarked)",
  "会怎样": "what happens",
  "依据": "basis",
  "允许": "allowed",
  "拒绝": "denied",
  "目标": "target",
  "记录": "decision",
  "只读预演：不执行测试、不写状态。": "Read-only dry run: no tests run, no state written.",
  "仍需真跑。": "It still has to be run for real.",
  "如果现在提交（只读预演）": "If you committed now (read-only dry run)",
  "危险动作打在哪": "Where risky actions land",
  "提交范围": "commit range",
  "无时间": "no timestamp",
  "未安装": "not installed",
  "安装点之后没有提交绕过": "no commit bypassed the gate since the install point",
  "没有阻塞项": "no blockers",
  "过闸": "passed",
  "跳过": "skipped",
  "文件": "files",
  "回滚点": "rollback",
  "这一组还没有提交。": "This group has no commits yet.",
  "这段时间没有提交，也就没有任务。": "No commits in this window, so no tasks.",
  "只有未发布节": "only an unreleased section",
  "有本节": "section present",
  "缺本节": "section missing"
};

let current = "zh";

function normalize(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s.startsWith("en")) return "en";
  if (s.startsWith("zh")) return "zh";
  return null;
}

function detect(explicit) {
  const asked = normalize(explicit);
  if (asked) return asked;
  for (const key of ["SIGNOFF_LANG", "LC_ALL", "LC_MESSAGES", "LANG"]) {
    const hit = normalize(process.env[key]);
    if (hit) return hit;
  }
  try {
    const hit = normalize(Intl.DateTimeFormat().resolvedOptions().locale);
    if (hit) return hit;
  } catch (e) {
    // 老 Node 或没有 ICU：退回中文
  }
  return "zh";
}

// 只认 zh / en / auto；别的值让调用方报用法错，而不是悄悄给中文。
function valid(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "" || s === "auto" || s === "zh" || s === "en";
}

function setLang(v) {
  current = detect(v);
  return current;
}

function getLang() {
  return current;
}

function htmlLang() {
  return current === "en" ? "en" : "zh-CN";
}

// 查不到就原样返回：漏翻的地方会以中文露出来，而不是变成空白。
function tr(zh) {
  if (current !== "en") return zh;
  return Object.prototype.hasOwnProperty.call(EN, zh) ? EN[zh] : zh;
}

module.exports = { detect, valid, setLang, getLang, htmlLang, tr, EN };
