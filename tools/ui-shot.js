#!/usr/bin/env node
// 给看板截一张图：改完版面自己先看一眼，再提交。
// 用本机常驻 Brave（~/.dsh/tools/hb.py），没有就只提示，不算失败。
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "ui");
const PY = process.env.SIGNOFF_PYTHON || path.join(os.homedir(), ".openviking", "venv", "Scripts", "python.exe");
const HB = path.join(os.homedir(), ".dsh", "tools", "hb.py");

function sh(cmd, args, opts) {
  return spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...(opts || {}) });
}

function main() {
  if (!fs.existsSync(PY) || !fs.existsSync(HB)) {
    console.log("[ui-shot] skipped: 常驻浏览器工具不在位（~/.dsh/tools/hb.py 或 OpenViking 的 python）");
    return 0;
  }
  fs.mkdirSync(OUT, { recursive: true });
  let failed = 0;
  for (const lang of ["zh", "en"]) {
    const page = path.join(os.tmpdir(), `signoff-shot-${lang}.html`);
    const made = sh(process.execPath, [path.join(ROOT, "bin", "signoff.js"), "report", "--html", "--out", page, "--lang", lang], {
      cwd: ROOT,
    });
    if (made.status !== 0) {
      console.error(`[ui-shot] report --lang ${lang} failed: ${(made.stderr || "").trim().split("\n").slice(-2).join(" ")}`);
      failed += 1;
      continue;
    }
    const png = path.join(OUT, `board-${lang}.png`);
    const url = new URL(`file:///${page.replace(/\\/g, "/")}`).href;
    const shot = sh(PY, [HB, "shot", url, png], { cwd: ROOT });
    if (shot.status !== 0 || !fs.existsSync(png)) {
      console.error(`[ui-shot] ${lang}: 截图失败（${(shot.stderr || shot.stdout || "").trim().split("\n").slice(-2).join(" ")}）`);
      failed += 1;
      continue;
    }
    console.log(`[ui-shot] ${lang}: ${path.relative(ROOT, png)} ${Math.round(fs.statSync(png).size / 1024)} KB`);
  }
  return failed ? 1 : 0;
}

process.exit(main());
