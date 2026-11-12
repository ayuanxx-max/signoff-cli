"use strict";
// 评审存证：把"有人看过这个 diff"变成"有个 hash 和它绑在一起"。
//
// 存证能证明的事情只有一件，但这件很关键：**评审过的内容和要发布的内容是同一份**。
// 它不能证明谁真的读了 diff —— `--by` / `--model` 是自述，任何工具的"我审过了"都只是自述。
// 所以这里不做签名承诺，只做内容绑定：diff 变一个字节，hash 就变，评审自动失效。

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const core = require("./core");
const runslog = require("./runslog");

const USAGE =
  "usage: signoff review --by ID [--model PROVIDER/MODEL] [--verdict approve|reject] [--note TEXT] [--json]\n" +
  "       signoff review --verify [--json]    is the diff being shipped the diff that was reviewed?\n" +
  "       signoff review --status | --list [--limit N]";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return { ok: r.status === 0, out: String(r.stdout || ""), err: String(r.stderr || "").trim() };
}

function parseArgs(argv) {
  const o = { by: "", model: "", verdict: "approve", note: "", json: false, verify: false, status: false, list: false, limit: 10, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--verify") o.verify = true;
    else if (a === "--status") o.status = true;
    else if (a === "--list") o.list = true;
    else if (a === "--by") o.by = argv[++i] || "";
    else if (a.startsWith("--by=")) o.by = a.slice(5);
    else if (a === "--model") o.model = argv[++i] || "";
    else if (a.startsWith("--model=")) o.model = a.slice(8);
    else if (a === "--verdict") o.verdict = argv[++i] || "";
    else if (a.startsWith("--verdict=")) o.verdict = a.slice(10);
    else if (a === "--note") o.note = argv[++i] || "";
    else if (a.startsWith("--note=")) o.note = a.slice(7);
    else if (a === "--limit") o.limit = Number(argv[++i]) || 10;
    else if (a.startsWith("--limit=")) o.limit = Number(a.slice(8)) || 10;
  }
  if (o.verdict !== "approve" && o.verdict !== "reject") o.verdict = "approve";
  return o;
}

// 要被评审的内容：优先暂存区（预提交钩子看到的就是它），没有暂存改动就看工作区。
// 两种都归一化换行，避免 CRLF/LF 让同一份改动算出两个 hash。
function diffOf(cwd) {
  const staged = git(cwd, ["diff", "--cached", "--binary", "--no-color"]);
  if (staged.ok && staged.out.trim()) {
    return { mode: "index", text: staged.out };
  }
  const work = git(cwd, ["diff", "--binary", "--no-color"]);
  return { mode: "worktree", text: work.ok ? work.out : "" };
}

function diffInfo(cwd) {
  const d = diffOf(cwd);
  const text = d.text.replace(/\r\n/g, "\n");
  // 文件清单走 -z：`+++ b/...` 这一行在路径含中文或空格时会被引号包成
  // `+++ "b/\346..."` 并挂一个制表符，正则永远匹配不上，整份 diff 就成了"没有改动"。
  const list = core.gitNameOnly(
    d.mode === "index" ? ["diff", "--cached", "--name-only", "-z"] : ["diff", "--name-only", "-z"],
    cwd
  );
  const files = list.ok ? list.paths : [];
  return { hash: sha(text).slice(0, 32), mode: d.mode, files, bytes: text.length };
}

function reviewPath(cwd) {
  return core.statePath(cwd, "reviews.jsonl");
}

function readAll(cwd) {
  let text = "";
  try {
    text = fs.readFileSync(reviewPath(cwd), "utf8");
  } catch (e) {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.hash) out.push(r);
    } catch (e) {
      /* 半截行忽略 */
    }
  }
  return out;
}

function latestFor(cwd, hash) {
  const all = readAll(cwd).filter((r) => r.hash === hash);
  return all.length ? all[all.length - 1] : null;
}

function run(argv) {
  const a = parseArgs(argv || []);
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  const cwd = process.cwd();
  if (!git(cwd, ["rev-parse", "--is-inside-work-tree"]).ok) {
    console.error("review: not a git repository — review binds to a diff, and a diff needs git");
    return 2;
  }
  const info = diffInfo(cwd);
  const all = readAll(cwd);

  if (a.list) {
    const rows = all.slice(-a.limit);
    if (a.json) {
      console.log(JSON.stringify({ reviews: rows }));
      return 0;
    }
    if (!rows.length) {
      console.log("[review] no attestations yet");
      return 0;
    }
    for (const r of rows) console.log(`[review] ${r.ts} ${r.verdict} ${r.hash} by=${r.by}${r.model ? " model=" + r.model : ""} ${(r.files || []).length} file(s)`);
    return 0;
  }

  if (a.status) {
    const hit = latestFor(cwd, info.hash);
    if (a.json) {
      console.log(JSON.stringify({ hash: info.hash, mode: info.mode, files: info.files, attested: !!hit, by: hit ? hit.by : null }));
      return 0;
    }
    console.log(`[review] current diff ${info.hash} (${info.mode}, ${info.files.length} file(s), ${info.bytes} bytes)`);
    if (hit) console.log(`[review] attested ${hit.ts} by ${hit.by}${hit.model ? " (" + hit.model + ")" : ""}: ${hit.verdict}`);
    else console.log("[review] not attested — no review is bound to this exact diff");
    return hit ? 0 : 1;
  }

  if (a.verify) {
    const hit = latestFor(cwd, info.hash);
    const ok = !!(hit && hit.verdict === "approve");
    if (!ok) {
      const reviewed = all.filter((r) => r.verdict === "approve").slice(-1)[0];
      if (a.json) {
        console.log(JSON.stringify({ ok: false, hash: info.hash, reviewedHash: reviewed ? reviewed.hash : null }));
        return 1;
      }
      console.log(`[review] FAIL — the diff being shipped (${info.hash}) is not the diff that was approved`);
      if (reviewed) console.log(`[review] last approved diff was ${reviewed.hash} (${reviewed.ts} by ${reviewed.by})`);
      console.log("[review] a review that does not name a hash names nothing; re-run review --by after changing the diff");
      return 1;
    }
    if (a.json) {
      console.log(JSON.stringify({ ok: true, hash: info.hash, by: hit.by, model: hit.model || null, ts: hit.ts }));
      return 0;
    }
    console.log(`[review] OK — ${info.hash} approved by ${hit.by}${hit.model ? " (" + hit.model + ")" : ""} at ${hit.ts}`);
    return 0;
  }

  if (!a.by.trim()) {
    console.error("review: --by ID is required (a review nobody signed is not a review)");
    return 2;
  }
  if (!info.bytes) {
    console.error("review: nothing to review — no staged or unstaged diff");
    return 2;
  }
  const rec = {
    ts: core.nowISO(),
    hash: info.hash,
    mode: info.mode,
    by: a.by.trim(),
    model: a.model.trim() || null,
    verdict: a.verdict,
    note: a.note.trim(),
    files: info.files,
    diffBytes: info.bytes,
    env: { node: process.version, platform: process.platform, git: (git(cwd, ["rev-parse", "--short", "HEAD"]).out || "").trim() },
  };
  core.appendJsonl(reviewPath(cwd), rec);
  runslog.note(cwd, "review", { ok: rec.verdict === "approve" }, 0);
  if (a.json) {
    console.log(JSON.stringify(rec));
    return rec.verdict === "approve" ? 0 : 1;
  }
  console.log(`[review] recorded ${rec.verdict} for ${rec.hash} by ${rec.by}${rec.model ? " (" + rec.model + ")" : ""} — ${rec.files.length} file(s), ${rec.diffBytes} bytes`);
  console.log("[review] the hash is the claim: change the diff and this attestation stops applying");
  return rec.verdict === "approve" ? 0 : 1;
}

module.exports = { run, diffInfo, readAll, latestFor, parseArgs, USAGE };
