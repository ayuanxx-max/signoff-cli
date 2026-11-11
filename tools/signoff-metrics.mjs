#!/usr/bin/env node
/**
 * signoff-metrics — 无痕工具的价值，只能用"抓住过几次"来量化。
 *
 * 数据来源只有三样，全是本地文件，不联网、不改仓库：
 *   .signoff/runs.log     每次跑闸一行 {ts, gate, ok, ms}
 *   .signoff/skips.log    每次绕过一行（存在才有）
 *   git log               安装点之后的提交数
 *
 * 算六个指标：
 *   graded        安装点之后的提交数（分母：有多少次交付被审视）
 *   runs          跑闸次数
 *   red           判红的次数
 *   flipped       翻案次数：同一闸 红 → 绿 的转折点（说明它拦住了东西）
 *   rework        返工轮次：每次翻案前连续红的平均长度
 *   skip          跳过次数与跳过率（--no-verify / SIGNOFF_SKIP）
 *
 * 用法：
 *   node tools/signoff-metrics.mjs <repo>... [--json] [--markdown]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.gate) out.push(r);
    } catch {
      /* torn line */
    }
  }
  return out;
}

function gitCount(repo, sinceSha) {
  try {
    const args = sinceSha ? ["rev-list", "--count", `${sinceSha}..HEAD`] : ["rev-list", "--count", "HEAD"];
    return Number(execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim());
  } catch {
    return null;
  }
}

function installSha(repo) {
  const p = path.join(repo, ".signoff", "installed.json");
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j.sha || j.commit || j.head || null;
  } catch {
    return null;
  }
}

function analyze(repo) {
  const state = path.join(repo, ".signoff");
  const runs = readJsonl(path.join(state, "runs.log"));
  const gated = runs.filter((r) => r.gate !== "secrets");

  // 每个闸独立看时序：红 → 绿 记一次翻案
  const byGate = {};
  for (const r of gated) (byGate[r.gate] = byGate[r.gate] || []).push(r);

  let red = 0;
  let flipped = 0;
  let reworkSum = 0;
  let reworkN = 0;
  const redByGate = {};

  for (const [gate, seq] of Object.entries(byGate)) {
    let run = 0;
    for (const r of seq) {
      if (!r.ok) {
        red += 1;
        redByGate[gate] = (redByGate[gate] || 0) + 1;
        run += 1;
      } else if (run > 0) {
        flipped += 1;
        reworkSum += run;
        reworkN += 1;
        run = 0;
      }
    }
  }

  const skipsFile = path.join(state, "skips.log");
  const skips = fs.existsSync(skipsFile)
    ? fs.readFileSync(skipsFile, "utf8").split("\n").filter((l) => l.trim()).length
    : 0;

  const sha = installSha(repo);
  const commits = gitCount(repo, sha);

  const gateMs = {};
  for (const r of gated) {
    if (Number.isFinite(r.ms) && r.ms >= 0) (gateMs[r.gate] = gateMs[r.gate] || []).push(r.ms);
  }
  const avgMs = {};
  for (const [g, arr] of Object.entries(gateMs)) avgMs[g] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  return {
    repo,
    since: sha ? sha.slice(0, 12) : null,
    commits,
    runs: gated.length,
    red,
    flipped,
    rework: reworkN ? Number((reworkSum / reworkN).toFixed(2)) : null,
    skip: skips,
    skipRate: commits ? Number(((skips / commits) * 100).toFixed(1)) : null,
    flipRate: red ? Number(((flipped / red) * 100).toFixed(1)) : null,
    redByGate,
    avgMs,
    first: gated[0] ? gated[0].ts : null,
    last: gated.length ? gated[gated.length - 1].ts : null,
  };
}

function percent(v) {
  return v == null ? "无数据" : `${v}%`;
}

function markdown(rows) {
  const head = [
    "| 仓库 | 提交 | 跑闸 | 红 | 翻案 | 翻案率 | 返工轮次 | 跳过 | 跳过率 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map(
    (r) =>
      `| ${path.basename(r.repo)} | ${r.commits ?? "?"} | ${r.runs} | ${r.red} | ${r.flipped} | ${percent(
        r.flipRate
      )} | ${r.rework ?? "无数据"} | ${r.skip} | ${percent(r.skipRate)} |`
  );
  const red = rows
    .flatMap((r) => Object.entries(r.redByGate).map(([g, n]) => ({ repo: path.basename(r.repo), g, n })))
    .map((x) => `| ${x.repo} | ${x.g} | ${x.n} |`);
  const out = [...head, ...body];
  if (red.length) out.push("", "| 仓库 | 闸 | 红次数 |", "| --- | --- | --- |", ...red);
  return out.join("\n");
}

function main(argv) {
  const json = argv.includes("--json");
  const md = argv.includes("--markdown");
  const repos = argv.filter((a) => !a.startsWith("--")).map((p) => path.resolve(p));
  if (!repos.length) {
    console.error("用法: node tools/signoff-metrics.mjs <repo>... [--json] [--markdown]");
    return 2;
  }
  const rows = repos.filter((r) => fs.existsSync(path.join(r, ".signoff"))).map(analyze);
  const missing = repos.filter((r) => !fs.existsSync(path.join(r, ".signoff")));

  if (json) {
    process.stdout.write(`${JSON.stringify({ rows, missing }, null, 2)}\n`);
    return 0;
  }
  if (md) {
    console.log(markdown(rows));
    return 0;
  }

  for (const r of rows) {
    console.log(`\n${path.basename(r.repo)}  (安装点 ${r.since || "无"}, ${r.first || "?"} → ${r.last || "?"})`);
    console.log(`  提交 ${r.commits ?? "?"} 次 / 跑闸 ${r.runs} 次 / 红 ${r.red} 次`);
    console.log(`  翻案 ${r.flipped} 次（占红 ${percent(r.flipRate)}）· 返工轮次 ${r.rework ?? "无数据"}`);
    console.log(`  跳过 ${r.skip} 次（占提交 ${percent(r.skipRate)}）`);
    const red = Object.entries(r.redByGate);
    if (red.length) console.log(`  红分布 ${red.map(([g, n]) => `${g}×${n}`).join("，")}`);
    const ms = Object.entries(r.avgMs);
    if (ms.length) console.log(`  平均耗时 ${ms.map(([g, v]) => `${g} ${v}ms`).join("，")}`);
  }
  for (const m of missing) console.log(`\n${path.basename(m)}：没有 .signoff/，未接入`);
  const totalRed = rows.reduce((a, r) => a + r.red, 0);
  const totalFlip = rows.reduce((a, r) => a + r.flipped, 0);
  console.log(`\n合计：${rows.length} 个仓库，红 ${totalRed} 次，翻案 ${totalFlip} 次`);
  console.log("口径：翻案 = 同一闸 红→绿 的转折点；它只说明拦住过，不说明拦得对。");
  return 0;
}

process.exit(main(process.argv.slice(2)));
