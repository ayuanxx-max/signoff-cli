"use strict";
// Shared helpers for the JavaScript gate implementations.
// The gates are pure Node (>=18) on purpose: `npm i -g signoff-cli` must give the
// full P1-P5 set on any machine that can run npm, with no Python and no degraded mode.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readJSON(p, dflt) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return dflt;
  }
}

function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function writeText(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, "utf8");
}

function stateDir(cwd) {
  const d = path.join(cwd || process.cwd(), ".signoff");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function statePath(cwd, name) {
  return path.join(stateDir(cwd), name);
}

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd: cwd || process.cwd(), encoding: "utf8", windowsHide: true });
  return { code: r.status === null ? 127 : r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function json(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function die(msg, code) {
  process.stderr.write(String(msg) + "\n");
  return code === undefined ? 1 : code;
}

// Minimal argv parser: `--flag`, `--key value`, `--key=value`, positionals.
function parseArgs(argv, spec) {
  const out = { _: [] };
  for (const [k, v] of Object.entries(spec || {})) out[k] = v;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = (eq === -1 ? a.slice(2) : a.slice(2, eq)).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
      let val;
      if (eq !== -1) val = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) val = argv[++i];
      else val = true;
      if (out[key] === undefined || Array.isArray(out[key])) {
        if (Array.isArray(out[key])) out[key].push(val);
        else out[key] = val;
      } else if (val === true) out[key] = true;
      else out[key] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function appendJsonl(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + "\n", "utf8");
}

function sha256(text) {
  return require("crypto").createHash("sha256").update(text, "utf8").digest("hex");
}

// ~/.signoff, overridable for tests and for machines with a different home layout.
function homeDir() {
  const override = process.env.SIGNOFF_HOME;
  if (override) {
    fs.mkdirSync(override, { recursive: true });
    return override;
  }
  const h = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const d = path.join(h, ".signoff");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// git 的路径输出有两种形态：人读的是 `M\t"tests/\346\265\213..."` —— core.quotepath
// 默认开，非 ASCII 路径被八进制转义；机器要的是 `-z` 的 NUL 分隔且不转义。凡是要拿
// 路径的地方都走这里：用正则啃人类可读输出，中文路径就会漏成"没有改动"，闸门静默放行。
function gitZ(args, cwd) {
  const r = spawnSync("git", args, {
    cwd: cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    ok: r.status === 0,
    fields: String(r.stdout || "").split("\0").filter(Boolean),
    err: String(r.stderr || "").trim(),
  };
}

// `git diff --name-status -z` 输出成对字段：状态、路径、状态、路径……
function gitNameStatus(args, cwd) {
  const r = gitZ(args, cwd);
  const rows = [];
  for (let i = 0; i + 1 < r.fields.length; i += 2) {
    rows.push({ status: r.fields[i], path: r.fields[i + 1] });
  }
  return { ok: r.ok, rows, err: r.err };
}

function gitNameOnly(args, cwd) {
  const r = gitZ(args, cwd);
  const seen = [];
  for (const p of r.fields) if (!seen.includes(p)) seen.push(p);
  return { ok: r.ok, paths: seen, err: r.err };
}

// 这个仓库自己就是 signoff-cli 吗？只有它自己的 lib/*.js 才全是判定路径；
// 别人的 lib/ 是普通源码，不许因为我们叫 signoff 就把人家挡住。
function isSelfRepo(cwd) {
  const pkg = readJSON(path.join(cwd || process.cwd(), "package.json"), null);
  return !!(pkg && pkg.name === "signoff-cli");
}

module.exports = {
  ROOT,
  nowISO,
  readJSON,
  writeJSON,
  writeText,
  stateDir,
  statePath,
  git,
  gitZ,
  gitNameStatus,
  gitNameOnly,
  isSelfRepo,
  json,
  die,
  parseArgs,
  appendJsonl,
  sha256,
  homeDir,
};
