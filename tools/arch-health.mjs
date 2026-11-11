#!/usr/bin/env node
/**
 * arch-health — SignOff 自己的架构体检（dogfooding）
 *
 * 为什么存在：SignOff 给别人的仓库判架构、判覆盖、判口径，却没有一个检查它自己的东西。
 * 这一条补的就是"看门的人自己有没有锁门"。
 *
 * 四条可判定的规则（都能被反驳，都能被复现）：
 *   R1 无环：lib/ 内部依赖图不得出现环。环意味着两个模块谁也不能单独理解。
 *   R2 基座不反向依赖：lib/core.js 只能依赖 node 内置，不得 require 其它 lib 模块。
 *   R3 不得向上依赖入口：lib/**、gates/** 不得 require bin/**。
 *   R4 超限文件必须登记：行数 > 阈值的文件必须出现在基线台账里；
 *      新出现的超限文件直接判红（先登记、再拆分，不允许"悄悄长"）。
 *
 * 判定口径：失败只针对"基线之外的新增"。存量债务登记在册，不因为登记就变绿。
 * 退出码：0 = 无新增违规；1 = 有新增违规；2 = 用法/环境错误。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'docs', 'arch-health-baseline.json');
const OVERSIZE_LIMIT = 1200; // 行；与基线分开，改阈值必须写进提交说明
const HISTORY_FILE = path.join(ROOT, 'docs', 'arch-health-history.json');

function listJs(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f));
}

function readLines(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
}

function requiresOf(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = new Set();
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const target = path.normalize(path.join(path.dirname(rel), m[1]));
    const withExt = target.endsWith('.js') ? target : `${target}.js`;
    out.add(withExt.split(path.sep).join('/'));
  }
  return [...out];
}

/** 强连通分量（Tarjan），返回节点数 > 1 的分量 */
function cycles(nodes, edges) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const idx = new Map();
  const low = new Map();
  const out = [];

  function strongconnect(v) {
    idx.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of edges.get(v) || []) {
      if (!idx.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }

    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  }

  for (const v of nodes) if (!idx.has(v)) strongconnect(v);
  return out;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return { oversize: {}, violations: [] };
  const raw = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  return { oversize: raw.oversize || {}, violations: raw.violations || [] };
}

function main(argv) {
  const wantJson = argv.includes('--json');
  const writeBaseline = argv.includes('--write-baseline');
  const known = new Set(['--json', '--write-baseline']);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length) {
    console.error(`arch-health: 未知参数 ${unknown.join(' ')}`);
    return 2;
  }

  const libFiles = listJs('lib');
  const binFiles = listJs('bin');
  const all = [...libFiles, ...binFiles];

  const lines = {};
  for (const f of all) lines[f] = readLines(f);

  const edges = new Map();
  for (const f of all) edges.set(f, requiresOf(f).filter((d) => lines[d] !== undefined));

  const violations = [];
  for (const [comp] of cycles(all, edges)) {
    violations.push({ rule: 'R1', detail: `依赖成环：${comp.join(' ↔ ')}` });
  }

  for (const dep of edges.get('lib/core.js') || []) {
    if (dep.startsWith('lib/') && dep !== 'lib/core.js') {
      violations.push({ rule: 'R2', detail: `lib/core.js 依赖了 ${dep}` });
    }
  }

  for (const f of [...libFiles, ...listJs('gates').filter((x) => x.endsWith('.js'))]) {
    for (const dep of edges.get(f) || []) {
      if (dep.startsWith('bin/')) violations.push({ rule: 'R3', detail: `${f} 向上依赖 ${dep}` });
    }
  }

  const oversize = {};
  for (const f of all) if (lines[f] > OVERSIZE_LIMIT) oversize[f] = lines[f];

  const baseline = loadBaseline();
  const newOversize = Object.keys(oversize).filter((f) => !(f in baseline.oversize));
  for (const f of newOversize) {
    violations.push({ rule: 'R4', detail: `新增超限文件 ${f}（${oversize[f]} 行 > ${OVERSIZE_LIMIT}），先登记再拆` });
  }
  const baselineViolations = new Set(baseline.violations.map((v) => `${v.rule}|${v.detail}`));
  const newViolations = violations.filter((v) => !baselineViolations.has(`${v.rule}|${v.detail}`));

  const total = all.length;
  const oversizeDebt = Object.keys(oversize).length;
  const score = Math.max(0, 40 - newViolations.length * 8 - newOversize.length * 4 - oversizeDebt);

  const report = {
    ts: new Date().toISOString(),
    files: total,
    lines: Object.values(lines).reduce((a, b) => a + b, 0),
    limit: OVERSIZE_LIMIT,
    oversize,
    violations,
    newViolations,
    baseline: { oversize: Object.keys(baseline.oversize).length, violations: baseline.violations.length },
    score,
    ok: newViolations.length === 0,
  };

  if (writeBaseline) {
    fs.writeFileSync(
      BASELINE_FILE,
      `${JSON.stringify({ note: '存量债务台账：登记不等于通过，新增违规仍判红', oversize, violations }, null, 2)}\n`,
      'utf8'
    );
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
      try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { history = []; }
    }
    history.push({ ts: report.ts, files: report.files, lines: report.lines, oversize: oversizeDebt, violations: violations.length, score });
    fs.writeFileSync(HISTORY_FILE, `${JSON.stringify(history.slice(-40), null, 2)}\n`, 'utf8');
    report.written = true;
  }

  if (wantJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`arch-health: ${report.files} 个文件 / ${report.lines} 行 / 阈值 ${OVERSIZE_LIMIT}`);
    console.log(`  超限文件 ${oversizeDebt} 个（已登记 ${Object.keys(baseline.oversize).length}）`);
    for (const [f, n] of Object.entries(oversize)) console.log(`    - ${f} ${n} 行`);
    console.log(`  违规 ${violations.length} 条（新增 ${newViolations.length}）`);
    for (const v of newViolations) console.log(`    x [${v.rule}] ${v.detail}`);
    console.log(`  评分 ${score}/40 · ${report.ok ? '无新增违规' : '有新增违规'}`);
  }

  return report.ok ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
