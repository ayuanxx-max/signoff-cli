"use strict";
// 机器级名册：谁在这台机器上真的用过 signoff。
//
// 为什么需要它：`signoff report` 是「一个仓库一页」，`--scan` 要你手动指一个根目录，
// 所以看板上永远只有你刚好在的那个仓库（实测 ~/.signoff/reports/index.html 里只有一条
// dsh-signoff 的记录，其他仓库跑过闸也不留痕）。名册把「用过」这件事本身记下来：
// 每次 guard 跑完就登记一次，之后 `signoff report --all` 不需要任何参数就能把全部仓库画进一页。
//
// 只写一行 JSON，失败一律吞掉——登记坏了不该挡住一次提交。

const fs = require("fs");
const path = require("path");
const os = require("os");

function homeDir() {
  return process.env.SIGNOFF_HOME || path.join(os.homedir(), ".signoff");
}

function file() {
  return path.join(homeDir(), "machine.json");
}

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(file(), "utf8"));
    if (j && typeof j.repos === "object" && j.repos) return j;
  } catch (e) {
    /* 没有名册、或名册坏了：当成空的，下一次登记会重建 */
  }
  return { version: 1, updatedAt: "", repos: {} };
}

function write(j) {
  try {
    fs.mkdirSync(homeDir(), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(j, null, 2) + "\n", "utf8");
  } catch (e) {
    /* 只读的 HOME、满盘：登记不了就算了 */
  }
}

// 登记一次运行。verdict 用统一的三个词：ready / blocked / unknown。
// 路径先取 realpath：Windows 会把同一个目录同时写成 `C:\Users\Administrator\...` 和
// `C:\Users\ADMINI~1\...`，不归一化就会在名册里长出两条记录。
function canonical(root) {
  const abs = path.resolve(String(root || "."));
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(abs) : fs.realpathSync(abs);
  } catch (e) {
    return abs;
  }
}

function register(root, info) {
  const abs = path.resolve(String(root || "."));
  // 自检与脚本化运行不写用户的名册：它们的仓库是临时目录，登记进去就是污染
  // （实测一次自检往真实名册里塞了 7 条 Temp\signoff-selftest-*）。
  // 临时目录除非显式 SIGNOFF_NO_REGISTRY=0，否则一律不进名册。
  const tmp = path.resolve(os.tmpdir()).toLowerCase();
  const lower = abs.toLowerCase();
  if (process.env.SIGNOFF_NO_REGISTRY !== "0" && (lower === tmp || lower.startsWith(tmp + path.sep) || lower.startsWith(tmp + "/"))) {
    return info || {};
  }
  if (process.env.SIGNOFF_NO_REGISTRY === "1") return info || {};
  const j = read();
  const key = canonical(root);
  const prev = j.repos[key] || {};
  const entry = Object.assign({}, prev, info || {}, {
    root: key,
    name: (info && info.name) || prev.name || path.basename(key),
    lastSeen: (info && info.at) || new Date().toISOString(),
  });
  j.repos[key] = entry;
  j.updatedAt = entry.lastSeen;
  write(j);
  return entry;
}

function list() {
  const j = read();
  return Object.keys(j.repos)
    .map((k) => j.repos[k])
    .filter((e) => e && e.root)
    .sort((a, b) => String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
}

// 名册里已经不在的目录（删了、移走了）不该让看板整页失败，但也别悄悄当它还在。
// 入参可以是名册条目本身，也可以是它的 root 字符串——调用方两种都写过。
function alive(entry) {
  const root = typeof entry === "string" ? entry : entry && entry.root;
  if (!root) return false;
  try {
    return fs.existsSync(path.join(root, ".git"));
  } catch (e) {
    return false;
  }
}

module.exports = { register, list, read, file, alive, homeDir };
