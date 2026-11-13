#!/usr/bin/env node
"use strict";
// Self-test for signoff-cli: every gate runs against a throwaway git repo and the
// exit code is the assertion. Node only — this is the suite `npm test` runs.
//   node test/selftest.mjs

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "bin", "signoff.js");
const PASS = [];
const FAIL = [];
const AUDIT = [];
let HOME = "";

// 可选计时：SIGNOFF_TIMING=1 时记录每条用例之间的真实间隔（用例本身是同步的，
// 时间花在它自己 spawn 的东西上），结束后按耗时排出前 12 名——压时间先看数据。
const TIMING = [];
let TIMING_AT = Date.now();
// 反向对照（lib/negative.js）只问一件事：这些测试在旧代码上会不会红。
// 第一条红就够了，继续跑完剩下的 600 条只是在替一个已经成立的结论付钱。
const FAIL_FAST = process.env.SIGNOFF_NC === "1";
function check(name, got, want, extra) {
  const ok = got === want;
  ONCE.clear();
  const now = Date.now();
  if (process.env.SIGNOFF_TIMING === "1") TIMING.push([now - TIMING_AT, name]);
  TIMING_AT = now;
  (ok ? PASS : FAIL).push(`${name}: got=${got} want=${want}${extra ? " " + extra : ""}`);
  if (!ok && FAIL_FAST) {
    for (const line of FAIL) console.log(`FAIL ${line}`);
    console.log(`\n${PASS.length} passed, ${FAIL.length} failed (stopped at the first red: negative control)`);
    process.exit(1);
  }
}

// 每条用例的耗时大部分花在它 spawn 的子进程上；按命令名聚合，能看出哪类调用值得减。
const SPAWNS = new Map();
// 同一个用例里重复问同一件只读的事（"再看一眼 --since-install" 那种）没有新信息，
// 但每次都要付一遍 node 启动 + 仓库扫描。缓存只在一条用例内有效，check() 一开始就清空：
// 用例之间会改状态，跨用例缓存会把旧结论当新结论。
const READ_ONLY = new Set(["report", "audit", "doctor", "status", "explain", "patterns", "tokens", "p2", "p4", "p5", "secrets", "cov"]);
const ONCE = new Map();
function run(args, cwd, env) {
  const k = String(args[0] || "");
  const onceKey = `${cwd}|${args.join(" ")}|${JSON.stringify(env || {})}`;
  if (READ_ONLY.has(k) && ONCE.has(onceKey)) return ONCE.get(onceKey);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    // A report for a busy repo is far bigger than the 1 MB spawnSync default.
    maxBuffer: 64 * 1024 * 1024,
    // Fixtures are not the user's repos: no auto-install unless a test asks for it.
    env: { ...process.env, SIGNOFF_HOME: HOME, SIGNOFF_NO_BOOTSTRAP: "1",
      // 页面语言在测试里固定成中文：CI 的系统区域是 en，跟随系统会让中文断言随机变红。
      SIGNOFF_LANG: "zh", ...(env || {}) },
  });
  if (process.env.SIGNOFF_TIMING === "1") {
    const rec = SPAWNS.get(k || "(none)") || { n: 0, ms: 0 };
    rec.n += 1;
    rec.ms += Date.now() - t0;
    SPAWNS.set(k || "(none)", rec);
  }
  if (READ_ONLY.has(k)) ONCE.set(onceKey, r);
  return r;
}

// Fixture repos are not the user's machine: keep the machine-wide dispatcher out of the
// suite so a commit inside a fixture only runs what the test asked for.
function gitEnv(extra) {
  return { ...process.env, SIGNOFF_HOME: HOME, SIGNOFF_NO_MACHINE: "1", ...(extra || {}) };
}

function gitOut(args, cwd, env) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv(env) });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function git(args, cwd, env) {
  gitOut(args, cwd, env);
}

// Git runs hooks through sh, and sh finds an extension-less `signoff` on PATH.
// That is how a real `git commit` reaches this checkout without a global install.
function makeShim(base) {
  const dir = path.join(base, "shim");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "signoff");
  const fwd = (s) => s.split("\\").join("/");
  fs.writeFileSync(p, `#!/bin/sh\nexec "${fwd(process.execPath)}" "${fwd(CLI)}" "$@"\n`, "utf8");
  try {
    fs.chmodSync(p, 0o755);
  } catch (e) {
    /* windows: sh does not need the bit */
  }
  return dir;
}

function buildRepo(base) {
  const repo = path.join(base, "repo");
  for (const d of ["tests", "verify/scenarios", "docs", "tasks/t1", "tasks/t2"]) {
    fs.mkdirSync(path.join(repo, d), { recursive: true });
  }
  const w = (p, s) => fs.writeFileSync(path.join(repo, p), s, "utf8");
  w(
    "package.json",
    JSON.stringify(
      { name: "fixture", version: "0.0.0", devDependencies: { "signoff-cli": "^4.0.0" } },
      null,
      2
    ) + "\n"
  );
  w("tasks/t1/card.json", JSON.stringify({ id: "t1", goal: "g", scope: ["src/a/**"], acceptance: ["pass"], rollback: "HEAD" }));
  w("tasks/t2/card.json", JSON.stringify({ id: "t2", goal: "g", scope: ["src/a/b.py"], acceptance: ["pass"], rollback: "HEAD" }));
  w("docs/clean.md", "# clean\n\n40 cases in 3.6 s, 12/12 PASS.\n");
  w("docs/dirty.md", "# dirty\n\n这个方案赋能全链路，闭环彻底解决，已验证。\n");
  fs.writeFileSync(
    path.join(repo, "verify/scenarios/a.json"),
    JSON.stringify({ checks: [{ name: "x" }, { name: "y" }, { name: "z" }] })
  );
  git(["init", "-q"], repo);
  git(["config", "user.email", "t@t"], repo);
  git(["config", "user.name", "t"], repo);
  git(["add", "-A"], repo);
  git(["commit", "-qm", "init"], repo);
  return repo;
}

function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-selftest-"));
  HOME = path.join(base, "home");
  try {
    const repo = buildRepo(base);
    const shim = makeShim(base);

    // ==== selftest shard A ====
    // P1
    let r = run(["p1", "--run", `"${process.execPath}" -e "console.log('3 passed')"`], repo);
    check("p1 pass", r.status, 0);
    const p1 = JSON.parse(fs.readFileSync(path.join(repo, ".signoff", "p1.json"), "utf8"));
    check("p1 cases parsed", p1.cases, 3);
    r = run(["p1", "--run", `"${process.execPath}" -e "process.exit(1)"`], repo);
    check("p1 fail on rc!=0", r.status, 1);

    // 反作弊执行层：改过的测试必须在 base 上红；永远为真的测试在这里被抓住。
    const nrepo = path.join(base, "nc-repo");
    fs.mkdirSync(nrepo, { recursive: true });
    const nw = (p, s) => fs.writeFileSync(path.join(nrepo, p), s, "utf8");
    fs.mkdirSync(path.join(nrepo, "test"), { recursive: true });
    nw("impl.js", "module.exports = 'v1';\n");
    nw("test/t.js", "const assert = require('assert');\nassert.strictEqual(require('../impl.js'), 'v1');\nconsole.log('1 passed');\n");
    git(["init", "-q"], nrepo);
    git(["config", "user.email", "t@t"], nrepo);
    git(["config", "user.name", "t"], nrepo);
    git(["add", "-A"], nrepo);
    git(["commit", "-qm", "base"], nrepo);
    // 新实现 + 新断言：落盘这棵树是绿的，但在 base 上必须红
    nw("impl.js", "module.exports = 'v2';\n");
    nw("test/t.js", "const assert = require('assert');\nassert.strictEqual(require('../impl.js'), 'v2');\nconsole.log('1 passed');\n");
    const nc = (extra) =>
      run(["p1", "--run", `"${process.execPath}" test/t.js`, "--negative-control", ...(extra || [])], nrepo, {
        SIGNOFF_NO_CACHE: "1",
      });
    r = nc();
    check("negative control goes green", r.status, 0, (r.stdout || "").trim().split("\n").pop());
    // 永远为真的断言：两棵树都绿，正是这一层要抓的那种「测试」
    nw("test/t.js", "const assert = require('assert');\nassert.ok(true);\nconsole.log('1 passed');\n");
    r = nc();
    check("negative control catches a test that cannot fail", r.status, 1, (r.stdout || "").trim().split("\n").pop());
    // 不改测试文件就不该付这笔钱
    r = run(["p1", "--run", `"${process.execPath}" -e "console.log('1 passed')"`, "--negative-control"], repo, {
      SIGNOFF_NO_CACHE: "1",
    });
    check("negative control skips without touched tests", /negative-control skipped/.test(r.stdout) ? 1 : 0, 1, (r.stdout || "").trim().split("\n").pop());

    // P2
    r = run(["p2", "--strict", "--json"], repo);
    check("p2 pass", r.status, 0);
    r = run(["p2", "--min-assertions", "9"], repo);
    check("p2 fail on threshold", r.status, 1);

    // P3
    r = run(["p3", "validate"], repo);
    check("p3 validate", r.status, 0);
    r = run(["p3", "plan"], repo);
    check("p3 plan splits", r.status, 0);
    const p3 = JSON.parse(fs.readFileSync(path.join(repo, ".signoff", "p3.json"), "utf8"));
    check("p3 wave count", p3.waves.length, 2);

    // P4
    r = run(["p4", "ask", "--action", "publish", "--target", "demo@1.0.0"], repo);
    check("p4 ask", r.status, 0);
    const ticket = (r.stdout.match(/ticket (\S+)/) || [])[1];
    r = run(["p4", "confirm", "--ticket", ticket, "--decision", "allow", "--detail", "d", "--rollback", "HEAD"], repo);
    check("p4 confirm allow", r.status, 0);
    r = run(["p4", "verify"], repo);
    check("p4 verify ok", r.status, 0);
    r = run(["p4", "confirm", "--ticket", ticket, "--decision", "allow"], repo);
    check("p4 ticket single-use", r.status, 2);
    r = run(["p4", "ask", "--action", "publish", "--target", "deny-me"], repo);
    const denyTicket = (r.stdout.match(/ticket (\S+)/) || [])[1];
    r = run(["p4", "confirm", "--ticket", denyTicket, "--decision", "deny"], repo);
    check("p4 deny red", r.status, 1);
    const log = path.join(HOME, "audit.log");
    fs.writeFileSync(log, fs.readFileSync(log, "utf8").replace('"d"', '"tampered"'), "utf8");
    r = run(["p4", "verify"], repo);
    check("p4 tamper detected", r.status, 1);
    r = run(["p4", "ask", "--action", "publish", "--target", "x"], repo);
    const t2 = (r.stdout.match(/ticket (\S+)/) || [])[1];
    run(["p4", "confirm", "--ticket", t2, "--decision", "allow", "--rollback", "npm deprecate x"], repo);
    r = run(["p4", "verify"], repo);
    check("p4 fake rollback refused", r.status, 1);

    // P4 repo-scoped ledger (3.3.0): without SIGNOFF_HOME the ledger lives in the repo,
    // records carry their repository, and a pre-3.3.0 chain still verifies.
    const lib = require(path.join(ROOT, "lib", "p4.js"));
    const rhome = path.join(base, "legacy-home");
    const rhomeDir = path.join(rhome, ".signoff");
    fs.mkdirSync(rhomeDir, { recursive: true });
    const v1body = {
      ts: "2026-01-01T00:00:00+0000",
      action: "publish",
      target: "old@1.0.0",
      detail: "legacy",
      rollback: "HEAD",
      decision: "allow",
    };
    const v1rec = Object.assign({}, v1body, { prev: "genesis", hash: lib.digest("genesis", v1body) });
    fs.writeFileSync(path.join(rhomeDir, "audit.log"), lib.dumpsPy(v1rec, { sortKeys: true }) + os.EOL, "utf8");
    const noHome = { SIGNOFF_HOME: "", HOME: rhome, USERPROFILE: rhome };
    r = run(["p4", "verify"], repo, noHome);
    check("p4 repo ledger seeds legacy chain", r.status, 0, (r.stdout || "").trim());
    const repoLog = path.join(repo, ".signoff", "audit.log");
    check("p4 ledger lands in repo", fs.existsSync(repoLog) ? 1 : 0, 1);
    r = run(["p4", "ask", "--action", "publish", "--target", "scoped"], repo, noHome);
    const t3 = (r.stdout.match(/ticket (\S+)/) || [])[1];
    run(["p4", "confirm", "--ticket", t3, "--decision", "allow", "--detail", "s", "--rollback", "HEAD"], repo, noHome);
    check("p4 record carries repo", /"repo": "[^"]+"/.test(fs.readFileSync(repoLog, "utf8")) ? 1 : 0, 1);
    const lines = fs.readFileSync(repoLog, "utf8").trim().split(/\r?\n/);
    const newest = JSON.parse(lines[lines.length - 1]);
    const lastHash = newest.hash;
    const foreignBody = {
      ts: "2026-01-02T00:00:00+0000",
      action: "publish",
      target: "elsewhere",
      detail: "other repo",
      rollback: "v-missing-tag",
      decision: "allow",
      repo: "elsewhere",
    };
    const foreign = Object.assign({}, foreignBody, { prev: lastHash, hash: lib.digest(lastHash, foreignBody) });
    fs.appendFileSync(repoLog, lib.dumpsPy(foreign, { sortKeys: true }) + os.EOL, "utf8");
    r = run(["p4", "verify"], repo, noHome);
    check("p4 skips foreign repo entries", r.status, 0, (r.stdout || "").trim());
    const ownBody = {
      ts: "2026-01-03T00:00:00+0000",
      action: "publish",
      target: "mine",
      detail: "own repo",
      rollback: "v-missing-tag",
      decision: "allow",
      repo: newest.repo,
    };
    const own = Object.assign({}, ownBody, { prev: foreign.hash, hash: lib.digest(foreign.hash, ownBody) });
    fs.appendFileSync(repoLog, lib.dumpsPy(own, { sortKeys: true }) + os.EOL, "utf8");
    r = run(["p4", "verify"], repo, noHome);
    check("p4 still checks own entries", r.status, 1, (r.stdout || "").trim());

    // P5
    r = run(["p5", "docs/dirty.md"], repo);
    check("p5 dirty red", r.status, 1);
    r = run(["p5", "docs/clean.md"], repo);
    check("p5 clean green", r.status, 0);

    // Guard: install once, then the gates run themselves.
    const ghome = path.join(base, "guard-home");
    const g = (args, env) => run(args, repo, { SIGNOFF_HOME: ghome, ...(env || {}) });
    // a real `git commit`, with the CLI reachable from the hooks
    const commit = (args, env) =>
      spawnSync("git", args, {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          SIGNOFF_HOME: ghome,
          PATH: `${shim}${path.delimiter}${process.env.PATH}`,
          ...(env || {}),
        },
      });
    r = g(["audit", "--since-install"]);
    check("audit --since-install needs install point", r.status, 2);
    r = g(["init", "--no-ci"]);
    check("guard init", r.status, 0);
    const ipath = path.join(repo, ".signoff", "installed.json");
    check("init records install point", fs.existsSync(ipath) ? 1 : 0, 1);
    const ip1 = JSON.parse(fs.readFileSync(ipath, "utf8"));
    check("install point carries sha", /^[0-9a-f]{7,40}$/.test(ip1.sha || "") ? 1 : 0, 1, JSON.stringify(ip1));
    check("audit --since-install ok", g(["audit", "--since-install"]).status, 0, g(["audit", "--since-install"]).stdout.trim());
    r = g(["init", "--no-ci"]);
    const ip2 = JSON.parse(fs.readFileSync(ipath, "utf8"));
    check("re-init keeps install point", `${ip2.sha}|${ip2.ts}` === `${ip1.sha}|${ip1.ts}` ? 1 : 0, 1);
    check("re-init records the hook version", ip2.version, JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version);

    // init --chain: the hook that was already there keeps running, and uninstall gives it back.
    const crepo = path.join(base, "chain-repo");
    const chome = path.join(base, "chain-home");
    fs.mkdirSync(crepo, { recursive: true });
    gitOut(["init", "-q", "."], crepo);
    const chooks = path.join(crepo, ".git", "hooks");
    fs.mkdirSync(chooks, { recursive: true });
    const oldHook = path.join(chooks, "pre-commit");
    fs.writeFileSync(oldHook, "#!/bin/sh\necho ran > .local-ran\nexit 0\n", "utf8");
    fs.chmodSync(oldHook, 0o755);
    fs.writeFileSync(path.join(crepo, "a.txt"), "a", "utf8");
    gitOut(["add", "."], crepo);
    gitOut(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "base"], crepo);
    check("old hook ran before signoff", fs.existsSync(path.join(crepo, ".local-ran")) ? 1 : 0, 1);
    const c = (args) => run(args, crepo, { SIGNOFF_HOME: chome });
    const ccommit = (msg) =>
      spawnSync("git", ["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", msg], {
        cwd: crepo,
        encoding: "utf8",
        env: { ...process.env, SIGNOFF_HOME: chome, PATH: `${shim}${path.delimiter}${process.env.PATH}` },
      });
    r = c(["init", "--no-ci", "--chain"]);
    check("init --chain", r.status, 0, (r.stdout || "").trim());
    check("chain keeps old hook aside", fs.existsSync(path.join(chooks, "pre-commit.local")) ? 1 : 0, 1);
    fs.rmSync(path.join(crepo, ".local-ran"), { force: true });
    fs.writeFileSync(path.join(crepo, "b.txt"), "b", "utf8");
    gitOut(["add", "."], crepo);
    const chained = ccommit("chained");
    check("chained commit passes", chained.status, 0, (chained.stderr || "").trim());
    check("chained commit ran the old hook", fs.existsSync(path.join(crepo, ".local-ran")) ? 1 : 0, 1);
    check("chained commit got a trailer", /^Signoff-Pass: [0-9a-f]{12}$/m.test(gitOut(["log", "-1", "--format=%B"], crepo)) ? 1 : 0, 1);
    fs.writeFileSync(path.join(chooks, "pre-commit.local"), "#!/bin/sh\nexit 1\n", "utf8");
    fs.chmodSync(path.join(chooks, "pre-commit.local"), 0o755);
    fs.writeFileSync(path.join(crepo, "c.txt"), "c", "utf8");
    gitOut(["add", "."], crepo);
    check("failing old hook blocks the commit", ccommit("blocked").status === 0 ? 0 : 1, 1);
    r = c(["uninstall"]);
    check("uninstall restores the old hook", /restored from pre-commit\.local/.test(r.stdout) ? 1 : 0, 1);
    check("restored hook is not ours", fs.readFileSync(oldHook, "utf8").includes("# generated by dsh-signoff") ? 0 : 1, 1);
    check("restored hook removed .local", fs.existsSync(path.join(chooks, "pre-commit.local")) ? 0 : 1, 1);

    // a chained hook keeps its language: a node hook becomes .local.js and runs with node
    const jrepo = path.join(base, "chain-js-repo");
    const jhome = path.join(base, "chain-js-home");
    fs.mkdirSync(jrepo, { recursive: true });
    gitOut(["init", "-q", "."], jrepo);
    fs.mkdirSync(path.join(jrepo, ".git", "hooks"), { recursive: true });
    fs.writeFileSync(
      path.join(jrepo, ".git", "hooks", "pre-commit"),
      "#!/usr/bin/env node\nrequire('fs').writeFileSync('.js-ran','1')\n",
      { encoding: "utf8", mode: 0o644 }
    );
    fs.writeFileSync(path.join(jrepo, "a.txt"), "a", "utf8");
    gitOut(["add", "."], jrepo);
    const j = (args) => run(args, jrepo, { SIGNOFF_HOME: jhome });
    r = j(["init", "--no-ci", "--no-push", "--chain", "--quiet"]);
    const jlocal = path.join(jrepo, ".git", "hooks", "pre-commit.local.js");
    check("node hook chained as .local.js", fs.existsSync(jlocal) ? 1 : 0, 1, (r.stdout || "").trim());
    const jhook = fs.readFileSync(path.join(jrepo, ".git", "hooks", "pre-commit"), "utf8");
    check("hook dispatches .py/.js/.ps1", /\.py\) PY=/.test(jhook) && /\.js\) node/.test(jhook) ? 1 : 0, 1);
    // Run the generated hook directly: whether `signoff` is on PATH is the harness's
    // business elsewhere, and the point here is only that the chained hook ran first.
    const jc = spawnSync("git", ["hook", "run", "pre-commit"], {
      cwd: jrepo,
      encoding: "utf8",
    });
    check("chained node hook left its mark", fs.existsSync(path.join(jrepo, ".js-ran")) ? 1 : 0, 1, (jc.stderr || "").trim());

    // 提交快、推送严（2026-11-12）：pre-commit 只跑 test:fast，pre-push 跑全套；
    // 两者的缓存不互相通融，没声明 test:fast 就不许悄悄放水。
    const grepo = path.join(base, "fast-repo");
    const fhome = path.join(base, "fast-home");
    fs.mkdirSync(grepo, { recursive: true });
    const gw = (p, s) => fs.writeFileSync(path.join(grepo, p), s, "utf8");
    const gWrites = (name) => fs.existsSync(path.join(grepo, name)) ? 1 : 0;
    gw("fast.js", "require('fs').writeFileSync('fast-ran', '1')\n");
    gw("full.js", "require('fs').writeFileSync('full-ran', '1')\n");
    gw(
      "package.json",
      JSON.stringify({ name: "f", version: "0.0.0", scripts: { test: "node full.js", "test:fast": "node fast.js" } }, null, 2)
    );
    gitOut(["init", "-q", "."], grepo);
    gitOut(["add", "."], grepo);
    gitOut(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "base"], grepo);
    fs.mkdirSync(path.join(grepo, ".signoff"), { recursive: true });
    fs.writeFileSync(path.join(grepo, ".signoff", "config.json"), "{}\n", "utf8");
    gw("change.txt", "x");
    gitOut(["add", "change.txt"], grepo);
    const ghook = (stage) => run(["hook", stage], grepo, { SIGNOFF_HOME: fhome });
    r = ghook("pre-commit");
    check("pre-commit runs test:fast", gWrites("fast-ran"), 1, (r.stdout || "").trim());
    check("pre-commit skips the full suite", gWrites("full-ran"), 0);
    check("pre-commit says tests=fast", /tests=fast/.test(r.stdout) ? 1 : 0, 1, (r.stdout || "").trim());
    // same tree: the fast pass must not let the push skip the full suite
    r = ghook("pre-push");
    check("pre-push runs the full suite", gWrites("full-ran"), 1, (r.stdout || "").trim());
    check("pre-push ignores the fast cache", /cached pass/.test(r.stdout) ? 0 : 1, 1, (r.stdout || "").trim());
    // no test:fast declared -> back to the full suite, never a silent pass
    fs.rmSync(path.join(grepo, "fast-ran"), { force: true });
    fs.rmSync(path.join(grepo, "full-ran"), { force: true });
    gw("package.json", JSON.stringify({ name: "f", version: "0.0.0", scripts: { test: "node full.js" } }, null, 2));
    gitOut(["add", "package.json"], grepo);
    r = ghook("pre-commit");
    check("no test:fast falls back to the full suite", gWrites("full-ran"), 1, (r.stdout || "").trim());


    // runner detection: named runners win, and an empty tests/ folder is not a suite
    const detector = require(path.join(ROOT, "lib", "detect.js"));
    const dprobe = (files) => {
      const dir = fs.mkdtempSync(path.join(base, "detect-"));
      for (const [name, body] of Object.entries(files)) {
        const p = path.join(dir, name);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, body, "utf8");
      }
      return detector.detect(dir, {});
    };
    check("detect npm script", dprobe({ "package.json": JSON.stringify({ scripts: { test: "node t.js" } }) }).cmd, "npm test --silent");
    check("detect vitest", dprobe({ "package.json": JSON.stringify({ devDependencies: { vitest: "1" } }) }).source, "vitest");
    check("detect cargo", dprobe({ "Cargo.toml": "[package]\n" }).cmd, "cargo test --quiet");
    check("detect go", dprobe({ "go.mod": "module x\n" }).cmd, "go test ./...");
    check("detect make", dprobe({ "Makefile": "test:\n\t@true\n" }).cmd, "make test");
    check("empty tests dir is not a suite", dprobe({ "tests/.keep": "" }).cmd, null);
    check("config outranks files", detector.detect(base, { test_cmd: "echo hi" }).cmd, "echo hi");
    const ddir = fs.mkdtempSync(path.join(base, "describe-"));
    fs.writeFileSync(path.join(ddir, "package.json"), JSON.stringify({ scripts: { test: "node t.js" } }), "utf8");
    check("describe names the runner", /npm test --silent  \(package\.json scripts\.test\)/.test(detector.describe(ddir, {})) ? 1 : 0, 1);

    // the generated CI workflow has to survive the default shallow clone
    const cirepo = path.join(base, "ci-repo");
    fs.mkdirSync(cirepo, { recursive: true });
    gitOut(["init", "-q", "."], cirepo);
    fs.writeFileSync(path.join(cirepo, "a.txt"), "a", "utf8");
    gitOut(["add", "."], cirepo);
    gitOut(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "a"], cirepo);
    run(["init", "--no-push"], cirepo, { SIGNOFF_HOME: path.join(base, "ci-home") });
    const wf = fs.readFileSync(path.join(cirepo, ".github", "workflows", "signoff.yml"), "utf8");
    check("CI workflow fetches full history", /fetch-depth: 0/.test(wf) ? 1 : 0, 1);
    check(
      "CI audit asks for a verified rev",
      /--verify --quiet/.test(wf) && !/rev-parse HEAD~1"/.test(wf) ? 1 : 0,
      1
    );

    // uninstall: --keep-config drops runtime state, --all drops the config too
    const urepo = path.join(base, "uninstall-repo");
    const uhome = path.join(base, "uninstall-home");
    fs.mkdirSync(urepo, { recursive: true });
    gitOut(["init", "-q", "."], urepo);
    fs.writeFileSync(path.join(urepo, "a.txt"), "a", "utf8");
    gitOut(["add", "."], urepo);
    gitOut(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "a"], urepo);
    const u = (args, extra) => run(args, urepo, Object.assign({ SIGNOFF_HOME: uhome }, extra || {}));
    u(["init", "--no-ci", "--quiet"]);
    fs.writeFileSync(path.join(urepo, ".signoff", "passed"), '{"tree":"x"}', "utf8");
    r = u(["uninstall", "--keep-config"]);
    check("uninstall --keep-config keeps the config", fs.existsSync(path.join(urepo, ".signoff", "config.json")) ? 1 : 0, 1);
    check("uninstall --keep-config drops the marker", fs.existsSync(path.join(urepo, ".signoff", "passed")) ? 0 : 1, 1);
    check("uninstall --keep-config drops the install point", fs.existsSync(path.join(urepo, ".signoff", "installed.json")) ? 0 : 1, 1);
    u(["init", "--no-ci", "--quiet"]);
    r = u(["uninstall", "--all"]);
    check("uninstall --all drops the config", fs.existsSync(path.join(urepo, ".signoff", "config.json")) ? 0 : 1, 1);

    // one hook run at a time: a live lock refuses, a stale one is broken
    u(["init", "--no-ci", "--quiet"]);
    const lk = path.join(urepo, ".signoff", "lock");
    fs.writeFileSync(lk, JSON.stringify({ pid: process.pid, stage: "pre-commit", ts: new Date().toISOString() }), "utf8");
    fs.writeFileSync(path.join(urepo, "z.txt"), "z", "utf8");
    gitOut(["add", "."], urepo);
    r = u(["hook", "pre-commit"], { SIGNOFF_LOCK_WAIT_MS: "0" });
    check("live lock refuses the run", r.status, 1, (r.stderr || "").trim());
    check("live lock names the holder", /holds the lock/.test(r.stderr) ? 1 : 0, 1);
    fs.writeFileSync(lk, JSON.stringify({ pid: 999999, stage: "pre-commit", ts: new Date(Date.now() - 3600e3).toISOString() }), "utf8");
    r = u(["hook", "pre-commit"], { SIGNOFF_LOCK_WAIT_MS: "0" });
    check("stale lock is broken", r.status === 0 ? 1 : 0, 1, (r.stdout || "").trim());
    check("lock released after the run", fs.existsSync(lk) ? 0 : 1, 1);

    // doctor --fix reinstalls hooks it can see are gone, then re-checks
    gitOut(["reset", "-q"], urepo);
    const fixHook = path.join(urepo, ".git", "hooks", "pre-commit");
    fs.rmSync(fixHook, { force: true });
    r = u(["doctor", "--fix", "--quiet"]);
    check("doctor --fix reinstalls the hook", fs.existsSync(fixHook) ? 1 : 0, 1, (r.stdout || "").trim());
    check("doctor --fix exits ok after repair", r.status, 0, (r.stdout || "").trim());
    r = u(["doctor", "--fix"]);
    check("doctor --fix is idempotent", /nothing to repair/.test(r.stdout) ? 1 : 0, 1, (r.stdout || "").trim());

    // audit refuses an install point that is not an ancestor of HEAD, and --reset-install fixes it
    const uipath = path.join(urepo, ".signoff", "installed.json");
    fs.writeFileSync(uipath, JSON.stringify({ sha: "0".repeat(40), ts: new Date().toISOString(), version: "3.9.0" }), "utf8");
    r = u(["audit", "--since-install"]);
    check("audit refuses a foreign install point", r.status, 2, (r.stderr || "").trim());
    check("audit says why", /not an ancestor of HEAD/.test(r.stderr) ? 1 : 0, 1);
    r = u(["init", "--reset-install", "--no-ci", "--no-push", "--quiet"]);
    const fixedPoint = JSON.parse(fs.readFileSync(uipath, "utf8"));
    check("init --reset-install records HEAD", fixedPoint.sha, gitOut(["rev-parse", "HEAD"], urepo).trim());
    r = u(["audit", "--since-install"]);
    check("audit works after the reset", r.status, 0, (r.stderr || "").trim());

    // init --lock-test pins what detection found, so another machine cannot switch runners
    const prepo = path.join(base, "pin-repo");
    const phome = path.join(base, "pin-home");
    fs.mkdirSync(prepo, { recursive: true });
    gitOut(["init", "-q", "."], prepo);
    fs.writeFileSync(
      path.join(prepo, "package.json"),
      JSON.stringify({ name: "pin", devDependencies: { vitest: "^1.0.0" } }, null, 2),
      "utf8"
    );
    fs.writeFileSync(path.join(prepo, "a.txt"), "a", "utf8");
    gitOut(["add", "."], prepo);
    const pin = (args) => run(args, prepo, { SIGNOFF_HOME: phome });
    r = pin(["init", "--lock-test", "--no-ci", "--no-push"]);
    const pinned = JSON.parse(fs.readFileSync(path.join(prepo, ".signoff", "config.json"), "utf8"));
    check("init --lock-test pins the runner", pinned.test_cmd, "npx --no-install vitest run");
    check("init --lock-test says what it locked", /locked\s+npx --no-install vitest run/.test(r.stdout) ? 1 : 0, 1, (r.stdout || "").trim());

    // the lock directory shape blocks too, and a dead owner breaks it
    const dlk = path.join(urepo, ".signoff", "lock");
    fs.mkdirSync(dlk, { recursive: true });
    fs.writeFileSync(path.join(dlk, "owner.json"), JSON.stringify({ pid: process.pid, stage: "pre-commit", ts: new Date().toISOString() }), "utf8");
    r = u(["hook", "pre-commit"], { SIGNOFF_LOCK_WAIT_MS: "0" });
    check("directory lock blocks", r.status, 1, (r.stderr || "").trim());
    fs.writeFileSync(path.join(dlk, "owner.json"), JSON.stringify({ pid: 999999, stage: "pre-commit", ts: new Date().toISOString() }), "utf8");
    u(["hook", "pre-commit"], { SIGNOFF_LOCK_WAIT_MS: "0" });
    check("dead owner breaks the directory lock", fs.existsSync(dlk) ? 0 : 1, 1);

    // p4 export --merge: another repo's ledger joins the table, tampering is reported
    const lrepo = path.join(base, "ledger-repo");
    const lhome = path.join(base, "ledger-home");
    fs.mkdirSync(lrepo, { recursive: true });
    gitOut(["init", "-q", "."], lrepo);
    fs.writeFileSync(path.join(lrepo, "a.txt"), "a", "utf8");
    gitOut(["add", "."], lrepo);
    gitOut(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "a"], lrepo);
    const l = (args) => run(args, lrepo, { SIGNOFF_HOME: lhome });
    const askOut = l(["p4", "ask", "--action", "publish", "--target", "demo@1.0.0"]);
    const lticket = (askOut.stdout.match(/ticket (\S+)/) || [])[1];
    l(["p4", "confirm", "--ticket", lticket, "--decision", "allow", "--detail", "d", "--rollback", "HEAD"]);
    const ledgerFile = path.join(lhome, "audit.log");
    check("ledger file written", fs.existsSync(ledgerFile) ? 1 : 0, 1);
    const other = path.join(base, "other-ledger.jsonl");
    fs.copyFileSync(ledgerFile, other);
    const expOut = path.join(base, "merged.md");
    r = l(["p4", "export", "--out", expOut, "--merge", other]);
    check("export --merge", r.status, 0, (r.stdout || "").trim());
    const md = fs.readFileSync(expOut, "utf8");
    check("merged table has a repo column", /\| # \| ts \| repo \|/.test(md) ? 1 : 0, 1);
    check("merged table has both rows", (md.match(/^\| \d+ \|/gm) || []).length, 2);
    const tampered = path.join(base, "tampered-ledger.jsonl");
    fs.writeFileSync(tampered, fs.readFileSync(other, "utf8").replace('"decision": "allow"', '"decision": "deny"'), "utf8");
    r = l(["p4", "export", "--out", path.join(base, "t.md"), "--merge", tampered]);
    check("merge reports a broken chain", r.status === 0 ? 0 : 1, 1, (r.stderr || "").trim());
    const jsonOut = path.join(base, "ledger.json");
    r = l(["p4", "export", "--out", jsonOut, "--format", "json", "--merge", other]);
    const parsed = fs.existsSync(jsonOut) ? JSON.parse(fs.readFileSync(jsonOut, "utf8")) : [];
    check("export --format json", Array.isArray(parsed) && parsed.length === 2 && parsed[0].hash ? 1 : 0, 1);
    const csvOut = path.join(base, "ledger.csv");
    l(["p4", "export", "--out", csvOut, "--format", "csv"]);
    const csv = fs.readFileSync(csvOut, "utf8").trim().split(/\r?\n/);
    check("export --format csv has a header and one row", csv.length === 2 && csv[0].startsWith("ts,repo,action") ? 1 : 0, 1);
    check("export rejects an unknown format", l(["p4", "export", "--format", "xml"]).status, 2);
    const hrepo = path.join(base, "hint-repo");
    fs.mkdirSync(hrepo, { recursive: true });
    gitOut(["init", "-q", "."], hrepo);
    for (const n of ["a", "b", "c"]) {
      fs.writeFileSync(path.join(hrepo, `${n}.txt`), n, "utf8");
      gitOut(["add", "."], hrepo);
      gitOut(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", n], hrepo);
    }
    run(["init", "--no-ci"], hrepo);
    const hsha = JSON.parse(fs.readFileSync(path.join(hrepo, ".signoff", "installed.json"), "utf8")).sha;
    const hinted = run(["audit", "--range", `${hsha}~2..HEAD`], hrepo);
    check("audit hints pre-install commits", /predate the install point/.test(hinted.stdout) ? 1 : 0, 1, hinted.stdout.trim().replace(/\n/g, " | "));
    check("audit --since-install in fresh repo", run(["audit", "--since-install"], hrepo).status, 0);
    const hooks = path.join(repo, ".git", "hooks");
    check("guard pre-commit hook", fs.existsSync(path.join(hooks, "pre-commit")) ? 1 : 0, 1);
    check("guard commit-msg hook", fs.existsSync(path.join(hooks, "commit-msg")) ? 1 : 0, 1);
    check("guard pre-push hook", fs.existsSync(path.join(hooks, "pre-push")) ? 1 : 0, 1);
    check("guard config", fs.existsSync(path.join(repo, ".signoff", "config.json")) ? 1 : 0, 1);
    check(
      "guard gitignore",
      fs.readFileSync(path.join(repo, ".gitignore"), "utf8").split("\n").includes(".signoff/") ? 1 : 0,
      1
    );
    r = g(["status", "--json"]);
    check("guard status", JSON.parse(r.stdout).installed["pre-commit"] ? 1 : 0, 1);

    fs.writeFileSync(path.join(repo, "docs", "clean.md"), "# clean\n\n40 cases in 3.6 s, 12/12 PASS.\nsecond\n", "utf8");
    git(["add", "-A"], repo);
    r = g(["hook", "pre-push"]);
    check("guard pre-push pass", r.status, 0);
    check("pre-push leaves no marker", fs.existsSync(path.join(repo, ".signoff", "passed")) ? 0 : 1, 1);
    r = g(["hook", "pre-commit"]);
    check("guard hook pass", r.status, 0);
    const markerAfterPass = JSON.parse(fs.readFileSync(path.join(repo, ".signoff", "passed"), "utf8"));
    check("marker mode pass", markerAfterPass.mode, "pass");
    check("marker tree is the staged tree", markerAfterPass.tree, gitOut(["write-tree"], repo).trim());
    check("marker ts is iso", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(markerAfterPass.ts) ? 1 : 0, 1, markerAfterPass.ts);
    r = g(["hook", "pre-commit"]);
    check("guard cache hit", /cached/.test(r.stdout) ? 1 : 0, 1);
    check(
      "marker written on cache hit",
      fs.existsSync(path.join(repo, ".signoff", "passed")) ? 1 : 0,
      1
    );

    fs.writeFileSync(path.join(repo, "docs", "dirty.md"), "# dirty\n\n该方案赋能全链路，闭环彻底解决，已验证。\nagain\n", "utf8");
    git(["add", "-A"], repo);
    r = g(["hook", "pre-commit"]);
    check("guard hook fail closed", r.status, 1);

    r = g(["hook", "pre-commit"], { SIGNOFF_SKIP: "1" });
    check("guard skip allowed", r.status, 0);
    check("guard skip recorded", fs.existsSync(path.join(repo, ".signoff", "skips.log")) ? 1 : 0, 1);
    check(
      "marker mode skip",
      JSON.parse(fs.readFileSync(path.join(repo, ".signoff", "passed"), "utf8")).mode,
      "skip"
    );

    // ------------------------------------------------------------- trailers
    // A real commit: pre-commit records the tree, commit-msg turns it into a line.
    git(["reset", "--hard", "-q"], repo);
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    const treeOf = (rev) => gitOut(["rev-parse", `${rev}^{tree}`], repo).trim();
    const bodyOf = (rev) => gitOut(["log", "-1", "--format=%B", rev], repo);
    const lastLine = (rev) => bodyOf(rev).trim().split(/\r?\n/).pop() || "";

    fs.writeFileSync(path.join(repo, "src", "note.txt"), "hello\n", "utf8");
    git(["add", "-A"], repo);
    let hc = commit(["commit", "-m", "trailer pass"]);
    check("trailer commit exit", hc.status, 0, (hc.stderr || "").trim().split("\n").pop());
    let m = lastLine("HEAD").match(/^Signoff-Pass: ([0-9a-f]{12})$/);
    check("trailer pass appended", m ? 1 : 0, 1, lastLine("HEAD"));
    check("trailer pass matches tree", m && m[1] === treeOf("HEAD").slice(0, 12) ? 1 : 0, 1);
    let ar = run(["audit", "--range", "HEAD~1..HEAD"], repo);
    check("audit pass exit", ar.status, 0);
    check("audit pass state", /^[0-9a-f]{7} pass$/m.test(ar.stdout) ? 1 : 0, 1, ar.stdout.trim().replace(/\n/g, " | "));
    check("audit pass summary", /audit: 1 commits, pass=1 skip=0 missing=0 skipped_merges=0/.test(ar.stdout) ? 1 : 0, 1);
    AUDIT.push(ar.stdout.trim());

    // A stale marker for another tree must never touch a message.
    const mf = path.join(repo, ".git", "MSGTEST");
    const markerFile = path.join(repo, ".signoff", "passed");
    fs.writeFileSync(mf, "mismatch\n", "utf8");
    fs.writeFileSync(
      markerFile,
      JSON.stringify({ tree: "0".repeat(40), mode: "pass", ts: "2026-01-01T00:00:00Z" }) + "\n",
      "utf8"
    );
    r = run(["hook", "commit-msg", mf], repo);
    check("commit-msg mismatch exit", r.status, 0);
    check("commit-msg mismatch untouched", fs.readFileSync(mf, "utf8"), "mismatch\n");
    check("commit-msg mismatch consumes marker", fs.existsSync(markerFile) ? 0 : 1, 1);
    r = run(["hook", "commit-msg", mf], repo);
    check("commit-msg without marker exit", r.status, 0);
    check("commit-msg without marker untouched", fs.readFileSync(mf, "utf8"), "mismatch\n");

    // --no-verify skips both hooks: no trailer, and audit has to say so.
    fs.writeFileSync(path.join(repo, "src", "note.txt"), "hello\nunverified\n", "utf8");
    git(["add", "-A"], repo);
    hc = commit(["commit", "--no-verify", "-m", "no verify"]);
    check("no-verify commit exit", hc.status, 0);
    check("no-verify leaves no trailer", /^Signoff-(Pass|Skip):/m.test(bodyOf("HEAD")) ? 0 : 1, 1);
    ar = run(["audit", "--range", "HEAD~1..HEAD"], repo);
    check("audit missing exit", ar.status, 1);
    check("audit missing state", /^[0-9a-f]{7} missing$/m.test(ar.stdout) ? 1 : 0, 1);
    AUDIT.push(ar.stdout.trim());

    // An explicit skip is recorded, and audit is honest about it.
    fs.writeFileSync(path.join(repo, "src", "note.txt"), "hello\nskipped\n", "utf8");
    git(["add", "-A"], repo);
    hc = commit(["commit", "-m", "skipped"], { SIGNOFF_SKIP: "1" });
    check("skip commit exit", hc.status, 0, (hc.stderr || "").trim().split("\n").pop());
    m = lastLine("HEAD").match(/^Signoff-Skip: ([0-9a-f]{12})$/);
    check("trailer skip appended", m ? 1 : 0, 1, lastLine("HEAD"));
    check("trailer skip matches tree", m && m[1] === treeOf("HEAD").slice(0, 12) ? 1 : 0, 1);
    ar = run(["audit", "--range", "HEAD~1..HEAD"], repo);
    check("audit skip exit", ar.status, 0);
    check("audit skip state", /^[0-9a-f]{7} skip$/m.test(ar.stdout) ? 1 : 0, 1);
    AUDIT.push(ar.stdout.trim());
    check("audit strict fails on skip", run(["audit", "--range", "HEAD~1..HEAD", "--strict"], repo).status, 1);
    const aj = JSON.parse(run(["audit", "--range", "HEAD~1..HEAD", "--json"], repo).stdout);
    check("audit json ok", aj.ok, true);
    check("audit json counts", JSON.stringify(aj.counts), JSON.stringify({ pass: 0, skip: 1, missing: 0 }));
    check("audit json commit state", aj.commits.length === 1 ? aj.commits[0].state : "none", "skip");
    check("audit default range", run(["audit"], repo).status, 0);
    fs.mkdirSync(path.join(base, "notrepo"), { recursive: true });
    check("audit outside repo", run(["audit"], path.join(base, "notrepo")).status, 2);
    check("audit unparsable range", run(["audit", "--range", "nope..nope2"], repo).status, 2);

    // Merges have no single staged tree: counted, never graded.
    const branch = gitOut(["symbolic-ref", "--short", "HEAD"], repo).trim();
    git(["checkout", "-q", "-b", "side"], repo);
    fs.writeFileSync(path.join(repo, "src", "side.txt"), "side\n", "utf8");
    git(["add", "-A"], repo);
    check("side commit exit", commit(["commit", "-m", "side pass"]).status, 0);
    git(["checkout", "-q", branch], repo);
    fs.writeFileSync(path.join(repo, "src", "main.txt"), "main\n", "utf8");
    git(["add", "-A"], repo);
    check("main commit exit", commit(["commit", "-m", "main pass"]).status, 0);
    check("merge commit exit", commit(["merge", "--no-ff", "-m", "merge side", "side"]).status, 0);
    ar = run(["audit", "--range", "HEAD~2..HEAD"], repo);
    check("audit merge exit", ar.status, 0, ar.stdout.trim().replace(/\n/g, " | "));
    check("audit merge skipped", /skipped_merges=1/.test(ar.stdout) ? 1 : 0, 1, ar.stdout.trim().replace(/\n/g, " | "));

    // prepare is refused when the CLI would be absent during install
    const bare = path.join(base, "bare");
    fs.mkdirSync(bare, { recursive: true });
    fs.writeFileSync(path.join(bare, "package.json"), JSON.stringify({ name: "bare", version: "0.0.0" }) + "\n");
    git(["init", "-q"], bare);
    r = run(["init", "--no-ci", "--prepare"], bare, { SIGNOFF_HOME: path.join(base, "bare-home") });
    check("prepare skipped without devDependency", r.status, 0);
    check(
      "prepare not written without devDependency",
      JSON.parse(fs.readFileSync(path.join(bare, "package.json"), "utf8")).scripts ? 0 : 1,
      1
    );

    // ----------------------------------------------- init --prepare / --quiet
    const pkgPath = path.join(repo, "package.json");
    const pkg0 = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg0.scripts = { build: "node -e 0" };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg0, null, 2) + "\n", "utf8");
    r = g(["init", "--dry-run", "--no-ci", "--prepare"]);
    check("prepare dry-run exit", r.status, 0);
    check(
      "prepare dry-run writes nothing",
      JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts.prepare === undefined ? 1 : 0,
      1
    );
    r = g(["init", "--no-ci", "--quiet", "--prepare"]);
    check("init --quiet silent", (r.stdout || "").trim() === "" ? 1 : 0, 1, (r.stdout || "").trim());
    check("init --prepare exit", r.status, 0);
    check("prepare added when absent", JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts.prepare, "signoff init --quiet");
    const pkg1 = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg1.scripts.prepare = "node -e 0";
    fs.writeFileSync(pkgPath, JSON.stringify(pkg1, null, 2) + "\n", "utf8");
    r = g(["init", "--no-ci", "--quiet", "--prepare"]);
    check("prepare merged with old value", JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts.prepare, "node -e 0 && signoff init --quiet");
    r = g(["init", "--no-ci", "--quiet", "--prepare"]);
    check("prepare idempotent", JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts.prepare, "node -e 0 && signoff init --quiet");
    check("prepare added once", (fs.readFileSync(pkgPath, "utf8").match(/signoff init --quiet/g) || []).length, 1);

    // ------------------------------------------------------------ status
    r = g(["status", "--json"]);
    const stj = JSON.parse(r.stdout);
    check("status trailer true", stj.trailer, true);
    check("status commit-msg hook", stj.installed["commit-msg"] ? 1 : 0, 1);
    check("status pre-commit hook", stj.installed["pre-commit"] ? 1 : 0, 1);
    r = g(["status"]);
    check("status human trailer", /^trailer\s+enforced$/m.test(r.stdout) ? 1 : 0, 1, r.stdout.trim().replace(/\n/g, " | "));
    check("status human commit-msg", /^commit-msg\s+installed$/m.test(r.stdout) ? 1 : 0, 1);

    // Trailer edge cases: no marker and a stale marker must both leave the message alone.
    const msgFile = path.join(base, "MSG.txt");
    fs.writeFileSync(msgFile, "subject\n", "utf8");
    r = g(["hook", "commit-msg", msgFile]);
    check("commit-msg without marker exits 0", r.status, 0);
    check("commit-msg without marker adds nothing", fs.readFileSync(msgFile, "utf8").trim(), "subject");
    fs.mkdirSync(path.join(repo, ".signoff"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, ".signoff", "passed"),
      JSON.stringify({ tree: "0".repeat(40), mode: "pass", ts: new Date().toISOString() }),
      "utf8"
    );
    r = g(["hook", "commit-msg", msgFile]);
    check("commit-msg stale marker exits 0", r.status, 0);
    check("commit-msg stale marker adds nothing", fs.readFileSync(msgFile, "utf8").trim(), "subject");
    check("commit-msg stale marker consumed", fs.existsSync(path.join(repo, ".signoff", "passed")) ? 0 : 1, 1);

    r = g(["uninstall"]);
    check("guard uninstall", fs.existsSync(path.join(hooks, "pre-commit")) ? 0 : 1, 1);
    check("uninstall removes commit-msg", fs.existsSync(path.join(hooks, "commit-msg")) ? 0 : 1, 1);
    r = g(["init", "--dry-run", "--no-ci"]);
    check("guard dry-run writes nothing", fs.existsSync(path.join(hooks, "pre-commit")) ? 0 : 1, 1);

    // doctor: a read-only self-check that has to agree with the gates it summarizes.
    const drepo = path.join(base, "doctor-repo");
    fs.mkdirSync(drepo, { recursive: true });
    gitOut(["init", "-q", "."], drepo);
    fs.writeFileSync(path.join(drepo, "a.txt"), "a", "utf8");
    gitOut(["add", "."], drepo);
    gitOut(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "a"], drepo);
    const dhome = path.join(base, "doctor-home");
    const d = (args) => run(args, drepo, { SIGNOFF_HOME: dhome });
    check("--version prints a version", /^\d+\.\d+\.\d+$/.test(run(["--version"]).stdout.trim()) ? 1 : 0, 1);
    check("help carries the current name", /落印/.test(run(["--help"]).stdout) ? 1 : 0, 1);
    check("doctor unguarded repo", d(["doctor"]).status, 1);
    d(["init", "--no-ci"]);
    check("doctor guarded repo", d(["doctor"]).status, 0, d(["doctor", "--quiet"]).stdout.trim());
    const dj = JSON.parse(d(["doctor", "--json"]).stdout);
    check("doctor json ok", dj.ok, true);
    check("doctor json has checks", dj.checks.length > 10 ? 1 : 0, 1);
    check("doctor quiet hides ok lines", /^ok /m.test(d(["doctor", "--quiet"]).stdout) ? 1 : 0, 0);
    check("doctor outside repo", run(["doctor"], path.join(base, "notrepo")).status, 2);
    fs.writeFileSync(
      path.join(drepo, ".signoff", "passed"),
      JSON.stringify({ tree: "a".repeat(40), mode: "pass", ts: new Date().toISOString() }),
      "utf8"
    );
    check("doctor leftover marker warns only", d(["doctor"]).status, 0);
    check("doctor sees the leftover marker", /leftover/.test(d(["doctor", "--quiet"]).stdout) ? 1 : 0, 1);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }

  // ---- zero-touch bootstrap: ensure, the machine layer, and the light guard
  {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-ensure-"));
    try {
      const home = path.join(base, "home");
      const gitcfg = path.join(base, "gitconfig");
      const gitcfgSystem = path.join(base, "gitconfig-system");
      fs.writeFileSync(gitcfg, "", "utf8");
      fs.writeFileSync(gitcfgSystem, "", "utf8");
      // GIT_CONFIG_GLOBAL keeps the machine layer out of the real ~/.gitconfig.
      const env = { SIGNOFF_HOME: home, GIT_CONFIG_GLOBAL: gitcfg, GIT_CONFIG_SYSTEM: gitcfgSystem };
      const repo = path.join(base, "repo");
      fs.mkdirSync(repo, { recursive: true });
      git(["init", "-q"], repo, env);
      git(["config", "user.email", "a@b.c"], repo, env);
      git(["config", "user.name", "t"], repo, env);
      fs.writeFileSync(path.join(repo, "README.md"), "# fixture\n", "utf8");

      const first = run(["ensure"], repo, { ...env, SIGNOFF_NO_BOOTSTRAP: "0" });
      check("ensure exit code", first.status, 0);
      check("ensure writes the pre-commit hook", fs.existsSync(path.join(repo, ".git", "hooks", "pre-commit")), true);
      check("ensure writes config.json", fs.existsSync(path.join(repo, ".signoff", "config.json")), true);
      check("ensure writes installed.json", fs.existsSync(path.join(repo, ".signoff", "installed.json")), true);

      const second = JSON.parse(run(["ensure", "--json"], repo, { ...env, SIGNOFF_NO_BOOTSTRAP: "0" }).stdout);
      check("ensure is idempotent", second.repo.installed, false);
      check("ensure reports the repo guarded", second.repo.ok, true);

      const g = JSON.parse(run(["ensure", "--global", "--json"], repo, env).stdout);
      check("ensure --global ok", g.machine.ok, true);
      check("machine hook written", fs.existsSync(path.join(home, "hooks", "pre-commit")), true);
      const hooksPath = () =>
        spawnSync("git", ["config", "--global", "--get", "core.hooksPath"], {
          cwd: repo,
          encoding: "utf8",
          env: { ...process.env, ...env },
        });
      check("core.hooksPath set", hooksPath().stdout.trim().length > 0 ? 1 : 0, 1);
      run(["uninstall", "--global"], repo, env);
      check("uninstall --global unsets it", hooksPath().status, 1);

      const fresh = (name) => {
        const d = path.join(base, name);
        fs.mkdirSync(d, { recursive: true });
        git(["init", "-q"], d, env);
        git(["config", "user.email", "a@b.c"], d, env);
        git(["config", "user.name", "t"], d, env);
        return d;
      };

      // The machine layer reaches unrepos that never opted in: only P1 runs, nothing is installed.
      const raw = fresh("raw");
      fs.writeFileSync(
        path.join(raw, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }),
        "utf8"
      );
      git(["add", "-A"], raw, env);
      const light = run(["hook", "pre-commit"], raw, { SIGNOFF_HOME: home });
      check("light guard blocks a failing test", light.status, 1);
      check("light guard installs nothing", fs.existsSync(path.join(raw, ".signoff", "config.json")), false);

      const good = fresh("good");
      fs.writeFileSync(
        path.join(good, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }),
        "utf8"
      );
      git(["add", "-A"], good, env);
      check("light guard passes a green test", run(["hook", "pre-commit"], good, { SIGNOFF_HOME: home }).status, 0);

      // A committed signoff.json opts the whole repo in: the clone builds the install itself.
      const shared = fresh("shared");
      fs.writeFileSync(
        path.join(shared, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }),
        "utf8"
      );
      fs.writeFileSync(path.join(shared, "signoff.json"), JSON.stringify({ gates: ["p1", "p2", "p3", "p4", "p5"] }), "utf8");
      git(["add", "-A"], shared, env);
      check("declared repo passes through the machine layer", run(["hook", "pre-commit"], shared, { SIGNOFF_HOME: home }).status, 0);
      check("declared repo installs config", fs.existsSync(path.join(shared, ".signoff", "config.json")), true);
      check("declared repo installs hooks", fs.existsSync(path.join(shared, ".git", "hooks", "pre-commit")), true);

      const sharedBad = fresh("shared-bad");
      fs.writeFileSync(
        path.join(sharedBad, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }),
        "utf8"
      );
      fs.writeFileSync(path.join(sharedBad, "signoff.json"), "{}", "utf8");
      git(["add", "-A"], sharedBad, env);
      check("declared repo blocks a red gate", run(["hook", "pre-commit"], sharedBad, { SIGNOFF_HOME: home }).status, 1);

      // init --share writes the declaration that makes the above work for teammates
      const sharer = fresh("sharer");
      const sr = run(["init", "--share", "--no-ci", "--quiet"], sharer, env);
      check("init --share exit code", sr.status, 0, (sr.stderr || "").trim());
      const decl = JSON.parse(fs.readFileSync(path.join(sharer, "signoff.json"), "utf8"));
      check("init --share writes gates", Array.isArray(decl.gates) && decl.gates.length === 5 ? 1 : 0, 1);
      check("init --share does not pin the runner", decl.test_cmd === undefined ? 1 : 0, 1);

      // A bootstrap during the first commit lands without a sha; a later init repairs it.
      const repair = fresh("repair");
      check("init before the first commit", run(["init", "--no-ci", "--quiet"], repair, env).status, 0);
      const ip = JSON.parse(fs.readFileSync(path.join(repair, ".signoff", "installed.json"), "utf8"));
      check("install point starts without a sha", ip.sha === "" ? 1 : 0, 1);
      fs.writeFileSync(path.join(repair, "a.txt"), "a", "utf8");
      git(["add", "-A"], repair, env);
      // --no-verify: this commit only needs to exist so the install point has a sha; the
      // repo hook would look for a global `signoff` binary the CI runner does not have.
      git(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "first", "--no-verify"], repair, env);
      run(["init", "--no-ci", "--quiet"], repair, env);
      const ip2 = JSON.parse(fs.readFileSync(path.join(repair, ".signoff", "installed.json"), "utf8"));
      check("re-init fills the install point", /^[0-9a-f]{40}$/.test(ip2.sha) ? 1 : 0, 1);
      check("audit --since-install works after the repair", run(["audit", "--since-install"], repair, env).status, 0);

      // ---------------------------------------------------------- P0 features
      // 1. secrets: a staged key fails the gate and is never printed in full.
      const sec = fresh("secrets");
      // The literal is assembled at run time so this file is not itself a hit for the
      // scanner under test (a scanner that trips on its own fixtures gets allowlisted
      // into uselessness).
      const fakeAws = "AKIA" + "1234567890ABCDEF";
      fs.writeFileSync(path.join(sec, "app.js"), `const k = "${fakeAws}";\n`, "utf8");
      git(["add", "-A"], sec, env);
      const sr1 = run(["secrets", "--staged", "--json"], sec, env);
      check("secrets blocks a staged key", sr1.status, 1);
      check("secrets reports one hit", JSON.parse(sr1.stdout).hits, 1);
      const srState = JSON.parse(fs.readFileSync(path.join(sec, ".signoff", "secrets.json"), "utf8"));
      check("secrets names the rule", srState.findings[0].rule, "aws-access-key");
      check("secrets masks the value", !srState.findings[0].match.includes("1234567890ABCDEF"), true);
      fs.writeFileSync(
        path.join(sec, ".signoff", "config.json"),
        JSON.stringify({ secrets: { allow: ["aws-access-key"] } }),
        "utf8"
      );
      check("secrets honours the allowlist", run(["secrets", "--staged"], sec, env).status, 0);
      const secClean = fresh("secrets-clean");
      fs.writeFileSync(path.join(secClean, "a.md"), "# clean\n", "utf8");
      git(["add", "-A"], secClean, env);
      check("secrets passes a clean file", run(["secrets", "--staged"], secClean, env).status, 0);

      // 2. secrets run inside the guard, before the suite.
      const secGuard = fresh("secrets-guard");
      const fakePat = "ghp_" + "abcdefghijklmnopqrstuvwxyz0123456789";
      fs.writeFileSync(path.join(secGuard, "app.js"), `const t = "${fakePat}";\n`, "utf8");
      git(["add", "-A"], secGuard, env);
      const sg = run(["hook", "pre-commit"], secGuard, { SIGNOFF_HOME: home });
      check("guard fails on a staged key", sg.status, 1);
      check("guard names the secrets gate", /secrets/.test(sg.stdout) ? 1 : 0, 1, (sg.stdout || "").trim().split("\n").slice(-12).join(" | "));

      // 3. runner detection beyond npm/pytest.
      const p1lib = require(path.join(ROOT, "lib", "p1.js"));
      const det = (name, file) => {
        const d = fresh("det-" + name + "-" + Date.now().toString(36));
        fs.writeFileSync(path.join(d, file), "x", "utf8");
        return p1lib.defaultCommands(d)[0];
      };
      check("p1 detects go", det("go", "go.mod"), "go test ./...");
      check("p1 detects cargo", det("cargo", "Cargo.toml"), "cargo test --quiet");
      check("p1 detects maven", det("maven", "pom.xml"), "mvn -q test");
      check("p1 detects dotnet", det("dotnet", "app.csproj"), "dotnet test --nologo");
      check("p1 detects elixir", det("elixir", "mix.exs"), "mix test");

      // 4. cache: the same staged tree runs the suite once.
      const cacheRepo = fresh("cache");
      const counter = path.join(cacheRepo, "count.txt");
      fs.writeFileSync(
        path.join(cacheRepo, "package.json"),
        JSON.stringify({ scripts: { test: `node -e "require('fs').appendFileSync('count.txt','x')"` } }),
        "utf8"
      );
      git(["add", "-A"], cacheRepo, env);
      const c1 = run(["p1"], cacheRepo, env);
      check("p1 runs the suite", c1.status, 0);
      check("p1 counter after the first run", fs.existsSync(counter) ? fs.readFileSync(counter, "utf8").length : 0, 1);
      const c2 = run(["p1"], cacheRepo, env);
      check("p1 cache hit on the same tree", /cached/.test(c2.stdout) ? 1 : 0, 1);
      check("p1 cache did not rerun the suite", fs.readFileSync(counter, "utf8").length, 1);
      const c3 = run(["p1"], cacheRepo, { SIGNOFF_HOME: HOME, SIGNOFF_NO_BOOTSTRAP: "1", SIGNOFF_NO_CACHE: "1" });
      check("p1 --no-cache reruns", /cached/.test(c3.stdout) ? 0 : 1, 1);
      check("p1 --no-cache counter grows", fs.readFileSync(counter, "utf8").length, 2);

      // 5. docs-only fast path: a markdown change never pays for the suite.
      const docsRepo = fresh("docsfast");
      fs.mkdirSync(path.join(docsRepo, "docs"), { recursive: true });
      fs.writeFileSync(
        path.join(docsRepo, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }),
        "utf8"
      );
      git(["add", "package.json"], docsRepo, env);
      git(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "pkg", "--no-verify"], docsRepo, env);
      fs.writeFileSync(path.join(docsRepo, "docs", "a.md"), "# note\n", "utf8");
      git(["add", "docs/a.md"], docsRepo, env);
      const d1 = run(["p1"], docsRepo, env);
      check("p1 passes a docs-only change", d1.status, 0);
      check("p1 says it was docs only", /docs only/.test(d1.stdout) ? 1 : 0, 1);
      fs.writeFileSync(path.join(docsRepo, "code.js"), "x", "utf8");
      git(["add", "-A"], docsRepo, env);
      check("p1 runs the suite once code changes", run(["p1"], docsRepo, env).status, 1);

      // 6. signed trailers: the signature travels with the commit and audit checks it.
      const keyDir = path.join(base, "signkey");
      fs.mkdirSync(keyDir, { recursive: true });
      const keyPath = path.join(keyDir, "id");
      const keygen = spawnSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", "t@signoff", "-f", keyPath], {
        encoding: "utf8",
      });
      check("fixture ssh key generated", keygen.status, 0, (keygen.stderr || "").trim());
      const signEnv = { SIGNOFF_HOME: home, SIGNOFF_SIGN_KEY: keyPath, SIGNOFF_NO_BOOTSTRAP: "1" };
      const signed = fresh("signed");
      // A base commit first: audit needs a real HEAD~1 to have a range at all.
      fs.writeFileSync(path.join(signed, "base.txt"), "b", "utf8");
      git(["add", "-A"], signed, env);
      git(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "base", "--no-verify"], signed, env);
      fs.writeFileSync(
        path.join(signed, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }),
        "utf8"
      );
      fs.writeFileSync(path.join(signed, "a.txt"), "a", "utf8");
      check("init --sign exits 0", run(["init", "--sign", "--no-ci", "--quiet"], signed, signEnv).status, 0);
      check("init --sign records a key", fs.existsSync(path.join(signed, ".signoff", "signing_key")) ? 1 : 0, 1);
      const signedCfg = JSON.parse(fs.readFileSync(path.join(signed, ".signoff", "config.json"), "utf8"));
      check("init --sign pins sign_key", typeof signedCfg.sign_key === "string" ? 1 : 0, 1);
      git(["add", "-A"], signed, env);
      check("signed pre-commit", run(["hook", "pre-commit"], signed, signEnv).status, 0);
      const msgRel = ".git/COMMIT_EDITMSG_TEST";
      fs.writeFileSync(path.join(signed, msgRel), "test the signed trailer\n", "utf8");
      check("commit-msg exits 0", run(["hook", "commit-msg", msgRel], signed, signEnv).status, 0);
      const msgText = fs.readFileSync(path.join(signed, msgRel), "utf8");
      check("trailer has Signoff-Pass", /^Signoff-Pass: [0-9a-f]{12}$/m.test(msgText) ? 1 : 0, 1);
      check("trailer has Signoff-Key", /^Signoff-Key: ssh-ed25519 /m.test(msgText) ? 1 : 0, 1);
      check("trailer has Signoff-Sig", /^Signoff-Sig: [A-Za-z0-9+/=]{40,}$/m.test(msgText) ? 1 : 0, 1);
      git(
        ["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-q", "-F", msgRel, "--no-verify"],
        signed,
        env
      );
      const av1 = run(["audit", "--range", "HEAD~1..HEAD", "--verify", "--json"], signed, signEnv);
      check("audit --verify passes", av1.status, 0, (av1.stderr || "").trim());
      check("audit sees a self-signed commit", JSON.parse(av1.stdout).signatures["self-signed"], 1);
      fs.writeFileSync(
        path.join(signed, ".signoff", "allowed_signers"),
        fs.readFileSync(keyPath + ".pub", "utf8"),
        "utf8"
      );
      const av2 = run(["audit", "--range", "HEAD~1..HEAD", "--verify", "--json"], signed, signEnv);
      check("audit verifies against allowed_signers", JSON.parse(av2.stdout).signatures.verified, 1);
      // A tampered tree cannot verify: the signature covers the full tree id.
      const tamper = run(["audit", "--range", "HEAD~1..HEAD", "--verify", "--require-signed", "--json"], signed, signEnv);
      check("audit --require-signed passes when signed", tamper.status, 0);

      // 7. line coverage of the change.
      const covRepo = fresh("cov");
      const lines = [];
      for (let i = 1; i <= 10; i++) lines.push(`const v${i} = ${i};`);
      fs.writeFileSync(path.join(covRepo, "a.js"), lines.join("\n") + "\n", "utf8");
      fs.mkdirSync(path.join(covRepo, "coverage"), { recursive: true });
      const da = [];
      for (let i = 1; i <= 10; i++) da.push(`DA:${i},${i <= 8 ? 1 : 0}`);
      fs.writeFileSync(
        path.join(covRepo, "coverage", "lcov.info"),
        ["SF:a.js", ...da, "end_of_record", ""].join("\n"),
        "utf8"
      );
      git(["add", "-A"], covRepo, env);
      git(["-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "base", "--no-verify"], covRepo, env);
      check("cov fails under the threshold", run(["cov", "--min", "90"], covRepo, env).status, 1);
      check("cov passes over the threshold", run(["cov", "--min", "70"], covRepo, env).status, 0);
      const covJson = JSON.parse(run(["cov", "--min", "70", "--json"], covRepo, env).stdout);
      check("cov reports 80 percent", covJson.pct, 80);
      check("cov reads lcov", covJson.source, "coverage/lcov.info");
      // Diff mode: a change on uncovered lines is the case that matters.
      fs.writeFileSync(path.join(covRepo, "a.js"), lines.join("\n") + "\nconst extra = 11;\n", "utf8");
      git(["add", "a.js"], covRepo, env);
      const covDiff = run(["cov", "--diff", "--base", "HEAD", "--min", "80", "--json"], covRepo, env);
      check("cov diff mode passes with no instrumented change", covDiff.status, 0);
      check("cov diff mode is reported", JSON.parse(covDiff.stdout).mode, "diff");
      check("cov without data exits 2", run(["cov", "--file", "missing.json"], covRepo, env).status, 2);
      check("cov allows missing data", run(["cov", "--file", "missing.json", "--allow-missing"], covRepo, env).status, 0);

      // 8. CI annotations: a finding becomes a line annotation, not a log paragraph.
      const ciRepo = fresh("ci");
      const ciFake = "AKIA" + "1234567890ABCDEF";
      fs.writeFileSync(path.join(ciRepo, "app.js"), `const k = "${ciFake}";\n`, "utf8");
      git(["add", "-A"], ciRepo, env);
      const summaryFile = path.join(base, "step-summary.md");
      const ciRun = run(["secrets", "--staged"], ciRepo, {
        SIGNOFF_HOME: HOME,
        SIGNOFF_NO_BOOTSTRAP: "1",
        GITHUB_ACTIONS: "true",
        GITHUB_STEP_SUMMARY: summaryFile,
      });
      check("CI run fails on the secret", ciRun.status, 1);
      check(
        "CI prints an annotation",
        /^::error file=app\.js,line=1,title=signoff\/aws-access-key::/m.test(ciRun.stdout) ? 1 : 0,
        1,
        (ciRun.stdout || "").trim().split("\n").slice(0, 2).join(" | ")
      );
      check("CI writes a step summary", fs.existsSync(summaryFile) ? 1 : 0, 1);
      check(
        "step summary names the rule",
        fs.existsSync(summaryFile) && /aws-access-key/.test(fs.readFileSync(summaryFile, "utf8")) ? 1 : 0,
        1
      );

      // 9. P5 rule packs: zh stays the default, en is opt-in, both is explicit.
      const enMd = path.join(base, "slop-en.md");
      fs.writeFileSync(enMd, "A seamless and robust platform.\n", "utf8");
      check("p5 zh ignores English slop", run(["p5", enMd], base, env).status, 0);
      check("p5 --pack en flags English slop", run(["p5", "--pack", "en", enMd], base, env).status, 1);
      check("p5 rejects an unknown pack", run(["p5", "--pack", "xx", enMd], base, env).status, 2);
      check("p5 --pack both flags English slop", run(["p5", "--pack", "both", enMd], base, env).status, 1);
      const rulesFile = path.join(base, "rules.json");
      fs.writeFileSync(rulesFile, JSON.stringify({ ai_words: ["powerful"] }), "utf8");
      const customMd = path.join(base, "custom.md");
      fs.writeFileSync(customMd, "This is a powerful tool.\n", "utf8");
      check("p5 rules alone do not fire on en default", run(["p5", "--rules", rulesFile, customMd], base, env).status, 1);
      const noHitMd = path.join(base, "plain.md");
      fs.writeFileSync(noHitMd, "This is a fast tool.\n", "utf8");
      check("p5 custom word does not over-match", run(["p5", "--rules", rulesFile, noHitMd], base, env).status, 0);
      const packRepo = fresh("p5pack");
      fs.mkdirSync(path.join(packRepo, ".signoff"), { recursive: true });
      fs.writeFileSync(path.join(packRepo, ".signoff", "config.json"), JSON.stringify({ p5: { pack: "en" } }), "utf8");
      fs.writeFileSync(path.join(packRepo, "note.md"), "A seamless platform.\n", "utf8");
      check("p5 reads the pack from config", run(["p5", "note.md"], packRepo, env).status, 1);

      // 10. presets: one flag for budget, docs, coverage and the rule pack.
      const preNode = fresh("preset-node");
      check("init --preset node exits 0", run(["init", "--preset", "node", "--no-ci", "--quiet"], preNode, env).status, 0);
      const preCfg = JSON.parse(fs.readFileSync(path.join(preNode, ".signoff", "config.json"), "utf8"));
      check("preset sets coverage", preCfg.coverage && preCfg.coverage.min, 80);
      check("preset sets the p5 pack", preCfg.p5.pack, "both");
      check("preset keeps test_cmd auto-detected", preCfg.test_cmd, null);
      check("preset sets the budget", preCfg.budget, 180);
      const preGo = fresh("preset-go");
      check("init --preset go exits 0", run(["init", "--preset", "go", "--no-ci", "--quiet"], preGo, env).status, 0);
      const goCfg = JSON.parse(fs.readFileSync(path.join(preGo, ".signoff", "config.json"), "utf8"));
      check("go preset has no coverage gate", goCfg.coverage, null);
      check("go preset uses the en pack", goCfg.p5.pack, "en");
      check("init rejects an unknown preset", run(["init", "--preset", "rust", "--no-ci"], fresh("preset-bad"), env).status, 2);

      // 11. editor integration: tasks.json + problem matcher, merged not replaced.
      const edRepo = fresh("editor");
      check("init --editor vscode exits 0", run(["init", "--editor", "vscode", "--no-ci", "--quiet"], edRepo, env).status, 0);
      const tasksPath = path.join(edRepo, ".vscode", "tasks.json");
      const tasksJson = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
      const guardTask = tasksJson.tasks.find((t) => t.label === "signoff: guard");
      check("tasks.json has the guard task", guardTask ? 1 : 0, 1);
      check("guard task has a problem matcher", guardTask && guardTask.problemMatcher[0], "signoff-secret");
      check(
        "problem matcher definitions written",
        fs.existsSync(path.join(edRepo, ".vscode", "signoff-problem-matchers.json")) ? 1 : 0,
        1
      );
      const withMine = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
      withMine.tasks.push({ label: "my task", type: "shell", command: "echo hi" });
      fs.writeFileSync(tasksPath, JSON.stringify(withMine, null, 2), "utf8");
      run(["init", "--editor", "vscode", "--no-ci", "--quiet"], edRepo, env);
      const merged = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
      check("editor merge keeps my task", merged.tasks.filter((t) => t.label === "my task").length, 1);
      check("editor merge does not duplicate", merged.tasks.filter((t) => t.label === "signoff: guard").length, 1);
      check("init rejects an unknown editor", run(["init", "--editor", "emacs", "--no-ci"], fresh("ed-bad"), env).status, 2);
      // 12. runner detection: a JS repo with a tests/ directory is still npm.
      const jsTests = fresh("detect-js");
      fs.writeFileSync(path.join(jsTests, "package.json"), JSON.stringify({ scripts: { test: "node test.js" } }), "utf8");
      fs.mkdirSync(path.join(jsTests, "tests"), { recursive: true });
      fs.writeFileSync(path.join(jsTests, "tests", "a.test.js"), "// js\n", "utf8");
      check("detect: package.json with tests/ is npm", p1lib.detectCommands(jsTests).id, "npm");
      const pyTests = fresh("detect-py");
      fs.mkdirSync(path.join(pyTests, "tests"), { recursive: true });
      fs.writeFileSync(path.join(pyTests, "tests", "test_a.py"), "def test_a():\n    assert True\n", "utf8");
      check("detect: tests/*.py is pytest", p1lib.detectCommands(pyTests).id, "pytest-tests");
      const bareTests = fresh("detect-bare");
      fs.mkdirSync(path.join(bareTests, "tests"), { recursive: true });
      fs.writeFileSync(path.join(bareTests, "tests", "data.json"), "{}", "utf8");
      check("detect: a tests/ dir alone is not pytest", p1lib.detectCommands(bareTests).id, null);

      // 13. Signed checkpoints over the P4 ledger.
      let r;
      // Seed two records in this run's own ledger before signing a checkpoint.
      const seedTicket = (run(["p4", "ask", "--action", "config", "--target", "cp"], repo).stdout.match(/ticket (\w+)/) || [])[1];
      check("p4 seed ticket", typeof seedTicket, "string");
      run(["p4", "confirm", "--ticket", seedTicket, "--decision", "allow", "--detail", "cp"], repo);
      const seed2 = (run(["p4", "ask", "--action", "config", "--target", "cp2"], repo).stdout.match(/ticket (\w+)/) || [])[1];
      run(["p4", "confirm", "--ticket", seed2, "--decision", "allow", "--detail", "cp2"], repo);
      r = run(["p4", "checkpoint", "--no-sign"], repo);
      check("p4 checkpoint writes", r.status, 0);
      r = run(["p4", "verify", "--checkpoint"], repo);
      check("p4 unsigned checkpoint is not a pass", r.status, 1);
      r = run(["p4", "verify", "--checkpoint", "--allow-unsigned"], repo);
      check("p4 --allow-unsigned", r.status, 0);
      r = run(["p4", "checkpoint"], repo);
      check("p4 checkpoint signs", r.status, 0);
      let cpv = JSON.parse(run(["p4", "verify", "--checkpoint", "--json"], repo).stdout);
      check("p4 checkpoint verifies", cpv.ok, true, cpv.state);
      check("p4 checkpoint covers records", cpv.seq > 0, true, String(cpv.seq));
      check("p4 checkpoint is self-signed", cpv.state, "self-signed");
      const cpAnchor = run(["p4", "anchor"], repo).stdout.trim();
      check("p4 anchor format", /^signoff1:\d+:[0-9a-f]{12}:[0-9a-f]{16}$/.test(cpAnchor), true, cpAnchor);
      check("p4 anchor matches checkpoint", cpAnchor, JSON.parse(run(["p4", "checkpoint", "--json"], repo).stdout.trim()).anchor);
      r = run(["p4", "verify", "--checkpoint", "--anchor", "signoff1:9:000000000000:0000000000000000"], repo);
      check("p4 wrong anchor is red", r.status, 1);

      // Trusted key in allowed_signers flips self-signed -> verified.
      const cp = JSON.parse(fs.readFileSync(JSON.parse(run(["p4", "path", "--json"], repo).stdout).checkpoint, "utf8"));
      fs.mkdirSync(path.join(repo, ".signoff"), { recursive: true });
      fs.writeFileSync(path.join(repo, ".signoff", "allowed_signers"), cp.key + "\n", "utf8");
      cpv = JSON.parse(run(["p4", "verify", "--checkpoint", "--json"], repo).stdout);
      check("p4 checkpoint becomes verified", cpv.state, "verified");

      // Truncating the ledger is the attack a plain hash chain cannot see.
      const where = JSON.parse(run(["p4", "path", "--json"], repo).stdout);
      check("p4 path names the ledger", fs.existsSync(where.ledger), true, where.ledger);
      check("p4 path names the checkpoint", where.checkpoint.endsWith("checkpoint.json"), true);
      const ledgerFile = where.ledger;
      const ledgerText = fs.readFileSync(ledgerFile, "utf8");
      const keep = ledgerText.trim().split(/\r?\n/).slice(0, -1).join("\n") + "\n";
      fs.writeFileSync(ledgerFile, keep, "utf8");
      r = run(["p4", "verify", "--checkpoint"], repo);
      check("p4 truncation is red", r.status, 1, r.stdout.includes("records were removed") ? "named" : r.stdout.slice(0, 60));
      fs.writeFileSync(ledgerFile, ledgerText, "utf8");

      // 14. A repo that checkpoints keeps checkpointing on every pass.
      const before = JSON.parse(run(["p4", "verify", "--checkpoint", "--json"], repo).stdout).seq;
      const prevHome = process.env.SIGNOFF_HOME;
      process.env.SIGNOFF_HOME = HOME;
      const guarded = require("../lib/guard").maybeCheckpoint(repo);
      if (prevHome === undefined) delete process.env.SIGNOFF_HOME;
      else process.env.SIGNOFF_HOME = prevHome;
      check("guard keeps a valid checkpoint", guarded && guarded.ok, true, guarded && (guarded.error || ""));
      check("guard does not churn an unchanged ledger", guarded && guarded.seq, before);
      check("guard checkpoint keeps verifying", run(["p4", "verify", "--checkpoint"], repo).status, 0);

      // 15. Distribution manifests exist and name the right entry points.
      const hooks = fs.readFileSync(path.join(__dirname, "..", ".pre-commit-hooks.yaml"), "utf8");
      check("pre-commit hook id", /id: signoff-guard/.test(hooks), true);
      check("pre-commit hook entry", /entry: signoff guard/.test(hooks), true);
      const action = fs.readFileSync(path.join(__dirname, "..", "action.yml"), "utf8");
      check("action installs the cli", /npm i -g signoff-cli/.test(action), true);

// 17. package rename (4.0.0): new mark written, legacy mark still ours
const bootlib = require(path.join(__dirname, "..", "lib", "bootstrap.js"));
check("hook mark names the new package", bootlib.HOOK_MARK.includes("signoff-cli"), true);
check("legacy mark still recognised", bootlib.markedByUs("# generated by dsh-signoff 3.9.4"), true);
check("new mark recognised", bootlib.markedByUs(bootlib.HOOK_MARK + " 4.0.0"), true);
check("foreign hook is not ours", bootlib.markedByUs("#!/bin/sh\nnpx lint-staged"), false);
check("ci template installs the package", /npm i -g --silent signoff-cli@/.test(require(path.join(__dirname, "..", "lib", "guard.js")).CI_BODY), true);
const pkgj = require(path.join(__dirname, "..", "package.json"));
const srvj = require(path.join(__dirname, "..", "server.json"));
check("server.json tracks the package version", srvj.version === pkgj.version, true);
check("server.json package version tracks too", srvj.packages[0].version === pkgj.version, true);
check("server.json names the package", srvj.packages[0].identifier === pkgj.name, true);
check("server.json name matches mcpName", srvj.name === pkgj.mcpName, true);
check("tarball ships the mcp server", pkgj.files.some((f) => String(f).replace(/\/+$/, "") === "integrations"), true);
check("mcp server file exists", fs.existsSync(path.join(__dirname, "..", "integrations", "mcp", "server.js")), true);
check("release gate rejects phantom registry versions", /registry-versions-exist/.test(fs.readFileSync(path.join(__dirname, "..", "lib", "release.js"), "utf8")), true);
check("retire workflow exists", fs.existsSync(path.join(__dirname, "..", ".github", "workflows", "mcp-registry-retire.yml")), true);
check("release gate exports main", typeof require(path.join(__dirname, "..", "lib", "release.js")).main === "function", true);
{
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "mcp-registry.yml"), "utf8");
  check("registry workflow waits for npm", /Wait for npm to serve this version/.test(wf) && /registry\.npmjs\.org/.test(wf), true);
  check("registry workflow rejects a tag that disagrees with server.json", /does not match server\.json version/.test(wf), true);
  check("registry workflow retries the publish", /for attempt in 1 2 3 4/.test(wf), true);
}

      check("action runs signoff", /run: signoff \$\{\{ inputs.args \}\}/.test(action), true);
      check("integrations doc lists actions", /uses: ayuanxx-max\/signoff-cli/.test(fs.readFileSync(path.join(__dirname, "..", "docs", "integrations.md"), "utf8")), true);

      // 16. Deterministic fuzz: parsers must never throw on hostile input, and the
      // hashing primitives must be stable and order-sensitive.
      const covlib = require("../lib/cov");
      const p5lib2 = require("../lib/p5");
      const cplib = require("../lib/checkpoint");
      const secretslib = require("../lib/secrets");
      let seed = 0x51f15e;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      const pick = (alphabet, n) => Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
      let crashes = 0;
      for (let i = 0; i < 120; i++) {
        const junk = pick("\n\r\t %$#{}[]\"'\\;:=<>0aF中é😀", Math.floor(rnd() * 200));
        try {
          const r = covlib.fromLcov(junk);
          // fromLcov returns a per-file map; only a summary carrying pct is range-checked.
          if (!r || typeof r !== "object") crashes += 1000;
          else if (typeof r.pct === "number" && (r.pct < 0 || r.pct > 100)) crashes += 1000;
        } catch (e) {
          crashes += 1;
        }
        try {
          p5lib2.scan(junk);
          secretslib.scan(junk);
        } catch (e) {
          crashes += 1;
        }
        try {
          const a = [junk, pick("abc", 3), "x"];
          const r1 = cplib.merkleRoot(a);
          const r2 = cplib.merkleRoot(a);
          if (r1 !== r2 || !/^[0-9a-f]{64}$/.test(r1)) crashes += 1000;
          if (cplib.merkleRoot([a[1], a[0], a[2]]) === r1 && a[0] !== a[1]) crashes += 100;
        } catch (e) {
          crashes += 1;
        }
      }
      check("parsers survive 120 hostile inputs", crashes, 0);
      check("merkle root is order sensitive", cplib.merkleRoot(["a", "b"]) === cplib.merkleRoot(["b", "a"]), false);
      const p4lib = require("../lib/p4");
      check("digest is stable", p4lib.digest("genesis", { a: 1, b: "x" }), p4lib.digest("genesis", { b: "x", a: 1 }));
      check("digest binds the predecessor", p4lib.digest("genesis", { a: 1 }) === p4lib.digest("other", { a: 1 }), false);
      r = run(["p4", "verify", "--checkpoint"], repo);
      check("p4 ledger restored", r.status, 0);

      // A BOM from a Windows editor must not look like corruption.
      fs.writeFileSync(ledgerFile, "\uFEFF" + ledgerText, "utf8");
      check("p4 tolerates a BOM", run(["p4", "verify"], repo).status, 0);
      fs.writeFileSync(ledgerFile, ledgerText, "utf8");
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }

  // 18. `signoff report`: one self-contained, read-only page — a verdict, a month
  // calendar, one-at-a-time tasks — plus the same data as JSON.
    // ==== selftest shard split ====
  {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-report-"));
    try {
      const repo = buildRepo(base);
      const out = path.join(base, "report.html");
      const r = run(["report", "--html", "--out", out], repo);
      check("report --html exits 0", r.status, 0, (r.stderr || "").slice(0, 80));
      const html = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
      check("report writes its file", fs.existsSync(out), true);
      check("report is one html document", /^<!doctype html>/i.test(html), true);
      check("report inlines css", /<style>/.test(html), true);
      check("report loads no external asset", !/(?:src|href)="(?:https?:)?\/\//.test(html), true);
      check(
        "report names all seven checks",
        ["测试", "覆盖率", "并发任务", "危险动作", "文档", "密钥", "发布"].every((l) => html.includes(l)),
        true
      );
      check("report has no form control", /<form|type="checkbox"|type="submit"|<input/.test(html), false);
      check(
        "every button is navigation",
        (html.match(/<button/g) || []).length === (html.match(/<button[^>]*data-step/g) || []).length,
        true
      );

      // 语种：--lang 决定页面语言（auto 跟随系统），未知值报用法错；词表必须覆盖所有 T(...)。
      const enOut = path.join(base, "report-en.html");
      const rEn = run(["report", "--html", "--lang", "en", "--out", enOut], repo);
      const enHtml = fs.existsSync(enOut) ? fs.readFileSync(enOut, "utf8") : "";
      check("report --lang en exits 0", rEn.status, 0, (rEn.stderr || "").slice(0, 80));
      check("en page declares its language", /<html lang="en"/.test(enHtml), true);
      check("en page translates the chrome", /generated/.test(enHtml) && /SignOff/.test(enHtml) && !/生成于|现在不能发|现在可以发/.test(enHtml), true);
      check("zh page stays chinese", /<html lang="zh-CN"/.test(html) && /生成于/.test(html), true);
      const rDe = run(["report", "--html", "--lang", "de", "--out", path.join(base, "report-de.html")], repo);
      check("unknown --lang is a usage error", rDe.status, 2, (rDe.stderr || "").slice(0, 80));
      const i18n = require(path.join(ROOT, "lib", "i18n.js"));
      const srcText = fs.readFileSync(path.join(ROOT, "lib", "report.js"), "utf8");
      const missing = [...srcText.matchAll(/T\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1].replace(/\\"/g, '"')).filter((k) => !(k in i18n.EN));
      check("every wrapped string has an english entry", missing.length, 0, missing.slice(0, 6).join(" | "));
      check("page script never leaves the file", !/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(html), true);
      check("hero text is not double-escaped", /&lt;b&gt;/.test(html), false);
      check("page is dark by default", /--bg:#0e1013/.test(html), true);
      check("dark page keeps readable ink", /--ink:#e9eaed/.test(html), true);
      check("dark page has no light sheet", /background:\s*#fafafa/i.test(html), false);
      check("page shows guard health", /守卫有没有在真的保护你/.test(html), true);

      const parsed = JSON.parse(run(["report", "--json"], repo).stdout);
      check("report --json is machine readable", !!(parsed && Array.isArray(parsed.gates)), true);
      check("report --json keeps seven checks", parsed.gates.length, 7);
      check("seven checks include release", parsed.gates.some((g) => g.id === "release"), true);
      check("release checks the manifests", /清单/.test((parsed.gates.find((g) => g.id === "release") || {}).detail || ""), true);
      check("report --json carries events", Array.isArray(parsed.events), true);
      check("report --json carries tasks", Array.isArray(parsed.tasks), true);
    check("report names the project", typeof parsed.project === "string" && parsed.project.length > 0, true);
    check(
      "every task label starts with the project",
      parsed.tasks.length === 0 || parsed.tasks.every((t) => String(t.label || "").startsWith(parsed.project)),
      true,
      (parsed.tasks[0] || {}).label
    );
    const versioned = parsed.tasks.filter((t) => /\d+\.\d+\.\d+/.test(String(t.label || "")));
    check(
      "versioned tasks read as a project update",
      versioned.length === 0 || versioned.every((t) => /\u9879\u76ee\u66f4\u65b0 \d+\.\d+\.\d+ \u7248/.test(t.label)),
      true,
      (versioned[0] || {}).label
    );
    const marks = (parsed.events || []).filter((e) => e.kind === "mark" && /\u6700\u8fd1\u4e00\u6b21\u8dd1\u95f8/.test(String(e.detail)));
    check(
      "last gate run is labelled by project",
      marks.length === 0 || marks.every((m) => String(m.label).startsWith(parsed.project)),
      true,
      (marks[0] || {}).label
    );
      check("report --json carries a verdict", ["blocked", "ready", "unknown"].includes(parsed.verdict), true);

  // 判定措辞：说的是「哪几项没过」，不是「谁准你发」。
  check("headline counts gates, not permission", /项/.test(parsed.headline || "") && !/不能发|可以发/.test(parsed.headline || ""), true, parsed.headline);
  {
    const panelSrc = fs.readFileSync(path.join(__dirname, "..", "integrations", "dsh-panel", "client.js"), "utf8");
    check("panel badge drops the permission wording", /不能发|可以发/.test(panelSrc), false);
    check("panel follows the browser language", /navigator\.language/.test(panelSrc) && /blocked: "failed"/.test(panelSrc), true);
    // Token 与费用要落在用户指着的那一行：过闸率后面接金额，0 或读不到就不写。
    const panelHost = fs.readFileSync(path.join(__dirname, "..", "integrations", "dsh-panel", "index.js"), "utf8");
    check("panel carries per-task token cost", panelHost.includes("tokens: t.tokens") && panelHost.includes("cost: t.cost"), true);
    check("panel appends the cost after the pass rate", panelSrc.includes("t.cost > 0") && panelSrc.includes("money(t.cost)"), true);
    check("panel keeps sub-cent spend visible", panelSrc.includes("v < 0.01"), true);
    check("panel labels the amount", panelSrc.includes("M.cost") && panelSrc.includes("money(t.cost)"), true);
    check("panel names the amount in both languages", panelSrc.includes('cost: "费用"') && panelSrc.includes('cost: "cost"'), true);
    {
      // 服务端拼行：report.json 里的 tokens/cost 必须原样出现在 taskRows 里，行里才有金额可显示。
      const { pathToFileURL } = require("url");
      const panelUrl = pathToFileURL(path.join(__dirname, "..", "integrations", "dsh-panel", "index.js")).href;
      const probe = path.join(base, "panel-probe.mjs");
      const fixture = {
        tasks: [
          { id: "fix", label: "fix SignOff 项目更新 4.1.1 版", count: 9, passed: 9, rate: 100, tokens: 2068623, cost: 0.0191 },
          { id: "plain", label: "没有账单的一组", count: 2, passed: 2, rate: 100 },
        ],
      };
      fs.writeFileSync(
        probe,
        "import { card } from " + JSON.stringify(panelUrl) + ";\n" +
          'const row = card("s", {}, ' + JSON.stringify(fixture) + ");\n" +
          "console.log(JSON.stringify(row.taskRows));\n",
        "utf8"
      );
      const rows = JSON.parse(spawnSync(process.execPath, [probe], { encoding: "utf8" }).stdout || "[]");
      check("panel row carries the task cost", rows[0] && rows[0].cost, 0.0191);
      check("panel row carries the task tokens", rows[0] && rows[0].tokens, 2068623);
      check("panel row without usage stays zero", rows[1] && rows[1].cost, 0);
    }
  }
      const anyRed = parsed.gates.some((g) => g.ran && g.ok === false);
      check("verdict follows the gates", parsed.verdict === "blocked", anyRed);
      check("blockers are explained", parsed.verdict !== "blocked" || parsed.blockers.length > 0, true);
      check(
        "every blocker carries a fix",
        (parsed.blockers || []).every((b) => typeof b.fix === "string" && b.fix.length > 0),
        true
      );
      check("summary counts commits", typeof parsed.summary.commits, "number");
      check("health tells the guarded span", typeof parsed.health.guarded, "number");
      check("health rate is a share", parsed.health.rate === null || (parsed.health.rate >= 0 && parsed.health.rate <= 100), true);
      check("health counts bypasses", typeof parsed.health.unmarkedTotal, "number");

      check("page has a month calendar", /id="cal"/.test(html), true);
      check("calendar cells carry dates", /data-day="\d{4}-\d{2}-\d{2}"/.test(html), true);
      check("calendar marks the default day", /class="[^"]*today/.test(html), true);
      check("no-js default shows today", new RegExp(`id="day-label">${parsed.today}`).test(html), true);
      check("calendar can page months", /data-step="-1"/.test(html) && /data-step="1"/.test(html), true);
      check("page lists tasks as collapsible groups", /<details class="task"/.test(html), true);
      check("tasks start collapsed", /<details class="task"[^>]*\bopen\b/.test(html), false);

      const rep = require("../lib/report.js");
      check("report escapes html", rep.escapeHtml(`<b x="1">&'`), "&lt;b x=&quot;1&quot;&gt;&amp;&#39;");
      check(
        "report escapes the repo name",
        rep.renderHtml(Object.assign({}, parsed, { repoName: `<img src=x onerror=alert(1)>` })).includes("<img src=x"),
        false
      );

      const g1 = JSON.parse(run(["report", "--json", "--gate", "p1"], repo).stdout);
      check("--gate keeps one check", g1.gates.length, 1);
      check("--gate is echoed as a filter", g1.filters.gate, "p1");
      check("--gate accepts release", run(["report", "--json", "--gate", "release"], repo).status, 0);
      check("bad --gate is a usage error", run(["report", "--gate", "p9"], repo).status, 2);
      const oneDay = JSON.parse(run(["report", "--json", "--days", "1"], repo).stdout);
      check("--days narrows the range", oneDay.range.since, oneDay.range.until);
      const sha = (gitOut(["rev-parse", "--short", "HEAD"], repo) || "").trim();
      const bySha = JSON.parse(run(["report", "--json", "--task", sha], repo).stdout);
      check("--task accepts a sha", bySha.filters.task, sha);
      check("--task really filters", JSON.parse(run(["report", "--json", "--task", "zzz-nothing"], repo).stdout).events.length, 0);

      const hd = run(["report", "-h"], repo);
      // trend / heat / task rate / would-block / multi-repo
      check("page shows the run trend", /跑闸趋势/.test(html), true);
      check("trend covers every gate", (parsed.trend || []).length, 7);
      check("trend rows carry a series", (parsed.trend || []).every((x) => Array.isArray(x.series)), true);
      check("tasks carry a pass rate", (parsed.tasks || []).every((x) => x.rate === null || typeof x.rate === "number"), true);
      check("heat zones are listed", Array.isArray(parsed.heat), true);
      check("riskiest groups are listed", Array.isArray(parsed.riskiest), true);
      const wb = JSON.parse(run(["report", "--json", "--would-block"], repo).stdout);
      check("--would-block judges secrets", !!(wb.wouldBlock.gates || []).find((g) => g.gate === "secrets"), true);
      check("--would-block judges docs", !!(wb.wouldBlock.gates || []).find((g) => g.gate === "p5"), true);
      check("--would-block names what still needs a real run", (wb.wouldBlock.untested || []).length, 3);
      const wbRun = run(["report", "--html", "--would-block"], repo);
      check("--would-block renders", wbRun.status, 0);
      check("preview section lands in the page", /如果现在提交/.test(fs.readFileSync(path.join(repo, ".signoff", "report.html"), "utf8")), true);
      const multi = JSON.parse(run(["report", "--json", "--repos", repo], repo).stdout);
      check("--repos collects repositories", multi.multi, true);
      check("--repos keeps one entry", (multi.repos || []).length, 1);
      check("--repos entries carry a verdict", ["blocked", "ready", "unknown"].includes((multi.repos[0] || {}).verdict), true);

      check("report -h exits 0", hd.status, 0);
      check("report -h names the flags", /--html/.test(hd.stdout) && /--task/.test(hd.stdout), true);
      const r2 = run(["report"], repo);
      check("report defaults to --html", r2.status, 0, (r2.stderr || "").slice(0, 80));
      // --mount: a fixed, discoverable place for other machines and other agents
      const mdir = path.join(base, "mount");
      const mr = run(["report", "--html", "--mount", mdir], repo);
      check("--mount exits 0", mr.status, 0, (mr.stderr || "").slice(0, 80));
      check("--mount writes an index", fs.existsSync(path.join(mdir, "index.html")), true);
      const mm = JSON.parse(run(["report", "--json", "--mount", mdir], repo).stdout);
      check("--mount reports where it went", !!mm.mounted.slug, true);
      check("--mount writes the page", fs.existsSync(path.join(mdir, mm.mounted.slug, "latest.html")), true);
      check("--mount keeps machine readable copy", fs.existsSync(path.join(mdir, mm.mounted.slug, "report.json")), true);
      const idx = JSON.parse(fs.readFileSync(path.join(mdir, "index.json"), "utf8"));
      check("--mount records the repo in the index", !!idx.repos[mm.mounted.slug], true);
      check("--mount index links the page", /latest\.html/.test(fs.readFileSync(path.join(mdir, "index.html"), "utf8")), true);
      run(["report", "--html", "--mount", mdir], repo);
      const idx2 = JSON.parse(fs.readFileSync(path.join(mdir, "index.json"), "utf8"));
      check("--mount is idempotent per repo", Object.keys(idx2.repos).length, 1);
      check("default report lands in .signoff", fs.existsSync(path.join(repo, ".signoff", "report.html")), true);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }

  // 19. The written contract: one canonical file, thin pointers for every agent
  // convention, and a runtime entry point that ships with the package.
  {
    const pkgRoot = path.join(__dirname, "..");
    const contractPath = path.join(pkgRoot, "docs", "REPORT-CONTRACT.md");
    const contract = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, "utf8") : "";
    check("contract exists", fs.existsSync(contractPath), true);
    check("contract numbers its clauses", Array.from({ length: 10 }, (_, i) => `C${i + 1}`).every((id) => contract.includes(`### ${id}`) || contract.includes(id)), true);
    check("contract is platform neutral", !/[A-Za-z]:\\Users|\/home\/|Administrator/.test(contract), true);
    check("contract names the seven checks", ["测试", "覆盖率", "并发任务", "危险动作", "文档", "密钥", "发布"].every((l) => contract.includes(l)), true);

    const pointers = [
      "AGENTS.md",
      "CLAUDE.md",
      path.join(".github", "copilot-instructions.md"),
      path.join(".cursor", "rules", "signoff-report.mdc"),
    ];
    for (const rel of pointers) {
      const file = path.join(pkgRoot, rel);
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      check(`pointer exists: ${rel}`, fs.existsSync(file), true);
      check(`pointer is thin: ${rel}`, text.split("\n").length <= 60, true);
      check(`pointer points home: ${rel}`, text.includes("docs/REPORT-CONTRACT.md"), true);
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
    check("contract ships in the package", (pkg.files || []).includes("docs/"), true);

    const printed = run(["report", "--contract"], pkgRoot);
    check("--contract exits 0", printed.status, 0, (printed.stderr || "").slice(0, 80));
    check("--contract prints the file", printed.stdout.trim() === contract.trim(), true);
    check("--contract works outside a repo", run(["report", "--contract"], os.tmpdir()).status, 0);
  }

  // lib/out.js: a document larger than a pipe buffer must arrive whole. Before this
  // helper the tail of a big --json report could be lost when the process exited
  // straight after writing (macos-latest, node 20).
  {
    const bigSrc =
      'require(' + JSON.stringify(path.join(__dirname, "..", "lib", "out.js")) + ').write("x".repeat(400000));';
    const big = spawnSync(process.execPath, ["-e", bigSrc], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    check("a large document reaches the reader", big.stdout.length, 400000);
    check("the writer leaves the exit code alone", run(["report", "--gate", "p9"], os.tmpdir()).status, 2);
  }

  // 场景卡是覆盖率声明：卡里点名的每个断言，都必须是这条自测里真实存在的 check。
  {
    // 读 selftest.js 本身而不是 __filename：并行跑分片时 __filename 是临时分片文件，
    // 拿它当"全套用例的源码"会把另一段的用例误判成伪造的。
    const source = fs.readFileSync(path.join(__dirname, "selftest.js"), "utf8");
    const sdir = path.join(__dirname, "..", "verify", "scenarios");
    const files = fs.existsSync(sdir) ? fs.readdirSync(sdir).filter((f) => f.endsWith(".json")).sort() : [];
    check("scenario cards exist", files.length >= 3, true, `${files.length} files`);
    const claims = [];
    const forged = [];
    for (const f of files) {
      const card = JSON.parse(fs.readFileSync(path.join(sdir, f), "utf8"));
      for (const c of card.checks || []) {
        claims.push(c.name);
        if (source.indexOf('check("' + c.name + '"') === -1) forged.push(`${f}: ${c.name}`);
      }
    }
    check("scenario checks are real assertions", forged.length, 0, forged.slice(0, 3).join(" | "));
    check("scenario cards measure real coverage", claims.length >= 20, true, `${claims.length} checks`);
  }

  // 同一个仓库的两种写法不能被判成两个仓库：npm 规范成 git+https://….git，server.json 写 https://…。
  {
    const rel = require(path.join(__dirname, "..", "lib", "release.js"));
    check("repo urls compare by target, not spelling", rel.sameRepo("git+https://github.com/a/b.git", "https://github.com/a/b/"), true);
    check("different repos still differ", rel.sameRepo("https://github.com/a/b", "https://github.com/a/c"), false);
  }

  // 架构自检必须真的看到依赖：listJs() 以前在 Windows 上产出反斜杠路径，与 requiresOf() 的
  // lib/x.js 对不上，依赖图整张为空，四条规则在这台机器上空转（Linux CI 才是第一次真跑）。
  {
    const ah = spawnSync(process.execPath, [path.join(__dirname, "..", "tools", "arch-health.mjs")], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, SIGNOFF_LANG: "zh" },
    });
    const out = (ah.stdout || "") + (ah.stderr || "");
    check("arch-health exits clean", ah.status, 0, out.trim().split("\n").slice(-1)[0]);
    check("arch-health reports posix paths", /lib\/report\.js/.test(out) && !/lib\\report\.js/.test(out), true);
    check("arch-health does not mistake lazy requires for cycles", /\[R1\]/.test(out), false);
    // 面板「一页 + 满页才给完整页面」，用极小的 React 桩真渲染一遍（见 test/panel-smoke.js）
    const panel = spawnSync(process.execPath, [path.join(ROOT, "test", "panel-smoke.js")], {
      cwd: ROOT,
      encoding: "utf8",
      env: Object.assign({}, process.env, { SIGNOFF_LANG: "zh" }),
    });
    let panelOut = {};
    try {
      panelOut = JSON.parse(String(panel.stdout || "{}").trim().split("\n").pop());
    } catch (e) {
      panelOut = {};
    }
    check("panel renders one page then offers the full page", panel.status, 0, String(panel.stderr || "").slice(0, 200));
    check("panel hides the button when everything fits", panelOut.compact, false);

    // 文档：用户向的五篇都有英文孪生件，README 也有
    const twins = ["docs/gates.md", "docs/integrations.md", "docs/trust.md", "docs/COMPARISON.md", "docs/SURFACES.md"];
    for (const rel of twins) {
      check(`${rel} has an English twin`, fs.existsSync(path.join(ROOT, rel.replace(/\.md$/, ".en.md"))), true);
    }
    check("README has an English twin", fs.existsSync(path.join(ROOT, "README.en.md")), true);

    // 文档：相对链接一个都不能断
    const mdFiles = [];
    (function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        if (name === "node_modules" || name === ".git" || name === "archive") continue;
        const abs = path.join(dir, name);
        const st = fs.statSync(abs);
        if (st.isDirectory()) walk(abs);
        else if (name.endsWith(".md")) mdFiles.push(abs);
      }
    })(ROOT);
    const broken = [];
    for (const file of mdFiles) {
      const text = fs.readFileSync(file, "utf8");
      const re = /\]\(([^)\s]+)\)/g;
      let m;
      while ((m = re.exec(text))) {
        const link = m[1];
        if (/^(https?:|mailto:|#)/.test(link)) continue;
        const target = path.resolve(path.dirname(file), link.split("#")[0]);
        if (!fs.existsSync(target)) broken.push(`${path.relative(ROOT, file)} -> ${link}`);
      }
    }
    check("docs have no broken relative links", broken.length, 0, broken.slice(0, 3).join(" | "));

    // agent 侧：装的命令必须真实存在，别把不存在的 `signoff run` 写进 SKILL
    const skill = fs.readFileSync(path.join(ROOT, "integrations", "skill", "SKILL.md"), "utf8");
    check("SKILL.md does not teach the removed run command", /signoff run\b/.test(skill), false);
    check("SKILL.md teaches the guard command", /signoff guard/.test(skill), true);
    const mcpServer = fs.readFileSync(path.join(ROOT, "integrations", "mcp", "server.js"), "utf8");
    check("MCP run tool forwards to guard", /case "signoff_run":[\s\S]{0,80}\["guard"\]/.test(mcpServer), true);
check(
  "MCP exposes review/dispute/patterns/fix",
  ["signoff_review", "signoff_dispute", "signoff_patterns", "signoff_fix"].every((t) => mcpServer.includes('name: "' + t + '"')),
  true
);
check("MCP review tool verifies by default", /case "signoff_review":[\s\S]{0,600}"--verify"/.test(mcpServer), true);
check("MCP fix tool is preview-only", /case "signoff_fix":[\s\S]{0,600}"--check"/.test(mcpServer), true);

    // 中英同构：中文正文之后必须原样跟着英文全文（源头是 .en.md，工具同步、自测防漂移）
    const bi = spawnSync(process.execPath, [path.join(ROOT, "tools", "sync-bilingual.mjs"), "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    check("every Chinese doc embeds its English twin", bi.status, 0, String(bi.stderr || "").slice(0, 200));
    for (const rel of ["README.md", "docs/gates.md", "docs/trust.md"]) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      check(`${rel} carries an embedded English section`, /<!-- EN-BEGIN/.test(text) && /^## English\r?$/m.test(text), true);
    }

    // 架构图与工作原理图必须留在中英文说明里，且文件真的存在
    const zhReadme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    const enReadme = fs.readFileSync(path.join(ROOT, "README.en.md"), "utf8");
    for (const name of ["signoff-1-capability.png", "signoff-4-flow.png"]) {
      check(`README keeps ${name}`, zhReadme.includes(`docs/diagrams/${name}`), true);
      check(`${name} exists`, fs.existsSync(path.join(ROOT, "docs", "diagrams", name)), true);
    }
    for (const name of ["signoff-1-capability-en.png", "signoff-4-flow-en.png"]) {
      check(`README.en keeps ${name}`, enReadme.includes(`docs/diagrams/${name}`), true);
      check(`${name} exists`, fs.existsSync(path.join(ROOT, "docs", "diagrams", name)), true);
    }

    // 许可与法律：著作权人是项目名义，NOTICE 随包，法律边界文档在位
    const license = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8");
    check("LICENSE names the project, not a person", /Copyright \(c\) 2026 SignOff contributors/.test(license), true);
    check("LICENSE is still MIT", /^MIT License/.test(license) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(license), true);
    check("NOTICE ships with the package", fs.existsSync(path.join(ROOT, "NOTICE")), true);
    check("legal boundary is documented", fs.existsSync(path.join(ROOT, "docs", "legal.md")) && fs.existsSync(path.join(ROOT, "docs", "legal.en.md")), true);
    check("release and commercial model is documented", fs.existsSync(path.join(ROOT, "docs", "release-model.md")), true);

    // 首行徽章不能丢：CI 状态、npm 版本、下载量、Node 版本、许可
    // 4.6.3 起说明页第一行是居中的标志，徽章紧随标题，所以从标题行开始取窗口。
    for (const rel of ["README.md", "README.en.md"]) {
      const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
      const top = lines.slice(0, 12).join("\n");
      const titleAt = lines.findIndex((l) => /^#\s/.test(l));
      const head = lines.slice(Math.max(0, titleAt), Math.max(0, titleAt) + 8).join("\n");
      check(`${rel} opens with the centred mark`, top.includes('align="center"') && top.includes("assets/brand/signoff-mark.svg"), true);
      check(`${rel} points at the notices instead of duplicating them`, /NOTICE/.test(top) && /TRADEMARK\.md/.test(top), true);
      check(`${rel} keeps the title above the badges`, titleAt >= 0 && titleAt < 12, true);
      for (const badge of ["npm/v/signoff-cli", "npm/dw/signoff-cli", "node/v/signoff-cli", "workflows/ci.yml/badge.svg", "npm/l/signoff-cli"]) {
        check(`${rel} keeps the ${badge} badge`, head.includes(badge), true);
      }
    }
    // 商标主张与主体占位：标 ™ 不标 ®，占位名有出处，方案有文档
    for (const rel of ["README.md", "README.en.md"]) {
      const doc = fs.readFileSync(path.join(ROOT, rel), "utf8");
      check(`${rel} claims the mark with TM`, /SignOff\u2122/.test(doc), true);
      check(`${rel} never claims a registered mark`, /SignOff\u00ae|\u00ae 2026 SignOff/.test(doc), false);
    }
    // 中文正文必须写在 EN-BEGIN 之前，否则同步会把附录当英文块覆盖掉
    const legalHead = fs.readFileSync(path.join(ROOT, "docs", "legal.md"), "utf8").split("<!-- EN-BEGIN")[0];
    check("legal.md keeps the Chinese trademark appendix", /商标主张/.test(legalHead), true);
    // 发布可验证：provenance 与 OIDC 是发布流水线的硬要求
    const pubWf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "publish.yml"), "utf8");
    check("publish workflow asks npm for provenance", /npm publish --provenance/.test(pubWf), true);
    check("publish workflow grants id-token for provenance", /id-token: write/.test(pubWf), true);
    check("publish workflow refuses a tag/version mismatch", /version/.test(pubWf) && /process\.exit\(1\)/.test(pubWf), true);
    // 版本号出现在四份文档里，必须与 package.json 一致（4.6.2 的 CITATION 曾落后三个版本）
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
    const topChangelog = (fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8").match(/^##\s+v?(\d+\.\d+\.\d+)/m) || [])[1];
    check("CHANGELOG top matches package.json", topChangelog, pkgVersion);
    const cited = (fs.readFileSync(path.join(ROOT, "CITATION.cff"), "utf8").match(/^version:\s*"?([0-9.]+)"?\s*$/m) || [])[1];
    check("CITATION version matches package.json", cited, pkgVersion);
    const relSrc = fs.readFileSync(path.join(ROOT, "lib", "release.js"), "utf8");
    for (const id of ["changelog-version", "citation-version", "git-tag", "surface-encoding", "npm-desc-encoding"]) {
      check(`release gate enforces ${id}`, relSrc.includes(`"${id}"`), true);
    }
    // CI 模板：本仓库自己就是 signoff-cli，npx 会把 spec 去重到本地项目、什么都不装
    const guardMod = require(path.join(ROOT, "lib", "guard.js"));
    const codeLines = (txt) => txt.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n");
    check("ci: the template installs the cli", /npm i -g --silent signoff-cli@/.test(guardMod.CI_BODY), true);
    check("ci: the template runs no npx command", /npx/.test(codeLines(guardMod.CI_BODY)), false);
    // the committed blob, not the worktree: an older installed cli rewrites the file on
    // a fresh clone (that is the bug this asserts against), so the worktree proves nothing
    let ownWf = "";
    try {
      ownWf = require("child_process").execFileSync("git", ["show", "HEAD:.github/workflows/signoff.yml"], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      ownWf = "";
    }
    check("ci: this repo's own workflow runs no npx command", /npx/.test(codeLines(ownWf)), false);

    // A 4.8.0 release spent 15 minutes on one job that hung on macOS and was only killed
    // by the runner's own ceiling. Three things have to be written down, or the next
    // release waits the same way: a wall-clock bound on the suite job, no second full
    // suite on tag pushes, and cancelling superseded runs on the same branch.
    // Read the committed blobs, not the worktree: `signoff guard --ci` runs an installed cli
    // that regenerates signoff.yml from its own template, so on CI the worktree copy is the
    // old template and these assertions would fail on a file nobody edited.
    const headBlob = (p) => {
      try {
        return require("child_process").execFileSync("git", ["show", "HEAD:" + p], { cwd: ROOT, encoding: "utf8" });
      } catch (e) {
        return "";
      }
    };
    const wfCi = headBlob(".github/workflows/ci.yml");
    const wfOwnWt = headBlob(".github/workflows/signoff.yml");
    check("ci: the suite job has a wall-clock bound", /timeout-minutes:\s*\d+/.test(wfCi), true);
    check(
      "ci: the self-check workflow does not run again on a tag push",
      /branches:\s*\[master\]/.test(wfOwnWt) && !/^on: \[push, pull_request\]/m.test(wfOwnWt),
      true
    );
    check("ci: the self-check workflow cancels superseded runs", /concurrency:[\s\S]{0,120}cancel-in-progress:\s*true/.test(wfOwnWt), true);

    // 路径里有中文/空格时，闸门与存证都必须看见它：git 默认 quotepath 会把这类路径
    // 转义成八进制，正则一啃人类可读输出，中文路径就成了"没被碰过"——删断言还能绿。
    const p0base = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-paths-"));
    const p0repo = path.join(p0base, "repo");
    fs.mkdirSync(path.join(p0repo, "tests"), { recursive: true });
    const p0env = { SIGNOFF_NO_MACHINE: "1", SIGNOFF_NO_BOOTSTRAP: "1" };
    git(["init", "-q"], p0repo);
    git(["config", "user.email", "t@example.com"], p0repo);
    git(["config", "user.name", "t"], p0repo);
    const cnTest = "tests/中文 用例.test.js";
    const three = "assert.strictEqual(1, 1);\nassert.strictEqual(2, 2);\nassert.strictEqual(3, 3);\n";
    fs.writeFileSync(path.join(p0repo, cnTest), three, "utf8");
    fs.writeFileSync(path.join(p0repo, "run.js"), "process.exit(0);\n", "utf8");
    git(["add", "-A"], p0repo);
    git(["commit", "-qm", "base"], p0repo);
    fs.writeFileSync(path.join(p0repo, "filler.txt"), "f\n", "utf8");
    git(["add", "-A"], p0repo);
    git(["commit", "-qm", "filler"], p0repo);
    fs.writeFileSync(path.join(p0repo, cnTest), "assert.strictEqual(1, 1);\n", "utf8");
    git(["add", "-A"], p0repo);

    const cnStatus = require(path.join(ROOT, "lib", "integrity.js")).check({ cwd: p0repo });
    check("integrity: a non-ASCII test path is still seen", cnStatus.touched.length, 1);
    check("integrity: deleting assertions in a Chinese-named test file is a finding", cnStatus.ok, false);
    const cnReview = require(path.join(ROOT, "lib", "review.js")).diffInfo(p0repo);
    check("review: a Chinese-named diff lists its file", cnReview.files.length, 1);
    check("review: that diff is not empty", cnReview.bytes > 0, true);
    const cnFix = require(path.join(ROOT, "lib", "fix.js"));
    check("fix: a case-flipped verdict path is refused", cnFix.denied(["Lib/P1.js"]).length, 1);
    check("fix: the manifest is refused", cnFix.denied(["package.json"]).length, 1);
    check("fix: another project's lib file is allowed", cnFix.denied(["lib/foo.js"]).length, 0);
    check("fix: inside signoff-cli every lib module is refused", cnFix.denied(["lib/foo.js"], { self: true }).length, 1);

    // dispute 的判据是"命令能跑、结果不稳定"，不是"命令拼错了"。拼错必须留下 0 份证据。
    const dsp = require(path.join(ROOT, "lib", "dispute.js"));
    const badRun = run(["dispute", "--claim", "typo", "--run", "nosuchcmd-signoff-fixture", "--repeat", "2"], p0repo, p0env);
    check("dispute: a command that cannot run is exit 2", badRun.status, 2);
    const ddir = path.join(p0repo, ".signoff", "disputes");
    check("dispute: a command that cannot run writes no evidence", fs.existsSync(ddir) ? fs.readdirSync(ddir).length : 0, 0);
    check("dispute: classify still separates the three verdicts", dsp.classify(2, 0, "pass"), "supported");

    // base 是 HEAD：闸门只判这次要提交的改动，不翻上一次提交的旧账。
    const integBase = require(path.join(ROOT, "lib", "integrity.js")).resolveBase(p0repo);
    check("integrity: the base is HEAD", integBase, gitOut(["rev-parse", "HEAD"], p0repo).trim());

    // 补丁解析要看懂 git 的引号与八进制转义（中文/空格路径），否则中文目录里 fix 永远说"补丁没碰到文件"。
    const quoted = 'diff --git "a/\\346\\265\\213\\350\\257\\225.test.js" "b/\\346\\265\\213\\350\\257\\225.test.js"';
    check("fix: a git-quoted patch path is decoded", cnFix.parsePatch(quoted).join(","), "测试.test.js");
    check("fix: a spaced patch path survives", cnFix.parsePatch("diff --git a/lib/my helper.js b/lib/my helper.js").join(","), "lib/my helper.js");
    check("fix: a backslash scope still matches", cnFix.outOfScope(["lib/a.js"], ["lib\\"]).length, 0);
    check("fix: a dot scope means everything", cnFix.outOfScope(["lib/a.js"], ["."]).length, 0);

    // 重命名在 status -z 里是两条字段：别再切出 "/old.js"
    fs.writeFileSync(path.join(p0repo, "mv-src.js"), "module.exports = 5;\n", "utf8");
    git(["add", "-A"], p0repo);
    git(["commit", "-qm", "for rename"], p0repo);
    git(["mv", "mv-src.js", "mv-dst.js"], p0repo);
    const changedNow = cnFix.changedFiles(p0repo);
    check("fix: a rename yields the new path", changedNow.includes("mv-dst.js"), true);
    check("fix: a rename yields no mangled path", changedNow.some((p) => p.startsWith("/")), false);

    // 在子目录 review：存证落在仓库根，换目录 --verify 也看得见
    const subDir = path.join(p0repo, "sub");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, "s.js"), "module.exports = 6;\n", "utf8");
    git(["add", "-A"], p0repo);
    const subReview = run(["review", "--by", "me"], subDir, p0env);
    check("review: recording from a subdirectory works", subReview.status, 0);
    check("review: the ledger lands at the repo root", fs.existsSync(path.join(p0repo, ".signoff", "reviews.jsonl")), true);
    check("review: no ledger inside the subdirectory", fs.existsSync(path.join(subDir, ".signoff", "reviews.jsonl")), false);

    // 同一处改动，LF 与"CRLF 被提交进库"的 hash 必须一致：存证绑内容，不绑 blob id
    const lineRepo = (content) => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-eol-"));
      const rp = path.join(base, "repo");
      fs.mkdirSync(rp, { recursive: true });
      git(["init", "-q"], rp);
      git(["config", "user.email", "t@example.com"], rp);
      git(["config", "user.name", "t"], rp);
      git(["config", "core.autocrlf", "false"], rp);
      fs.writeFileSync(path.join(rp, "a.js"), "module.exports = 1;\n", "utf8");
      git(["add", "-A"], rp);
      git(["commit", "-qm", "base"], rp);
      fs.writeFileSync(path.join(rp, "a.js"), content, "utf8");
      git(["add", "a.js"], rp);
      return rp;
    };
    const revmod = require(path.join(ROOT, "lib", "review.js"));
    const hLf = revmod.diffInfo(lineRepo("module.exports = 2;\n")).hash;
    const hCrlf = revmod.diffInfo(lineRepo("module.exports = 2;\r\n")).hash;
    check("review: committed CRLF does not change the hash", hCrlf, hLf);

    // 卸载要把新状态一起收走；写坏的豁免必须被 doctor 点名
    const allowFile = path.join(p0repo, ".signoff", "integrity-allow.json");
    fs.writeFileSync(allowFile, "{not json", "utf8");
    const docBad = run(["doctor"], p0repo, { ...p0env, SIGNOFF_LANG: "en" });
    check("doctor: an unparseable allowlist is named", /integrity-allow/.test(String(docBad.stdout)), true);
    fs.writeFileSync(
      allowFile,
      JSON.stringify([{ file: "t.test.js", kind: "removed-assertion", reason: "客户要求删掉这条断言，工单 2026-11", needle: "assert" }]),
      "utf8"
    );
    const un = run(["uninstall", "--all"], p0repo, p0env);
    check("uninstall: --all drops the waivers", fs.existsSync(allowFile), false);
    check("uninstall: --all says what it removed", /waiver/.test(String(un.stdout)), true);

    // runs.log 里也有 fix/dispute/review 的结论：回滚不是"门失败"，复盘不该被引偏
    const patmod = require(path.join(ROOT, "lib", "patterns.js"));
    const toolPats = patmod.extract(
      [
        { gate: "fix", ok: false, ts: "2026-01-01T00:00:00Z" },
        { gate: "fix", ok: false, ts: "2026-01-02T00:00:00Z" },
        { gate: "p1", ok: false, ts: "2026-01-03T00:00:00Z" },
      ],
      [],
      { min: 2 }
    );
    const patKeys = toolPats.map((x) => x.key);
    check("patterns: a rolled-back fix is a tool outcome", patKeys.includes("tool:fix"), true);
    check("patterns: a real gate failure stays a gate", patKeys.includes("gate:p1"), true);
    const fixPat = toolPats.find((x) => x.key === "tool:fix");
    check("patterns: the tool hint does not claim a gate failed", /same gate failed/.test(fixPat ? fixPat.hint : ""), false);

    // 看板一句话里的三个数字必须同属一个窗口：19 提交 / 17 过闸 配 100% 是自相矛盾的
    const repmod = require(path.join(ROOT, "lib", "report.js"));
    const winCounts = repmod.taskCounts({ count: 19, passed: 17, since: 17, guarded: 17, rate: 100 });
    check("report: a windowed task counts the window", winCounts.count, 17);
    check("report: a windowed task keeps the all-time total", winCounts.total, 19);
    const allCounts = repmod.taskCounts({ count: 19, passed: 17, since: 19, guarded: 17, rate: 89 });
    check("report: an unwindowed task counts every commit", allCounts.count, 19);
    check("report: an unwindowed task shows a single window", allCounts.windowed, false);

    // 回滚必须带走补丁自己新建、但被 .gitignore 挡住的文件；用户原有的被忽略文件不许动
    const igBase = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-ignored-"));
    const igRepo = path.join(igBase, "repo");
    fs.mkdirSync(path.join(igRepo, "dist"), { recursive: true });
    fs.mkdirSync(path.join(igRepo, "src"), { recursive: true });
    git(["init", "-q"], igRepo);
    git(["config", "user.email", "t@example.com"], igRepo);
    git(["config", "user.name", "t"], igRepo);
    fs.writeFileSync(path.join(igRepo, ".gitignore"), "dist/\n", "utf8");
    fs.writeFileSync(path.join(igRepo, "src/app.js"), "module.exports = 1;\n", "utf8");
    fs.writeFileSync(path.join(igRepo, "dist/keep.txt"), "keep\n", "utf8");
    fs.writeFileSync(path.join(igRepo, "fail.js"), "process.exit(1);\n", "utf8");
    git(["add", "-A"], igRepo);
    git(["commit", "-qm", "base"], igRepo);
    const igPatch = [
      "diff --git a/src/app.js b/src/app.js",
      "--- a/src/app.js",
      "+++ b/src/app.js",
      "@@ -1 +1 @@",
      "-module.exports = 1;",
      "+module.exports = 2;",
      "diff --git a/dist/new.txt b/dist/new.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/dist/new.txt",
      "@@ -0,0 +1 @@",
      "+new",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(igRepo, "fix.patch"), igPatch, "utf8");
    const igRun = run(["fix", "--patch", "fix.patch", "--run", "node fail.js", "--scope", "src", "--scope", "dist"], igRepo, p0env);
    check("fix: a still-red patch is rolled back", igRun.status, 1);
    check("fix: rollback removes the ignored file the patch created", fs.existsSync(path.join(igRepo, "dist", "new.txt")), false);
    check("fix: rollback keeps the ignored file that was already there", fs.existsSync(path.join(igRepo, "dist", "keep.txt")), true);
    check(
      "fix: rollback restores the patched file",
      fs.readFileSync(path.join(igRepo, "src", "app.js"), "utf8").replace(/\r\n/g, "\n"),
      "module.exports = 1;\n"
    );

    // 评审存证：hash 才是主张，签名是自述
    const rev = require(path.join(ROOT, "lib", "review.js"));
    check("review: diffInfo hashes the staged diff", typeof rev.diffInfo, "function");
    const rbase = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-review-"));
    const rrepo = path.join(rbase, "repo");
    fs.mkdirSync(rrepo, { recursive: true });
    const rEnv = { SIGNOFF_NO_MACHINE: "1", SIGNOFF_NO_BOOTSTRAP: "1" };
    const rspawn = (args) => run(args, rrepo, rEnv);
    git(["init", "-q"], rrepo);
    git(["config", "user.email", "t@example.com"], rrepo);
    git(["config", "user.name", "t"], rrepo);
    fs.writeFileSync(path.join(rrepo, "a.js"), "module.exports = 1;\n", "utf8");
    git(["add", "-A"], rrepo);
    git(["commit", "-qm", "base"], rrepo);

    fs.writeFileSync(path.join(rrepo, "a.js"), "module.exports = 2;\n", "utf8");
    git(["add", "a.js"], rrepo);
    const noReview = rspawn(["review", "--verify"]);
    check("review: an unreviewed diff fails verification", noReview.status, 1);

    const made = rspawn(["review", "--by", "deepseek-flash", "--model", "deepseek/flash", "--note", "checked the loop bound", "--json"]);
    check("review: an attestation is recorded", made.status, 0);
    let revRec = null;
    try {
      revRec = JSON.parse(String(made.stdout));
    } catch (e) {
      revRec = null;
    }
    check("review: the record carries the model id", revRec && revRec.model, "deepseek/flash");
    check("review: the record carries a diff hash", revRec && /^[0-9a-f]{32}$/.test(revRec.hash || ""), true);

    const afterReview = rspawn(["review", "--verify"]);
    check("review: the reviewed diff verifies", afterReview.status, 0);

    // 改一个字节：同一份评审不再适用
    fs.writeFileSync(path.join(rrepo, "a.js"), "module.exports = 3;\n", "utf8");
    git(["add", "a.js"], rrepo);
    const changed = rspawn(["review", "--verify"]);
    check("review: changing the diff invalidates the approval", changed.status, 1);

    // 失败模式库：同一条红出现三次就是模式，不是意外
    const pat = require(path.join(ROOT, "lib", "patterns.js"));
    const synthetic = [
      { ts: "2026-11-01T00:00:00Z", gate: "p1", ok: false, ms: 4000 },
      { ts: "2026-11-02T00:00:00Z", gate: "p1", ok: true, ms: 3000 },
      { ts: "2026-11-03T00:00:00Z", gate: "p1", ok: false, ms: 5000 },
      { ts: "2026-11-04T00:00:00Z", gate: "p1", ok: false, ms: 6000 },
      { ts: "2026-11-05T00:00:00Z", gate: "p5", ok: false, ms: 120 },
    ];
    const pats = pat.extract(synthetic, [{ action: "publish", decision: "deny" }, { action: "publish", decision: "deny" }], { min: 2 });
    check("patterns: the worst gate is listed first", pats[0].key, "gate:p1");
    check("patterns: three failures count as recurring", pats[0].recurring, true);
    check("patterns: the rate is a number, not a feeling", pats[0].rate, 75);
    check("patterns: a single failure is not recurring", pats.find((x) => x.key === "gate:p5").recurring, false);
    check("patterns: refused audit actions are a pattern too", pats.find((x) => x.key === "action:publish").count, 2);
    check("patterns: an empty log yields no patterns", pat.extract([], [], { min: 2 }).length, 0);

    // 分歧仲裁：复现即证据。结论只由"重复跑"定，不由措辞定
    const disp = require(path.join(ROOT, "lib", "dispute.js"));
    check("dispute: all pass supports a claim", disp.classify(3, 0, "pass"), "supported");
    check("dispute: all fail refutes a claim", disp.classify(0, 3, "pass"), "refuted");
    check("dispute: mixed runs are unstable, not a win", disp.classify(2, 1, "pass"), "unstable");
    check("dispute: a claim of failure is supported by failures", disp.classify(0, 3, "fail"), "supported");
    check("dispute: nothing ran is no evidence", disp.classify(0, 0, "pass"), "no-evidence");

    const dbase = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-dispute-"));
    const dEnv = { SIGNOFF_NO_MACHINE: "1", SIGNOFF_NO_BOOTSTRAP: "1" };
    const drepo = path.join(dbase, "repo");
    fs.mkdirSync(drepo, { recursive: true });
    git(["init", "-q"], drepo);
    const dspawn = (args) => run(args, drepo, dEnv);

    // 稳定的失败：主张"它过"被推翻
    fs.writeFileSync(path.join(drepo, "red.js"), "process.exit(1);\n", "utf8");
    const refuted = dspawn(["dispute", "--claim", "the suite passes", "--run", "node red.js", "--repeat", "3"]);
    check("dispute: a stable failure refutes the claim", refuted.status, 1);
    check("dispute: the refutation is recorded", /evidence \S+\.json/.test(String(refuted.stdout)), true);

    // 稳定通过：主张成立
    fs.writeFileSync(path.join(drepo, "green.js"), "process.exit(0);\n", "utf8");
    const supported = dspawn(["dispute", "--claim", "the suite passes", "--run", "node green.js", "--repeat", "3"]);
    check("dispute: a stable pass supports the claim", supported.status, 0);

    // 时好时坏：既不算成立也不算推翻，单独一格
    fs.writeFileSync(
      path.join(drepo, "flaky.js"),
      "const fs=require('fs');const f='state.txt';const n=fs.existsSync(f)?Number(fs.readFileSync(f,'utf8')):0;fs.writeFileSync(f,String(n+1));process.exit(n%3===0?0:1);\n",
      "utf8"
    );
    const flaky = dspawn(["dispute", "--claim", "the suite passes", "--run", "node flaky.js", "--repeat", "3"]);
    check("dispute: mixed results exit 3, not a verdict", flaky.status, 3);

    // 没有复现步骤就不仲裁
    const noRun = dspawn(["dispute", "--claim", "it works"]);
    check("dispute: no reproducer is a usage error", noRun.status, 2);

    // 证据可以复核：拿记录重跑，结论一致
    fs.writeFileSync(path.join(drepo, "same.js"), "process.exit(0);\n", "utf8");
    const rec = dspawn(["dispute", "--claim", "the suite passes", "--run", "node same.js", "--repeat", "2", "--json"]);
    let recFile = "";
    try {
      recFile = JSON.parse(String(rec.stdout)).file;
    } catch (e) {
      recFile = "";
    }
    check("dispute: --json names the evidence file", recFile.length > 0, true);
    const rep = recFile ? dspawn(["dispute", "--replay", recFile]) : { status: -1 };
    check("dispute: replay of a stable verdict agrees", rep.status, 0);

    // 有界修复闭环：留下的条件只有四条，四个场景各验一次
    const fixlib = require(path.join(ROOT, "lib", "fix.js"));
    check(
      "fix: a unified diff names its files",
      fixlib.parsePatch("diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-x\n+y\n").join(","),
      "a.js"
    );
    check("fix: the verdict path is refused", fixlib.denied(["bin/signoff.js"]).length, 1);
    check("fix: a normal source file is still allowed", fixlib.denied(["src/app.js"]).length, 0);
    // report/release 也读判定结果：修它们等于改判据，所以从 4.8 起一并拒绝
    check("fix: the reporter is part of the verdict path", fixlib.denied(["lib/report.js"]).length, 1);
    check("fix: out-of-scope files are named", fixlib.outOfScope(["lib/a.js", "docs/b.md"], ["lib"]).join(","), "docs/b.md");

    const makeFixFixture = (content) => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), "signoff-fix-"));
      const repo = path.join(base, "repo");
      fs.mkdirSync(repo, { recursive: true });
      fs.writeFileSync(path.join(repo, "run.js"), content, "utf8");
      fs.writeFileSync(path.join(repo, "package.json"), '{"name":"fix-fixture","version":"1.0.0"}\n', "utf8");
      git(["init", "-q"], repo);
      git(["config", "user.email", "t@example.com"], repo);
      git(["config", "user.name", "t"], repo);
      git(["add", "-A"], repo);
      git(["commit", "-qm", "base"], repo);
      return { base, repo };
    };
    const patchFrom = (repo, base, content, name) => {
      const target = path.join(repo, "run.js");
      const original = fs.readFileSync(target, "utf8");
      fs.writeFileSync(target, content, "utf8");
      const file = path.join(base, name);
      fs.writeFileSync(file, gitOut(["diff"], repo), "utf8");
      fs.writeFileSync(target, original, "utf8");
      return file;
    };
    const fixEnv = { SIGNOFF_NO_BOOTSTRAP: "1", SIGNOFF_NO_MACHINE: "1" };

    // 1) 真的把测试改绿：留下
    const redFix = makeFixFixture("process.exit(1);\n");
    const goodPatch = patchFrom(redFix.repo, redFix.base, "process.exit(0);\n", "good.diff");
    const keepRes = run(["fix", "--patch", goodPatch, "--run", "node run.js"], redFix.repo, fixEnv);
    check("fix: a real fix is kept", keepRes.status, 0, String(keepRes.stdout || keepRes.stderr || "").slice(-160));
    check(
      "fix: a kept fix stays applied",
      fs.readFileSync(path.join(redFix.repo, "run.js"), "utf8").includes("exit(0)"),
      true
    );
    check("fix: the record is written", fs.existsSync(path.join(redFix.repo, ".signoff", "fix-log.jsonl")), true);

    // 2) 改了点东西但没让测试变绿：整单回滚
    const redAgain = makeFixFixture("process.exit(1);\n");
    const badPatch = patchFrom(redAgain.repo, redAgain.base, "// still red\nprocess.exit(1);\n", "bad.diff");
    const rolled = run(["fix", "--patch", badPatch, "--run", "node run.js"], redAgain.repo, fixEnv);
    check("fix: a fix that does not flip the verdict is rolled back", rolled.status, 1);
    check(
      "fix: rollback restores the file",
      fs.readFileSync(path.join(redAgain.repo, "run.js"), "utf8").trim(),
      "process.exit(1);"
    );

    // 3) 基线已经绿：没有复现就没有修复
    const greenFix = makeFixFixture("console.log('ok');\n");
    const commentPatch = patchFrom(greenFix.repo, greenFix.base, "console.log('ok'); // touched\n", "green.diff");
    const already = run(["fix", "--patch", commentPatch, "--run", "node run.js"], greenFix.repo, fixEnv);
    check("fix: a green baseline is refused", already.status, 2);

    // 4) 判定路径：这个循环不许改闸门
    const gatePatch = path.join(redFix.base, "gate.diff");
    fs.writeFileSync(
      gatePatch,
      "diff --git a/bin/signoff.js b/bin/signoff.js\n--- a/bin/signoff.js\n+++ b/bin/signoff.js\n@@ -1 +1 @@\n-x\n+y\n",
      "utf8"
    );
    const refused = run(["fix", "--patch", gatePatch, "--run", "node run.js"], redFix.repo, fixEnv);
    check("fix: patching the verdict path is refused", refused.status, 2);

    // 反作弊闸门：测试变绿可以通过四种方式作弊，前三种必须被抓到
    const integrity = require(path.join(ROOT, "lib", "integrity.js"));
    const kinds = (before, after) => integrity.analyze(before, after).findings.map((f) => f.kind).sort().join(",");
    check("integrity: a deleted assertion is a finding", kinds('check("a", 1, 1);\n', ""), "removed-assertion");
    check(
      "integrity: an equal-size rewrite is not a finding",
      kinds('check("a", 1, 1);\n', 'check("b", 2, 2);\n'),
      ""
    );
    check("integrity: a new skip is a finding", kinds('test("x", () => {});\n', 'test.skip("x", () => {});\n'), "skipped");
    check("integrity: a new .only is a finding", kinds('test("x", () => {});\n', 'test.only("x", () => {});\n'), "focused");
    check(
      "integrity: a lowered threshold is a finding",
      kinds('check("cases >= 80", n >= 80);\n', 'check("cases >= 60", n >= 60);\n'),
      "threshold-lowered"
    );
    check(
      "integrity: a raised threshold is not a finding",
      kinds('check("cases >= 60", n >= 60);\n', 'check("cases >= 80", n >= 80);\n'),
      ""
    );
    check(
      "integrity: p1 folds the gate into its verdict",
      /require\("\.\/integrity"\)/.test(fs.readFileSync(path.join(ROOT, "lib", "p1.js"), "utf8")),
      true
    );
    // 中文写坏成 ??? 是真实事故（GitHub About 与两个 release 正文都中过），出现即不可恢复
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === 'diagrams') return [];
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /[.](md|js|mjs|json|yml|yaml|cff|txt|svg)$/i.test(e.name) ? [full] : [];
    });
    const mojibake = [];
    for (const file of walk(ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      if (/\uFFFD/.test(text) || /[\u4e00-\u9fff]\?\?/.test(text) || /\?\?[\u4e00-\u9fff]/.test(text)) {
        mojibake.push(path.relative(ROOT, file));
      }
    }
    check("no tracked text file has lost its Chinese to ? marks", mojibake.join(","), "");
    check("third-party actions are pinned to commit SHAs", /uses: actions\/checkout@[0-9a-f]{40}/.test(fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8")), true);
    check("verification steps are documented", fs.existsSync(path.join(ROOT, "docs", "verify-release.md")), true);
    check("trademark use policy is in the repo", fs.existsSync(path.join(ROOT, "TRADEMARK.md")), true);
    // 标志里不再刻版权：出现年份即说明边款又回来了
    for (const rel of ["signoff-mark.svg", "signoff-mark-indigo.svg"]) {
      const svg = fs.readFileSync(path.join(ROOT, "assets", "brand", rel), "utf8");
      check(`${rel} carries no copyright inscription`, /2026/.test(svg), false);
    }
    // 同步点只剩两处：LICENSE 与 NOTICE
    for (const rel of ["README.md", "README.en.md"]) {
      const doc = fs.readFileSync(path.join(ROOT, rel), "utf8");
      check(`${rel} does not duplicate the copyright line`, /© 2026 SignOff/.test(doc), false);
    }
    check("trademark plan is documented", fs.existsSync(path.join(ROOT, "docs", "brand-policy.md")) && fs.existsSync(path.join(ROOT, "docs", "brand-policy.en.md")), true);
    check("NOTICE names the placeholder holder", /占位名/.test(fs.readFileSync(path.join(ROOT, "NOTICE"), "utf8")), true);
    for (const file of ["signoff-mark.svg", "signoff-mark-indigo.svg", "signoff-mark-1024.png", "signoff-copyright.svg"]) {
      check(`brand asset ${file} is in the repo`, fs.existsSync(path.join(ROOT, "assets", "brand", file)), true);
    }
  }

  // ---------------------------------------------------------------- token 与费用
  // 三个数字必须同口径：价格按峰谷、归属按「上一次提交到这一次」的区间、读不到就报读不到。
  {
    const tkmod = require(path.join(ROOT, "lib", "tokens.js"));
    const tpk = tkmod.DEFAULTS;
    const peakMon = Date.UTC(2026, 10, 9, 2, 0, 0); // 周一 02:00 UTC = 峰时
    const offMon = Date.UTC(2026, 10, 9, 5, 0, 0); // 周一 05:00 UTC = 谷时
    const sat = Date.UTC(2026, 10, 7, 2, 0, 0); // 周六 02:00 UTC = 谷时
    check("tokens: weekday 02:00 UTC is peak", tkmod.isPeak(peakMon, tpk), true);
    check("tokens: weekday 05:00 UTC is off-peak", tkmod.isPeak(offMon, tpk), false);
    check("tokens: weekends are off-peak", tkmod.isPeak(sat, tpk), false);

    const call = (u) => tkmod.costOf(u, tpk, peakMon).cost;
    check("tokens: 1M cache-miss input at peak costs the list price", call({ input: 1e6, model: "deepseek-flash" }), 0.3);
    check(
      "tokens: the same call off-peak costs half",
      tkmod.costOf({ input: 1e6, model: "deepseek-flash" }, tpk, offMon).cost,
      0.15
    );
    check("tokens: cache reads use the hit price", call({ cacheRead: 1e6, model: "deepseek-flash" }), 0.006);
    check("tokens: output uses the output price", call({ output: 1e6, model: "deepseek-flash" }), 1.2);
    check("tokens: the session dir slug follows the DSH rule", tkmod.slugOf("E:\\DSH.Jack.01"), "--E-DSH.Jack.01--");

    const at = (d, t) => Date.parse(`${d}T${t}`);
    const tokCommits = [
      { sha: "c3", date: "2026-11-12", time: "12:00:00" },
      { sha: "c2", date: "2026-11-11", time: "12:00:00" },
      { sha: "c1", date: "2026-11-10", time: "12:00:00" },
    ];
    const tokEvents = [
      [at("2026-11-10", "09:00:00"), 1000, 0, 0, 0, "deepseek-flash"], // 第一次提交之前
      [at("2026-11-10", "18:00:00"), 2000, 100, 0, 0, "deepseek-flash"], // → c1
      [at("2026-11-11", "18:00:00"), 3000, 100, 0, 0, "deepseek-flash"], // → c2
    ];
    const folded = tkmod.fold(tokEvents, tpk, tokCommits);
    check("tokens: usage before the first commit is not charged to it", folded.before.tokens, 1000);
    check("tokens: usage after a commit is charged to that commit", folded.byCommit.get("c1").tokens, 2100);
    check("tokens: the next commit only gets its own window", folded.byCommit.get("c2").tokens, 3100);
    check("tokens: every event is counted exactly once", folded.totals.tokens, 6200);
    check("tokens: cost is positive when there is usage", folded.totals.cost > 0, true);

    // 端到端：一个真的 zstd 会话文件，从「读到 → 折成一次调用」走通。
    const zlib = require("zlib");
    const tokRepo = path.join(base, "tokrepo");
    fs.mkdirSync(tokRepo, { recursive: true });
    fs.writeFileSync(path.join(tokRepo, "README.md"), "# tok\n", "utf8");
    git(["init", "-q"], tokRepo);
    git(["config", "user.email", "t@t"], tokRepo);
    git(["config", "user.name", "t"], tokRepo);
    git(["add", "-A"], tokRepo);
    git(
      ["commit", "-qm", "init"],
      tokRepo,
      {
        GIT_AUTHOR_DATE: new Date(Date.now() - 3600 * 1000).toISOString(),
        GIT_COMMITTER_DATE: new Date(Date.now() - 3600 * 1000).toISOString(),
      }
    );
    const head = gitOut(["rev-parse", "--short", "HEAD"], tokRepo).trim();
    // Node 18/20 没有 zstd（22.15 才加进来）。产品代码在这种情况下明说原因、不给 0；
    // 这段夹具本身要用 zstd 压文件，所以老 Node 上改成断言那句话，并打印跳过原因。
    // CI 的 node 20 矩阵就卡在这里崩过一次：整套用例不该因为一个夹具而整片红。
    if (typeof zlib.zstdCompressSync !== "function" || typeof zlib.zstdDecompressSync !== "function") {
      // 夹具要压 zstd，老 Node 压不了；那就改问产品自己那句话：说清原因、不给 0。
      // 实测口径：`tokens` 在这种情况下退出 2，并把「needs Node >= 22.15」写在 stderr。
      const nzSessions = path.join(base, "tok-sessions-nozstd");
      const nzDir = path.join(nzSessions, tkmod.slugOf(tokRepo), "session-1");
      fs.mkdirSync(nzDir, { recursive: true });
      fs.writeFileSync(path.join(nzDir, "session.v4.jsonl.zstd"), "not really zstd", "utf8");
      const nzSaved = { sessions: process.env.SIGNOFF_SESSIONS, cache: process.env.SIGNOFF_CACHE_DIR };
      process.env.SIGNOFF_SESSIONS = nzSessions;
      process.env.SIGNOFF_CACHE_DIR = path.join(base, "tok-cache-nozstd");
      let nzr = null;
      try {
        nzr = run(["tokens", "--json"], tokRepo);
      } finally {
        if (nzSaved.sessions === undefined) delete process.env.SIGNOFF_SESSIONS;
        else process.env.SIGNOFF_SESSIONS = nzSaved.sessions;
        if (nzSaved.cache === undefined) delete process.env.SIGNOFF_CACHE_DIR;
        else process.env.SIGNOFF_CACHE_DIR = nzSaved.cache;
      }
      const nzSaid = ((nzr && nzr.stderr) || "") + ((nzr && nzr.stdout) || "");
      check("tokens: a Node without zstd says why instead of counting", (nzr && nzr.status) === 2 && /zstd/.test(nzSaid), true, nzSaid.trim().split("\n")[0]);
      check("tokens: the message names the required version", /needs Node >= 22\.15/.test(nzSaid), true);
      console.log("SKIP tokens: zstd fixture — this Node (" + process.version + ") has no zstdCompressSync");
    } else {
      const sessionsDir = path.join(base, "tok-sessions");
      const sdir = path.join(sessionsDir, tkmod.slugOf(tokRepo), "session-1");
      fs.mkdirSync(sdir, { recursive: true });
      const now = Date.now();
      const lines =
        [
          JSON.stringify({ type: "session", time: now - 5000, data: {} }),
          JSON.stringify({
            type: "assistant/message",
            time: now - 1000,
            data: {
              usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 500, cacheWriteTokens: 0, totalTokens: 1600 },
              message: { model: "deepseek-flash" },
            },
          }),
          // 撕裂的末行，不该让整次统计崩掉
          '{"type":"assistant/message","time":',
        ].join("\n") + "\n";
      fs.writeFileSync(path.join(sdir, "session.v4.jsonl.zstd"), zlib.zstdCompressSync(Buffer.from(lines, "utf8")));
      const saved = { sessions: process.env.SIGNOFF_SESSIONS, cache: process.env.SIGNOFF_CACHE_DIR };
      process.env.SIGNOFF_SESSIONS = sessionsDir;
      process.env.SIGNOFF_CACHE_DIR = path.join(base, "tok-cache");
      let got = null;
      try {
        got = tkmod.foldFor(tokRepo, { refresh: true });
      } finally {
        if (saved.sessions === undefined) delete process.env.SIGNOFF_SESSIONS;
        else process.env.SIGNOFF_SESSIONS = saved.sessions;
        if (saved.cache === undefined) delete process.env.SIGNOFF_CACHE_DIR;
        else process.env.SIGNOFF_CACHE_DIR = saved.cache;
      }
      check("tokens: a session file is read back through zstd", got.available, true);
      check("tokens: the fixture session yields exactly one call", got.totals.calls, 1);
      check("tokens: the fixture call has 1600 tokens", got.totals.tokens, 1600);
      check("tokens: the fixture call is attributed to the commit after it", (got.byCommit.get(head) || {}).tokens, 1600);
      check("tokens: the cache is written outside the repo", fs.existsSync(path.join(base, "tok-cache")), true);
      check("tokens: nothing is written into the repo", fs.existsSync(path.join(tokRepo, ".signoff", "tokens.json")), false);
    }

    // 只读契约：report 不因为多了一块 token 就往仓库里写东西
    const noTok = JSON.parse(run(["report", "--json", "--no-tokens"], tokRepo).stdout);
    check("tokens: --no-tokens reports unavailable instead of a zero", noTok.tokens.available, false);
    const withTok = JSON.parse(run(["report", "--json"], tokRepo).stdout);
    check("tokens: report always carries the token block", typeof withTok.tokens, "object");
    // 页面上的金额也要有词：裸 $0.02 会被读成别的单位（面板行上报过同一个问题）。
    // 端到端那条路要造会话缓存，这里直接盯渲染源：chip 必须先出词再出数。
    const reportSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "report.js"), "utf8");
    check(
      "page cost chips are labelled",
      /T\("费用"\)\} \$\{esc\(tk\.money\(t\.cost\)\)\}/.test(reportSrc) &&
        /T\("费用"\)\} \$\{esc\(tk\.money\(c\.cost\)\)\}/.test(reportSrc),
      true
    );
  }

  for (const line of AUDIT) console.log(`AUDIT ${line.replace(/\n/g, "\nAUDIT ")}`);
  for (const line of PASS) console.log(`PASS ${line}`);
  for (const line of FAIL) console.log(`FAIL ${line}`);
  if (process.env.SIGNOFF_TIMING === "1") {
    const total = TIMING.reduce((n, t) => n + t[0], 0);
    console.log(`\nslowest ${Math.min(12, TIMING.length)} of ${TIMING.length} cases (total ${(total / 1000).toFixed(1)} s):`);
    for (const [ms, name] of TIMING.slice().sort((a, b) => b[0] - a[0]).slice(0, 12)) {
      console.log(`  ${String(ms).padStart(6)} ms  ${name}`);
    }
    const byCmd = [...SPAWNS.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
    console.log("\nspawn cost by command (count / total):");
    for (const [name, v] of byCmd) console.log(`  ${String(v.n).padStart(4)}x  ${(v.ms / 1000).toFixed(1)} s  ${name}`);
  }
  console.log(`\n${PASS.length} passed, ${FAIL.length} failed`);
  return FAIL.length ? 1 : 0;
}

process.exit(main());
