#!/usr/bin/env node
// 把「发行节奏」变成可复现的数字，而不是文档里手抄的结论。
//
//   node tools/release-cadence.mjs         # 本地 git 能算的（离线）
//   node tools/release-cadence.mjs --npm   # 外加 npm 按版本的周下载（联网）
//
// 输出 JSON，方便贴进文档或对比两次测量。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const withNpm = process.argv.includes("--npm");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const tags = git("tag", "--sort=creatordate")
  .split("\n")
  .map((t) => t.trim())
  .filter(Boolean);

const dated = tags.map((tag) => ({
  tag,
  date: git("log", "-1", "--format=%cs", tag),
}));

const days = dated.map((d) => d.date);
const gaps = days.slice(1).map((d, i) => (Date.parse(d) - Date.parse(days[i])) / 86_400_000);

const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const sections = (changelog.match(/^## /gm) || []).length;
const breaking = (changelog.match(/BREAKING|不兼容|破坏性/g) || []).length;

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const nodeMatrix = (workflow.match(/node:\s*\[([^\]]+)\]/) || [, ""])[1]
  .split(",")
  .map((n) => Number(n.trim()))
  .filter(Boolean);
const enginesNode = (pkg.engines && pkg.engines.node) || "";
const minMajor = Number((enginesNode.match(/\d+/) || [0])[0]) || 0;

const report = {
  version: pkg.version,
  tags: tags.length,
  firstTag: dated[0] ? `${dated[0].tag}@${dated[0].date}` : null,
  lastTag: dated.at(-1) ? `${dated.at(-1).tag}@${dated.at(-1).date}` : null,
  spanDays:
    days.length > 1
      ? Math.round((Date.parse(days.at(-1)) - Date.parse(days[0])) / 86_400_000)
      : 0,
  gapMedianDays: median(gaps),
  gapMaxDays: gaps.length ? Math.max(...gaps) : 0,
  sameDayReleases: gaps.filter((g) => g === 0).length,
  changelogSections: sections,
  breakingMarkers: breaking,
  engines: { node: enginesNode, minMajor },
  ciNodeMatrix: nodeMatrix,
  enginesMatchesCi: minMajor > 0 && nodeMatrix.length > 0 && minMajor === Math.min(...nodeMatrix),
};

if (!report.enginesMatchesCi) {
  report.note = `engines says node >=${minMajor || "?"} but CI tests ${nodeMatrix.join(", ") || "nothing"}; one of them is lying`;
}

if (withNpm) {
  const res = await fetch("https://api.npmjs.org/versions/signoff-cli/last-week");
  if (!res.ok) {
    report.npm = { error: `HTTP ${res.status}` };
  } else {
    const body = await res.json();
    report.npm = {
      window: "last-week",
      top: Object.entries(body.downloads)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([version, downloads]) => ({ version, downloads })),
    };
  }
}

console.log(JSON.stringify(report, null, 2));
