signoff-cli — 报告页与闸门的唯一契约在 `docs/REPORT-CONTRACT.md`（C1…C10）。

改 `lib/report.js` / `lib/report-page.js` 前先读它；改完同步改 `test/selftest.js` 的对应断言（`npm test`）。
页面不得有外链、`fetch`、或任何能通过/跳过/放宽闸门的控件。流程见 `AGENTS.md`。
