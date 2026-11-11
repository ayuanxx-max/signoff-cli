#!/usr/bin/env node
// 中英同构：把 <name>.en.md 的全文（标题降一级）追加到 <name>.md 末尾，放在 `## English` 之下。
// 英文正文只有一个源头（.en.md），本工具负责「同一份内容两处可用」；--check 供自测使用。
//
//   node tools/sync-bilingual.mjs          # 写入
//   node tools/sync-bilingual.mjs --check  # 只校验，不一致则退出 1
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const PAIRS = [
  ["README.md", "README.en.md"],
  ["docs/gates.md", "docs/gates.en.md"],
  ["docs/integrations.md", "docs/integrations.en.md"],
  ["docs/trust.md", "docs/trust.en.md"],
  ["docs/SURFACES.md", "docs/SURFACES.en.md"],
  ["docs/COMPARISON.md", "docs/COMPARISON.en.md"],
  ["docs/legal.md", "docs/legal.en.md"],
  ["docs/release-model.md", "docs/release-model.en.md"],
];

const BEGIN = "<!-- EN-BEGIN";
const MARK = "<!-- EN-END -->";

function demote(md) {
  return md.replace(/^(#{1,5}) /gm, (_, hashes) => `${"#".repeat(Math.min(hashes.length + 1, 6))} `);
}

function block(enRel, enText) {
  return `${BEGIN} auto-embedded from ${enRel}; edit that file and run node tools/sync-bilingual.mjs -->\n\n## English\n\n${demote(enText.trimEnd())}\n\n${MARK}`;
}

function splitZh(zhText) {
  const at = zhText.indexOf(BEGIN);
  if (at < 0) return { head: zhText.trimEnd(), tail: "" };
  return { head: zhText.slice(0, at).trimEnd(), tail: zhText.slice(at).trimEnd() };
}

function desired(zhPath, enPath) {
  const enRel = path.relative(root, path.join(root, enPath)).split(path.sep).join("/");
  const enText = fs.readFileSync(path.join(root, enPath), "utf8");
  const { head } = splitZh(fs.readFileSync(path.join(root, zhPath), "utf8"));
  return `${head}\n\n${block(enRel, enText)}\n`;
}

const check = process.argv.includes("--check");
let bad = 0;

for (const [zhPath, enPath] of PAIRS) {
  const zhAbs = path.join(root, zhPath);
  const enAbs = path.join(root, enPath);
  if (!fs.existsSync(zhAbs) || !fs.existsSync(enAbs)) {
    console.error(`missing pair: ${zhPath} / ${enPath}`);
    bad += 1;
    continue;
  }
  const want = desired(zhPath, enPath);
  const have = fs.readFileSync(zhAbs, "utf8");
  if (check) {
    if (have.trimEnd() !== want.trimEnd()) {
      console.error(`out of sync: ${zhPath} (run node tools/sync-bilingual.mjs)`);
      bad += 1;
    }
    continue;
  }
  if (have.trimEnd() !== want.trimEnd()) {
    fs.writeFileSync(zhAbs, want, "utf8");
    console.log(`synced ${zhPath} <- ${enPath}`);
  }
}

if (check) {
  console.log(bad === 0 ? `bilingual pairs in sync: ${PAIRS.length}` : `${bad} pair(s) out of sync`);
  process.exit(bad === 0 ? 0 : 1);
}
