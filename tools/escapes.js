#!/usr/bin/env node
"use strict";
// 逃逸记账（阶段 3 目标 3）：真实迭代里「过了闸门、事后才发现」的缺陷，一条一行。
//
// 口径（2026-11-16 与用户确认）：
//   一次迭代 = master 上一个提交。iteration N = 从 start 那个提交算起的第 N 个（start 自己是 1）。
// 记在仓库里（verify/escapes/），因为这是要能追溯的证据，不是本机临时状态。
//
// 用法：
//   node tools/escapes.js start [--sha <sha>] [--force] [--assertions N] [--root <dir>]
//   node tools/escapes.js add --defect "..." --found-by "..." [--gate p1|none|unknown]
//                             [--severity high|medium|low] [--assertions N] [--note "..."] [--root <dir>]
//   node tools/escapes.js status [--root <dir>]
//   node tools/escapes.js list [--root <dir>] [--json]

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const GATES = ["p1", "p2", "p3", "p4", "p5", "sec", "cov", "release", "none", "unknown"];
const SEVERITIES = ["high", "medium", "low"];

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return { code: r.status === null ? 1 : r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function pathsFor(root) {
  const dir = path.join(root, "verify", "escapes");
  return { dir, state: path.join(dir, "state.json"), log: path.join(dir, "log.jsonl") };
}

function readState(root) {
  const { state } = pathsFor(root);
  if (!fs.existsSync(state)) return null;
  try {
    return JSON.parse(fs.readFileSync(state, "utf8"));
  } catch {
    return null;
  }
}

function readLog(root) {
  const { log } = pathsFor(root);
  if (!fs.existsSync(log)) return [];
  return fs
    .readFileSync(log, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new Error(`verify/escapes/log.jsonl 第 ${i + 1} 行不是合法 JSON`);
      }
    });
}

function iterationsSince(root, startSha) {
  const r = git(root, ["rev-list", "--count", `${startSha}..HEAD`]);
  if (r.code !== 0) return null;
  return Number(r.out) + 1;
}

function parseArgs(argv) {
  const a = { cmd: null, root: null, sha: null, force: false, assertions: null, defect: null, foundBy: null, gate: "unknown", severity: "medium", note: null, json: false };
  const takesValue = new Set(["--root", "--sha", "--assertions", "--defect", "--found-by", "--gate", "--severity", "--note"]);
  for (let i = 0; i < argv.length; i++) {
    const tok = String(argv[i]);
    if (tok === "--force") a.force = true;
    else if (tok === "--json") a.json = true;
    else if (takesValue.has(tok)) {
      if (i + 1 >= argv.length) return { error: `${tok} 需要一个值` };
      const v = String(argv[++i]);
      if (tok === "--root") a.root = v;
      else if (tok === "--sha") a.sha = v;
      else if (tok === "--assertions") a.assertions = Number(v);
      else if (tok === "--defect") a.defect = v;
      else if (tok === "--found-by") a.foundBy = v;
      else if (tok === "--gate") a.gate = v;
      else if (tok === "--severity") a.severity = v;
      else if (tok === "--note") a.note = v;
    } else if (tok.startsWith("-")) return { error: `不认识的选项 ${tok}` };
    else if (!a.cmd) a.cmd = tok;
    else return { error: `多余的参数 ${tok}` };
  }
  return a;
}

function cmdStart(a) {
  const root = a.root || path.resolve(__dirname, "..");
  const p = pathsFor(root);
  const head = git(root, ["rev-parse", "--short", "HEAD"]);
  if (head.code !== 0) return { error: "这里不是 git 仓库" };
  const prev = readState(root);
  if (prev && !a.force) return { error: `已经有起点 ${prev.startSha}（${prev.startedAt}）；要重设请加 --force` };
  const sha = a.sha || head.out;
  const full = git(root, ["rev-parse", "--verify", "--quiet", `${sha}^{commit}`]);
  if (full.code !== 0) return { error: `找不到提交 ${sha}` };
  const state = {
    startSha: full.out.slice(0, 7),
    startedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    unit: "commit",
    assertions: a.assertions === null ? null : a.assertions,
    note: "一次迭代 = master 上一个提交；iteration N = 从 startSha 算起的第 N 个（startSha 自己是 1）",
  };
  fs.mkdirSync(p.dir, { recursive: true });
  fs.writeFileSync(p.state, JSON.stringify(state, null, 2) + "\n", "utf8");
  return { out: `起点 ${state.startSha}（${state.startedAt}），一次迭代 = 一个提交` };
}

function cmdAdd(a) {
  const root = a.root || path.resolve(__dirname, "..");
  const p = pathsFor(root);
  const state = readState(root);
  if (!state) return { error: "还没有起点：先跑 node tools/escapes.js start" };
  if (!a.defect) return { error: "缺少 --defect（漏掉的那个缺陷是什么）" };
  if (!a.foundBy) return { error: "缺少 --found-by（怎么发现的：谁/哪个场景）" };
  if (!GATES.includes(a.gate)) return { error: `--gate 只能是 ${GATES.join(" / ")}` };
  if (!SEVERITIES.includes(a.severity)) return { error: `--severity 只能是 ${SEVERITIES.join(" / ")}` };
  const iter = iterationsSince(root, state.startSha);
  if (iter === null) return { error: `起点 ${state.startSha} 不在当前历史里` };
  const head = git(root, ["rev-parse", "--short", "HEAD"]);
  const row = {
    iter,
    at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    commit: head.out,
    assertions: a.assertions === null ? state.assertions : a.assertions,
    defect: a.defect,
    foundBy: a.foundBy,
    gate: a.gate,
    severity: a.severity,
    note: a.note,
  };
  fs.mkdirSync(p.dir, { recursive: true });
  fs.appendFileSync(p.log, JSON.stringify(row) + "\n", "utf8");
  return { out: `记下第 ${iter} 次迭代的逃逸（${row.commit}）：${row.defect}` };
}

function summarize(rows, iterations) {
  const byGate = {};
  for (const r of rows) byGate[r.gate] = (byGate[r.gate] || 0) + 1;
  return {
    iterations,
    escapes: rows.length,
    perIteration: iterations ? Math.round((rows.length / iterations) * 1000) / 1000 : null,
    byGate,
    bySeverity: rows.reduce((m, r) => ((m[r.severity] = (m[r.severity] || 0) + 1), m), {}),
  };
}

function cmdStatus(a) {
  const root = a.root || path.resolve(__dirname, "..");
  const state = readState(root);
  if (!state) return { error: "还没有起点：先跑 node tools/escapes.js start" };
  const rows = readLog(root);
  const iterations = iterationsSince(root, state.startSha);
  if (iterations === null) return { error: `起点 ${state.startSha} 不在当前历史里` };
  const s = summarize(rows, iterations);
  if (a.json) return { json: { start: state, ...s } };
  const lines = [
    `起点 ${state.startSha}（${state.startedAt}）  一次迭代 = 一个提交`,
    `已走 ${s.iterations} 次迭代（当前 HEAD 是第 ${iterations} 次）`,
    `逃逸 ${s.escapes} 条，每次迭代 ${s.perIteration === null ? "-" : s.perIteration}`,
  ];
  if (s.escapes) {
    lines.push("按闸门：" + Object.entries(s.byGate).map(([g, n]) => `${g}=${n}`).join("  "));
    lines.push("按严重度：" + Object.entries(s.bySeverity).map(([g, n]) => `${g}=${n}`).join("  "));
  }
  const target = 20;
  lines.push(`距目标 ${target} 次还差 ${Math.max(0, target - iterations)} 次`);
  return { out: lines.join("\n") };
}

function cmdList(a) {
  const root = a.root || path.resolve(__dirname, "..");
  const rows = readLog(root);
  if (a.json) return { json: rows };
  if (!rows.length) return { out: "（还没有记录）" };
  return { out: rows.map((r) => `#${r.iter} ${r.commit} [${r.gate}/${r.severity}] ${r.defect} — ${r.foundBy}`).join("\n") };
}

function main(argv) {
  const a = parseArgs(argv);
  if (a.error) {
    process.stderr.write(`escapes: ${a.error}\n`);
    return 2;
  }
  const table = { start: cmdStart, add: cmdAdd, status: cmdStatus, list: cmdList };
  if (!a.cmd || !table[a.cmd]) {
    process.stderr.write("用法：node tools/escapes.js start|add|status|list [选项]（细节见文件头）\n");
    return 2;
  }
  let r;
  try {
    r = table[a.cmd](a);
  } catch (e) {
    process.stderr.write(`escapes: ${e.message}\n`);
    return 1;
  }
  if (r.error) {
    process.stderr.write(`escapes: ${r.error}\n`);
    return r.error.includes("缺少") || r.error.includes("只能是") || r.error.includes("不认识") ? 2 : 1;
  }
  if (r.json) process.stdout.write(JSON.stringify(r.json) + "\n");
  else process.stdout.write((r.out || "") + "\n");
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
