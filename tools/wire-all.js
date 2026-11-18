#!/usr/bin/env node
"use strict";
// 把 signoff 接到本机所有 git 仓库。
//
// 为什么需要它：本机已经有机器级 dispatcher（core.hooksPath → ~/.signoff/hooks），
// 但那是「轻守卫」——只跑 secrets + 测试，不写 Signoff-Pass 尾注，所以看板上这些仓库
// 的提交全标「未走闸」。真正的接法是在每个仓库里 `signoff init`：写 .signoff/config.json，
// 让 guard 认识这个仓库，commit-msg 才会写尾注。
//
// 用法：
//   node tools/wire-all.js                 接线本机默认根目录下所有仓库
//   node tools/wire-all.js --dry-run       只看会做什么
//   node tools/wire-all.js --roots "E:\a;C:\b" --depth 3
//   node tools/wire-all.js --ci            连 .github/workflows/signoff.yml 一起写
//
// 安全边界：只对「没有 .signoff/config.json」的仓库动手；已经接过的一行不碰。

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const DRY = flag("--dry-run");
const WITH_CI = flag("--ci");
// 默认把探测到的测试命令写进 config.json：不写的话 p1 永远 skip，接了等于没接闸。
const LOCK_TEST = !flag("--no-lock-test");
// --relock：已经接过、但 test_cmd 还是 null 的仓库，再跑一次 init --lock-test 补上。
const RELOCK = flag("--relock");
const DEPTH = Number(opt("--depth", "3")) || 3;
const DEFAULTS = [path.join("E:", "DSH.Jack.01"), path.join("E:", "DSH.Jack.02"), path.join("E:", "Obsidian"), os.homedir()];
const ROOTS = (opt("--roots", "") || DEFAULTS.join(";"))
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

// 第三方克隆不算「本地项目」：给 Arduino 库或 .tmp 里的临时克隆写 .signoff，只会污染别人的仓库。
const SKIP = /node_modules|\\AppData\\|Program Files|\\vendor\\|\\\.git\\|\\\.signoff\\|\\dist\\|\\archive\\|\\libraries\\|\\\.tmp\\/i;

function findRepos(root, depth) {
  const out = [];
  const walk = (dir, left) => {
    if (left < 0) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    if (entries.some((e) => e.isDirectory() && e.name === ".git")) out.push(dir);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (SKIP.test(full)) continue;
      walk(full, left - 1);
    }
  };
  if (fs.existsSync(root)) walk(root, depth);
  return out;
}

const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const wired = (repo) => fs.existsSync(path.join(repo, ".signoff", "config.json"));

// 只看「.git 在不在」会误判：有些目录里躺着半个 .git（只有 objects），
// git 会一路向上找到父仓库，于是 init 会跑到父仓库里去。所以必须问 git 自己。
function isOwnRepo(repo) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) return false;
  return norm(String(r.stdout || "").trim()) === norm(repo);
}

function hasGithubRemote(repo) {
  const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd: repo, encoding: "utf8" });
  return r.status === 0 && /github\.com/i.test(r.stdout || "");
}

const CLI = path.join(__dirname, "..", "bin", "signoff.js");
const repos = [...new Set(ROOTS.flatMap((r) => findRepos(r, DEPTH)))].filter((p) => !norm(p).startsWith(norm(os.homedir()) + "/appdata")).sort();

const rows = [];
for (const repo of repos) {
  if (!isOwnRepo(repo)) {
    rows.push({ repo, action: "not-a-repo", note: "半截 .git，git 会把它算进父仓库" });
    continue;
  }
  if (wired(repo) && !RELOCK) {
    rows.push({ repo, action: "already", note: "" });
    continue;
  }
  if (wired(repo) && RELOCK) {
    const cfgPath = path.join(repo, ".signoff", "config.json");
    let cfg = {};
    try {
      cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    } catch (e) {
      cfg = {};
    }
    if (cfg.test_cmd) {
      rows.push({ repo, action: "already", note: "test_cmd=" + cfg.test_cmd });
      continue;
    }
    if (DRY) {
      rows.push({ repo, action: "would-relock", note: "" });
      continue;
    }
    const r = spawnSync(process.execPath, [CLI, "init", "--no-ci", "--lock-test"], { cwd: repo, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const after = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    rows.push({
      repo,
      action: after.test_cmd ? "relocked" : "no-runner",
      note: after.test_cmd || (r.status === 0 ? "什么都没探测到，p1 仍会 skip" : "init 失败"),
    });
    continue;
  }
  const ci = WITH_CI && hasGithubRemote(repo);
  if (DRY) {
    rows.push({ repo, action: "would-init", note: ci ? "with ci" : "no ci" });
    continue;
  }
  const argv = [CLI, "init"].concat(ci ? [] : ["--no-ci"]).concat(LOCK_TEST ? ["--lock-test"] : []);
  const r = spawnSync(process.execPath, argv, { cwd: repo, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const ok = r.status === 0 && wired(repo);
  const test = (r.stdout || "").match(/^\s+test\s{2,}(.+)$/m);
  rows.push({
    repo,
    action: ok ? "wired" : "FAILED",
    note: ok ? String(test ? test[1] : "").trim() : (r.stderr || r.stdout || "").split("\n").slice(0, 2).join(" ").slice(0, 120),
  });
}

const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - String(s).length));
for (const r of rows) console.log(`${pad(r.action, 11)} ${r.repo}${r.note ? "  ·  " + r.note : ""}`);
const count = (a) => rows.filter((r) => r.action === a).length;
console.log(
  `\n${rows.length} repos: wired=${count("wired")} already=${count("already")} not-a-repo=${count("not-a-repo")} failed=${count("FAILED")} would=${count("would-init")}${DRY ? "  (dry run)" : ""}`
);
process.exit(count("FAILED") ? 1 : 0);
