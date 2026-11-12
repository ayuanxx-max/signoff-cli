#!/usr/bin/env node
// 给看板出图：渲染 → 交给全局 shot.py 截图（跨工作区通用那一半在 ~/.dsh/tools/shot.py）。
// 改完版面自己先看一眼，再提交。
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "ui");
const PY = process.env.SIGNOFF_PYTHON || path.join(os.homedir(), ".openviking", "venv", "Scripts", "python.exe");
const TOOLS = path.join(os.homedir(), ".dsh", "tools");
const SHOT = path.join(TOOLS, "shot.py");

const sh = (cmd, args, opts) =>
  spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...(opts || {}) });

function main() {
  if (!fs.existsSync(PY)) {
    console.log("[ui-shot] skipped: 找不到 OpenViking 的 python（$SIGNOFF_PYTHON 可覆盖）");
    return 0;
  }
  if (!fs.existsSync(SHOT)) {
    console.log(`[ui-shot] skipped: 全局截图工具不在位（${SHOT}）`);
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
    const shot = sh(PY, [SHOT, page, "--out", png, "--width", "1280", "--height", "1000"], { cwd: ROOT });
    const line = (shot.stdout || "").trim().split("\n").pop() || "";
    let info = null;
    try {
      info = JSON.parse(line);
    } catch (e) {
      info = null;
    }
    if (!info || !info.ok) {
      console.error(`[ui-shot] ${lang}: 截图失败（${line || (shot.stderr || "").trim().slice(0, 200)}）`);
      failed += 1;
      continue;
    }
    console.log(`[ui-shot] ${lang}: ${path.relative(ROOT, png)} ${Math.round(info.bytes / 1024)} KB · ${info.ms} ms`);
  }
  return failed ? 1 : 0;
}

process.exit(main());
