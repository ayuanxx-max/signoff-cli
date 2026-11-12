"use strict";
// 反作弊闸门 —— 让"把测试改绿"不能成为过闸的方式。
//
// 为什么单独写一个模块：p1 判定"测试有没有过"，但它判定不了"测试还是不是原来那个
// 测试"。自动修复第一个会坏的正是后者：删断言、加 skip、把阈值从 80 改到 60，
// 三种做法都能让 p1 变绿，而且 green 得很体面。
//
// 判据只有三条，都可以机械核对，不需要模型判断：
//   1) 新增"不跑"标记：skip / only / todo / xit / xdescribe / @pytest.mark.skip
//   2) 断言被删：同一文件里删掉的断言行数 > 新增的断言行数
//   3) 阈值被改小：同一断言（忽略数字）的数字比之前小
//
// 允许显式放宽，但必须写进 .signoff/integrity-allow.json 并给出理由（≥20 字）。
// 声明的放宽会留在 diff 里，评审看得见——闸门的目的不是禁止，是禁止"悄悄地"。

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const core = require("./core");

// 测试文件：路径特征，不猜语言。
const TEST_FILE_RE =
  /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(py|rs)$|(^|\/)test_[^/]+\.py$/i;

// 一行算不算"断言"。宁可漏，不要误报：只认常见的断言入口。
const ASSERT_RE =
  /(^|[^.\w])(assert(?:\.\w+)?|expect|check|t\.(?:is|true|deepEqual|is|falsy|throws)|assertEqual|assert_eq|assertTrue|self\.assert\w*)\s*[.(]/;

// "不跑"的标记。only 也算：它让同文件其他用例静默不执行。
const SKIP_RES = [
  { kind: "skipped", re: /\b(?:it|test|describe|specify|suite)\.(?:skip|todo)\b/ },
  { kind: "skipped", re: /\b(?:xit|xdescribe|xspecify)\s*\(/ },
  { kind: "skipped", re: /@pytest\.mark\.(?:skip|xfail)\b/ },
  { kind: "skipped", re: /\b(?:skip|skipped|todo)\s*[:=]\s*(?:true|["'][^"']+["'])/ },
  { kind: "focused", re: /\b(?:it|test|describe|specify|suite)\.only\b/ },
  { kind: "focused", re: /\b(?:fit|fdescribe|fspecify)\s*\(/ },
];

const norm = (line) => line.trim().replace(/\s+/g, " ");
// 去掉字符串字面量：`test.only(` 出现在断言消息里不是代码，不能算作弊。
const stripLiterals = (line) =>
  String(line)
    .replace(/`[^`]*`/g, "`S`")
    .replace(/"[^"]*"/g, '"S"')
    .replace(/'[^']*'/g, "'S'");
const isComment = (line) => /^(\/\/|#|\*|\/\*)/.test(line.trim());
const digitsKey = (line) => norm(line).replace(/\d+(?:\.\d+)?/g, "#");
const numbersOf = (line) => (norm(line).match(/\d+(?:\.\d+)?/g) || []).map(Number);

function assertionLines(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim() || isComment(line)) continue;
    if (ASSERT_RE.test(line)) out.push(norm(line));
  }
  return out;
}

function countOccurrences(text, re) {
  const lines = String(text || "").split(/\r?\n/);
  let n = 0;
  const hits = [];
  for (const line of lines) {
    if (isComment(line)) continue;
    if (re.test(stripLiterals(line))) {
      n += 1;
      hits.push(norm(line));
    }
  }
  return { n, hits };
}

// 纯函数：只吃两段文本，给出一组发现。测试可以直接调它，不需要 git。
function analyze(beforeText, afterText) {
  const before = String(beforeText || "");
  const after = String(afterText || "");
  const findings = [];

  // 规则 1：新增"不跑"标记。
  for (const { kind, re } of SKIP_RES) {
    const b = countOccurrences(before, re);
    const a = countOccurrences(after, re);
    if (a.n > b.n) {
      for (const line of a.hits.slice(b.n)) {
        findings.push({ kind, line, detail: kind === "focused" ? "focuses the suite, others stop running" : "marks a test as not running" });
      }
    }
  }

  // 规则 2：断言被删，且同文件没有等量新增。
  const bLines = assertionLines(before);
  const aLines = assertionLines(after);
  const bCount = new Map();
  for (const l of bLines) bCount.set(l, (bCount.get(l) || 0) + 1);
  const aCount = new Map();
  for (const l of aLines) aCount.set(l, (aCount.get(l) || 0) + 1);
  const removed = [];
  for (const [line, n] of bCount) {
    const left = n - (aCount.get(line) || 0);
    for (let i = 0; i < left; i += 1) removed.push(line);
  }
  const added = Math.max(0, aLines.length - bLines.length + removed.length);
  if (removed.length > added) {
    const excess = removed.length - added;
    for (const line of removed.slice(0, 5)) {
      findings.push({
        kind: "removed-assertion",
        line,
        detail: `${excess} assertion(s) gone with no replacement`,
      });
    }
  }

  // 规则 3：同一断言（忽略数字）的阈值被改小。
  const bByKey = new Map();
  const isThreshold = (line) => /[<>]=?|!==?|===?/.test(stripLiterals(line));
  for (const line of bLines) {
    if (!isThreshold(line)) continue;
    const k = digitsKey(line);
    const nums = (stripLiterals(line).match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) continue;
    const prev = bByKey.get(k);
    if (!prev || Math.max(...nums) > prev.max) bByKey.set(k, { max: Math.max(...nums), line });
  }
  for (const line of aLines) {
    if (!isThreshold(line)) continue;
    const k = digitsKey(line);
    const nums = (stripLiterals(line).match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) continue;
    const prev = bByKey.get(k);
    if (!prev) continue;
    const now = Math.max(...nums);
    if (now < prev.max) {
      findings.push({
        kind: "threshold-lowered",
        line: norm(line),
        detail: `${prev.max} -> ${now}`,
      });
    }
  }

  return { findings, stats: { beforeAssertions: bLines.length, afterAssertions: aLines.length } };
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function resolveBase(cwd, explicit) {
  if (explicit) return explicit;
  if (process.env.SIGNOFF_BASE) return process.env.SIGNOFF_BASE;
  const mb = git(cwd, ["merge-base", "HEAD", "origin/master"]);
  if (mb.ok && mb.out) return mb.out;
  const parent = git(cwd, ["rev-parse", "--verify", "HEAD~1"]);
  if (parent.ok && parent.out) return parent.out;
  return null;
}

function loadAllow(cwd) {
  const file = path.join(cwd, ".signoff", "integrity-allow.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(raw) ? raw : [];
    return list.filter((e) => e && typeof e.file === "string" && typeof e.kind === "string");
  } catch (e) {
    return [];
  }
}

function allowedBy(finding, file, allow) {
  return allow.find(
    (e) =>
      (e.file === "*" || e.file === file) &&
      e.kind === finding.kind &&
      typeof e.reason === "string" &&
      e.reason.trim().length >= 20 &&
      String(e.needle || "").trim().length > 0 &&
      finding.line.includes(e.needle)
  );
}

// 带 git 的那一半：工作区相对 base 的测试改动。
function check(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const base = resolveBase(cwd, o.base);
  if (!base) {
    return { ok: true, skipped: true, reason: "no base commit to compare against", findings: [] };
  }
  // 路径必须从 -z 读：默认 quotepath 会把中文路径转义成 "\346\265\213..."，
  // 正则匹配不上就等于"测试文件没被碰过"——删断言也就不会红。
  const diff = core.gitNameStatus(["diff", "--name-status", "-z", "--no-renames", base, "--"], cwd);
  if (!diff.ok) {
    return { ok: true, skipped: true, reason: "git diff failed: " + diff.err, findings: [] };
  }
  const rows = diff.rows.filter((r) => TEST_FILE_RE.test(r.path));

  const allow = loadAllow(cwd);
  const findings = [];
  const allowed = [];
  const touched = [];
  let addedAssertions = 0;
  let deletedAssertions = 0;

  for (const { status, path: file } of rows) {
    const beforeRaw = status === "A" ? "" : git(cwd, ["show", base + ":" + file]);
    const before = beforeRaw.ok ? beforeRaw.out : "";
    const abs = path.join(cwd, file);
    const after = status === "D" || !fs.existsSync(abs) ? "" : fs.readFileSync(abs, "utf8");
    touched.push(status + " " + file);
    const res = analyze(before, after);
    if (status === "D") deletedAssertions += res.stats.beforeAssertions;
    if (status === "A") addedAssertions += res.stats.afterAssertions;
    for (const f of res.findings) {
      const hit = allowedBy(f, file, allow);
      const entry = { ...f, file };
      if (hit) allowed.push({ ...entry, reason: hit.reason.trim() });
      else findings.push(entry);
    }
  }

  // 整文件删除：若新增的测试文件带回了等量断言，按"搬家"放行。
  if (deletedAssertions > 0 && addedAssertions >= deletedAssertions) {
    for (let i = findings.length - 1; i >= 0; i -= 1) {
      if (findings[i].kind === "removed-assertion") findings.splice(i, 1);
    }
  }

  return { ok: findings.length === 0, skipped: false, base: base.slice(0, 7), touched, findings, allowed };
}

module.exports = { analyze, check, resolveBase, stripLiterals, TEST_FILE_RE, ASSERT_RE };
