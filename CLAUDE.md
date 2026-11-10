# CLAUDE.md

本仓库的行为契约只有一处：`docs/REPORT-CONTRACT.md`（报告页 C1…C10）。开工前读它，不要凭记忆改页面。

流程见 `AGENTS.md`：先写失败测试 → 改实现 → `npm test` 全绿 → 提交（钩子跑 p1 + secrets）。

三条红线不在任何模式下放开：`--no-verify`、`SIGNOFF_SKIP=1`、调阈值让红变绿。
