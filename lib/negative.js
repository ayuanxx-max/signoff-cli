"use strict";

// 反作弊的第二层：证明改过的测试真的能红。
//
// lib/integrity.js 是静态的——它看 diff，判断断言有没有被删、被 `skip`、阈值有没有改小。
// 它抓不到最省事的那种作弊：写一条永远为真的断言。这一层的判据是执行出来的：
// 把这次的测试文件放进「改动之前」的代码里跑一遍，**必须失败**；还是绿的，就说明它测不到东西。
//
// 成本控制：只在 touched（这次动过的测试文件）非空时才跑，且只跑一次（base 一次性检出），
// 单独计时、单独预算；超时算红，不静默跳过。
//
// 两种入口：
//   * 提交前/暂存中：integrity 给出 touched，base 是 HEAD，测试文件取工作区（还没提交的那份）；
//   * 推送时：工作区已经干净、touched 为空，于是改看「要推出去的那段提交」——
//     base 取 `@{u}` 的 merge-base，测试文件取 `HEAD` 里已提交的那份。

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const integrity = require("./integrity");

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

// "M test/selftest.js" -> "test/selftest.js"；只留下现在还存在的文件（删掉的测试没有可跑的东西）。
// 路径按仓库根解析：integrity 给的是相对路径，而进程的 cwd 可能是别的仓库。
function testFiles(touched, cwd) {
  const root = cwd || process.cwd();
  return (touched || [])
    .map((t) => String(t).replace(/^[A-Z?]+\s+/, "").trim())
    .filter((f) => f && fs.existsSync(path.resolve(root, f)));
}

// 要推出去的那段提交里，测试文件动过哪些：base = 上游的 merge-base。
function rangeTouched(cwd) {
  const up = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  if (up.status !== 0) return null;
  const mb = git(["merge-base", up.stdout.trim(), "HEAD"], cwd);
  if (mb.status !== 0) return null;
  const base = mb.stdout.trim();
  const d = git(["diff", "--name-status", "--no-renames", base, "HEAD", "--"], cwd);
  if (d.status !== 0) return null;
  const touched = [];
  for (const line of d.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0];
    const file = parts[1];
    if (!file || status === "D") continue;
    if (!integrity.TEST_FILE_RE.test(file)) continue;
    touched.push(`${status} ${file}`);
  }
  return { base, touched, upstream: up.stdout.trim() };
}

function run(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  let files = testFiles(o.touched, cwd);
  let rev = o.base || "HEAD";
  let fromHead = false;
  if (!files.length) {
    // 工作区干净（推送前的常态）：改判「这段提交里动过的测试」，base 挪到上游的 merge-base。
    const range = rangeTouched(cwd);
    if (!range) {
      return {
        ok: true,
        skipped: true,
        reason: "工作区没有改动的测试文件，也没有上游分支可对照（没有 @{u}）",
        findings: [],
      };
    }
    files = range.touched
      .map((t) => t.replace(/^[A-Z?]+\s+/, "").trim())
      .filter((f) => git(["cat-file", "-e", "HEAD:" + f], cwd).status === 0);
    rev = range.base;
    fromHead = true;
    if (!files.length) {
      return { ok: true, skipped: true, reason: `要推出去的提交（${range.upstream}..HEAD）没有碰测试文件`, findings: [] };
    }
  }
  if (!o.cmd) {
    return { ok: true, skipped: true, reason: "没有可重跑的命令", findings: [] };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-nc-"));
  const add = git(["worktree", "add", "--detach", dir, rev], cwd);
  if (add.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    const msg = (add.stderr || "").trim().split(/\r?\n/)[0];
    return {
      ok: false,
      skipped: false,
      files,
      findings: [{ kind: "worktree", file: rev, detail: msg || "git worktree add 失败" }],
    };
  }

  try {
    // 只换测试文件：实现留在 base，这正是「新测试对旧代码」。
    for (const f of files) {
      const dst = path.join(dir, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (fromHead) {
        // 推送时工作区是干净的，要的是已提交的那份（HEAD），不是工作区里的临时改动。
        const blob = git(["show", "HEAD:" + f], cwd);
        if (blob.status !== 0) continue;
        fs.writeFileSync(dst, blob.stdout, "utf8");
      } else {
        fs.copyFileSync(path.join(cwd, f), dst);
      }
    }
    const budgetMs = Math.max(30000, Number(o.budgetMs) || 180000);
    const t0 = Date.now();
    const r = spawnSync(o.cmd, {
      shell: true,
      cwd: dir,
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      timeout: budgetMs,
      env: { ...process.env, SIGNOFF_NC: "1", SIGNOFF_NO_MACHINE: "1", SIGNOFF_NO_FAST: "1" },
    });
    const ms = Date.now() - t0;
    const out = (r.stdout ? r.stdout.toString("utf8") : "") + (r.stderr ? r.stderr.toString("utf8") : "");
    const tail = out
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-3);

    if (r.error && r.error.code === "ETIMEDOUT") {
      return {
        ok: false,
        skipped: false,
        ms,
        files,
        findings: [
          {
            kind: "timeout",
            file: files.join(", "),
            detail: `negative control 超过 ${Math.round(budgetMs / 1000)} s：命令本身要拆小，或给 --nc-budget 一个诚实的值`,
          },
        ],
        tail,
      };
    }

    const rc = r.status === null ? 1 : r.status;
    if (rc === 0) {
      return {
        ok: false,
        skipped: false,
        ms,
        files,
        findings: [
          {
            kind: "green-on-base",
            file: files.join(", "),
            detail: `在 ${rev} 上也是绿的：这条测试没有证明这次改动`,
          },
        ],
        tail,
      };
    }
    // 跑不起来 != 测出来了：缺模块/语法错说明这个测试根本到不了断言。
    if (/Cannot find module|MODULE_NOT_FOUND|SyntaxError|UnhandledPromiseRejection/i.test(out)) {
      return {
        ok: false,
        skipped: false,
        ms,
        files,
        findings: [
          {
            kind: "cannot-run-on-base",
            file: files.join(", "),
            detail: "在 base 上就跑不起来（缺模块/语法错），negative control 不成立",
          },
        ],
        tail,
      };
    }
    return { ok: true, skipped: false, ms, files, findings: [], tail };
  } finally {
    git(["worktree", "remove", "--force", dir], cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { run, testFiles };
