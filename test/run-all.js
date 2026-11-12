"use strict";

// 全套用例 spawn 了上千个 node/git 子进程，单进程跑要 90 s 量级，时间几乎全在等子进程。
// 这里把 `test/selftest.js` 在标好的分界处切成两段，各起一个进程并行跑，再合并输出。
//
// 用例一条没少、一条没改：`node test/selftest.js` 仍然是完整的一次串行运行（查单条用例用它），
// `npm test` 走这里。两段的夹具各建各的（各自 mkdtemp + 各自的 SIGNOFF_HOME），互不干扰。

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const SRC = path.join(__dirname, "selftest.js");
const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);

function marker(text) {
  const i = lines.findIndex((l) => l.includes(text));
  if (i < 0) throw new Error(`selftest.js: missing marker "${text}"`);
  return i;
}

const iA = marker("==== selftest shard A ====") + 1;
const iSplit = marker("==== selftest shard split ====");
if (!(iA < iSplit)) throw new Error("selftest.js: shard markers are out of order");
const iTail = lines.findIndex((l) => l.includes("for (const line of AUDIT)"));
if (iTail < iSplit) throw new Error("selftest.js: cannot find the summary block");

const prelude = lines.slice(0, iA);
const epilogue = lines.slice(iTail);
// 主 try 的 `finally` 落在分界之前（它在第一段的末尾），所以第二段必须自己收口，
// 否则合成出来的文件是 "try 没有 catch"；顺带把第一段的临时目录清掉。
const closeTry = [
  "    } finally {",
  "      fs.rmSync(base, { recursive: true, force: true });",
  "    }",
];
const bodies = [
  [...prelude, ...lines.slice(iA, iSplit), ...epilogue],
  [...prelude, ...closeTry, ...lines.slice(iSplit, iTail), ...epilogue],
];

const files = bodies.map((body, i) => {
  // 必须落在 test/ 里：文件里用 __dirname 找 ../bin/signoff.js 和 ../lib/*。
  const file = path.join(__dirname, `.shard-${i === 0 ? "a" : "b"}.js`);
  fs.writeFileSync(file, body.join("\n"), "utf8");
  return file;
});

function runShard(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("close", (code) => resolve({ file, code, out, err, ms: Date.now() - started }));
  });
}

Promise.all(files.map(runShard)).then((results) => {
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    for (const line of r.out.split(/\r?\n/)) {
      if (line.startsWith("PASS ") || line.startsWith("FAIL ") || line.startsWith("AUDIT ")) {
        if (line.startsWith("PASS ")) passed += 1;
        if (line.startsWith("FAIL ")) failed += 1;
        console.log(line);
      }
    }
    if (r.err.trim()) console.log(r.err.trim());
    fs.rmSync(r.file, { force: true });
  }
  const bad = results.filter((r) => r.code !== 0);
  for (const r of bad) {
    if (r.code !== null && r.code !== 0) console.log(`[shard] ${path.basename(r.file)} exited ${r.code}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed || bad.length ? 1 : 0);
});
