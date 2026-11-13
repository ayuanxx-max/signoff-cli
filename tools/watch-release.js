#!/usr/bin/env node
"use strict";
/**
 * watch-release.mjs —— 发版后「四条腿都到位了吗」只问一条命令。
 *
 * 背景：一次 4.8.0 的发布里，真正的墙钟时间几乎全花在「手动轮询」上——
 * 每次起一个 shell、sleep、再问一遍，npm 的 processing、MCP 注册表的异步、
 * GitHub Release 的 draft 状态，三处都得看事实。这个脚本把它们收成一次等待。
 *
 *   node tools/watch-release.mjs            # 一直等到全部到位（默认 10 分钟上限）
 *   node tools/watch-release.mjs --once     # 只问一次，立刻给结论（供 --post 复核）
 *   node tools/watch-release.mjs --timeout 900
 *
 * 退出码：0 全部到位 / 1 超时仍缺 / 2 用法错误。
 * 只看事实：npm registry 里有没有这一版、MCP 注册表把谁标成 isLatest、
 * 本地 tag 是否在 HEAD、GitHub Release 是否已正式发布（不是 draft）。
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const VERSION = pkg.version;
const TAG = "v" + VERSION;
const REPO = "ayuanxx-max/signoff-cli";

const args = process.argv.slice(2);
const once = args.includes("--once");
const ti = args.indexOf("--timeout");
const TIMEOUT = ti >= 0 ? Number(args[ti + 1]) : 600;
if (!Number.isFinite(TIMEOUT) || TIMEOUT <= 0) {
  console.error("usage: node tools/watch-release.mjs [--once] [--timeout seconds]");
  process.exit(2);
}

function get(url, headers) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: headers || { "User-Agent": "signoff-watch-release" } }, (res) => {
      let out = "";
      res.on("data", (c) => (out += c));
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", (e) => resolve({ status: 0, body: String(e.message) }));
    req.setTimeout(20000, () => {
      req.destroy();
      resolve({ status: 0, body: "timeout" });
    });
  });
}

function json(res) {
  try {
    return JSON.parse(res.body);
  } catch (e) {
    return null;
  }
}

function ghToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const raw = execFileSync("git", ["credential", "fill"], {
      cwd: root,
      input: "protocol=https\nhost=github.com\n\n",
      encoding: "utf8",
    });
    const m = raw.match(/^password=(.*)$/m);
    return m ? m[1] : "";
  } catch (e) {
    return "";
  }
}

const token = ghToken();

async function checkNpm() {
  const pack = json(await get("https://registry.npmjs.org/signoff-cli"));
  const latest = pack && pack["dist-tags"] ? pack["dist-tags"].latest : null;
  const served = await get("https://registry.npmjs.org/signoff-cli/" + VERSION);
  const has = served.status === 200 && !!json(served);
  return { ok: latest === VERSION && has, detail: "latest=" + (latest || "?") + (has ? "" : " (tarball not served)") };
}

async function checkMcp() {
  const doc = json(
    await get("https://registry.modelcontextprotocol.io/v0/servers?search=" + encodeURIComponent("io.github.ayuanxx-max/signoff-cli") + "&limit=100")
  );
  const rows = ((doc && doc.servers) || []).filter((s) => (s.server || s).name === "io.github.ayuanxx-max/signoff-cli");
  const mine = rows.find((s) => {
    const meta = (s._meta || {})["io.modelcontextprotocol.registry/official"] || {};
    return meta.isLatest;
  });
  const v = mine ? mine.server.version : null;
  return { ok: v === VERSION, detail: "isLatest=" + (v || "none") };
}

function checkTag() {
  const git = (a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
  try {
    git(["rev-parse", "--verify", TAG]);
  } catch (e) {
    return { ok: false, detail: "no " + TAG };
  }
  // tag 上那份 package.json 必须真是这个版本号：tag 打在错误的提交上是最难看出来的一种错。
  let tagged = null;
  try {
    tagged = JSON.parse(git(["show", TAG + ":package.json"])).version;
  } catch (e) {
    tagged = null;
  }
  if (tagged !== VERSION) return { ok: false, detail: TAG + " carries " + (tagged || "?") };
  // 发版后再补修复提交是正常的，所以判据是「tag 在 HEAD 的历史里」，不是「tag == HEAD」。
  let behind = 0;
  try {
    behind = Number(git(["rev-list", "--count", TAG + "..HEAD"]));
  } catch (e) {
    behind = -1;
  }
  return { ok: behind >= 0, detail: TAG + " carries " + VERSION + (behind ? ", " + behind + " commit(s) after it" : " at HEAD") };
}

async function checkRelease() {
  if (!token) return { ok: false, detail: "no github token" };
  const res = await get("https://api.github.com/repos/" + REPO + "/releases/tags/" + TAG, {
    "User-Agent": "signoff-watch-release",
    Authorization: "token " + token,
    Accept: "application/vnd.github+json",
  });
  if (res.status !== 200) return { ok: false, detail: "http " + res.status };
  const rel = json(res) || {};
  const ok = rel.draft === false && rel.tag_name === TAG && (rel.body || "").length > 0;
  return { ok, detail: ok ? "published, body=" + rel.body.length : "draft=" + rel.draft };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const started = Date.now();
  let wait = 5;
  for (;;) {
    const [npm, mcp, tag, rel] = await Promise.all([checkNpm(), checkMcp(), Promise.resolve(checkTag()), checkRelease()]);
    const parts = [
      "npm=" + (npm.ok ? "ok" : "wait:" + npm.detail),
      "mcp=" + (mcp.ok ? "ok" : "wait:" + mcp.detail),
      "tag=" + (tag.ok ? "ok" : "wait:" + tag.detail),
      "release=" + (rel.ok ? "ok" : "wait:" + rel.detail),
    ];
    const all = npm.ok && mcp.ok && tag.ok && rel.ok;
    const t = Math.round((Date.now() - started) / 1000);
    console.log("[watch-release " + VERSION + " t+" + t + "s] " + parts.join("  "));
    if (all) {
      console.log("[watch-release] all four channels serve " + VERSION);
      process.exit(0);
    }
    if (once) {
      console.log("[watch-release] not there yet (single shot)");
      process.exit(1);
    }
    if (Date.now() - started + wait * 1000 > TIMEOUT * 1000) {
      console.log("[watch-release] gave up after " + TIMEOUT + "s: " + parts.filter((p) => !p.includes("=ok")).join(" "));
      process.exit(1);
    }
    await sleep(wait * 1000);
    wait = Math.min(Math.round(wait * 1.5), 30);
  }
})();
