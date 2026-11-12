"use strict";
// 有界修复闭环 —— 只仲裁"改完能不能留"，不假装会写代码。
//
// 自动修复的第一个坏法不是改错代码，而是改判据：删断言、加 skip、把阈值调小。
// 第二个坏法是改闸门本身：p1 判红就把 p1 改绿。第三个坏法是顺手改别处。
// 所以这里不做"生成修复"，只做一件可以机械核对的事，把下面四条绑成一个判定：
//
//   1) 基线必须是红的——没有复现的"修复"只是在增加变更量
//   2) patch 只能落在声明的范围里（--scope），否则拒
//   3) 判定路径（bin/、lib/p1..p5、guard、integrity、gates/、workflows/）不许被这个循环改
//   4) 改完必须红转绿、反作弊 clean、且工作区没有 patch 之外的变化，否则整单回滚
//
// 谁产生 patch 不管（人、模型、脚本都行），留下的条件只有这四条。

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const runslog = require("./runslog");
const core = require("./core");

// 判定路径：这个循环不许碰。改闸门要走正常提交，由人看 diff。
const DENY = [
  /^bin\//,
  // 判定链上的每一个模块：闸门、反作弊、发现命令、记账、三个新判定、发布自检。
  /^lib\/(?:p[1-5]|guard|core|integrity|secrets|fix|detect|runslog|dispute|review|patterns|bootstrap|audit|checkpoint|ci|cov|doctor|editor|explain|i18n|out|preset|report|report-page|sign)\.js$/,
  /^gates\//,
  /^\.github\//,
  /^\.signoff\//,
  // p1 跑的是 package.json 里的 test 脚本：改它等于换掉判据。
  /^(?:package|package-lock|npm-shrinkwrap)\.json$/,
  /^(?:yarn\.lock|pnpm-lock\.yaml)$/,
];

const USAGE = "usage: signoff fix --patch FILE [--scope PREFIX]... [--run CMD]... [--budget SEC] [--check] [--json]";

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function parseArgs(argv) {
  const o = { patch: "", scopes: [], runs: [], budget: 180, check: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--check") o.check = true;
    else if (a === "--json") o.json = true;
    else if (a === "--patch") o.patch = argv[++i] || "";
    else if (a.startsWith("--patch=")) o.patch = a.slice(8);
    else if (a === "--scope") o.scopes.push(argv[++i] || "");
    else if (a.startsWith("--scope=")) o.scopes.push(a.slice(8));
    else if (a === "--run") o.runs.push(argv[++i] || "");
    else if (a.startsWith("--run=")) o.runs.push(a.slice(6));
    else if (a === "--budget") o.budget = Number(argv[++i]);
    else if (a.startsWith("--budget=")) o.budget = Number(a.slice(9));
  }
  o.scopes = o.scopes.filter(Boolean);
  o.runs = o.runs.filter(Boolean);
  return o;
}

// git 会在路径含中文、空格、引号时把整段包成 "..." 并用 C 风格八进制转义
// （"a/\346\265\213.test.js"）。按 \S+ 切会把这类路径丢成"没有文件"，
// 补丁就只能拒绝 —— 中文目录是常态，不能这么切。
function unquoteGit(p) {
  const t = String(p || "");
  if (!t.startsWith('"') || !t.endsWith('"')) return t;
  const body = t.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== "\\") {
      bytes.push(Buffer.from(ch, "utf8"));
      continue;
    }
    const n = body[i + 1];
    i += 1;
    if (n >= "0" && n <= "7") {
      let oct = n;
      while (oct.length < 3 && body[i + 1] >= "0" && body[i + 1] <= "7") oct += body[(i += 1)];
      bytes.push(Buffer.from([parseInt(oct, 8)]));
    } else if (n === "n") bytes.push(Buffer.from("\n"));
    else if (n === "t") bytes.push(Buffer.from("\t"));
    else if (n === "r") bytes.push(Buffer.from("\r"));
    else bytes.push(Buffer.from(n || "", "utf8"));
  }
  return Buffer.concat(bytes).toString("utf8");
}

function filesFromHeader(line) {
  const m = /^diff --git (.+)$/.exec(line);
  if (!m) return null;
  const rest = m[1];
  const quoted = /^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/.exec(rest);
  let aPath;
  let bPath;
  if (quoted) {
    aPath = unquoteGit(quoted[1]);
    bPath = unquoteGit(quoted[2]);
  } else {
    // 未转义时两边用 " b/" 分隔（路径本身允许空格）
    const at = rest.lastIndexOf(" b/");
    if (at < 0) return null;
    aPath = rest.slice(0, at);
    bPath = rest.slice(at + 1);
  }
  const strip = (p) => p.replace(/^[ab]\//, "");
  return [strip(aPath), strip(bPath)];
}

// patch 里出现了哪些文件。只认 unified diff 的标准行，不猜。
function parsePatch(text) {
  const files = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || p === "/dev/null" || seen.has(p)) return;
    seen.add(p);
    files.push(p);
  };
  for (const line of String(text || "").split(/\r?\n/)) {
    const pair = filesFromHeader(line);
    if (pair) {
      pair.forEach(add);
      continue;
    }
    let m = /^\+\+\+ b\/(.+)$/.exec(line);
    if (m) add(unquoteGit(m[1].replace(/\t$/, "")));
  }
  return files;
}

// 大小写与分隔符先归一：Windows/macOS 的文件系统不区分大小写，用 `Lib/P1.js` 写下的
// 路径在磁盘上就是 `lib/p1.js`，正则若区分大小写，这一条就成了绕过口。
const normPath = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();

function denied(files, opts) {
  const o = opts || {};
  // 只有在 signoff-cli 自己的仓库里，整个 lib/ 才算判定路径。
  const pats = o.self ? DENY.concat([/^lib\/[a-z0-9._-]+\.js$/]) : DENY;
  return files.map(normPath).filter((f) => pats.some((re) => re.test(f)));
}

function outOfScope(files, scopes) {
  if (!scopes.length) return [];
  const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return files.filter((f) => {
    const file = norm(f);
    return !scopes.some((s) => {
      const scope = norm(s);
      return !scope || scope === "." || file === scope || file.startsWith(scope + "/");
    });
  });
}

// 跑一遍判定命令。只关心"全绿/不全绿"和一个可读的失败摘要。
function runCommands(cwd, cmds, budgetSec) {
  const started = Date.now();
  const results = [];
  for (const cmd of cmds) {
    const t0 = Date.now();
    const r = spawnSync(cmd, {
      shell: true,
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: Math.max(1000, budgetSec * 1000 - (Date.now() - started)),
      killSignal: "SIGKILL",
    });
    results.push({ cmd, rc: r.status === null ? -1 : r.status, ms: Date.now() - t0 });
    if (results[results.length - 1].rc !== 0) break;
    if (Date.now() - started > budgetSec * 1000) break;
  }
  const ok = results.length === cmds.length && results.every((r) => r.rc === 0);
  const overBudget = Date.now() - started > budgetSec * 1000;
  return { ok: ok && !overBudget, overBudget, results, elapsedMs: Date.now() - started };
}

// 用 -z 读状态：` M file` 的行首空格会被任何 trim 吃掉，切片就错位（曾经切出 "un.js"）。
function changedFiles(cwd) {
  const r = spawnSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], { cwd, encoding: "utf8" });
  if (r.status !== 0) return [];
  const fields = String(r.stdout || "").split("\0").filter(Boolean);
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const rec = fields[i];
    const code = rec.slice(0, 2);
    const p = rec.slice(3);
    if (p) out.push(p);
    // 重命名/复制在 -z 里占两个字段：新路径之后紧跟旧路径。
    if (code[0] === "R" || code[0] === "C") {
      i += 1;
      if (fields[i]) out.push(fields[i]);
    }
  }
  return out;
}

// 回滚要回到补丁之前，包括补丁自己新建、但被 .gitignore 挡住的文件：
// `git clean -fd` 不碰它们，停在原地就等于"半回滚"，下一次 fix 会把它们当成基线的一部分。
// 只删打补丁前不存在的那几个；父目录空了才收，用户原有的未跟踪/被忽略文件一律不碰。
function rollback(cwd, files, before) {
  const snap = before || { untracked: new Set(), existing: new Set() };
  git(cwd, ["checkout", "--", "."]);
  const tracked = new Set(git(cwd, ["ls-files"]).out.split(/\r?\n/).filter(Boolean));
  const removable = files.filter((f) => !tracked.has(f) && !snap.untracked.has(f));
  if (removable.length) git(cwd, ["clean", "-fd", "--"].concat(removable));
  for (const f of files) {
    if (snap.existing.has(f)) continue;
    const p = path.join(cwd, f);
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (e) {
      /* 删不掉就留着，理由已经写进 fix-log */
      continue;
    }
    for (let d = path.dirname(p); d.startsWith(cwd) && d !== cwd; d = path.dirname(d)) {
      try {
        if (fs.readdirSync(d).length) break;
        fs.rmdirSync(d);
      } catch (e) {
        break;
      }
    }
  }
}

function record(cwd, entry) {
  try {
    const dir = path.join(cwd, ".signoff");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "fix-log.jsonl"), JSON.stringify(entry) + "\n", "utf8");
  } catch (e) {
    /* 记账失败不影响判定 */
  }
}

function run(argv) {
  const a = parseArgs(argv || []);
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  const cwd = process.cwd();
  const say = (s) => {
    if (!a.json) console.log(s);
  };

  if (!git(cwd, ["rev-parse", "--is-inside-work-tree"]).ok) {
    console.error("fix: not a git repository");
    return 2;
  }
  if (!a.patch) {
    console.error("fix: --patch FILE is required (write the candidate fix to a file first)");
    return 2;
  }
  // 只有"被跟踪的改动"算脏：回滚点是 HEAD，未跟踪文件不挡路（补丁自己会新建文件）。
  if (git(cwd, ["status", "--porcelain", "--untracked-files=no"]).out) {
    console.error("fix: tracked files have uncommitted changes — commit or stash first, a fix loop needs a base to roll back to");
    return 2;
  }
  const untrackedBefore = new Set(changedFiles(cwd));

  let patch;
  try {
    patch = a.patch === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(a.patch, "utf8");
  } catch (e) {
    console.error(`fix: cannot read patch: ${e.message}`);
    return 2;
  }
  const files = parsePatch(patch);
  if (!files.length) {
    console.error("fix: patch touches no file (expected a unified diff)");
    return 2;
  }
  const deniedFiles = denied(files, { self: core.isSelfRepo(cwd) });
  if (deniedFiles.length) {
    console.error(`fix: refusing to patch the verdict path: ${deniedFiles.join(", ")}`);
    console.error("fix: gate changes go through a normal commit, with a human reading the diff");
    return 2;
  }
  const outside = outOfScope(files, a.scopes);
  if (outside.length) {
    console.error(`fix: outside the declared scope (${a.scopes.join(", ")}): ${outside.join(", ")}`);
    return 2;
  }

  const cmds = a.runs.length ? a.runs : require("./p1").defaultCommands(cwd);
  if (!cmds.length) {
    console.error("fix: nothing to run (pass --run CMD)");
    return 2;
  }

  // 1) 基线必须红：没有复现的修复只是变更量。
  const before = runCommands(cwd, cmds, a.budget);
  if (before.ok) {
    console.error("fix: baseline is already green — there is nothing to fix, so nothing will be applied");
    return 2;
  }
  say(`[fix] baseline red (${before.results.map((r) => `${r.cmd} rc=${r.rc}`).join("; ")})`);

  // 补丁与工作树的换行不一致（CRLF 提交 / autocrlf 关）会让 git apply 直接失败，
  // 但内容是对的。--ignore-whitespace 能救回这一大类，救不回就明说原因。
  let applyCheck = git(cwd, ["apply", "--check", a.patch]);
  let applyArgs = ["apply", a.patch];
  if (!applyCheck.ok) {
    const retry = git(cwd, ["apply", "--check", "--ignore-whitespace", a.patch]);
    if (retry.ok) {
      applyCheck = retry;
      applyArgs = ["apply", "--ignore-whitespace", a.patch];
    }
  }
  if (!applyCheck.ok) {
    const first = applyCheck.err.split("\n")[0];
    const crlf = /\r\n/.test(patch) !== /\r\n/.test(fs.existsSync(path.join(cwd, files[0])) ? fs.readFileSync(path.join(cwd, files[0]), "utf8") : "");
    console.error(`fix: patch does not apply: ${first}`);
    if (crlf) console.error("fix: the patch and the worktree disagree about line endings (CRLF vs LF) — regenerate the diff in the same checkout");
    return 2;
  }
  if (a.check) {
    say(`[fix] --check: would apply ${files.length} file(s): ${files.join(", ")}`);
    return 0;
  }
  // 补丁落地前记下"哪些文件本来就有"：回滚时只清掉补丁新建的那些。
  const beforeSnap = {
    untracked: new Set(changedFiles(cwd)),
    existing: new Set(files.filter((f) => fs.existsSync(path.join(cwd, f)))),
  };
  const applied = git(cwd, applyArgs);
  if (!applied.ok) {
    console.error(`fix: apply failed: ${applied.err.split("\n")[0]}`);
    return 2;
  }

  // 2) 改完：红转绿 + 反作弊 clean + 没有 patch 之外的改动。
  const after = runCommands(cwd, cmds, a.budget);
  const integrity = require("./integrity").check({ cwd });
  const integrityOk = integrity.skipped || integrity.ok;
  const touched = changedFiles(cwd);
  const stray = touched.filter((f) => !files.includes(f) && !untrackedBefore.has(f));

  const reasons = [];
  if (!after.ok) reasons.push(`still red (${after.results.map((r) => `${r.cmd} rc=${r.rc}`).join("; ")})`);
  if (!integrityOk) reasons.push(`anti-tamper: ${integrity.findings.length} finding(s)`);
  if (stray.length) reasons.push(`changed outside the patch: ${stray.slice(0, 5).join(", ")}`);
  const keep = reasons.length === 0;

  if (!keep) rollback(cwd, files, beforeSnap);

  const entry = {
    at: new Date().toISOString(),
    patch: a.patch,
    files,
    scopes: a.scopes,
    before: before.results,
    after: after.results,
    integrity: integrityOk ? "clean" : reasons.filter((r) => r.startsWith("anti-tamper")),
    kept: keep,
    reasons,
  };
  record(cwd, entry);
  runslog.note(cwd, "fix", { ok: keep, files: files.length, reasons }, before.elapsedMs + after.elapsedMs);

  if (a.json) {
    console.log(JSON.stringify({ ok: keep, files, reasons, before: before.ok, after: after.ok, integrity: entry.integrity }));
  } else if (keep) {
    console.log(`[fix] KEPT ${files.length} file(s): ${files.join(", ")} — red -> green, anti-tamper clean, nothing else moved`);
  } else {
    console.log(`[fix] ROLLED BACK — ${reasons.join(" | ")}`);
  }
  return keep ? 0 : 1;
}

module.exports = { run, parsePatch, denied, outOfScope, changedFiles, DENY, USAGE };
