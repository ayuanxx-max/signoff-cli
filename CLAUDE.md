# CLAUDE.md

本仓库的行为契约只有一处：`docs/REPORT-CONTRACT.md`（报告页 C1…C11）。开工前读它，不要凭记忆改页面。

流程见 `AGENTS.md`：先写失败测试 → 改实现 → `npm test` 全绿 → 提交（钩子跑 p1 + secrets）。

三条红线是记录边界，不是「不可绕过」：`SIGNOFF_SKIP=1` 会跳过并写 `.signoff/skips.log`；`--no-verify` 什么都不留
（所以 CI 是唯一硬边界）；调阈值只改自己的判定标准。
