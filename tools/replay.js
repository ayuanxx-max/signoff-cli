#!/usr/bin/env node
"use strict";
// 缺陷回放：把历史上真实逃逸过的缺陷按 patch 放回去，看现在的检查能不能当场抓住。
//
// 判据只有一条——放回缺陷后 probe 必须变红。变红 = 这条缺陷再也回不来；
// 还是绿 = 那条检查是纸糊的。跑完一定还原文件（异常、Ctrl-C 都还原）。
//
// usage: node tools/replay.js [--json] [--file PATH]

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SET = path.join(ROOT, "verify", "replay", "defects.json");

function probeRun(cmd) {
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: "utf8", timeout: 180000, windowsHide: true });
  return { out: String(r.stdout || "") + String(r.stderr || ""), status: r.status };
}

function evaluate(defect, patched) {
  const p = defect.probe;
  if (p.type === "source") {
    const src = fs.readFileSync(path.join(ROOT, p.file), "utf8");
    const hit = new RegExp(p.expect).test(src);
    return { green: hit, why: hit ? "source matches " + p.expect : "source no longer matches " + p.expect };
  }
  const r = probeRun(p.cmd);
  const green = r.out.includes(p.expectContains);
  return { green, why: green ? "probe printed " + JSON.stringify(p.expectContains) : "probe did not print " + JSON.stringify(p.expectContains) };
}

function main(argv) {
  const json = argv.includes("--json");
  const only = (() => {
    const i = argv.indexOf("--file");
    return i === -1 ? null : argv[i + 1];
  })();
  let set;
  try {
    set = JSON.parse(fs.readFileSync(SET, "utf8"));
  } catch (e) {
    process.stderr.write("replay: cannot read " + SET + ": " + e.message + "\n");
    return 2;
  }
  const defects = (set.defects || []).filter((d) => !only || d.file === only);
  if (!defects.length) {
    process.stdout.write("[replay] SKIPPED no defects in the set\n");
    return 0;
  }

  const originals = new Map();
  const restore = () => {
    for (const [f, text] of originals) {
      try {
        if (fs.readFileSync(f, "utf8") !== text) fs.writeFileSync(f, text, "utf8");
      } catch (e) {
        process.stderr.write("replay: FAILED to restore " + f + ": " + e.message + "\n");
      }
    }
  };
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });

  const rows = [];
  for (const d of defects) {
    const abs = path.join(ROOT, d.file);
    if (!fs.existsSync(abs)) {
      rows.push({ id: d.id, reproduced: false, why: "missing file " + d.file });
      continue;
    }
    if (!originals.has(abs)) originals.set(abs, fs.readFileSync(abs, "utf8"));
    const base = originals.get(abs);
    if (!base.includes(d.patch.find)) {
      rows.push({ id: d.id, reproduced: false, why: "patch no longer applies to " + d.file });
      continue;
    }
    try {
      const clean = evaluate(d);
      fs.writeFileSync(abs, base.split(d.patch.find).join(d.patch.replace), "utf8");
      const broken = evaluate(d);
      rows.push({
        id: d.id,
        reproduced: clean.green && !broken.green,
        clean: clean.green,
        withBug: broken.green,
        why: !clean.green ? "probe is red even without the bug: " + clean.why : broken.green ? "probe stayed green with the bug back: " + broken.why : "red as soon as the bug is back",
      });
    } finally {
      restore();
      originals.delete(abs);
    }
  }
  restore();

  const ok = rows.filter((r) => r.reproduced).length;
  const payload = { gate: "replay", set: path.relative(ROOT, SET).split(path.sep).join("/"), total: rows.length, reproduced: ok, defects: rows };
  if (json) process.stdout.write(JSON.stringify(payload) + "\n");
  else {
    for (const r of rows) process.stdout.write(`[replay] ${r.reproduced ? "caught  " : "MISSED  "} ${r.id} — ${r.why}\n`);
    process.stdout.write(`[replay] ${ok}/${rows.length} historical defects are caught when reintroduced\n`);
  }
  return ok === rows.length ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
