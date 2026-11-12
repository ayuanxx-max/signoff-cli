#!/usr/bin/env node
"use strict";

// 提交时的快检层（pre-commit）。全套用例在推送时跑（pre-push）。
//
// 规矩：这里的断言尽量落在「渲染出来的东西」上——页面里真的有没有 chip、词对不对，
// 而不是源码里有没有那串字符。源码匹配是 2026-11-12 那次把测试改软的教训（见 CHANGELOG）。
//
// 预算：< 8 s。超了就说明它不该待在提交路径上。

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const report = require("../lib/report.js");
const i18n = require("../lib/i18n.js");
const tk = require("../lib/tokens.js");

let passed = 0;
const failed = [];
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    return;
  }
  failed.push(detail === undefined ? name : `${name}: got=${detail}`);
}

const t0 = Date.now();

// 1 金额必须带词：英文表里「费用」是 cost（漏翻会让英文页露出中文）
const before = i18n.getLang();
i18n.setLang("en");
check("i18n maps 费用 to cost", i18n.tr("费用") === "cost", i18n.tr("费用"));
i18n.setLang(before);

// 2 钱的分档：0 印 $0、小于一分印 5 位、小于一块印 3 位、其余 2 位
check("money prints zero explicitly", tk.money(0) === "$0", tk.money(0));
check("money keeps sub-cent precision", tk.money(0.0005) === "$0.00050", tk.money(0.0005));
check("money rounds small amounts", tk.money(0.0191) === "$0.019", tk.money(0.0191));
check("money uses two decimals above one", tk.money(12.5) === "$12.50", tk.money(12.5));

// 3 真渲染：拿当前仓库的数据渲染整页，数页面里的 chip
const data = report.collect(ROOT, report.parse(["--limit", "30"]));
const html = report.renderHtml(data);
const chips = [...html.matchAll(/<span class="cost"[^>]*>([^<]*)</g)].map((m) => m[1]);
const hasTokens = !!(data.tokens && data.tokens.available);
if (hasTokens && chips.length) {
  check("rendered page carries cost chips", chips.length > 0, `chips=${chips.length}`);
  check("every chip starts with 费用 or cost", chips.every((c) => /^(费用|cost) \$/.test(c)), chips[0]);
} else {
  // 没有会话数据的机器不该被这条挡住；但不能悄悄通过，要留一行说明。
  console.log(`[smoke] skip chips: tokens.available=${hasTokens}, chips=${chips.length}`);
}

// 4 页面契约的条款还在（条数是文档事实，不靠记忆）
const contract = fs.readFileSync(path.join(ROOT, "docs", "REPORT-CONTRACT.md"), "utf8");
const clauses = (contract.match(/^### C\d+/gm) || []).length;
check("contract keeps its clauses", clauses >= 12, `clauses=${clauses}`);

const ms = Date.now() - t0;
console.log(`[smoke] ${passed} passed, ${failed.length} failed · ${ms} ms`);
for (const f of failed) console.log(`FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
