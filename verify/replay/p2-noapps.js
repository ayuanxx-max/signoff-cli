#!/usr/bin/env node
"use strict";
// 回放探针：在没有 apps 配置的仓库里跑 p2，要求它说 SKIPPED 而不是 PASS。
// 退出码就是判据：0 = 现在的代码是对的；非 0 = 缺陷又回来了。

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-replay-"));
try {
  spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8" });
  fs.writeFileSync(path.join(dir, "README.md"), "no apps here\n", "utf8");
  const r = spawnSync(process.execPath, [path.join(ROOT, "bin", "signoff.js"), "p2", "--json"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, SIGNOFF_NO_BOOTSTRAP: "1", SIGNOFF_HOME: path.join(dir, ".signoff-home") },
  });
  const out = String(r.stdout || "") + String(r.stderr || "");
  let skipped = null;
  try {
    skipped = JSON.parse(String(r.stdout).trim().split(/\r?\n/).pop()).skipped;
  } catch (e) {
    skipped = null;
  }
  if (skipped === "no apps") {
    process.stdout.write("[p2-noapps] skipped=no apps\n");
    process.exitCode = 0;
  } else {
    process.stdout.write("[p2-noapps] p2 called a repo with no apps a pass: skipped=" + JSON.stringify(skipped) + "\n" + out);
    process.exitCode = 1;
  }
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    /* 临时目录清不掉不影响判据 */
  }
}
