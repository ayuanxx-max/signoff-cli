#!/usr/bin/env node
"use strict";
// 最小变异测试：把「断言有没有牙」变成可复算的数字。
//
// 做法只有一个：逐处改掉源码里的一个算子/一个布尔字面量，跑一次判定命令；
// 命令红了 = 这个变异被断言杀掉；命令还是绿的 = 变异活下来，说明这段代码没有被断言看住。
// 没有依赖、没有守护进程、不改仓库（每个变异体跑完立刻还原，异常也还原）。
//
// usage: node tools/mutate.mjs [--files a.js,b.js | --dir lib] [--cmd "..."] [--max N]
//                              [--timeout MS] [--min PCT] [--list] [--json]

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

// 一行只改一个位置，且只改这些「几乎不可能等价」的东西。
const OPS = [
  { id: "eq->ne", find: "===", to: "!==" },
  { id: "ne->eq", find: "!==", to: "===" },
  { id: "and->or", find: "&&", to: "||" },
  { id: "or->and", find: "||", to: "&&" },
  { id: "le->lt", find: "<=", to: "<" },
  { id: "ge->gt", find: ">=", to: ">" },
  { id: "true->false", find: "true", to: "false" },
];

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

function candidates(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    for (const op of OPS) {
      const at = line.indexOf(op.find);
      if (at === -1) continue;
      out.push({
        file,
        line: i + 1,
        op: op.id,
        before: line.slice(Math.max(0, at - 30), at + op.find.length + 30).trim(),
        apply: (src) => {
          const rows = src.split("\n");
          rows[i] = rows[i].slice(0, at) + op.to + rows[i].slice(at + op.find.length);
          return rows.join("\n");
        },
      });
    }
  });
  return out;
}

function parseArgs(argv) {
  const a = { files: null, dir: "lib", cmd: "node test/smoke.js", max: 30, offset: 0, timeout: 120000, min: null, list: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = String(argv[i]);
    const eq = t.indexOf("=");
    const key = t.startsWith("--") && eq !== -1 ? t.slice(2, eq) : t.startsWith("--") ? t.slice(2) : null;
    const inline = t.startsWith("--") && eq !== -1 ? t.slice(eq + 1) : undefined;
    const next = () => (inline !== undefined ? inline : String(argv[++i]));
    if (key === "files") a.files = String(next()).split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "dir") a.dir = String(next());
    else if (key === "cmd") a.cmd = String(next());
    else if (key === "max") a.max = Number(next());
    else if (key === "offset") a.offset = Number(next());
    else if (key === "timeout") a.timeout = Number(next());
    else if (key === "min") a.min = Number(next());
    else if (key === "list") a.list = true;
    else if (key === "json") a.json = true;
    else if (t === "-h" || key === "help") a.help = true;
    else if (t.startsWith("-")) a.error = "unknown option: " + t;
    else a.error = "unexpected argument: " + t;
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    process.stdout.write(
      "usage: node tools/mutate.js [--files a.js,b.js | --dir lib] [--cmd \"node test/smoke.js\"]\n" +
        "                             [--max N] [--offset N] [--timeout MS] [--min PCT] [--list] [--json]\n\n" +
        "每个变异体单独跑一次 --cmd：红了算 killed，还绿着算 survived。\n" +
        "跑完一定还原文件；--min 只在你想让它当闸门时才给。\n"
    );
    return 0;
  }
  if (a.error) {
    process.stderr.write("mutate: " + a.error + "\n");
    return 2;
  }

  const files = a.files ? a.files.map((f) => path.resolve(ROOT, f)) : walk(path.resolve(ROOT, a.dir), []);
  const pools = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      process.stderr.write("mutate: no such file: " + f + "\n");
      return 2;
    }
    pools.push(...candidates(f).map((c) => ({ ...c, file: path.relative(ROOT, c.file).split(path.sep).join("/") })));
  }
  if (!pools.length) {
    process.stdout.write("[mutate] SKIPPED no mutation sites in " + (a.files ? a.files.join(", ") : a.dir) + "\n");
    return 0;
  }
  const picked = pools.slice(Math.max(0, a.offset || 0), Math.max(0, a.offset || 0) + a.max);
  if (a.list) {
    for (const m of picked) process.stdout.write(`${m.file}:${m.line}  ${m.op}  ${m.before}\n`);
    process.stdout.write(`[mutate] ${picked.length} mutants listed of ${pools.length} sites\n`);
    return 0;
  }

  const originals = new Map();
  const restore = () => {
    for (const [f, text] of originals) {
      try {
        if (fs.readFileSync(f, "utf8") !== text) fs.writeFileSync(f, text, "utf8");
      } catch (e) {
        process.stderr.write("mutate: FAILED to restore " + f + ": " + e.message + "\n");
      }
    }
  };
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });

  const results = [];
  let n = 0;
  for (const m of picked) {
    const abs = path.join(ROOT, m.file);
    if (!originals.has(abs)) originals.set(abs, fs.readFileSync(abs, "utf8"));
    const src = originals.get(abs);
    try {
      fs.writeFileSync(abs, m.apply(src), "utf8");
      const r = spawnSync(a.cmd, { cwd: ROOT, shell: true, encoding: "utf8", timeout: a.timeout, windowsHide: true });
      const timedOut = r.error && String(r.error.code || "").includes("ETIMEDOUT");
      const killed = r.status !== 0;
      results.push({ ...m, apply: undefined, killed, timedOut: !!timedOut, status: r.status });
      n += 1;
      process.stdout.write(`[mutate] ${String(n).padStart(2)}/${picked.length} ${killed ? "killed  " : "SURVIVED"} ${m.file}:${m.line} ${m.op}\n`);
    } finally {
      restore();
      originals.delete(abs);
    }
  }
  restore();

  const killed = results.filter((r) => r.killed).length;
  const survived = results.length - killed;
  const score = results.length ? Math.round((killed / results.length) * 1000) / 10 : 0;
  const payload = { gate: "mutate", cmd: a.cmd, total: results.length, killed, survived, score, survivors: results.filter((r) => !r.killed) };
  try {
    fs.mkdirSync(path.join(ROOT, ".signoff"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, ".signoff", "mutants.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
  } catch (e) {
    /* 写不进就算了，报告还在 stdout */
  }
  if (a.json) {
    process.stdout.write(JSON.stringify(payload) + "\n");
  } else {
    for (const s of payload.survivors) process.stdout.write(`[mutate] survivor ${s.file}:${s.line} ${s.op}  ${s.before}\n`);
    process.stdout.write(`[mutate] ${results.length} mutants: ${killed} killed, ${survived} survived (${score}%)  cmd=${a.cmd}\n`);
  }
  if (a.min !== null && score < a.min) {
    process.stderr.write(`mutate: score ${score}% is below --min ${a.min}%\n`);
    return 1;
  }
  return 0;
}

process.exitCode = main();
