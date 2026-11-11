"use strict";
// 分歧仲裁：复现即证据。
//
// 两个人（或一个人和模型）吵"它到底过不过"，靠说没有用。能定案的只有一件事：
// 同一个复现步骤，在同一棵树上，重复跑，看结论稳不稳。
//
//   跑 N 次全过        -> 主张成立（exit 0）
//   跑 N 次全不过      -> 主张被推翻（exit 1）
//   过也有、不过也有    -> 不定（exit 3）：不是谁对谁错，是这个问题还没有可复现的说法
//
// 第三种是最常被跳过、也最该被记录的一格：它把"时好时坏"从一个形容词变成一个数字
// （p/N），并且写进证据文件，别人可以拿 --replay 在同一结论上复核。

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const runslog = require("./runslog");

const USAGE =
  "usage: signoff dispute --claim TEXT --run CMD [--expect pass|fail] [--repeat N] [--budget SEC] [--json]\n" +
  "       signoff dispute --replay FILE [--json]";

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function parseArgs(argv) {
  const o = { claim: "", runs: [], expect: "pass", repeat: 3, budget: 600, json: false, replay: "", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--claim") o.claim = argv[++i] || "";
    else if (a.startsWith("--claim=")) o.claim = a.slice(8);
    else if (a === "--run") o.runs.push(argv[++i] || "");
    else if (a.startsWith("--run=")) o.runs.push(a.slice(6));
    else if (a === "--expect") o.expect = argv[++i] || "pass";
    else if (a.startsWith("--expect=")) o.expect = a.slice(9);
    else if (a === "--repeat") o.repeat = Number(argv[++i]);
    else if (a.startsWith("--repeat=")) o.repeat = Number(a.slice(9));
    else if (a === "--budget") o.budget = Number(argv[++i]);
    else if (a.startsWith("--budget=")) o.budget = Number(a.slice(9));
    else if (a === "--replay") o.replay = argv[++i] || "";
    else if (a.startsWith("--replay=")) o.replay = a.slice(9);
  }
  o.runs = o.runs.filter(Boolean);
  o.repeat = Math.max(1, Math.min(20, Math.trunc(o.repeat || 3)));
  if (o.expect !== "pass" && o.expect !== "fail") o.expect = "pass";
  return o;
}

// 纯函数：给定通过/失败次数和"主张它是什么"，返回结论。测试直接调它。
function classify(passes, fails, expect) {
  const want = expect === "fail" ? "fail" : "pass";
  if (passes > 0 && fails > 0) return "unstable";
  if (passes + fails === 0) return "no-evidence";
  const observed = fails > 0 ? "fail" : "pass";
  return observed === want ? "supported" : "refuted";
}

function fingerprint(cwd) {
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8" });
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    git: git.status === 0 ? git.stdout.trim() : "(not a repo)",
    cwd,
  };
}

function attempt(cwd, cmds) {
  const started = Date.now();
  const results = [];
  let pass = true;
  for (const cmd of cmds) {
    const t0 = Date.now();
    const r = spawnSync(cmd, { shell: true, cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const rc = r.status === null ? -1 : r.status;
    const out = String(r.stdout || "");
    results.push({
      cmd,
      rc,
      ms: Date.now() - t0,
      outSha: sha(out).slice(0, 12),
      tail: out.trim().slice(-200),
    });
    if (rc !== 0) {
      pass = false;
      break;
    }
  }
  return { pass, ms: Date.now() - started, results };
}

function dir(cwd) {
  return path.join(cwd, ".signoff", "disputes");
}

function writeRecord(record) {
  const d = dir(process.cwd());
  fs.mkdirSync(d, { recursive: true });
  const id = `${record.at.replace(/[:.]/g, "-")}-${record.id}`;
  const file = path.join(d, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n", "utf8");
  return file;
}

function replay(argv) {
  const a = parseArgs(argv);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(a.replay, "utf8"));
  } catch (e) {
    console.error(`dispute: cannot read record: ${e.message}`);
    return 2;
  }
  const cmds = record.runs && record.runs.length ? record.runs : (record.cmds || []);
  if (!cmds.length) {
    console.error("dispute: the record contains no command to replay");
    return 2;
  }
  // 记录是为了以后复核，所以优先回到记录里的目录；目录没了才用当前目录。
  const runCwd = record.env && record.env.cwd && fs.existsSync(record.env.cwd) ? record.env.cwd : process.cwd();
  const now = [];
  let passes = 0;
  let fails = 0;
  for (let i = 0; i < (record.repeat || 3); i += 1) {
    const r = attempt(runCwd, cmds);
    now.push(r.pass);
    if (r.pass) passes += 1;
    else fails += 1;
  }
  const verdict = classify(passes, fails, record.expect || "pass");
  const same = verdict === record.verdict;
  if (a.json) {
    console.log(JSON.stringify({ replay: a.replay, was: record.verdict, now: verdict, same }));
  } else {
    console.log(`[dispute] replay ${a.replay}`);
    console.log(`[dispute] was ${record.verdict} (${record.passes}/${record.repeat}) -> now ${verdict} (${passes}/${record.repeat})`);
    console.log(same ? "[dispute] same verdict — the record still reproduces" : "[dispute] verdict changed — the evidence no longer reproduces");
  }
  return same ? 0 : 1;
}

function run(argv) {
  const a = parseArgs(argv || []);
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  if (a.replay) return replay(argv);
  if (!a.runs.length) {
    console.error("dispute: --run CMD is required (a dispute is settled by a reproducer, not by an opinion)");
    return 2;
  }
  if (!a.claim.trim()) {
    console.error("dispute: --claim TEXT is required (say what is being claimed, so the verdict names something)");
    return 2;
  }
  const cwd = process.cwd();
  const started = Date.now();
  const attempts = [];
  let passes = 0;
  let fails = 0;
  let incomplete = false;
  for (let i = 0; i < a.repeat; i += 1) {
    if (Date.now() - started > a.budget * 1000) {
      incomplete = true;
      break;
    }
    const r = attempt(cwd, a.runs);
    attempts.push({ n: i + 1, pass: r.pass, ms: r.ms, results: r.results });
    if (r.pass) passes += 1;
    else fails += 1;
  }
  if (incomplete) {
    console.error(`dispute: budget ${a.budget}s exceeded after ${attempts.length}/${a.repeat} attempt(s) — no verdict`);
    return 2;
  }

  const verdict = classify(passes, fails, a.expect);
  const record = {
    at: new Date().toISOString(),
    id: sha(a.claim + "\n" + a.runs.join("\n")).slice(0, 8),
    claim: a.claim,
    expect: a.expect,
    cmds: a.runs,
    runs: a.runs,
    repeat: a.repeat,
    passes,
    fails,
    verdict,
    env: fingerprint(cwd),
    attempts,
  };
  const file = writeRecord(record);
  runslog.note(cwd, "dispute", { ok: verdict === "supported", verdict, passes, repeat: a.repeat }, Date.now() - started);

  if (a.json) {
    console.log(JSON.stringify({ claim: a.claim, expect: a.expect, verdict, passes, repeat: a.repeat, file }));
  } else {
    console.log(`[dispute] claim: ${a.claim}`);
    console.log(`[dispute] expect=${a.expect} ran ${a.repeat}x -> ${passes} pass, ${fails} fail`);
    for (const t of attempts) {
      const first = t.results.find((x) => x.rc !== 0) || t.results[0];
      console.log(`[dispute]   #${t.n} ${t.pass ? "pass" : "fail"} rc=${first.rc} ${first.ms}ms ${first.cmd}`);
    }
    if (verdict === "supported") console.log(`[dispute] SUPPORTED — the claim reproduces ${a.repeat}/${a.repeat}`);
    else if (verdict === "refuted") console.log(`[dispute] REFUTED — the opposite reproduces ${a.repeat}/${a.repeat}`);
    else if (verdict === "unstable") console.log(`[dispute] UNSTABLE — ${passes} pass / ${fails} fail: not a matter of opinion, there is no reproducible claim yet`);
    else console.log("[dispute] NO EVIDENCE — nothing ran");
    console.log(`[dispute] evidence ${path.relative(cwd, file) || file}`);
  }
  if (verdict === "supported") return 0;
  if (verdict === "refuted") return 1;
  return 3;
}

module.exports = { run, classify, parseArgs, USAGE };
