#!/usr/bin/env node
"use strict";

// `signoff report` — read-only views over what the gates recorded.
//
// v2 adds the two things a snapshot could not answer:
//   - 时间：每条事件都有本机日期与时间，按天分组的时间线，可 `--days / --since / --until` 收窄；
//   - 按任务：`--task` 过滤（任务卡存在时按卡分组，否则把每个提交当一个工作单元），
//     `--gate` 只看某一关，`--group day|task|commit` 换分组。
//
// 页面依然是单文件、内联 CSS、无脚本、无外链；数据只来自 .signoff/*.json、.signoff/audit.log
// 与 git。跑它不执行任何关，也没有任何能通过 / 跳过 / 放宽闸门的控件。

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const STATE = ".signoff";
const GATE_IDS = ["p1", "p2", "p3", "p4", "p5", "sec"];

const USAGE = `signoff report — 只读的五关现状 + 时间线（可按任务 / 关 / 时间段查询）

  signoff report [--html] [--out FILE]   写一个自包含 HTML 页面（默认 .signoff/report.html）
  signoff report --json                  同样的数据，机器可读

  时间
    --days N                 只看最近 N 天（默认 14）
    --since YYYY-MM-DD       起始日期（含）
    --until YYYY-MM-DD       截止日期（含）

  按任务 / 按关
    --task KEY               只看匹配的任务：任务卡 id、提交范围（feat(report) 里的 report）、
                             提交 sha 前缀，或提交标题里的关键词
    --gate p1..p5|sec        只看这一关
    --group day|task|commit  时间线分组方式（默认 day；有任务卡时 task 才有意义）
    --limit N                时间线最多 N 条（默认 60）

页面没有按钮：查询靠参数，结果进页面和 --json。`;

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

function readLines(file) {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  } catch (e) {
    return [];
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// Everything user-facing is rendered in the machine's local time, because that is the
// clock the person reading the page is looking at.
function localDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tzLabel(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function asDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function sh(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
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

// Shared with `signoff status` / the hooks, so the page cannot disagree with them.
function guardState(root) {
  try {
    const g = require("./guard.js");
    if (typeof g.installed === "function") return g.installed(root);
  } catch (e) {
    /* fall through to the file checks below */
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

// Gate summaries do not always carry a timestamp (a cached pass writes only its own
// file), so the file's mtime is the honest fallback for "when did this land".
function mtimeIso(file) {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch (e) {
    return "";
  }
}

function gateRows(root) {
  const p1 = readJson(path.join(root, STATE, "p1.json"));
  const p2 = readJson(path.join(root, STATE, "p2.json"));
  const p3 = readJson(path.join(root, STATE, "p3.json"));
  const p5 = readJson(path.join(root, STATE, "p5.json"));
  const se = readJson(path.join(root, STATE, "secrets.json"));
  const ledger = readLines(path.join(root, STATE, "audit.log"));
  const p4 = ledger.length ? readJsonSafe(ledger[ledger.length - 1]) : null;
  const rows = [
    {
      id: "p1",
      cmd: "signoff p1",
      file: `${STATE}/p1.json`,
      ran: !!p1,
      ok: p1 ? !!p1.ok : null,
      when: p1 ? p1.cachedAt || p1.ts || mtimeIso(path.join(root, STATE, "p1.json")) : "",
      detail: p1 ? `${p1.cases || 0} cases, budget ${Math.round((p1.budgetMs || 0) / 1000)}s` : "这个仓库里还没跑过",
      fix: 'signoff p1 --run "<test command>"',
    },
    {
      id: "p2",
      cmd: "signoff p2",
      file: `${STATE}/p2.json`,
      ran: !!p2,
      ok: p2 ? !!p2.ok : null,
      when: p2 ? p2.cachedAt || p2.ts || mtimeIso(path.join(root, STATE, "p2.json")) : "",
      detail: p2 ? `${p2.apps || 0} apps, scenario ${p2.scenarioApps || 0}, assertions ${p2.assertions || 0}, broken ${p2.broken || 0}` : "还没量过覆盖率级别",
      fix: "signoff p2 --min-scenario 3",
    },
    {
      id: "p3",
      cmd: "signoff p3 validate",
      file: `${STATE}/p3.json`,
      ran: !!p3,
      ok: p3 ? !!p3.ok : null,
      when: p3 ? p3.cachedAt || p3.ts || mtimeIso(path.join(root, STATE, "p3.json")) : "",
      detail: p3 ? `${p3.cards || 0} cards, problems ${(p3.problems || []).length}` : "没有并发任务卡",
      fix: "signoff p3 validate",
    },
    {
      id: "p4",
      cmd: "signoff p4 verify",
      file: `${STATE}/audit.log`,
      ran: ledger.length > 0,
      ok: p4 && typeof p4.ok === "boolean" ? p4.ok : null,
      when: p4 ? p4.ts || mtimeIso(path.join(root, STATE, "audit.log")) : "",
      detail: `${ledger.length} ledger record${ledger.length === 1 ? "" : "s"}`,
      fix: "signoff p4 verify",
    },
    {
      id: "p5",
      cmd: "signoff p5",
      file: `${STATE}/p5.json`,
      ran: !!p5,
      ok: p5 ? !!p5.ok : null,
      when: p5 ? p5.cachedAt || p5.ts || mtimeIso(path.join(root, STATE, "p5.json")) : "",
      detail: p5 ? `${p5.files || 0} files, ${p5.hits || 0} hits` : "文档还没扫过",
      fix: "signoff p5",
    },
    {
      id: "sec",
      cmd: "signoff secrets",
      file: `${STATE}/secrets.json`,
      ran: !!se,
      ok: se ? !!se.ok : null,
      when: se ? se.cachedAt || se.ts || mtimeIso(path.join(root, STATE, "secrets.json")) : "",
      detail: se ? `${se.files || 0} files, ${se.findings || 0} findings` : "密钥扫描还没跑过",
      fix: "signoff secrets --all",
    },
  ];
  return rows;
}

function readJsonSafe(line) {
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}

// Git is the only durable history SignOff has: a commit carries `Signoff-Pass:` exactly
// when a full gate run passed on that tree. A commit after the install point without
// either trailer is the one thing this page is allowed to call suspicious.
function gitHistory(root, since, limit) {
  const fmt = ["%x1e%h", "%ad", "%an", "%s", "%B"].join("%x1f");
  const raw = sh(
    ["log", `--date=format-local:%Y-%m-%d %H:%M:%S`, `--format=${fmt}`, `-n`, String(Math.max(limit * 3, 60)), `--since=${since}`],
    root
  );
  if (!raw) return [];
  const filesRaw = sh(["log", `--format=%x1e%h`, "--name-only", "-n", String(Math.max(limit * 3, 60)), `--since=${since}`], root) || "";
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
    const [sha, dateStr, author, subject] = parts;
    const body = parts.slice(4).join("\x1f");
    const passed = /^Signoff-Pass:\s*\S+/m.test(body);
    const skipped = /^Signoff-Skip:\s*\S+/m.test(body);
    const filesOfCommit = files.get(sha.trim()) || [];
    out.push({
      kind: "commit",
      sha: sha.trim(),
      date: (dateStr || "").slice(0, 10),
      time: (dateStr || "").slice(11, 19),
      author: (author || "").trim(),
      subject: (subject || "").trim(),
      passed,
      skipped,
      files: filesOfCommit,
    });
  }
  return out;
}

// P4 ledger: confirmed risky actions, each with a decision and a rollback point.
function ledgerHistory(root) {
  return readLines(path.join(root, STATE, "audit.log"))
    .map(readJsonSafe)
    .filter(Boolean)
    .map((r) => ({ kind: "ticket", ...r }));
}

function markHistory(root, installed) {
  const marks = [];
  const inst = readJson(path.join(root, STATE, "installed.json"));
  if (inst && inst.ts) marks.push({ kind: "mark", ts: inst.ts, label: "安装点", detail: `v${inst.version || "?"} · ${String(inst.sha || "").slice(0, 7)}` });
  const cp = readJson(path.join(root, STATE, "checkpoint.json"));
  if (cp && cp.ts) marks.push({ kind: "mark", ts: cp.ts, label: "账本检查点", detail: `seq ${cp.seq} · ${String(cp.head || "").slice(0, 7)}` });
  const cache = readJson(path.join(root, STATE, "cache.json"));
  if (cache && cache.ts) {
    marks.push({
      kind: "mark",
      ts: cache.ts,
      label: "最近一次跑闸",
      detail: `${cache.ok ? "PASS" : "FAIL"} · ${cache.seconds || 0}s · ${(cache.key || "").split("|")[1] || ""}`,
    });
  }
  if (installed && installed.last_run && installed.last_run.ts) {
    /* already covered by cache.json; kept for repos where cache was cleaned */
  }
  return marks;
}

// Task cards (P3) are optional. When they exist, a "task" is a card plus the commits
// whose files fall inside its scope; otherwise the caller gets commits as work units.
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
    return {
      id,
      goal: card.goal || "",
      scope,
      acceptance: [].concat(card.acceptance || []),
      rollback: card.rollback || "",
      owns: (file) => scope.some((s) => matchScope(s, file)),
    };
  });
}

// Without task cards, "a task" is still visible: conventional commits name their area
// (`feat(report)`, `chore(release)`), which is a good proxy for "what work this was".
function areaOf(subject) {
  const m = /^(\w+)(?:\(([^)]+)\))?!?:/.exec(String(subject || ""));
  if (!m) return { type: "other", area: "其他" };
  return { type: m[1].toLowerCase(), area: m[2] || m[1].toLowerCase() };
}

function areaView(commits, since) {
  const map = new Map();
  for (const c of commits) {
    const { type, area } = areaOf(c.subject);
    let a = map.get(area);
    if (!a) map.set(area, (a = { area, type, commits: 0, passed: 0, skipped: 0, unmarked: 0, lastDate: "", lastTime: "" }));
    a.commits += 1;
    if (c.passed) a.passed += 1;
    else if (c.skipped) a.skipped += 1;
    else if (!since || `${c.date} ${c.time}` >= since) a.unmarked += 1;
    if (`${c.date} ${c.time}` > `${a.lastDate} ${a.lastTime}`) {
      a.lastDate = c.date;
      a.lastTime = c.time;
    }
  }
  return [...map.values()].sort((x, y) => `${y.lastDate} ${y.lastTime}`.localeCompare(`${x.lastDate} ${x.lastTime}`));
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

// Filtering is CLI-side on purpose: the page stays script-free, and a shared link can
// describe a query by its own URL-independent parameters.
function parse(argv) {
  const o = {
    html: false,
    json: false,
    outFile: null,
    days: 14,
    since: null,
    until: null,
    task: null,
    gate: null,
    group: "day",
    limit: 60,
  };
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
    else if (a === "--group") o.group = String(val() || "day").toLowerCase();
    else if (a.startsWith("--group=")) o.group = a.slice(8).toLowerCase();
    else if (a === "--limit") o.limit = Number(val());
    else if (a.startsWith("--limit=")) o.limit = Number(a.slice(8));
    else if (a.startsWith("-")) {
      o.error = `unknown flag ${a}`;
      return o;
    }
  }
  if (!Number.isFinite(o.days) || o.days <= 0) o.error = "--days wants a positive number";
  if (!Number.isFinite(o.limit) || o.limit <= 0) o.error = "--limit wants a positive number";
  if (o.gate && !GATE_IDS.includes(o.gate)) o.error = `--gate wants one of ${GATE_IDS.join(", ")}`;
  if (!["day", "task", "commit"].includes(o.group)) o.error = "--group wants day, task or commit";
  for (const [k, v] of [["--since", o.since], ["--until", o.until]]) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) o.error = `${k} wants YYYY-MM-DD`;
  }
  if (!o.html && !o.json && !o.help && !o.error) o.html = true;
  return o;
}

function sinceDate(o) {
  if (o.since) return new Date(`${o.since}T00:00:00`);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (o.days - 1));
  return d;
}

function untilDate(o) {
  if (o.until) return new Date(`${o.until}T23:59:59`);
  return new Date();
}

function inRange(d, lo, hi) {
  return d && d >= lo && d <= hi;
}

function collect(cwd, o) {
  const opts = o || parse([]);
  const root = repoRoot(cwd || process.cwd());
  const now = new Date();
  const lo = sinceDate(opts);
  const hi = untilDate(opts);
  const cfg = readJson(path.join(root, STATE, "config.json"));
  const guard = guardState(root);
  const cards = taskCards(root);

  const commits = gitHistory(root, opts.since || localDate(lo), opts.limit).filter((c) => inRange(asDate(`${c.date}T${c.time || "00:00:00"}`), lo, hi));
  const tickets = ledgerHistory(root)
    .map((t) => ({ ...t, when: asDate(t.ts) }))
    .filter((t) => inRange(t.when, lo, hi))
    .map((t) => ({
      kind: "ticket",
      action: t.action || "?",
      target: t.target || "?",
      decision: t.decision || "?",
      rollback: t.rollback || "",
      date: t.when ? localDate(t.when) : "",
      time: t.when ? localTime(t.when) : "",
    }));
  const marks = markHistory(root, guard)
    .map((m) => ({ ...m, at: asDate(m.ts) }))
    .filter((m) => inRange(m.at, lo, hi))
    .map((m) => ({ kind: "mark", label: m.label, detail: m.detail, date: m.at ? localDate(m.at) : "", time: m.at ? localTime(m.at) : "" }));

  let events = [
    ...commits.map((c) => ({ kind: "commit", date: c.date, time: c.time, passed: c.passed, skipped: c.skipped, subject: c.subject, who: c.author, sha: c.sha, files: c.files.length })),
    ...tickets,
    ...marks,
  ];

  if (opts.task) {
    const key = opts.task.toLowerCase();
    const card = cards.find((c) => c.id.toLowerCase() === key);
    const areaHit = areaView(commits).some((a) => a.area.toLowerCase() === key || a.type === key);
    const keep = new Set();
    if (card) {
      for (const c of commits) if (c.files.some((f) => card.owns(f))) keep.add(c.sha);
    }
    events = events.filter((e) => {
      if (e.kind === "commit") {
        if (card) return keep.has(e.sha);
        if (areaHit) {
          const a = areaOf(e.subject);
          return a.area.toLowerCase() === key || a.type === key;
        }
        return e.sha.toLowerCase().startsWith(key) || e.subject.toLowerCase().includes(key);
      }
      return String(e.target || "").toLowerCase().includes(key);
    });
  }
  const gateNote = opts.gate
    ? "单关历史不落盘：git 只记录「全套闸门通过」这一事实（Signoff-Pass），所以时间线不按关裁剪。"
    : "";

  events.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  events = events.slice(0, opts.limit);

  const days = [];
  for (const e of events) {
    const key = e.date || "未知日期";
    let bucket = days.find((d) => d.date === key);
    if (!bucket) {
      const d = asDate(`${key}T00:00:00`);
      days.push((bucket = { date: key, weekday: d ? WEEK[d.getDay()] : "", events: [] }));
    }
    bucket.events.push(e);
  }

  // A commit that landed after the install point and carries neither trailer is the
  // signal the whole product exists for: it is surfaced, never hidden in a table.
  const installedAt = (() => {
    const d = asDate((readJson(path.join(root, STATE, "installed.json")) || {}).ts);
    return d ? `${localDate(d)} ${localTime(d)}` : "";
  })();
  const unmarked = installedAt ? commits.filter((c) => `${c.date} ${c.time}` >= installedAt && !c.passed && !c.skipped).length : 0;

  const areas = areaView(commits, installedAt);
  const taskView = cards.map((card) => {
    const own = commits.filter((c) => c.files.some((f) => card.owns(f)));
    return {
      id: card.id,
      goal: card.goal,
      scope: card.scope,
      rollback: card.rollback,
      commits: own.map((c) => ({ sha: c.sha, date: c.date, time: c.time, subject: c.subject, passed: c.passed })),
      passed: own.filter((c) => c.passed).length,
    };
  });

  const gates = gateRows(root).filter((g) => !opts.gate || g.id === opts.gate);
  return {
    generatedAt: `${localDate(now)} ${localTime(now)} ${tzLabel(now)}`,
    version: packageVersion(),
    root,
    repoName: path.basename(root),
    range: { since: localDate(lo), until: localDate(hi), days: opts.days, source: opts.since || opts.until ? "参数" : `近 ${opts.days} 天` },
    filters: { task: opts.task, gate: opts.gate, group: opts.group, limit: opts.limit },
    git: {
      head: (sh(["rev-parse", "--short", "HEAD"], root) || "").trim(),
      branch: sh(["rev-parse", "--abbrev-ref", "HEAD"], root) || "",
      dirty: (sh(["status", "--porcelain"], root) || "").split("\n").filter(Boolean).length,
    },
    guard,
    machine: machineLayer(),
    config: cfg || {},
    testCommand: cfg && cfg.test_cmd ? String(cfg.test_cmd) : "(自动探测)",
    gates,
    summary: {
      commits: commits.length,
      passed: commits.filter((c) => c.passed).length,
      skipped: commits.filter((c) => c.skipped).length,
      unmarked,
      tickets: tickets.length,
    },
    days,
    areas,
    shown: days.reduce((n, day) => n + day.events.length, 0),
    tasks: taskView,
    taskMode: cards.length ? "card" : "commit",
    gateNote,
  };
}

// A gate that recorded a result but no boolean (the P4 ledger is a chain, not a
// verdict) shows as "记录"; only a real `false` is red.
function stateOf(row) {
  if (!row.ran) return { label: "未跑", cls: "none" };
  if (row.ok === null || row.ok === undefined) return { label: "记录", cls: "none" };
  return row.ok ? { label: "PASS", cls: "pass" } : { label: "FAIL", cls: "fail" };
}

function chip(row) {
  const s = stateOf(row);
  return `<span class="chip ${s.cls}" data-gate="${esc(row.id)}">${esc(row.id.toUpperCase())} ${s.label}</span>`;
}

function verdict(row) {
  const s = stateOf(row);
  return `<span class="chip ${s.cls}">${s.label}</span>`;
}

function cleanSubject(s) {
  return String(s || "")
    .replace(/\s*Signoff-(?:Pass|Skip):\s*\S+\s*$/i, "")
    .trim();
}

function eventRow(e) {
  if (e.kind === "commit") {
    const tag = e.passed ? `<span class="chip pass">过闸</span>` : e.skipped ? `<span class="chip warn">跳过</span>` : `<span class="chip miss">无标记</span>`;
    return `<tr><td class="ts">${esc(e.time)}</td><td>${tag}</td><td><code>${esc(e.sha)}</code> ${esc(
      cleanSubject(e.subject)
    )}</td><td class="who">${esc(e.who)}</td><td class="num">${esc(String(e.files))} files</td></tr>`;
  }
  if (e.kind === "ticket") {
    const cls = e.decision === "allow" ? "pass" : e.decision === "deny" ? "fail" : "none";
    return `<tr><td class="ts">${esc(e.time)}</td><td><span class="chip ${cls}">${esc(e.decision)}</span></td><td>${esc(
      e.action
    )} <code>${esc(e.target)}</code></td><td colspan="2">回滚点 ${esc(e.rollback || "—")}</td></tr>`;
  }
  return `<tr><td class="ts">${esc(e.time)}</td><td class="label">${esc(e.label)}</td><td colspan="3">${esc(e.detail)}</td></tr>`;
}

function renderHtml(d) {
  const g = d.guard || {};
  const yn = (v) => (v ? "installed" : "missing");
  const cfg = d.config || {};
  const gateRowsHtml = d.gates
    .map(
      (r) => `<tr>
      <th scope="row">${esc(r.id.toUpperCase())}</th>
      <td><code>${esc(r.cmd)}</code></td>
      <td>${verdict(r)}</td>
      <td class="ts">${esc(r.when ? shortStamp(r.when) : "—")}</td>
      <td>${esc(r.detail)}</td>
      <td><code>${esc(r.fix)}</code></td>
    </tr>`
    )
    .join("\n");

  const filterBits = [];
  if (d.filters.task) filterBits.push(`任务/范围 <code>${esc(d.filters.task)}</code>`);
  if (d.filters.gate) filterBits.push(`只关 <code>${esc(d.filters.gate.toUpperCase())}</code>`);
  filterBits.push(`分组 ${esc(d.filters.group)}`);

  const timeline = d.days.length
    ? d.filters.group === "commit"
      ? d.days.flatMap((day) => day.events).map(eventRow).join("\n")
      : d.days
          .map(
            (day) => `<tr class="day"><th colspan="5">${esc(day.date)} ${esc(day.weekday)}</th></tr>
${day.events.map(eventRow).join("\n")}`
          )
          .join("\n")
    : `<tr><td colspan="5">这个时间段内没有记录（试 <code>--days 90</code> 或 <code>--since</code>）</td></tr>`;

  const taskBlock = d.tasks.length
    ? d.tasks
        .map(
          (t) => `<section class="task">
      <h3><code>${esc(t.id)}</code> ${esc(t.goal)}</h3>
      <div class="meta">scope ${esc(t.scope.join(", ") || "—")} · 回滚点 ${esc(t.rollback || "—")} · 提交 ${
            t.commits.length
          } 个（过闸 ${t.passed}）</div>
      ${
        t.commits.length
          ? `<table><thead><tr><th>提交</th><th>日期</th><th>时间</th><th>标题</th><th>结果</th></tr></thead><tbody>${t.commits
              .map(
                (c) =>
                  `<tr><td><code>${esc(c.sha)}</code></td><td class="ts">${esc(c.date)}</td><td class="ts">${esc(
                    c.time
                  )}</td><td>${esc(c.subject)}</td><td>${c.passed ? "过闸" : "无标记"}</td></tr>`
              )
              .join("")}</tbody></table>`
          : `<div class="meta">这个任务卡还没有落在它 scope 里的提交。</div>`
      }
    </section>`
        )
        .join("\n")
    : "";

  const areaBlock = (d.areas || [])
    .map(
      (a) => `<tr><td><code>${esc(a.area)}</code></td><td>${esc(a.type)}</td><td class="num">${esc(String(a.commits))}</td><td class="num">${esc(
        String(a.passed)
      )}</td><td class="num">${esc(String(a.unmarked))}</td><td class="ts">${esc(a.lastDate)} ${esc(a.lastTime)}</td><td>${
        a.unmarked ? `<span class="chip miss">有无标记提交</span>` : `<span class="chip pass">全过闸</span>`
      }</td></tr>`
    )
    .join("\n");

  const s = d.summary;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SignOff report · ${esc(d.repoName)} · ${esc(d.range.since)}~${esc(d.range.until)}</title>
<style>
  :root { --pass:#197b33; --fail:#b3261e; --warn:#8a5a00; --none:#5f6368; --line:#dadce0; --bg:#fafafa; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 20px 48px; background:var(--bg); color:#202124;
         font:14px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", Roboto, sans-serif; }
  main { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 20px; margin:0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing:.04em; color:#3c4043; }
  h3 { font-size: 14px; margin: 0 0 4px; }
  .meta { color:#5f6368; font-size:12.5px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 4px; }
  .chip { display:inline-block; padding:3px 9px; border-radius:999px; font-size:12px;
          font-weight:600; border:1px solid var(--line); background:#fff; color:#3c4043; }
  .chip.pass { color:var(--pass); border-color:#a8d5b5; background:#eef7f0; }
  .chip.fail { color:var(--fail); border-color:#f0b6b2; background:#fdeeee; }
  .chip.warn { color:var(--warn); border-color:#e8d3a3; background:#fdf6e6; }
  .chip.miss { color:var(--fail); border-color:#f0b6b2; background:#fdf0ef; }
  .chip.none { color:var(--none); }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line); }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  thead th { background:#f1f3f4; font-weight:600; font-size:12.5px; white-space:nowrap; }
  tbody tr:last-child th, tbody tr:last-child td { border-bottom:0; }
  tr.day th { background:#e8eaed; font-size:12.5px; letter-spacing:.02em; }
  code { font: 12.5px/1.4 "Cascadia Mono", Consolas, monospace; background:#f1f3f4;
         padding:1px 5px; border-radius:4px; }
  .kv { display:grid; grid-template-columns: 180px 1fr; gap:6px 14px; }
  .ts { white-space:nowrap; font-variant-numeric: tabular-nums; }
  .who { white-space:nowrap; font-size:12.5px; color:#3c4043; }
  .num { white-space:nowrap; font-size:12.5px; color:#5f6368; }
  .label { white-space:nowrap; font-size:12.5px; font-weight:600; color:#3c4043; }
  table.timeline { table-layout: fixed; }
  .kv dt { color:#5f6368; } .kv dd { margin:0; }
  .task { background:#fff; border:1px solid var(--line); padding:12px 14px; margin-bottom:12px; }
  .note { margin-top:26px; padding:12px 14px; background:#fff; border:1px solid var(--line);
          border-left:3px solid #3c4043; color:#3c4043; font-size:13px; }
  footer { margin-top:26px; color:#5f6368; font-size:12px; }
</style>
</head>
<body>
<main>
  <h1>落印 / SignOff — 只读状态页与时间线</h1>
  <div class="meta">${esc(d.root)} · v${esc(d.version)} · 生成于 ${esc(d.generatedAt)}（本机时区）</div>
  <div class="meta">区间 ${esc(d.range.since)} ~ ${esc(d.range.until)}（${esc(d.range.source)}） · ${filterBits.join(" · ")}</div>

  <div class="chips">${d.gates.map(chip).join("")}</div>
  <div class="meta">近段提交 ${esc(String(s.commits))} · 过闸 ${esc(String(s.passed))} · 显式跳过 ${esc(
    String(s.skipped)
  )} · 无标记 ${esc(String(s.unmarked))} · 票据 ${esc(String(s.tickets))}</div>

  <h2>五关现状</h2>
  <table>
    <thead><tr><th>关</th><th>命令</th><th>上次结果</th><th>时间</th><th>依据</th><th>怎么修</th></tr></thead>
    <tbody>
${gateRowsHtml}
    </tbody>
  </table>

  <h2>时间线（${esc(d.range.since)} ~ ${esc(d.range.until)}，按天）</h2>
  <div class="meta">显示 ${esc(String(d.shown))} 条（上限 <code>--limit ${esc(String(d.filters.limit))}</code>）· 一条提交 = 一次过闸记录（<code>Signoff-Pass</code>），票据与安装点也在同一条时间轴上。</div>
  <table class="timeline">
    <colgroup><col style="width:86px"><col style="width:78px"><col><col style="width:118px"><col style="width:74px"></colgroup>
    <thead><tr><th>时间</th><th>事件</th><th>内容</th><th>谁 / 证书</th><th>规模</th></tr></thead>
    <tbody>
${timeline}
    </tbody>
  </table>

  ${
    taskBlock
      ? `<h2>按任务（P3 任务卡）</h2>${taskBlock}`
      : `<h2>按任务（按提交范围自动切分）</h2>
  <div class="meta">这个仓库没有 <code>tasks/&lt;id&gt;/card.json</code>，于是按提交标题里的类型 / 范围（<code>feat(report)</code>）切分；<code>--task report</code> 只看这一组，<code>--group commit</code> 一条提交一行。</div>
  <table class="timeline"><colgroup><col style="width:132px"><col style="width:86px"><col style="width:66px"><col style="width:66px"><col style="width:80px"><col style="width:146px"><col></colgroup>
    <thead><tr><th>范围</th><th>类型</th><th>提交</th><th>过闸</th><th>无标记</th><th>最近一次</th><th>状态</th></tr></thead>
    <tbody>${areaBlock || `<tr><td colspan="7">这段时间没有提交</td></tr>`}</tbody>
  </table>`
  }

  <h2>守卫状态</h2>
  <dl class="kv">
    <dt>pre-commit</dt><dd>${esc(yn(g["pre-commit"]))}</dd>
    <dt>commit-msg</dt><dd>${esc(yn(g["commit-msg"]))}</dd>
    <dt>pre-push</dt><dd>${esc(yn(g["pre-push"]))}</dd>
    <dt>CI workflow</dt><dd>${esc(yn(g.ci))}</dd>
    <dt>trailer</dt><dd>${esc(g.trailer ? "enforced" : "off")}</dd>
    <dt>仓库配置</dt><dd>${esc(g.config ? "present" : "missing")}</dd>
    <dt>机器层守卫</dt><dd>${esc(d.machine ? "installed" : "missing")}</dd>
    <dt>测试命令</dt><dd><code>${esc(d.testCommand)}</code></dd>
    <dt>预算 / 文档范围</dt><dd>${esc(cfg.budget != null ? cfg.budget + "s" : "—")} · ${esc(
    Array.isArray(cfg.docs) ? cfg.docs.join(", ") : "—"
  )}</dd>
    <dt>HEAD</dt><dd><code>${esc(d.git.head || "—")}</code> ${esc(d.git.branch)} · 未提交 ${esc(
    String(d.git.dirty)
  )}</dd>
  </dl>

  <div class="note">
    查询靠参数，页面没有按钮：<code>--days 30</code>、<code>--since 2026-11-01 --until 2026-11-10</code>、
    <code>--task &lt;卡 id|sha|关键词&gt;</code>、<code>--gate p2</code>、<code>--group commit</code>。
    「无标记」= 提交落在安装点之后却既没有 <code>Signoff-Pass:</code> 也没有 <code>Signoff-Skip:</code>，那正是
    <code>--no-verify</code> 的形状。判定只认退出码，三条红线不变。
  </div>

  <footer>由 <code>signoff report</code> 生成 · 数据来自 ${esc(STATE)}/*.json、${esc(STATE)}/audit.log 与 git（本机时区）· 不联网、不执行任何关</footer>
</main>
</body>
</html>
`;
}

function shortStamp(iso) {
  const d = asDate(iso);
  if (!d) return String(iso || "");
  return `${localDate(d)} ${localTime(d).slice(0, 5)}`;
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
  const data = collect(process.cwd(), a);
  if (a.json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  const target = a.outFile ? path.resolve(a.outFile) : path.join(data.root, STATE, "report.html");
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, renderHtml(data), "utf8");
  } catch (e) {
    console.error(`signoff: cannot write ${target}: ${e && e.message}`);
    return 1;
  }
  console.log(`signoff: wrote ${target}`);
  console.log(
    `signoff: ${data.range.since} ~ ${data.range.until} · ${data.summary.commits} commits (${data.summary.passed} passed) · ${data.days.length} days`
  );
  return 0;
}

module.exports = { run, collect, renderHtml, escapeHtml: esc, parse, USAGE, STATE };

if (require.main === module) process.exit(run(process.argv.slice(2)));
