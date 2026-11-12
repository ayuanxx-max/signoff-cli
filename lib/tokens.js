"use strict";
// Token 与费用：把 DSH 会话记录里已经存在的 usage 读出来，按天/按提交折成 token 数与金额。
//
// 为什么放在 signoff 里：看板已经在回答「这个仓库的改动有没有走闸」，缺的那一半是「这些改动
// 花了多少钱」。数量不需要新埋点——DSH 每个 assistant/message 都带 usage，会话文件就在
// ~/.dsh/sessions/<workspace>/<session>/session.v4.jsonl.zstd。
//
// 三条边界：
//   1. 只读：不写会话文件，不改 DSH 配置；读不到就说读不到，不猜。
//   2. 闸门本身不花 token：这里的钱是「产出这次提交的 agent 工作」的钱，不是 p1…p5 的钱。
//   3. 价格表可换：默认取 DeepSeek 官方页（带日期），`.signoff/prices.json` 可覆盖。

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const core = require("./core");

const USAGE =
  "usage: signoff tokens [--days N] [--json] [--refresh] [--md FILE] [--no-cache]  " +
  "(token 与费用，数据来自 DSH 会话记录，只读本地)";

// DeepSeek 官方价（每 1M tokens，USD），2026-11-12 取自 api-docs.deepseek.com/quick_start/pricing。
// deepseek-flash：缓存命中 0.006 / 未命中 0.3 / 输出 1.2（峰时）；谷时全部半价。
// deepseek-v4-pro：0.044 / 1.32 / 3.96（峰时）。
const DEFAULTS = {
  source: "https://api-docs.deepseek.com/quick_start/pricing",
  asOf: "2026-11-12",
  currency: "USD",
  // 峰时：UTC 01:00-04:00 与 06:00-10:00，周一至周五。谷时为其余时间（含周末）。
  peakHoursUtc: [[1, 4], [6, 10]],
  models: {
    "deepseek-flash": {
      peak: { hit: 0.006, miss: 0.3, out: 1.2 },
      off: { hit: 0.003, miss: 0.15, out: 0.6 },
    },
    "deepseek-v4-pro": {
      peak: { hit: 0.044, miss: 1.32, out: 3.96 },
      off: { hit: 0.022, miss: 0.66, out: 1.98 },
    },
  },
};

function parseArgs(argv) {
  const o = { days: 0, json: false, refresh: false, md: "", cache: true, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--refresh") o.refresh = true;
    else if (a === "--no-cache") o.cache = false;
    else if (a === "--days") o.days = Number(argv[++i]) || 0;
    else if (a.startsWith("--days=")) o.days = Number(a.slice(7)) || 0;
    else if (a === "--md") o.md = argv[++i] || "";
    else if (a.startsWith("--md=")) o.md = a.slice(5);
  }
  return o;
}

function sessionsRoot() {
  return process.env.SIGNOFF_SESSIONS || path.join(os.homedir(), ".dsh", "sessions");
}

function workspaceFile() {
  return process.env.SIGNOFF_WORKSPACES || path.join(os.homedir(), ".dsh", "storages", "workspace.json");
}

// E:\DSH.Jack.01 → --E-DSH.Jack.01--（DSH 的会话目录命名规则：去掉盘符冒号，分隔符变 -）
function slugOf(p) {
  const s = String(p || "").replace(/[\\/]+$/, "").replace(/[\\/]/g, "-").replace(/^([A-Za-z]):/, "$1");
  return `--${s}--`;
}

function norm(p) {
  const s = path.resolve(String(p || "")).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? s.toLowerCase() : s;
}

// 仓库 → 它所在工作区的会话目录。工作区根从 workspace.json 取（最长前缀匹配），
// 取不到时退回「仓库根自己就是工作区」。
function sessionDirs(root) {
  const dirs = [];
  const sessions = sessionsRoot();
  let roots = [];
  try {
    const w = JSON.parse(fs.readFileSync(workspaceFile(), "utf8"));
    const rows = (w && w.tables && w.tables.workspaces) || {};
    roots = Object.values(rows).map((r) => r && r.path).filter(Boolean);
  } catch (e) {
    roots = [];
  }
  const me = norm(root);
  const inside = roots
    .filter((r) => {
      const n = norm(r);
      return me === n || me.startsWith(n + path.sep) || me.startsWith(n + "/");
    })
    .sort((a, b) => norm(b).length - norm(a).length);
  const candidates = inside.length ? inside : [root];
  for (const r of candidates) {
    const d = path.join(sessions, slugOf(r));
    if (fs.existsSync(d)) dirs.push(d);
  }
  return [...new Set(dirs)];
}

function sessionFiles(dirs) {
  const out = [];
  for (const d of dirs) {
    let kids = [];
    try {
      kids = fs.readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory());
    } catch (e) {
      continue;
    }
    for (const k of kids) {
      const f = path.join(d, k.name, "session.v4.jsonl.zstd");
      if (fs.existsSync(f)) out.push(f);
    }
  }
  return out;
}

function hasZstd() {
  return typeof zlib.zstdDecompressSync === "function";
}

// 一个会话文件 → [ms, input, out, cacheRead, cacheWrite, model]
// 只认 assistant/message 上的 usage：它是每次模型调用的真实账单口径，turn/end 是汇总，读了会翻倍。
function readEvents(file) {
  if (!hasZstd()) throw new Error("this Node cannot decompress zstd (needs Node >= 22.15)");
  const raw = zlib.zstdDecompressSync(fs.readFileSync(file)).toString("utf8");
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      continue; // 撕裂的末行
    }
    if (!rec || rec.type !== "assistant/message") continue;
    const d = rec.data || {};
    const u = d.usage;
    if (!u || typeof u !== "object" || typeof u.inputTokens !== "number") continue;
    const t = Number(rec.time || 0);
    if (!t) continue;
    const msg = d.message || {};
    const model = String(msg.model || d.model || "");
    out.push([
      t,
      Number(u.inputTokens) || 0,
      Number(u.outputTokens) || 0,
      Number(u.cacheReadTokens) || 0,
      Number(u.cacheWriteTokens) || 0,
      model,
    ]);
  }
  return out;
}

function isPeak(ms, prices) {
  const d = new Date(ms);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  for (const [a, b] of prices.peakHoursUtc || []) {
    if (h >= a && h < b) return true;
  }
  return false;
}

function rateFor(prices, model, peak) {
  const table = prices.models || {};
  const m = table[model] || table.default || DEFAULTS.models["deepseek-flash"];
  return peak ? m.peak : m.off;
}

// 一次调用的钱：未命中输入按 miss、缓存读按 hit、输出按 out；缓存写目前不计费。
function costOf(usage, prices, whenMs) {
  const peak = isPeak(whenMs, prices || DEFAULTS);
  const r = rateFor(prices || DEFAULTS, usage.model || "", peak);
  const cost =
    ((usage.input || 0) * r.miss +
      (usage.cacheRead || 0) * r.hit +
      (usage.output || 0) * r.out +
      (usage.cacheWrite || 0) * (r.write === undefined ? 0 : r.write)) /
    1e6;
  return { cost, peak, rate: r };
}

function readPrices(root) {
  const file = path.join(core.stateDir(root), "prices.json");
  let user = null;
  try {
    user = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    user = null;
  }
  if (!user || typeof user !== "object") return { prices: DEFAULTS, file: null };
  return {
    prices: {
      ...DEFAULTS,
      ...user,
      models: { ...DEFAULTS.models, ...(user.models || {}) },
      peakHoursUtc: user.peakHoursUtc || DEFAULTS.peakHoursUtc,
    },
    file,
  };
}

function localDateOf(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 把事件折成「按天」和「按提交」两种口径。提交之间的用量归给后一次提交：
// 一次 commit 的代价 = 从上一次 commit 到它之间模型花掉的 token，和「这次改动花了多少钱」对得上。
function fold(events, prices, commits) {
  const byDay = new Map();
  const totals = { tokens: 0, cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, peakCalls: 0, models: {} };
  const rows = [];
  for (const e of events) {
    const [t, input, output, cacheRead, cacheWrite, model] = e;
    const usage = { input, output, cacheRead, cacheWrite, model };
    const { cost, peak } = costOf(usage, prices, t);
    const tokens = input + output + cacheRead + cacheWrite;
    rows.push({ t, tokens, cost, peak, model, usage });
    const day = localDateOf(t);
    const d = byDay.get(day) || { date: day, tokens: 0, cost: 0, calls: 0, peakCalls: 0 };
    d.tokens += tokens;
    d.cost += cost;
    d.calls += 1;
    if (peak) d.peakCalls += 1;
    byDay.set(day, d);
    totals.tokens += tokens;
    totals.cost += cost;
    totals.input += input;
    totals.output += output;
    totals.cacheRead += cacheRead;
    totals.cacheWrite += cacheWrite;
    totals.calls += 1;
    if (peak) totals.peakCalls += 1;
    if (model) totals.models[model] = (totals.models[model] || 0) + tokens;
  }
  rows.sort((a, b) => a.t - b.t);
  const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  // 按提交归集：commits 按时间升序，逐个开区间 (prev, c]。
  const buckets = new Map();
  let before = { tokens: 0, cost: 0 };
  if (commits && commits.length) {
    const marks = commits
      .map((c) => ({ sha: c.sha, at: Date.parse(`${c.date}T${c.time || "00:00:00"}`) }))
      .filter((x) => Number.isFinite(x.at))
      .sort((a, b) => a.at - b.at);
    let idx = 0;
    for (const r of rows) {
      let target = null;
      // 归给「事件之前最近的那次提交」：边界是提交时间，不是下一次提交时间。
      while (idx < marks.length && r.t > marks[idx].at) {
        target = marks[idx];
        idx += 1;
      }
      // 最后一次提交之后的用量算给最近那次（它还在进行中），不丢。
      if (!target && idx >= marks.length) target = marks[marks.length - 1];
      if (!target) {
        before.tokens += r.tokens;
        before.cost += r.cost;
        continue;
      }
      const b = buckets.get(target.sha) || { tokens: 0, cost: 0 };
      b.tokens += r.tokens;
      b.cost += r.cost;
      buckets.set(target.sha, b);
    }
  }
  return { days, totals, byCommit: buckets, before, rows };
}

// 缓存放用户主目录，不写被检查的仓库（C1：report 不得新增/修改 .signoff/ 下的任何文件）。
function cacheFile(root) {
  const base =
    process.env.SIGNOFF_CACHE_DIR ||
    path.join(os.homedir(), ".signoff", "cache", "tokens");
  const key = path.resolve(String(root)).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(-80) || "root";
  return path.join(base, key + ".json");
}

function readCache(root) {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(root), "utf8"));
    if (c && c.version === 1 && c.files && typeof c.files === "object") return c;
  } catch (e) {
    /* 没有缓存、或缓存坏了：重新读一遍就是 */
  }
  return { version: 1, files: {} };
}

function collect(root, opts) {
  const o = opts || {};
  const { prices, file: pricesFile } = readPrices(root);
  const warnings = [];
  if (!hasZstd()) {
    return {
      available: false,
      reason: `this Node (${process.version}) cannot decompress zstd; needs Node >= 22.15`,
      prices,
      pricesFile: null,
      days: [],
      sessions: [],
      totals: { tokens: 0, cost: 0, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, peakCalls: 0, models: {} },
      byCommit: new Map(),
      before: { tokens: 0, cost: 0 },
      files: 0,
      builtAt: new Date().toISOString(),
    };
  }
  const dirs = sessionDirs(root);
  if (!dirs.length) warnings.push("no DSH session directory for this workspace");
  const files = sessionFiles(dirs);
  const cache = o.refresh ? { version: 1, files: {} } : readCache(root);
  const next = { version: 1, files: {} };
  const events = [];
  for (const f of files) {
    let st;
    try {
      st = fs.statSync(f);
    } catch (e) {
      continue;
    }
    const key = f;
    const hit = cache.files[key];
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size && Array.isArray(hit.events)) {
      next.files[key] = hit;
    } else {
      try {
        next.files[key] = { mtimeMs: st.mtimeMs, size: st.size, events: readEvents(f) };
      } catch (e) {
        warnings.push(`cannot read ${path.basename(path.dirname(f))}: ${e.message}`);
        continue;
      }
    }
    for (const e of next.files[key].events) events.push(e);
  }
  if (o.cache !== false) {
    try {
      fs.mkdirSync(path.dirname(cacheFile(root)), { recursive: true });
      fs.writeFileSync(cacheFile(root), JSON.stringify(next), "utf8");
    } catch (e) {
      /* 缓存写不进不影响结论 */
    }
  }
  return {
    available: true,
    prices,
    pricesFile,
    warnings,
    files: files.length,
    dirs,
    sessions: files.map((f) => ({ file: f, events: (next.files[f] || {}).events || [] })),
    builtAt: new Date().toISOString(),
  };
}

function money(x, currency) {
  const c = currency === "USD" || !currency ? "$" : currency === "CNY" ? "¥" : currency;
  const v = Number(x) || 0;
  if (v === 0) return `${c}0`;
  if (v < 0.01) return `${c}${v.toFixed(5)}`;
  if (v < 1) return `${c}${v.toFixed(3)}`;
  return `${c}${v.toFixed(2)}`;
}

function num(x) {
  const v = Number(x) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}

function run(argv) {
  const a = parseArgs(argv || []);
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  const root = process.cwd();
  const t = collect(root, { refresh: a.refresh, cache: a.cache });
  if (!t.available) {
    console.error(`tokens: ${t.reason}`);
    console.error("tokens: the board shows tokens only when the runtime can read session files");
    return 2;
  }
  const commits = commitsOf(root, a.days);
  const folded = fold(t.sessions.flatMap((s) => s.events), t.prices, commits);
  const total = folded.totals;
  if (a.json) {
    console.log(
      JSON.stringify({
        available: true,
        files: t.files,
        warnings: t.warnings,
        prices: { source: t.prices.source, asOf: t.prices.asOf, currency: t.prices.currency },
        totals: { ...total, costText: money(total.cost, t.prices.currency) },
        days: folded.days.map((d) => ({ ...d, costText: money(d.cost, t.prices.currency) })),
        before: folded.before,
        byCommit: Object.fromEntries([...folded.byCommit].map(([k, v]) => [k, { ...v, costText: money(v.cost, t.prices.currency) }])),
      })
    );
    return 0;
  }
  if (a.md) {
    const lines = ["| date | tokens | cost | calls |", "| --- | --- | --- | --- |"];
    for (const d of folded.days) lines.push(`| ${d.date} | ${d.tokens} | ${money(d.cost, t.prices.currency)} | ${d.calls} |`);
    fs.mkdirSync(path.dirname(path.resolve(root, a.md)), { recursive: true });
    fs.writeFileSync(path.resolve(root, a.md), `# Token cost\n\n${lines.join("\n")}\n`, "utf8");
    console.log(`tokens: wrote ${a.md}`);
    return 0;
  }
  if (!t.files) {
    console.log("[tokens] no DSH session records for this workspace — nothing to count");
    return 0;
  }
  if (!total.calls) {
    console.log(`[tokens] read ${t.files} session file(s), but they carry no usage records yet`);
    return 0;
  }
  console.log(
    `[tokens] ${num(total.tokens)} tokens · ${money(total.cost, t.prices.currency)} · ${total.calls} calls · ${folded.days.length} day(s) · ${t.files} session file(s)`
  );
  console.log(
    `[tokens] input ${num(total.input)} · cache-read ${num(total.cacheRead)} · output ${num(total.output)} · peak calls ${total.peakCalls}/${total.calls}`
  );
  if (commits.length) {
    const last = commits[0];
    const b = folded.byCommit.get(last.sha);
    if (b) console.log(`[tokens] latest commit ${last.sha} ≈ ${num(b.tokens)} tokens · ${money(b.cost, t.prices.currency)}`);
  }
  for (const d of folded.days.slice(0, 7)) {
    console.log(`[tokens] ${d.date}  ${String(num(d.tokens)).padStart(8)}  ${money(d.cost, t.prices.currency).padStart(9)}  ${d.calls} call(s)`);
  }
  if (t.warnings.length) for (const w of t.warnings.slice(0, 3)) console.log(`[tokens] note: ${w}`);
  console.log(`[tokens] prices: ${t.prices.source} (${t.prices.asOf})${t.pricesFile ? ` · override ${path.relative(root, t.pricesFile)}` : ""}`);
  return 0;
}

// 提交清单：只取 report 需要的轻字段（sha / date / time），避免和 report 的解析逻辑分叉。
function commitsOf(root, days) {
  const out = [];
  const args = ["log", "--date=format-local:%Y-%m-%d %H:%M:%S", "--format=%h%x1f%ad%x1f%s", "-n", "400"];
  if (days) args.push(`--since=${days} days ago`);
  args.push("--");
  const r = core.git(args, root);
  if (!r || r.code !== 0) return out;
  for (const line of String(r.out || "").split("\n")) {
    if (!line.trim()) continue;
    const [sha, dt, subject] = line.split("\x1f");
    if (!sha || !dt) continue;
    const [date, time] = String(dt).split(" ");
    out.push({ sha: String(sha).trim(), date, time: time || "00:00:00", subject: subject || "" });
  }
  return out;
}

function foldFor(root, opts) {
  const o = opts || {};
  const t = collect(root, { refresh: o.refresh, cache: o.cache });
  if (!t.available) return { available: false, reason: t.reason };
  const commits = commitsOf(root, o.days || 0);
  const folded = fold(t.sessions.flatMap((s) => s.events), t.prices, commits);
  return { available: true, ...folded, prices: t.prices, files: t.files, warnings: t.warnings, builtAt: t.builtAt };
}

module.exports = { run, collect, fold, foldFor, costOf, isPeak, slugOf, sessionDirs, readEvents, money, num, readPrices, parseArgs, DEFAULTS, USAGE };
