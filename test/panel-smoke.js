#!/usr/bin/env node
// 看板面板的浅渲染冒烟：一把极小的 React 桩 + 假 window，把 integrations/dsh-panel/client.js
// 原样加载并渲染一次，确认「一页数据 + 满一页才出现『打开完整页面』」这条规则真的成立。
//
// 用法：node test/panel-smoke.js   → 打印一行 JSON，退出码 0/1
const fs = require("fs");
const path = require("path");

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toHtml(node) {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return esc(node);
  if (Array.isArray(node)) return node.map(toHtml).join("");
  const { type, props, kids } = node;
  if (typeof type === "function") return toHtml(type(Object.assign({}, props, { children: kids })));
  const attrs = Object.keys(props || {})
    .filter((k) => k !== "children" && k !== "style" && !/^on[A-Z]/.test(k))
    .map((k) => ` ${k}="${esc(props[k])}"`)
    .join("");
  return `<${type}${attrs}>${kids.map(toHtml).join("")}</${type}>`;
}

function loadPanel(repo) {
  const src = fs.readFileSync(path.join(__dirname, "..", "integrations", "dsh-panel", "client.js"), "utf8");
  const sandboxWindow = { __ModuleLoader__: { load: (m) => { sandboxWindow.__entry = m; } } };
  const sandboxNavigator = { language: "zh-CN", languages: ["zh-CN"] };

  let hookIndex = 0;
  const React = {
    createElement: (type, props, ...kids) => ({
      type,
      props: props || {},
      kids: kids.flat(9).filter((k) => k !== null && k !== undefined && k !== false),
    }),
    // Board 的三次 useState：data / error / busy。数据直接给成品，避免在同步冒烟里等 fetch。
    useState: (init) => {
      const fixed = [repo ? { repos: [repo], updatedAt: "2026-11-11 15:40" } : null, null, false];
      const value = hookIndex < fixed.length ? fixed[hookIndex] : init;
      hookIndex += 1;
      return [value, () => {}];
    },
    useEffect: () => {},
    useCallback: (fn) => fn,
  };

  const run = new Function("window", "navigator", "require", "console", src);
  run(sandboxWindow, sandboxNavigator, (name) => (name === "react" ? React : require(name)), console);
  const entry = sandboxWindow.__entry;
  if (!entry || typeof entry.factory !== "function") throw new Error("client.js did not register a module");
  const plugin = entry.factory((name) => (name === "react" ? React : require(name)));

  let Main = null;
  plugin.apply({
    slots: {
      inject: (name, fn) => fn(),
      register: (cfg, comp) => {
        if (cfg.name === "main") Main = comp;
        return { dispose() {} };
      },
    },
  });
  if (!Main) throw new Error("panel did not register a main component");
  hookIndex = 0;
  return toHtml(Main({}));
}

function repoOf(tasks) {
  const rows = [];
  for (let i = 1; i <= tasks; i += 1) {
    rows.push({
      id: `g${i}`,
      label: i <= 2 ? `SignOff 项目更新 4.4.${6 - i} 版` : `SignOff · area${i}`,
      count: 5, passed: 5, rate: 100, risk: false, unmarked: 0,
    });
  }
  return {
    slug: "dsh-signoff-abc123",
    name: "dsh-signoff",
    root: "E:/DSH.Jack.01/dsh-signoff",
    verdict: "ready",
    headline: "7 all passed",
    rate: 100,
    commits: 103,
    tasks,
    blockers: [],
    lastRun: { label: "SignOff 项目更新 4.4.5 版", detail: "最近一次跑闸 · 全过 · 0.61s" },
    taskRows: rows,
    checks: [
      { id: "p1", label: "测试", ok: true },
      { id: "p2", label: "覆盖率", ok: true },
      { id: "p3", label: "并发任务", ok: true },
      { id: "p4", label: "危险动作", ok: true },
      { id: "p5", label: "文档", ok: true },
      { id: "sec", label: "密钥", ok: true },
      { id: "release", label: "发布", ok: true },
    ],
  };
}

function main() {
  const big = loadPanel(repoOf(23));
  const small = loadPanel(repoOf(3));
  const out = {
    overflow: /data-signoff="open-page"/.test(big) && /（还有 \d+ 组）/.test(big),
    overflowCount: (big.match(/（还有 (\d+) 组）/) || [])[1] || null,
    compact: /data-signoff="open-page"/.test(small),
    taskRows: (big.match(/data-signoff="task"/g) || []).length,
    lastRunShown: /data-signoff="last-run"/.test(big) && /SignOff 项目更新 4\.4\.5 版/.test(big),
  };
  if (process.env.PANEL_SMOKE_DUMP) require("fs").writeFileSync(process.env.PANEL_SMOKE_DUMP, big, "utf8");
  const ok = out.overflow && out.overflowCount === "14" && !out.compact && out.taskRows === 9 && out.lastRunShown;
  console.log(JSON.stringify(Object.assign({ ok }, out)));
  return ok ? 0 : 1;
}

process.exit(main());
