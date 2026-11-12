"use strict";
// 失败模式库：把 runs.log 与账本里散落的失败，按"同一个地方反复红"聚成模式。
//
// 单条失败没有信息量，重复出现的失败才有：它说明上次的修法没有碰到原因。
// 这个命令只做聚合与排序，不做判断——但"第 3 次出现"本身就是该改原因的提示。

const fs = require("fs");
const path = require("path");
const core = require("./core");
const runslog = require("./runslog");

const USAGE = "usage: signoff patterns [--min N] [--top N] [--since DAYS] [--md FILE] [--json]";

function parseArgs(argv) {
  const o = { min: 2, top: 10, since: 0, md: "", json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--min") o.min = Number(argv[++i]) || 2;
    else if (a.startsWith("--min=")) o.min = Number(a.slice(6)) || 2;
    else if (a === "--top") o.top = Number(argv[++i]) || 10;
    else if (a.startsWith("--top=")) o.top = Number(a.slice(6)) || 10;
    else if (a === "--since") o.since = Number(argv[++i]) || 0;
    else if (a.startsWith("--since=")) o.since = Number(a.slice(8)) || 0;
    else if (a === "--md") o.md = argv[++i] || "";
    else if (a.startsWith("--md=")) o.md = a.slice(5);
  }
  return o;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// 纯函数：给一组运行记录与账本条目，返回按"出现次数"排序的失败模式。
function extract(runs, audits, opts) {
  const o = opts || {};
  const min = Number(o.min) || 2;
  const sinceMs = o.since ? Date.now() - o.since * 86400000 : 0;
  const fresh = (ts) => {
    if (!sinceMs) return true;
    const t = Date.parse(ts || "");
    return Number.isFinite(t) ? t >= sinceMs : true;
  };

  // 只有判定门算"门失败"。fix 回滚、dispute 被推翻、review 被拒都是正确结果：
  // 它们也写进 runs.log，但把一个回滚说成"同一个门反复红"会把复盘引到错的地方。
  const GATE_NAMES = new Set(["p1", "p2", "p3", "p4", "p5", "sec", "secrets", "cov", "release"]);
  const byGate = new Map();
  const byTool = new Map();
  for (const r of runs || []) {
    if (!r || !r.gate || !fresh(r.ts)) continue;
    if (!GATE_NAMES.has(String(r.gate).toLowerCase())) {
      const t = byTool.get(r.gate) || { total: 0, nonpass: 0, first: "", last: "" };
      t.total += 1;
      if (r.ok === false) {
        t.nonpass += 1;
        if (!t.first) t.first = r.ts || "";
        t.last = r.ts || t.last;
      }
      byTool.set(r.gate, t);
      continue;
    }
    const g = byGate.get(r.gate) || { total: 0, fails: 0, failMs: [], first: "", last: "", streak: 0 };
    g.total += 1;
    if (r.ok === false) {
      g.fails += 1;
      g.streak += 1;
      if (Number.isFinite(r.ms)) g.failMs.push(r.ms);
      if (!g.first) g.first = r.ts || "";
      g.last = r.ts || g.last;
    } else {
      g.streak = 0;
    }
    byGate.set(r.gate, g);
  }

  const byAction = new Map();
  for (const e of audits || []) {
    if (!e || !e.action || !fresh(e.ts)) continue;
    const a = byAction.get(e.action) || { total: 0, denies: 0, first: "", last: "" };
    a.total += 1;
    if (e.decision === "deny") {
      a.denies += 1;
      if (!a.first) a.first = e.ts || "";
      a.last = e.ts || a.last;
    }
    byAction.set(e.action, a);
  }

  const patterns = [];
  for (const [gate, g] of byGate) {
    if (!g.fails) continue;
    patterns.push({
      key: `gate:${gate}`,
      kind: "gate",
      count: g.fails,
      total: g.total,
      rate: g.total ? Math.round((g.fails / g.total) * 100) : 0,
      medianMs: median(g.failMs),
      first: g.first,
      last: g.last,
      recurring: g.fails >= min,
      hint:
        g.fails >= min
          ? `same gate failed ${g.fails} times — the previous fix probably did not touch the cause`
          : "first failure of this gate in the window",
    });
  }
  for (const [tool, t] of byTool) {
    if (!t.nonpass) continue;
    patterns.push({
      key: `tool:${tool}`,
      kind: "tool",
      count: t.nonpass,
      total: t.total,
      rate: t.total ? Math.round((t.nonpass / t.total) * 100) : 0,
      medianMs: 0,
      first: t.first,
      last: t.last,
      recurring: false,
      hint: `${tool} returned a non-pass result ${t.nonpass} time(s) — a rolled-back fix, a refuted claim or a rejected review is an outcome, not a gate failure`,
    });
  }
  for (const [action, a] of byAction) {
    if (!a.denies) continue;
    patterns.push({
      key: `action:${action}`,
      kind: "audit",
      count: a.denies,
      total: a.total,
      rate: a.total ? Math.round((a.denies / a.total) * 100) : 0,
      medianMs: 0,
      first: a.first,
      last: a.last,
      recurring: a.denies >= min,
      hint: a.denies >= min ? `${a.denies} refusals on ${action} — the rule is being met repeatedly, not accidentally` : "single refusal",
    });
  }

  patterns.sort((x, y) => y.count - x.count || (y.last || "").localeCompare(x.last || ""));
  return patterns;
}

function readAudit(cwd) {
  const file = core.statePath(cwd, "audit.log");
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.action) out.push(r);
    } catch (e) {
      /* 撕裂行忽略 */
    }
  }
  return out;
}

function writeMd(file, patterns, runs) {
  const lines = ["| pattern | count | total | rate | last | recurring |", "| --- | --- | --- | --- | --- | --- |"];
  for (const p of patterns) {
    lines.push(`| \`${p.key}\` | ${p.count} | ${p.total} | ${p.rate}% | ${p.last || "-"} | ${p.recurring ? "yes" : "no"} |`);
  }
  const body = `# Failure patterns\n\n${runs} run record(s).\n\n${lines.join("\n")}\n`;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

function run(argv) {
  const a = parseArgs(argv || []);
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  const cwd = process.cwd();
  const runs = runslog.read(cwd);
  const audits = readAudit(cwd);
  const patterns = extract(runs, audits, a);
  const shown = patterns.slice(0, a.top);
  const recurring = patterns.filter((p) => p.recurring).length;

  if (a.md) {
    writeMd(path.resolve(cwd, a.md), patterns, runs.length);
    if (!a.json) console.log(`patterns: wrote ${a.md} (${patterns.length} pattern(s))`);
  }

  if (a.json) {
    console.log(JSON.stringify({ runs: runs.length, audits: audits.length, patterns: shown }));
    return 0;
  }
  if (!runs.length && !audits.length) {
    console.log("[patterns] no run records yet — .signoff/runs.log appears after the first gate run");
    return 0;
  }
  console.log(`[patterns] ${patterns.length} failure pattern(s) in ${runs.length} run(s), ${audits.length} audit entr(ies); ${recurring} recurring`);
  if (!shown.length) {
    console.log("[patterns] nothing failed in this window");
    return 0;
  }
  for (const p of shown) {
    console.log(`[patterns] ${p.key} x${p.count}/${p.total} (${p.rate}%) last ${p.last || "-"}${p.recurring ? " recurring" : ""}`);
    console.log(`[patterns]   ${p.hint}`);
  }
  return 0;
}

module.exports = { run, extract, readAudit, parseArgs, USAGE };
