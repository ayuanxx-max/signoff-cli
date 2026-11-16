"use strict";
// signoff risk —— 建议器，不是闸门。
//
// 它只回答一个问题：这次改动值得把审查预算放在哪儿。所以它永远 exit 0，
// 永远不改判定，也永远不读网络。分数由几条可复核的规则相加得出，每条都带理由字符串；
// 分数本身没有意义，有意义的是「为什么这条被标红」。
//
// 输入：git diff（默认工作区 vs HEAD，--base 指定别的基线）+ 可选 .signoff/mutants.json
// 输出：表格或 --json；顺带写 .signoff/risk.json 供别的工具消费。

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HELP = `usage: signoff risk [--base REF] [--json] [--quiet]

建议这次改动该多查哪几个文件（永远 exit 0，不改变任何判定）。

options:
  --base REF   compare against REF instead of HEAD
  --json       machine-readable payload, also written to .signoff/risk.json
  --quiet      only the summary line
`;

// 每条规则都得能被人复核：命中什么、为什么加分。
const RULES = [
  {
    id: "measurement-surface",
    weight: 4,
    why: "测量面：它坏了，所有分数都不可信（比闸门本身更值得先看）",
    hit: (p) => /^(tools|verify)\//.test(p),
  },
  {
    id: "new-file",
    weight: 1,
    why: "新建文件：不看 diff 就会整份漏掉",
    hit: (f) => !!f.untracked,
  },
  {
    id: "gate-module",
    weight: 3,
    why: "闸门实现：这里判错等于把红的说成绿的",
    hit: (p) => /^lib\/(p[1-5]|cov|sec|guard|release|bootstrap)\.js$/.test(p),
  },
  {
    id: "entry-point",
    weight: 2,
    why: "CLI 入口：参数语义改了会影响每一道关",
    hit: (p) => /^bin\/signoff\.js$/.test(p),
  },
  {
    id: "ci-surface",
    weight: 2,
    why: "CI/action 表面：改了它，别人仓库的判定行为跟着变",
    hit: (p) => /^(\.github\/workflows\/.*\.ya?ml|action\.yml)$/.test(p),
  },
  {
    id: "test-move",
    weight: 1,
    why: "测试本身变了：断言可能在跟着实现走",
    hit: (p) => /^test\//.test(p),
  },
  {
    id: "docs-only",
    weight: -1,
    why: "只改文档：没有判定风险，最多一句措辞要核对",
    hit: (p) => /\.(md|mdx)$/.test(p),
  },
];

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? String(r.stdout) : "";
}

function changedFiles(root, base) {
  const ref = base || "HEAD";
  const out = git(["diff", "--numstat", ref], root) || git(["diff", "--numstat", "--cached", ref], root);
  const files = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const added = parts[0] === "-" ? 0 : Number(parts[0]);
    const removed = parts[1] === "-" ? 0 : Number(parts[1]);
    files.push({ path: parts.slice(2).join("\t"), added, removed });
  }
  const seen = new Set(files.map((f) => f.path));
  for (const p of git(["ls-files", "--others", "--exclude-standard"], root).split(/\r?\n/)) {
    if (!p.trim() || seen.has(p)) continue;
    files.push({ path: p, added: 0, removed: 0, untracked: true });
  }
  return files;
}

function mutationByFile(root) {
  const out = {};
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, ".signoff", "mutants.json"), "utf8"));
    for (const [file, m] of Object.entries(j.files || {})) out[file] = m;
    if (!j.files) {
      // 旧格式只有 survivors 数组：只数得出存活点，数不出分数，就不编分数
      for (const s of j.survivors || []) {
        out[s.file] = out[s.file] || { survivors: 0 };
        out[s.file].survivors += 1;
      }
    }
  } catch (e) {
    /* 没有变异报告就没有这一条，不猜 */
  }
  return out;
}

function scoreFile(f, mutations) {
  const reasons = [];
  let score = 0;
  for (const rule of RULES) {
    if (!rule.hit(f.path)) continue;
    score += rule.weight;
    reasons.push({ id: rule.id, weight: rule.weight, why: rule.why });
  }
  const size = f.added + f.removed;
  if (size > 200) {
    score += 3;
    reasons.push({ id: "size-xl", weight: 3, why: `改了 ${size} 行：一次看完很难` });
  } else if (size > 60) {
    score += 2;
    reasons.push({ id: "size-l", weight: 2, why: `改了 ${size} 行` });
  }
  if (f.removed > 10) {
    score += 1;
    reasons.push({ id: "deletions", weight: 1, why: `删了 ${f.removed} 行：要确认没有断言跟着消失` });
  }
  const m = mutations[f.path] || null;
  const surv = m ? Number(m.survivors || 0) : 0;
  if (surv > 0) {
    score += 2;
    reasons.push({ id: "mutation-survivors", weight: 2, why: `变异测试在这个文件里还有 ${surv} 个存活点` });
  }
  const suggest = [];
  if (score >= 5) suggest.push("L2 mutation", "L3 review");
  else if (score >= 3) suggest.push("L2 mutation");
  else if (score >= 1) suggest.push("L0 static");
  const mutation = m && typeof m.score === "number" ? { score: m.score, total: m.total, killed: m.killed, survivors: surv } : null;
  return { ...f, score, reasons, suggest, mutation };
}

function main(argv, opts) {
  const a = { base: null, json: false, quiet: false, help: false };
  for (let i = 0; i < (argv || []).length; i++) {
    const t = String(argv[i]);
    if (t === "--base") a.base = String(argv[++i] || "");
    else if (t.startsWith("--base=")) a.base = t.slice(7);
    else if (t === "--json") a.json = true;
    else if (t === "--quiet") a.quiet = true;
    else if (t === "-h" || t === "--help") a.help = true;
    else {
      process.stderr.write("risk: unrecognized argument: " + t + "\n" + HELP);
      return 2;
    }
  }
  if (a.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const root = (opts && opts.cwd) || process.cwd();
  const files = changedFiles(root, a.base).map((f) => scoreFile(f, mutationByFile(root)));
  files.sort((x, y) => y.score - x.score || x.path.localeCompare(y.path));
  const payload = {
    gate: "risk",
    advisory: true,
    note: "建议器：分数只用来排序审查预算，永不改变任何判定",
    files,
    top: files.length && files[0].score > 0 ? files[0].path : null,
  };
  try {
    fs.mkdirSync(path.join(root, ".signoff"), { recursive: true });
    fs.writeFileSync(path.join(root, ".signoff", "risk.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
  } catch (e) {
    /* 写不进磁盘不影响建议 */
  }
  if (a.json) {
    process.stdout.write(JSON.stringify(payload) + "\n");
    return 0;
  }
  if (!files.length) {
    process.stdout.write("[risk] SKIPPED no changed files against " + (a.base || "HEAD") + " — nothing to rank\n");
    return 0;
  }
  if (!a.quiet) {
    for (const f of files) {
      const why = f.reasons.map((r) => `${r.id}(${r.weight > 0 ? "+" : ""}${r.weight})`).join(" ");
      process.stdout.write(`[risk] ${String(f.score).padStart(2)}  ${f.path}  ${why || "no rule hit"}\n`);
      if (f.suggest.length) process.stdout.write(`          → ${f.suggest.join(" + ")}\n`);
      if (f.mutation) process.stdout.write(`          · mutation ${f.mutation.killed}/${f.mutation.total} killed (${f.mutation.score}%)\n`);
    }
  }
  process.stdout.write(`[risk] ${files.length} file(s), top=${payload.top || "none"} — advisory only, this never changes a verdict\n`);
  return 0;
}

module.exports = { main, scoreFile, changedFiles };
