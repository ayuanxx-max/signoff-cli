#!/usr/bin/env node
"use strict";

// `signoff report` — 一页只读的「现在能不能发」+ 月历 + 按任务。
//
// 三个改版的理由：
//   - 关不止五关：P1–P5 之外还有密钥扫描与发布，所以按七项算；
//   - 「五关现状」那张表对读的人没有意义，他真正要问的是「现在能不能发、还差什么」，
//     于是首页给结论与阻塞项，通过的关压成一句话；
//   - 时间要与任务要能点：月历点某天看那天，任务默认折叠、一次只展开一个。
//
// 数据只来自 .signoff/*.json、.signoff/audit.log 与 git。页面里的脚本只做「切换视图」，
// 不发请求、不改状态、没有任何能通过 / 跳过 / 放宽闸门的东西。

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const STATE = ".signoff";
const GATES = ["p1", "p2", "p3", "p4", "p5", "sec", "release"];
const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const USAGE = `signoff report — 现在能不能发 + 月历 + 按任务（只读）

  signoff report [--html] [--out FILE]   写一个自包含 HTML 页面（默认 .signoff/report.html）
  signoff report --json                  同样的数据，机器可读

  时间
    --days N                 往前看 N 天（默认 120）
    --since YYYY-MM-DD       起始日期（含）
    --until YYYY-MM-DD       截止日期（含）

  按任务 / 按关
    --task KEY               只看一组：任务卡 id、提交范围（feat(report) → report）、sha 前缀或关键词
    --gate p1|p2|p3|p4|p5|sec|release   只看一项
    --limit N                进程里最多取多少条提交（默认 400）

  多仓库
    --repos A,B / --repos path1,path2   一页看几个仓库：先比「谁挡住你」，再逐个展开
    --scan DIR               找出 DIR 两层内的所有 git 仓库，一起看

  预演
    --would-block            只读预演：现在提交会被哪些离线关挡住（不执行测试、不写状态）

页面里点月历看某天，点任务展开某一组；没有按钮能让某一关变绿。`;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    return "";
  }
}

function readLines(file) {
  return readText(file)
    .split("\n")
    .filter((l) => l.trim());
}

function readJsonSafe(line) {
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function localDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tzLabel(d) {
  const off = -d.getTimezoneOffset();
  return `${off >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

function asDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function sh(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 48 * 1024 * 1024 });
  return r.status === 0 ? String(r.stdout || "") : null;
}

function repoRoot(cwd) {
  return (sh(["rev-parse", "--show-toplevel"], cwd) || cwd).trim();
}

function packageVersion() {
  try {
    return require("../package.json").version;
  } catch (e) {
    return "unknown";
  }
}

function pageJs() {
  return readText(path.join(__dirname, "report-page.js"));
}

function mtimeIso(file) {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch (e) {
    return "";
  }
}

function guardState(root) {
  try {
    const g = require("./guard.js");
    if (typeof g.installed === "function") return g.installed(root);
  } catch (e) {
    /* fall back to file checks */
  }
  const hooks = path.join(root, ".git", "hooks");
  const has = (n) => fs.existsSync(path.join(hooks, n));
  const out = {
    "pre-commit": has("pre-commit"),
    "commit-msg": has("commit-msg"),
    "pre-push": has("pre-push"),
    ci: fs.existsSync(path.join(root, ".github", "workflows", "signoff.yml")),
    config: fs.existsSync(path.join(root, STATE, "config.json")),
  };
  out.trailer = out["pre-commit"] && out["commit-msg"];
  return out;
}

function machineLayer() {
  const home = process.env.SIGNOFF_HOME || path.join(os.homedir(), ".signoff");
  return fs.existsSync(path.join(home, "hooks"));
}

// The release check below is the one gate that has no state file: publishing is not a
// thing that gets cached, it is a set of facts you can recompute offline.
function commitsSinceTag(root, tagCommit) {
  const raw = sh(["log", `--format=%H%x1f%B%x1e`, `${tagCommit}..HEAD`], root) || "";
  const entries = raw.split("\x1e").filter((c) => c.trim());
  return {
    total: entries.length,
    unguarded: entries.filter((c) => !/^Signoff-(?:Pass|Skip):\s*\S+/m.test(c)).length,
  };
}

function releaseGate(root) {
  const pkg = readJson(path.join(root, "package.json")) || {};
  const srv = readJson(path.join(root, "server.json")) || {};
  const version = pkg.version || "";
  const changelog = readText(path.join(root, "CHANGELOG.md"));
  const hasSection = !!version && new RegExp(`^##\\s+v?${version.replace(/\./g, "\\.")}\\s*$`, "m").test(changelog);
  const hasUnreleased = /^##\s*未发布/m.test(changelog);
  const tag = version ? (sh(["tag", "--list", `v${version}`], root) || "").trim() : "";
  const tagCommit = tag ? (sh(["rev-list", "-n", "1", tag], root) || "").trim() : "";
  const head = (sh(["rev-parse", "HEAD"], root) || "").trim();
  const behind = tagCommit && head && tagCommit !== head ? Number((sh(["rev-list", "--count", `${tagCommit}..HEAD`], root) || "0").trim()) || 0 : 0;
  const manifests = !srv.version || !version || srv.version === version;
  // 发布项与过闸记录的组合：一个版本可不可以发，取决于 tag 之后的每个提交是否都走过了闸。
  const after = tagCommit ? commitsSinceTag(root, tagCommit) : { total: 0, unguarded: 0 };
  const ok = !!version && hasSection && manifests && after.unguarded === 0;
  const bits = [];
  if (version) bits.push(`v${version}`);
  bits.push(`清单 ${manifests ? "一致" : "不一致"}`);
  bits.push(`changelog ${hasSection ? "有本节" : hasUnreleased ? "只有未发布节" : "缺本节"}`);
  bits.push(`tag ${tag ? "✓" : "✗"}`);
  if (after.total) bits.push(`tag 之后 ${after.total} 个提交，未走闸 ${after.unguarded}`);
  else if (behind) bits.push(`tag 之后还有 ${behind} 个提交`);
  return {
    id: "release",
    label: "发布",
    cmd: "signoff release --pre",
    file: "package.json / CHANGELOG.md / git tag",
    ran: !!version,
    ok,
    when: mtimeIso(path.join(root, "package.json")),
    detail: bits.join(" · "),
    fix: "signoff release --pre",
  };
}

function gateRows(root) {
  const p1 = readJson(path.join(root, STATE, "p1.json"));
  const p2 = readJson(path.join(root, STATE, "p2.json"));
  const p3 = readJson(path.join(root, STATE, "p3.json"));
  const p5 = readJson(path.join(root, STATE, "p5.json"));
  const se = readJson(path.join(root, STATE, "secrets.json"));
  const ledger = readLines(path.join(root, STATE, "audit.log"));
  const p4 = ledger.length ? readJsonSafe(ledger[ledger.length - 1]) : null;
  return [
    {
      id: "p1",
      label: "测试",
      cmd: "signoff p1",
      file: `${STATE}/p1.json`,
      ran: !!p1,
      ok: p1 ? !!p1.ok : null,
      when: p1 ? p1.cachedAt || p1.ts || mtimeIso(path.join(root, STATE, "p1.json")) : "",
      detail: p1 ? `${p1.cases || 0} 个用例 · 预算 ${Math.round((p1.budgetMs || 0) / 1000)}s` : "这个仓库还没跑过",
      fix: 'signoff p1 --run "<test command>"',
    },
    {
      id: "p2",
      label: "覆盖率",
      cmd: "signoff p2",
      file: `${STATE}/p2.json`,
      ran: !!p2,
      ok: p2 ? !!p2.ok : null,
      when: p2 ? p2.cachedAt || p2.ts || mtimeIso(path.join(root, STATE, "p2.json")) : "",
      detail: p2 ? `${p2.apps || 0} 应用 · 场景 ${p2.scenarioApps || 0} · 断言 ${p2.assertions || 0}` : "还没量过",
      fix: "signoff p2 --min-scenario 3",
    },
    {
      id: "p3",
      label: "并发任务",
      cmd: "signoff p3 validate",
      file: `${STATE}/p3.json`,
      ran: !!p3,
      ok: p3 ? !!p3.ok : null,
      when: p3 ? p3.cachedAt || p3.ts || mtimeIso(path.join(root, STATE, "p3.json")) : "",
      detail: p3 ? `${p3.cards || 0} 张任务卡 · 问题 ${(p3.problems || []).length}` : "没有任务卡",
      fix: "signoff p3 validate",
    },
    {
      id: "p4",
      label: "危险动作",
      cmd: "signoff p4 verify",
      file: `${STATE}/audit.log`,
      ran: ledger.length > 0,
      ok: p4 && typeof p4.ok === "boolean" ? p4.ok : null,
      when: (p4 && p4.ts) || mtimeIso(path.join(root, STATE, "audit.log")),
      detail: `${ledger.length} 条审计记录`,
      fix: "signoff p4 verify",
    },
    {
      id: "p5",
      label: "文档",
      cmd: "signoff p5",
      file: `${STATE}/p5.json`,
      ran: !!p5,
      ok: p5 ? !!p5.ok : null,
      when: p5 ? p5.cachedAt || p5.ts || mtimeIso(path.join(root, STATE, "p5.json")) : "",
      detail: p5 ? `${p5.files || 0} 个文件 · ${(p5.hits || []).length} 处问题` : "文档还没扫过",
      fix: "signoff p5",
    },
    {
      id: "sec",
      label: "密钥",
      cmd: "signoff secrets",
      file: `${STATE}/secrets.json`,
      ran: !!se,
      ok: se ? !!se.ok : null,
      when: se ? se.cachedAt || se.ts || mtimeIso(path.join(root, STATE, "secrets.json")) : "",
      detail: se ? `${se.files || 0} 个文件 · ${(se.findings || []).length} 处` : "还没扫过",
      fix: "signoff secrets --all",
    },
    releaseGate(root),
  ];
}

function stateOf(row) {
  if (!row.ran) return { label: "未跑", cls: "none" };
  if (row.ok === null || row.ok === undefined) return { label: "已记录", cls: "none" };
  return row.ok ? { label: "过", cls: "pass" } : { label: "不过", cls: "fail" };
}

// A commit carries `Signoff-Pass:` exactly when a full gate run passed on that tree;
// a commit after the install point with neither trailer is the shape of --no-verify.
function gitHistory(root, since, limit) {
  const fmt = ["%x1e%h", "%ad", "%an", "%s", "%B"].join("%x1f");
  const cap = Math.max(limit, 100);
  const raw = sh(["log", `--date=format-local:%Y-%m-%d %H:%M:%S`, `--format=${fmt}`, "-n", String(cap), `--since=${since}`], root);
  if (!raw) return [];
  const filesRaw = sh(["log", "--format=%x1e%h", "--name-only", "-n", String(cap), `--since=${since}`], root) || "";
  const files = new Map();
  for (const chunk of filesRaw.split("\x1e").slice(1)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    files.set(lines[0].trim(), lines.slice(1).filter((l) => !l.startsWith(" ")));
  }
  const out = [];
  for (const chunk of raw.split("\x1e").slice(1)) {
    const parts = chunk.split("\x1f");
    if (parts.length < 4) continue;
    const sha = parts[0].trim();
    const dateStr = parts[1] || "";
    const body = parts.slice(4).join("\x1f");
    const filesOf = files.get(sha) || [];
    if (!dateStr) continue;
    const when = asDate(`${dateStr.slice(0, 10)}T${dateStr.slice(11, 19) || "00:00:00"}`);
    out.push({
      sha,
      date: dateStr.slice(0, 10),
      time: dateStr.slice(11, 19),
      weekday: when ? WEEK[when.getDay()] : "",
      author: (parts[2] || "").trim(),
      subject: cleanSubject(parts[3]),
      passed: /^Signoff-Pass:\s*\S+/m.test(body),
      skipped: /^Signoff-Skip:\s*\S+/m.test(body),
      files: filesOf,
    });
  }
  return out;
}

function cleanSubject(s) {
  return String(s || "")
    .replace(/\s*Signoff-(?:Pass|Skip):\s*\S+\s*$/i, "")
    .trim();
}

function ledgerHistory(root) {
  return readLines(path.join(root, STATE, "audit.log"))
    .map(readJsonSafe)
    .filter(Boolean);
}

function marksOf(root, guard) {
  const marks = [];
  const inst = readJson(path.join(root, STATE, "installed.json"));
  if (inst && inst.ts) marks.push({ ts: inst.ts, label: "安装点", detail: `v${inst.version || "?"} · ${String(inst.sha || "").slice(0, 7)}` });
  const cp = readJson(path.join(root, STATE, "checkpoint.json"));
  if (cp && cp.ts) marks.push({ ts: cp.ts, label: "账本检查点", detail: `第 ${cp.seq} 条 · ${String(cp.head || "").slice(0, 7)}` });
  const cache = readJson(path.join(root, STATE, "cache.json"));
  if (cache && cache.ts) {
    marks.push({
      ts: cache.ts,
      label: "最近一次跑闸",
      detail: `${cache.ok ? "全过" : "有红"} · ${cache.seconds || 0}s`,
    });
  }
  return marks;
}

function areaOf(subject) {
  const m = /^(\w+)(?:\(([^)]+)\))?!?:/.exec(String(subject || ""));
  if (!m) return { type: "other", area: "其他" };
  return { type: m[1].toLowerCase(), area: (m[2] || m[1]).toLowerCase() };
}

function taskCards(root) {
  const dir = path.join(root, "tasks");
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, "card.json")));
  } catch (e) {
    return [];
  }
  return names.map((id) => {
    const card = readJson(path.join(dir, id, "card.json")) || {};
    const scope = [].concat(card.scope || []).map(String);
    return { id, title: card.goal || id, kind: "card", scope, owns: (file) => scope.some((s) => matchScope(s, file)) };
  });
}

function matchScope(scope, file) {
  const s = scope.replace(/\\/g, "/").replace(/\/\*\*$/, "").replace(/\/$/, "");
  if (!s) return false;
  if (s.includes("*")) {
    const rx = new RegExp("^" + s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
    return rx.test(file);
  }
  return file === s || file.startsWith(s + "/");
}

// "全部用户完整任务" = 任务卡 ∪ 提交范围。两者都没有的仓库，任务就是提交本身。
function taskList(commits, cards, since) {
  const byId = new Map();
  for (const card of cards) {
    const own = commits.filter((c) => c.files.some((f) => card.owns(f)));
    byId.set(card.id, {
      id: card.id,
      title: card.title,
      kind: "card",
      commits: own,
      last: own.length ? `${own[0].date} ${own[0].time}` : "",
    });
  }
  for (const c of commits) {
    const { area } = areaOf(c.subject);
    if (cards.some((card) => card.id === area)) continue;
    let t = byId.get(area);
    if (!t) byId.set(area, (t = { id: area, title: area === "其他" ? "其他提交" : area, kind: "area", commits: [], last: "" }));
    t.commits.push(c);
    if (`${c.date} ${c.time}` > t.last) t.last = `${c.date} ${c.time}`;
  }
  return [...byId.values()].map((t) => {
    const unmarked = t.commits.filter((c) => !c.passed && !c.skipped && (!since || `${c.date} ${c.time}` >= since)).length;
    const counted = t.commits.filter((c) => !since || `${c.date} ${c.time}` >= since);
    const passedSince = counted.filter((c) => c.passed).length;
    const rate = counted.length ? Math.round((passedSince / counted.length) * 100) : null;
    const risk = counted.length >= 3 && rate !== null && rate < 100;
    return {
      id: t.id,
      title: t.title,
      kind: t.kind,
      count: t.commits.length,
      passed: t.commits.filter((c) => c.passed).length,
      skipped: t.commits.filter((c) => c.skipped).length,
      unmarked,
      since: counted.length,
      guarded: passedSince,
      rate,
      risk,
      last: t.last,
      commits: t.commits.map((c) => ({ sha: c.sha, date: c.date, time: c.time, subject: c.subject, passed: c.passed, skipped: c.skipped })),
    };
  }).sort((a, b) => String(b.last).localeCompare(String(a.last)));
}

// `--would-block` 只读预演：跑一遍能离线判定的关（密钥、文档），不写状态、不执行测试。
// `--scan DIR`：找出 DIR 下（两层内）所有 git 仓库，一页看全部。
function discoverRepos(dir) {
  const out = [];
  const isRepo = (d) => fs.existsSync(path.join(d, ".git"));
  if (isRepo(dir)) out.push(dir);
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (isRepo(full)) out.push(full);
    else {
      try {
        for (const child of fs.readdirSync(full, { withFileTypes: true })) {
          if (child.isDirectory() && fs.existsSync(path.join(full, child.name, ".git"))) out.push(path.join(full, child.name));
        }
      } catch (e2) {
        /* unreadable dir, skip */
      }
    }
  }
  return out.sort();
}

function wouldBlockCheck(root) {
  const gatesOut = [];
  let sec = null;
  try {
    const s = require("./secrets");
    const res = s.scan(root, { mode: "all" });
    const hits = (res.findings || []).length;
    sec = { gate: "secrets", label: "密钥", ok: hits === 0, detail: `${(res.files || []).length} 个文件 · ${hits} 处` };
  } catch (e) {
    sec = { gate: "secrets", label: "密钥", ok: null, detail: "扫不了: " + (e && e.message) };
  }
  gatesOut.push(sec);

  let doc = null;
  try {
    const p5 = require("./p5");
    let files = 0;
    let hits = 0;
    const walk = (dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const e of entries) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.md$/i.test(e.name)) {
          const text = readText(full);
          if (!text) continue;
          files += 1;
          hits += p5.scan(text, {}).length;
        }
      }
    };
    walk(root);
    doc = { gate: "p5", label: "文档", ok: hits === 0, detail: `${files} 个 md · ${hits} 处` };
  } catch (e) {
    doc = { gate: "p5", label: "文档", ok: null, detail: "扫不了: " + (e && e.message) };
  }
  gatesOut.push(doc);

  const p2 = readJson(path.join(root, STATE, "p2.json"));
  gatesOut.push({
    gate: "p2",
    label: "覆盖率",
    ok: p2 ? !!p2.ok : null,
    detail: p2 ? `只能看上次缓存（${(p2.cachedAt || "").slice(0, 16) || "无时间"}），改代码要重跑` : "没有缓存结果",
  });

  return {
    gates: gatesOut,
    blocked: gatesOut.filter((g) => g.ok === false),
    untested: ["测试", "并发任务", "发布"],
  };
}

function parse(argv) {
  const o = { html: false, json: false, outFile: null, days: 120, since: null, until: null, task: null, gate: null, limit: 400, repos: [], scan: null, wouldBlock: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--html") o.html = true;
    else if (a === "--json") o.json = true;
    else if (a === "--out") o.outFile = val();
    else if (a.startsWith("--out=")) o.outFile = a.slice(6);
    else if (a === "--days") o.days = Number(val());
    else if (a.startsWith("--days=")) o.days = Number(a.slice(7));
    else if (a === "--since") o.since = val();
    else if (a.startsWith("--since=")) o.since = a.slice(8);
    else if (a === "--until") o.until = val();
    else if (a.startsWith("--until=")) o.until = a.slice(8);
    else if (a === "--task") o.task = val();
    else if (a.startsWith("--task=")) o.task = a.slice(7);
    else if (a === "--gate") o.gate = String(val() || "").toLowerCase();
    else if (a.startsWith("--gate=")) o.gate = a.slice(7).toLowerCase();
    else if (a === "--limit") o.limit = Number(val());
    else if (a === "--repos") o.repos = String(val() || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--repos=")) o.repos = a.slice(8).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    else if (a === "--scan") o.scan = val();
    else if (a.startsWith("--scan=")) o.scan = a.slice(7);
    else if (a === "--would-block") o.wouldBlock = true;
    else if (a.startsWith("--limit=")) o.limit = Number(a.slice(8));
    else if (a.startsWith("-")) {
      o.error = `unknown flag ${a}`;
      return o;
    }
  }
  if (!Number.isFinite(o.days) || o.days <= 0) o.error = "--days wants a positive number";
  if (!Number.isFinite(o.limit) || o.limit <= 0) o.error = "--limit wants a positive number";
  if (o.gate && !GATES.includes(o.gate)) o.error = `--gate wants one of ${GATES.join(", ")}`;
  for (const [k, v] of [["--since", o.since], ["--until", o.until]]) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) o.error = `${k} wants YYYY-MM-DD`;
  }
  if (!o.html && !o.json && !o.help && !o.error) o.html = true;
  return o;
}

function collect(cwd, rawOpts) {
  const opts = rawOpts || parse([]);
  const given = cwd || process.cwd();
  const root = opts.asIs ? path.resolve(given) : repoRoot(given);
  const now = new Date();
  const lo = opts.since ? new Date(`${opts.since}T00:00:00`) : new Date(now.getTime() - (opts.days - 1) * 86400000);
  lo.setHours(0, 0, 0, 0);
  const hi = opts.until ? new Date(`${opts.until}T23:59:59`) : now;
  const cfg = readJson(path.join(root, STATE, "config.json")) || {};
  const guard = guardState(root);
  const cards = taskCards(root);

  const commits = gitHistory(root, localDate(lo), opts.limit).filter((c) => {
    const d = asDate(`${c.date}T${c.time || "00:00:00"}`);
    return d && d >= lo && d <= hi;
  });
  const installedRaw = (readJson(path.join(root, STATE, "installed.json")) || {}).ts;
  const installedAt = (() => {
    const d = asDate(installedRaw);
    return d ? `${localDate(d)} ${localTime(d)}` : "";
  })();
  const isUnmarked = (c) => !c.passed && !c.skipped && (!installedAt || `${c.date} ${c.time}` >= installedAt);

  let events = [
    ...commits.map((c) => ({
      kind: "commit",
      date: c.date,
      time: c.time,
      passed: c.passed,
      skipped: c.skipped,
      unmarked: isUnmarked(c),
      subject: c.subject,
      area: areaOf(c.subject).area,
      who: c.author,
      sha: c.sha,
      files: c.files.length,
    })),
    ...ledgerHistory(root)
      .map((t) => ({ kind: "ticket", ...t, at: asDate(t.ts) }))
      .filter((t) => t.at && t.at >= lo && t.at <= hi)
      .map((t) => ({
        kind: "ticket",
        date: localDate(t.at),
        time: localTime(t.at),
        action: t.action || "?",
        target: t.target || "?",
        decision: t.decision || "?",
        rollback: t.rollback || "",
      })),
    ...marksOf(root, guard)
      .map((m) => ({ kind: "mark", ...m, at: asDate(m.ts) }))
      .filter((m) => m.at && m.at >= lo && m.at <= hi)
      .map((m) => ({ kind: "mark", date: localDate(m.at), time: localTime(m.at), label: m.label, detail: m.detail })),
  ];

  if (opts.task) {
    const key = opts.task.toLowerCase();
    const card = cards.find((c) => c.id.toLowerCase() === key);
    const areaHit = commits.some((c) => areaOf(c.subject).area === key || areaOf(c.subject).type === key);
    const keep = new Set(card ? commits.filter((c) => c.files.some((f) => card.owns(f))).map((c) => c.sha) : []);
    events = events.filter((e) => {
      if (e.kind === "commit") {
        if (card) return keep.has(e.sha);
        if (areaHit) return e.area.toLowerCase() === key;
        return e.sha.toLowerCase().startsWith(key) || e.subject.toLowerCase().includes(key);
      }
      if (e.kind === "ticket") return String(e.target || "").toLowerCase().includes(key);
      return false;
    });
  }

  events.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  const gates = gateRows(root).filter((g) => !opts.gate || g.id === opts.gate);
  const red = gates.filter((g) => g.ran && g.ok === false);
  const missing = gates.filter((g) => !g.ran);
  const verdict = red.length ? "blocked" : missing.length ? "unknown" : "ready";
  const headline =
    verdict === "blocked"
      ? "现在不能发"
      : verdict === "unknown"
      ? "还有关没跑，先别发"
      : "现在可以发";
  const blockers = [...red, ...missing].map((g) => ({ id: g.id, label: g.label, why: g.ran ? "不过" : "没跑过", detail: g.detail, fix: g.fix }));
  const passed = gates.filter((g) => g.ran && g.ok !== false).map((g) => ({ id: g.id, label: g.label, detail: g.detail }));

  // 守卫体检：只回答「它有没有在真的保护你」，全部来自已有数据，不需要新状态文件。
  const lastGreen = commits.find((c) => c.passed) || null;
  const sinceInstall = installedAt ? commits.filter((c) => `${c.date} ${c.time}` >= installedAt) : commits;
  const withTrailer = sinceInstall.filter((c) => c.passed || c.skipped).length;
  const unmarkedCommits = sinceInstall.filter(isUnmarked);
  const hooksOn = ["pre-commit", "commit-msg", "pre-push"].filter((k) => guard[k]).length;
  const health = {
    installedAt,
    guarded: sinceInstall.length,
    withTrailer,
    rate: sinceInstall.length ? Math.round((withTrailer / sinceInstall.length) * 100) : null,
    lastGreen: lastGreen
      ? { sha: lastGreen.sha, date: lastGreen.date, time: lastGreen.time, subject: lastGreen.subject, behind: commits.indexOf(lastGreen) }
      : null,
    unmarked: unmarkedCommits.slice(0, 5).map((c) => ({ sha: c.sha, date: c.date, time: c.time, subject: c.subject, author: c.author })),
    unmarkedTotal: unmarkedCommits.length,
    hooksOn,
    ci: !!guard.ci,
  };

  const tasks = taskList(commits, cards, installedAt);

  let runs = [];
  try {
    runs = require("./runslog").read(root, 400);
  } catch (e) {
    runs = [];
  }
  const trend = GATES.map((id) => {
    const series = runs.filter((r) => r.gate === id).slice(-30);
    const good = series.filter((r) => r.ok).length;
    const withMs = series.filter((r) => Number.isFinite(r.ms));
    return {
      id,
      label: (gateRows(root).find((g) => g.id === id) || {}).label || id,
      series: series.map((r) => (r.ok ? 1 : 0)),
      runs: series.length,
      pass: good,
      rate: series.length ? Math.round((good / series.length) * 100) : null,
      lastMs: withMs.length ? withMs[withMs.length - 1].ms : null,
    };
  });

  // 危险动作打在哪些目录上：审计目标的目录聚类。
  const heatMap = new Map();
  for (const t of ledgerHistory(root)) {
    const target = String(t.target || "").replace(/\\/g, "/");
    if (!target) continue;
    const bits = target.split("/").filter(Boolean);
    const isPath = target.includes("/") || /\.(md|js|json|ts|py|ya?ml|toml|txt|png)$/i.test(target);
    const key = isPath ? (bits.length > 2 ? bits.slice(0, 2).join("/") : bits.join("/") || ".") : "发布票据（tag / 清单）";
    const e = heatMap.get(key) || { dir: key, total: 0, allow: 0, deny: 0, last: "" };
    e.total += 1;
    if (t.decision === "deny") e.deny += 1;
    else e.allow += 1;
    const ts = String(t.ts || "");
    if (ts > e.last) e.last = ts;
    heatMap.set(key, e);
  }
  const heat = [...heatMap.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  const riskiest = tasks.filter((x) => x.risk).sort((a, b) => (a.rate || 0) - (b.rate || 0)).slice(0, 3);
  const today = localDate(now);
  return {
    generatedAt: `${today} ${localTime(now)} ${tzLabel(now)}`,
    today,
    version: packageVersion(),
    root,
    repoName: path.basename(root),
    range: { since: localDate(lo), until: localDate(hi), days: opts.days, source: opts.since || opts.until ? "参数" : `近 ${opts.days} 天` },
    filters: { task: opts.task, gate: opts.gate, limit: opts.limit },
    git: {
      head: (sh(["rev-parse", "--short", "HEAD"], root) || "").trim(),
      branch: (sh(["rev-parse", "--abbrev-ref", "HEAD"], root) || "").trim(),
      dirty: (sh(["status", "--porcelain"], root) || "").split("\n").filter(Boolean).length,
    },
    guard,
    machine: machineLayer(),
    config: cfg,
    testCommand: cfg.test_cmd ? String(cfg.test_cmd) : "(自动探测)",
    headline,
    verdict,
    blockers,
    passed,
    gates,
    events,
    health,
    tasks,
    trend,
    heat,
    riskiest,
    wouldBlock: opts.wouldBlock ? wouldBlockCheck(root) : null,
    summary: {
      commits: commits.length,
      passed: commits.filter((c) => c.passed).length,
      skipped: commits.filter((c) => c.skipped).length,
      unmarked: commits.filter(isUnmarked).length,
      tickets: events.filter((e) => e.kind === "ticket").length,
      days: new Set(events.map((e) => e.date)).size,
    },
  };
}

function stamp(iso) {
  const d = asDate(iso);
  return d ? `${localDate(d)} ${localTime(d).slice(0, 5)}` : String(iso || "—");
}

function calHtml(data) {
  const now = asDate(data.today);
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7; // 周一为一周之首
  const total = new Date(y, m + 1, 0).getDate();
  const byDate = new Map();
  for (const e of data.events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(`<td class="pad"></td>`);
  for (let d = 1; d <= total; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const list = byDate.get(key) || [];
    const cls = [key === data.today ? "today" : "", list.length ? "has" : ""].filter(Boolean).join(" ");
    const dot = list.length ? `<b>${list.length}</b>` : "";
    cells.push(`<td class="${cls}" data-day="${key}" tabindex="0"><span>${d}</span>${dot}</td>`);
  }
  while (cells.length % 7) cells.push(`<td class="pad"></td>`);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  return `<table class="cal" id="cal" data-month="${y}-${pad(m + 1)}">
    <thead><tr>${["一", "二", "三", "四", "五", "六", "日"].map((d) => `<th>${d}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function eventsHtml(events, date) {
  if (!events.length) return `<div class="empty">${esc(date)} 没有记录</div>`;
  return `<table class="timeline"><tbody>${events
    .map((e) => {
      if (e.kind === "commit") {
        const tag = e.passed
          ? `<span class="chip pass">过闸</span>`
          : e.skipped
          ? `<span class="chip warn">跳过</span>`
          : `<span class="chip miss">无标记</span>`;
        return `<tr><td class="ts">${esc(e.time.slice(0, 5))}</td><td>${tag}</td><td><code>${esc(e.sha)}</code> ${esc(
          e.subject
        )}</td><td class="who">${esc(e.who)}</td><td class="num">${esc(String(e.files))} 文件</td></tr>`;
      }
      if (e.kind === "ticket") {
        const cls = e.decision === "allow" ? "pass" : e.decision === "deny" ? "fail" : "none";
        return `<tr><td class="ts">${esc(e.time.slice(0, 5))}</td><td><span class="chip ${cls}">${esc(e.decision)}</span></td><td>${esc(
          e.action
        )} <code>${esc(e.target)}</code></td><td colspan="2">回滚点 ${esc(e.rollback || "—")}</td></tr>`;
      }
      return `<tr><td class="ts">${esc(e.time.slice(0, 5))}</td><td class="label">${esc(e.label)}</td><td colspan="3">${esc(e.detail)}</td></tr>`;
    })
    .join("")}</tbody></table>`;
}

function taskHtml(t) {
  const open = "";
  return `<details class="task" ${open} data-task="${esc(t.id)}">
  <summary><code>${esc(t.id)}</code>${
    t.title && t.title !== t.id ? ` <span class="tname">${esc(t.title)}</span>` : ""
  }
    <span class="tmeta">${esc(String(t.count))} 次提交 · 过闸 ${esc(String(t.passed))}${
    t.rate !== null && t.rate !== undefined ? ` · <b class="${t.risk ? "bad" : ""}">过闸率 ${esc(String(t.rate))}%</b>` : ""
  }${t.unmarked ? ` · <b class="bad">无标记 ${esc(String(t.unmarked))}</b>` : ""}${
    t.last ? ` · ${esc(t.last.slice(0, 10))}` : ""
  }</span></summary>
  ${
    t.commits.length
      ? `<table class="timeline"><tbody>${t.commits
          .map(
            (c) =>
              `<tr><td class="ts">${esc(c.date.slice(5))} ${esc(c.time.slice(0, 5))}</td><td>${
                c.passed ? `<span class="chip pass">过闸</span>` : c.skipped ? `<span class="chip warn">跳过</span>` : `<span class="chip miss">无标记</span>`
              }</td><td><code>${esc(c.sha)}</code> ${esc(c.subject)}</td></tr>`
          )
          .join("")}</tbody></table>`
      : `<div class="empty">这一组还没有提交。</div>`
  }
</details>`;
}

function spark(series) {
  if (!series || !series.length) return `<span class="meta">没有记录</span>`;
  const w = 9;
  const gap = 2;
  const bars = series
    .map((v, i) => `<rect x="${i * (w + gap)}" y="${v ? 2 : 11}" width="${w}" height="9" rx="1.5" fill="${v ? "#4ade80" : "#f87171"}"/>`)
    .join("");
  return `<svg width="${series.length * (w + gap)}" height="22" role="img" aria-label="最近 ${series.length} 次">${bars}</svg>`;
}

function renderMulti(d) {
  const repos = d.repos || [];
  const red = repos.filter((r) => r.verdict === "blocked");
  const unknown = repos.filter((r) => r.verdict === "unknown");
  const headline = red.length ? `${red.length} 个仓库不能发` : unknown.length ? `${unknown.length} 个仓库还没跑全` : "全部可以发";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SignOff · 多仓库 · ${esc(headline)}</title>
<style>
  :root { color-scheme: dark; --pass:#4ade80; --fail:#f87171; --warn:#fbbf24; --line:#2a2e35; --bg:#0e1013; --card:#16191e; --ink:#e9eaed; --muted:#9aa1ab; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 56px; background:var(--bg); color:var(--ink); font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",Roboto,sans-serif; }
  main { max-width: 980px; margin:0 auto; }
  h1 { font-size:20px; margin:0 0 6px; color:#fff; }
  h2 { font-size:13px; margin:30px 0 8px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  .meta { color:var(--muted); font-size:12.5px; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  tbody tr:last-child td { border-bottom:0; }
  .chip { display:inline-block; padding:1px 8px; border-radius:999px; font-size:12px; font-weight:600; border:1px solid #3a3f47; background:#1b1e23; color:var(--muted); }
  .chip.pass { color:var(--pass); border-color:#2f6b45; background:#12251a; }
  .chip.fail { color:var(--fail); border-color:#7a2f2f; background:#2a1516; }
  .chip.warn { color:var(--warn); border-color:#6b5320; background:#2a2415; }
  code { font:12.5px/1.4 "Cascadia Mono",Consolas,monospace; background:#23272e; color:#e6e8eb; padding:1px 5px; border-radius:4px; border:1px solid #2f343c; }
  .repo { background:var(--card); border:1px solid var(--line); margin-bottom:10px; }
  .repo summary { padding:10px 13px; cursor:pointer; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  .repo .body { padding:4px 13px 12px; }
  ul { margin:6px 0 0; padding-left:18px; }
  footer { margin-top:26px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<main>
  <h1>落印 / SignOff — ${esc(headline)}</h1>
  <div class="meta">生成于 ${esc(d.generatedAt)}（本机时区）· ${esc(String(repos.length))} 个仓库 · 区间 ${esc(d.range.since)} ~ ${esc(d.range.until)}</div>

  <h2>先看哪个仓库挡住你</h2>
  <table>
    <thead><tr><th>仓库</th><th>结论</th><th>阻塞项</th><th>过闸率</th><th>最近全绿</th></tr></thead>
    <tbody>${repos
      .map((r) => {
        const cls = r.verdict === "blocked" ? "fail" : r.verdict === "ready" ? "pass" : "warn";
        const h = r.health || {};
        return `<tr><td><b>${esc(r.repoName)}</b><div class="meta">${esc(r.root)}</div></td>
          <td><span class="chip ${cls}">${esc(r.headline)}</span></td>
          <td>${esc(String((r.blockers || []).length))}</td>
          <td>${h.rate === null || h.rate === undefined ? "—" : esc(String(h.rate)) + "%"}</td>
          <td>${h.lastGreen ? esc(h.lastGreen.date.slice(5) + " " + h.lastGreen.time.slice(0, 5)) : "—"}</td></tr>`;
      })
      .join("")}</tbody>
  </table>

  <h2>逐个看</h2>
  ${repos
    .map(
      (r) => `<details class="repo">
    <summary><b>${esc(r.repoName)}</b> <span class="meta">${esc(r.headline)} · ${esc(String(r.summary.commits))} 提交 · ${esc(String((r.tasks || []).length))} 组任务</span></summary>
    <div class="body">
      <div>${(r.gates || [])
        .map((g, i) => {
          const s = stateOf(g);
          return `<span class="chip ${s.cls}">${esc(g.label)} ${s.label}</span>`;
        })
        .join(" ")}</div>
      ${
        (r.blockers || []).length
          ? `<ul>${r.blockers.map((b) => `<li>${esc(b.label)} ${esc(b.why)} — ${esc(b.detail)} <code>${esc(b.fix)}</code></li>`).join("")}</ul>`
          : `<div class="meta">没有阻塞项</div>`
      }
    </div>
  </details>`
    )
    .join("")}
  <footer>由 <code>signoff report --repos</code> 生成 · 每个仓库的判定与单仓页面一致 · 页内脚本只切换视图，不发请求</footer>
</main>
<script>
(function () {
  var boxes = document.querySelectorAll("details.repo");
  Array.prototype.forEach.call(boxes, function (box) {
    box.addEventListener("toggle", function () {
      if (!box.open) return;
      Array.prototype.forEach.call(boxes, function (other) { if (other !== box) other.open = false; });
    });
  });
})();
</script>
</body>
</html>
`;
}

function renderHtml(d) {
  const g = d.guard || {};
  const cfg = d.config || {};
  const todayEvents = d.events.filter((e) => e.date === d.today);
  const todayWd = WEEK[(asDate(d.today) || new Date()).getDay()];
  const h = d.health || {};
  const payload = JSON.stringify({ today: d.today, events: d.events }).replace(/</g, "\\u003c");
  const filterBits = [];
  if (d.filters.task) filterBits.push(`只看 <code>${esc(d.filters.task)}</code>`);
  if (d.filters.gate) filterBits.push(`只算 <code>${esc(d.filters.gate)}</code>`);

  const blockers = d.blockers.length
    ? `<ul class="blockers">${d.blockers
        .map(
          (b) =>
            `<li><span class="chip ${b.why === "不过" ? "fail" : "none"}">${esc(b.label)} ${esc(b.why)}</span>
             <span class="why">${esc(b.detail)}</span> <code>${esc(b.fix)}</code></li>`
        )
        .join("")}</ul>`
    : `<div class="allgood">没有阻塞项。七项都跑过且没有红。</div>`;

  const passedLine = d.passed.length
    ? `已过：${d.passed.map((p) => `<b>${esc(p.label)}</b>`).join(" · ")}`
    : "还没有任何一项拿到过结果。";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SignOff · ${esc(d.repoName)} · ${esc(d.headline)}</title>
<style>
  :root { color-scheme: dark;
          --pass:#4ade80; --pass-bg:#12251a; --pass-line:#2f6b45;
          --fail:#f87171; --fail-bg:#2a1516; --fail-line:#7a2f2f;
          --warn:#fbbf24; --warn-bg:#2a2415; --warn-line:#6b5320;
          --none:#a8adb5; --none-bg:#1b1e23; --none-line:#3a3f47;
          --line:#2a2e35; --bg:#0e1013; --card:#16191e; --ink:#e9eaed; --muted:#9aa1ab; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 20px 56px; background:var(--bg); color:var(--ink);
         font:14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", Roboto, sans-serif; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 20px; margin:0 0 6px; color:#fff; }
  h2 { font-size: 13px; margin: 32px 0 8px; text-transform: uppercase; letter-spacing:.08em; color:var(--muted); }
  .meta { color:var(--muted); font-size:12.5px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0 6px; }
  .chip { display:inline-block; padding:2px 9px; border-radius:999px; font-size:12px; font-weight:600;
          border:1px solid var(--none-line); background:var(--none-bg); color:var(--none); white-space:nowrap; }
  .chip.pass { color:var(--pass); border-color:var(--pass-line); background:var(--pass-bg); }
  .chip.fail { color:var(--fail); border-color:var(--fail-line); background:var(--fail-bg); }
  .chip.warn { color:var(--warn); border-color:var(--warn-line); background:var(--warn-bg); }
  .chip.miss { color:#fca5a5; border-color:var(--fail-line); background:var(--fail-bg); }
  .chip.none { color:var(--none); }
  .hero { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--none-line); padding:16px 18px; margin-top:12px; }
  .hero.blocked { border-left-color:var(--fail); }
  .hero.ready { border-left-color:var(--pass); }
  .hero.unknown { border-left-color:var(--warn); }
  .verdict { font-size:23px; font-weight:700; margin:0 0 6px; color:#fff; }
  .hero.blocked .verdict { color:var(--fail); }
  .hero.ready .verdict { color:var(--pass); }
  .hero.unknown .verdict { color:var(--warn); }
  ul.blockers { margin:10px 0 0; padding-left:18px; }
  ul.blockers li { margin:6px 0; }
  .why { color:var(--muted); }
  .allgood { color:var(--pass); font-weight:600; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  tbody tr:last-child td { border-bottom:0; }
  .ts, .num { white-space:nowrap; font-variant-numeric: tabular-nums; color:#cfd4da; }
  .who { white-space:nowrap; font-size:12.5px; color:var(--muted); }
  .label { white-space:nowrap; font-size:12.5px; font-weight:600; color:#cfd4da; }
  code { font:12.5px/1.4 "Cascadia Mono", Consolas, monospace; background:#23272e; color:#e6e8eb;
         padding:1px 5px; border-radius:4px; border:1px solid #2f343c; }
  .nav { font:inherit; font-size:12px; padding:1px 8px; border:1px solid var(--none-line); background:var(--none-bg);
         color:var(--ink); border-radius:5px; cursor:pointer; }
  .nav:hover { background:#262b33; }
  .cal { table-layout:fixed; }
  .cal th { text-align:center; font-size:12px; color:var(--muted); font-weight:600; background:#14171c; }
  .cal td { text-align:center; height:48px; position:relative; cursor:default; font-variant-numeric: tabular-nums; }
  .cal td.pad { background:#111318; border-bottom:1px solid var(--line); }
  .cal td.has { cursor:pointer; }
  .cal td.has b { position:absolute; right:6px; top:6px; font-size:10px; color:#0e1013; background:#7dd3fc;
                  border-radius:999px; padding:0 5px; line-height:15px; font-weight:700; }
  .cal td.today { box-shadow: inset 0 0 0 2px #7dd3fc; font-weight:700; color:#fff; }
  .cal td.sel { background:#1b2740; color:#fff; }
  .cal td:hover span { text-decoration: underline; }
  .daybar { display:flex; align-items:baseline; gap:10px; margin:14px 0 6px; flex-wrap:wrap; }
  .daybar .day { font-weight:700; color:#fff; }
  .health { display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin-top:10px; }
  .card { background:var(--card); border:1px solid var(--line); padding:11px 13px; }
  .card .k { color:var(--muted); font-size:12px; letter-spacing:.03em; }
  .card .v { font-size:16px; font-weight:700; margin-top:3px; color:#fff; }
  .card .v.good { color:var(--pass); } .card .v.bad { color:var(--fail); } .card .v.warn { color:var(--warn); }
  .card .s { color:var(--muted); font-size:12px; margin-top:3px; }
  .task { background:var(--card); border:1px solid var(--line); margin-bottom:8px; }
  .task summary { padding:9px 12px; cursor:pointer; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  .task summary::-webkit-details-marker { color:var(--muted); }
  .task .tname { font-weight:600; color:#f1f3f4; }
  .task .tmeta { color:var(--muted); font-size:12.5px; }
  .task .bad { color:var(--fail); }
  .task .timeline { border:0; border-top:1px solid var(--line); }
  .empty { color:var(--muted); padding:10px 12px; background:var(--card); border:1px solid var(--line); }
  .kv { display:grid; grid-template-columns: 150px 1fr; gap:5px 14px; }
  .kv dt { color:var(--muted); } .kv dd { margin:0; }
  table.trend td { vertical-align: middle; }
  .note { margin-top:28px; padding:12px 14px; background:var(--card); border:1px solid var(--line);
          border-left:3px solid #7dd3fc; font-size:13px; color:#cfd4da; }
  footer { margin-top:26px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<main>
  <h1>落印 / SignOff — ${esc(d.headline)}</h1>
  <div class="meta">${esc(d.root)} · v${esc(d.version)} · 生成于 ${esc(d.generatedAt)}（本机时区）</div>
  <div class="meta">区间 ${esc(d.range.since)} ~ ${esc(d.range.until)}（${esc(d.range.source)}）${filterBits.length ? " · " + filterBits.join(" · ") : ""}</div>

  <div class="chips">${d.gates
    .map((r) => {
      const s = stateOf(r);
      return `<span class="chip ${s.cls}">${esc(r.label)} ${s.label}</span>`;
    })
    .join("")}</div>

  <section class="hero ${esc(d.verdict)}">
    <p class="verdict">${esc(d.headline)}</p>
    <div class="meta">${passedLine}</div>
    ${blockers}
  </section>

  <h2>这层守卫有没有在真的保护你</h2>
  <div class="health">
    <div class="card">
      <div class="k">最近一次全绿</div>
      <div class="v ${esc(!h.lastGreen ? "bad" : h.lastGreen.behind > 20 ? "warn" : "good")}">${
    h.lastGreen ? esc(h.lastGreen.date.slice(5) + " " + h.lastGreen.time.slice(0, 5)) : "没有记录"
  }</div>
      <div class="s">${
    h.lastGreen
      ? `${esc(h.lastGreen.sha)} · 之后又有 ${esc(String(h.lastGreen.behind))} 个提交`
      : "这个仓库还没有带 Signoff-Pass 的提交"
  }</div>
    </div>
    <div class="card">
      <div class="k">安装点以来过闸率</div>
      <div class="v ${esc(h.rate === null ? "bad" : h.rate === 100 ? "good" : "warn")}">${
    h.rate === null ? "未安装" : esc(String(h.rate)) + "%"
  }</div>
      <div class="s">${esc(String(h.withTrailer))} / ${esc(String(h.guarded))} 个提交带 trailer（过闸或显式跳过）</div>
    </div>
    <div class="card">
      <div class="k">绕过闸门</div>
      <div class="v ${esc(h.unmarkedTotal ? "bad" : "good")}">${esc(String(h.unmarkedTotal))}</div>
      <div class="s">${
    h.unmarkedTotal
      ? h.unmarked
          .map((c) => `${esc(c.sha)} ${esc(c.date.slice(5))}`)
          .join(" · ") + (h.unmarkedTotal > h.unmarked.length ? ` · 还有 ${esc(String(h.unmarkedTotal - h.unmarked.length))} 条` : "")
      : "安装点之后没有提交绕过"
  }</div>
    </div>
    <div class="card">
      <div class="k">守卫在位</div>
      <div class="v ${esc(h.hooksOn === 3 && h.ci ? "good" : "warn")}">${esc(String(h.hooksOn))}/3</div>
      <div class="s">钩子 + ${esc(h.ci ? "CI 在位" : "CI 缺失")}${h.installedAt ? " · 安装于 " + esc(h.installedAt.slice(0, 16)) : " · 没有安装记录"}</div>
    </div>
  </div>

  <h2>跑闸趋势（runs.log，最近 30 次一组）</h2>
  <table class="trend">
    <thead><tr><th>项</th><th>近况</th><th>通过率</th><th>最近耗时</th></tr></thead>
    <tbody>${(d.trend || [])
      .map(
        (x) => `<tr><td>${esc(x.label)}</td><td>${spark(x.series)}</td><td>${
          x.rate === null ? "—" : esc(String(x.rate)) + "% (" + esc(String(x.pass)) + "/" + esc(String(x.runs)) + ")"
        }</td><td>${x.lastMs === null ? "—" : esc(String(x.lastMs)) + " ms"}</td></tr>`
      )
      .join("")}</tbody>
  </table>
  <div class="meta" style="margin-top:6px">每次跑闸追加一行；没有记录说明这个仓库还没跑过，或跑的是旧版本。</div>

  <h2>哪一天发生了什么</h2>
  <div class="daybar"><span class="day" id="day-label">${esc(d.today)} ${esc(todayWd)}</span>
    <span class="meta" id="day-meta">${esc(String(todayEvents.length))} 条记录 · 点月历换一天</span>
    <span class="meta" id="month-nav"><button class="nav" data-step="-1" aria-label="上个月">‹</button> <span id="month-label">${esc(d.today.slice(0, 7))}</span> <button class="nav" data-step="1" aria-label="下个月">›</button> <button class="nav" data-step="0">今天</button></span></div>
  ${calHtml(d)}
  <div id="day-events">${eventsHtml(todayEvents, d.today)}</div>

  <h2>按任务（共 ${esc(String(d.tasks.length))} 组，默认收起，一次只展开一个）</h2>
  <div class="meta" style="margin-bottom:8px">自动整理自：${d.tasks.some((t) => t.kind === "card") ? "P3 任务卡" : "提交范围"}（<code>feat(report)</code> → <code>report</code>）；每组含提交、过闸与无标记计数。</div>
  ${
    (d.riskiest || []).length
      ? `<div class="note" style="margin:10px 0"><b>工作方式本身在绕闸的组</b>：${d.riskiest
          .map((x) => `${esc(x.id)}（${esc(String(x.rate))}% · ${esc(String(x.unmarked))} 次无标记）`)
          .join(" · ")}</div>`
      : ""
  }
  ${d.tasks.length ? d.tasks.map(taskHtml).join("\n") : `<div class="empty">这段时间没有提交，也就没有任务。</div>`}

  ${
    (d.heat || []).length
      ? `<h2>危险动作打在哪</h2>
  <table>
    <thead><tr><th>目标</th><th>记录</th><th>允许</th><th>拒绝</th><th>最近</th></tr></thead>
    <tbody>${d.heat
      .map(
        (x) =>
          `<tr><td><code>${esc(x.dir)}</code></td><td>${esc(String(x.total))}</td><td>${esc(String(x.allow))}</td><td>${
            x.deny ? `<b class="bad" style="color:#f87171">${esc(String(x.deny))}</b>` : "0"
          }</td><td class="ts">${esc(String(x.last).slice(0, 16))}</td></tr>`
      )
      .join("")}</tbody>
  </table>`
      : ""
  }

  ${
    d.wouldBlock
      ? `<h2>如果现在提交（只读预演）</h2>
  <table>
    <thead><tr><th>项</th><th>会怎样</th><th>依据</th></tr></thead>
    <tbody>${d.wouldBlock.gates
      .map(
        (g) =>
          `<tr><td>${esc(g.label)}</td><td><span class="chip ${
            g.ok === false ? "fail" : g.ok ? "pass" : "none"
          }">${g.ok === false ? "会挡住" : g.ok ? "不会挡" : "不知道"}</span></td><td class="meta">${esc(g.detail)}</td></tr>`
      )
      .join("")}</tbody>
  </table>
  <div class="meta" style="margin-top:6px">只读预演：不执行测试、不写状态。${esc((d.wouldBlock.untested || []).join(" / "))} 仍需真跑。</div>`
      : ""
  }

  <h2>守卫状态</h2>
  <dl class="kv">
    <dt>pre-commit</dt><dd>${esc(g["pre-commit"] ? "installed" : "missing")}</dd>
    <dt>commit-msg</dt><dd>${esc(g["commit-msg"] ? "installed" : "missing")}</dd>
    <dt>pre-push</dt><dd>${esc(g["pre-push"] ? "installed" : "missing")}</dd>
    <dt>CI workflow</dt><dd>${esc(g.ci ? "installed" : "missing")}</dd>
    <dt>trailer</dt><dd>${esc(g.trailer ? "enforced" : "off")}</dd>
    <dt>机器层守卫</dt><dd>${esc(d.machine ? "installed" : "missing")}</dd>
    <dt>测试命令</dt><dd><code>${esc(d.testCommand)}</code></dd>
    <dt>预算 / 文档</dt><dd>${esc(cfg.budget != null ? cfg.budget + "s" : "—")} · ${esc(Array.isArray(cfg.docs) ? cfg.docs.join(", ") : "—")}</dd>
    <dt>HEAD</dt><dd><code>${esc(d.git.head || "—")}</code> ${esc(d.git.branch)} · 未提交 ${esc(String(d.git.dirty))}</dd>
  </dl>

  <div class="note">
    这一页只读：没有任何东西能让某一关变绿。<code>--no-verify</code>、<code>SIGNOFF_SKIP=1</code>、调阈值都只会让这里更红。
    「无标记」= 安装点之后既没有 <code>Signoff-Pass:</code> 也没有 <code>Signoff-Skip:</code> 的提交。
    查询靠参数：<code>--days 90</code> / <code>--since --until</code> / <code>--task</code> / <code>--gate</code> / <code>--json</code>。
  </div>

  <footer>由 <code>signoff report</code> 生成 · 数据来自 ${esc(STATE)}/*.json、${esc(STATE)}/audit.log 与 git（本机时区）· 页内脚本只切换视图，不发请求</footer>
</main>
<script type="application/json" id="payload">${payload}</script>
<script>
${pageJs()}
</script>
</body>
</html>
`;
}

function run(argv) {
  const a = parse(argv || []);
  if (a.error) {
    console.error(`signoff: ${a.error}\n`);
    console.error(USAGE);
    return 2;
  }
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  const repos = a.repos.length ? a.repos.map((r) => path.resolve(r)) : a.scan ? discoverRepos(path.resolve(a.scan)) : [];
  const data = repos.length
    ? (() => {
        const each = [];
        for (const dir of repos) {
          try {
            each.push(collect(dir, Object.assign({}, a, { asIs: true })));
          } catch (e) {
            /* a broken repo must not blank the whole board */
          }
        }
        const now = new Date();
        return {
          multi: true,
          generatedAt: `${localDate(now)} ${localTime(now)} ${tzLabel(now)}`,
          version: packageVersion(),
          root: process.cwd(),
          range: each.length ? each[0].range : { since: "", until: "", days: a.days, source: `近 ${a.days} 天` },
          repos: each,
        };
      })()
    : collect(process.cwd(), a);
  if (a.json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  const target = a.outFile ? path.resolve(a.outFile) : path.join(data.root, STATE, "report.html");
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data.multi ? renderMulti(data) : renderHtml(data), "utf8");
  } catch (e) {
    console.error(`signoff: cannot write ${target}: ${e && e.message}`);
    return 1;
  }
  console.log(`signoff: wrote ${target}`);
  if (data.multi) {
    const red = data.repos.filter((r) => r.verdict === "blocked").length;
    console.log(`signoff: ${data.repos.length} 个仓库 · ${red} 个不能发 · ${data.range.since} ~ ${data.range.until}`);
  } else {
    console.log(`signoff: ${data.headline} · ${data.range.since} ~ ${data.range.until} · ${data.summary.commits} 提交 · ${data.tasks.length} 组任务`);
  }
  return 0;
}

module.exports = { run, collect, renderHtml, escapeHtml: esc, parse, USAGE, STATE, GATES };

if (require.main === module) process.exit(run(process.argv.slice(2)));
