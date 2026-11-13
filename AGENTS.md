# AGENTS.md — signoff-cli

这个仓库的一切"该怎么改"都以 `docs/REPORT-CONTRACT.md` 为准；本文件只做指路与流程，不重复条款。

## 先读什么

1. `docs/REPORT-CONTRACT.md` —— 报告页的契约（C1…C11），改 `lib/report.js` / `lib/report-page.js` 前必读。
2. `README.md` —— 命令行与闸门语义。
3. `docs/gates.md` —— 七道关的判定细节（p1…p5、sec、release）。

## 怎么改

- 逻辑变更先写失败测试（`test/selftest.js`），再改实现；`npm test` 必须全绿。
- 只改必须改的文件；不要顺手重排、重命名、加依赖。
- 页面只允许"切换视图"的脚本；不得引入外链、`fetch`、或任何能通过/跳过/放宽闸门的控件（C2、C3）。
- 三条红线不在任何模式下放开：`--no-verify`、`SIGNOFF_SKIP=1`、调阈值让红变绿。

## 提交前

```bash
npm run test:fast         # 提交时的快检层（8 项，约 2.4 s）
npm test                  # 全套（两段并行，约 50 s）；钩子在 push 时跑它
signoff p5                # 文档口径扫描（会挡"绝对/必然"这类无数字断言）
git add -A && git commit # 钩子会跑 p1（test:fast）+ secrets
```

## 发布

**发布口令（2026-11-11）：只有用户说出「发布 x.x.x」（带明确版本号）才走下面这条流程；其余说法一律只提交。**
「暂不发布、只进本地仓库」= 只 commit 到本地 master，origin 落后是正常的，不 push、不 tag、不发 npm。

发布流程：`npm test` → `signoff p5` → `signoff release --pre` → bump + commit + `git push` master →
打 tag 推 tag（`publish.yml` 在 tag 上构建并带 provenance 发 npm，本地不裸发）→ `signoff release --post`。
版本号、`package.json`、`server.json`、`CHANGELOG.md`、`git tag` 必须一致；
`signoff report` 的「发布」项会现算这几件事，不一致就是红。

发完不要手动轮询：`node tools/watch-release.js` 一条命令等到 npm / MCP 注册表 / tag / GitHub Release
四条腿全到位（每个渠道看事实，默认 10 分钟上限，`--once` 只问一次）。实测四条渠道 1.3 s 内可判完，
而 4.8.0 那次发布真正耗掉的时间几乎全是「起 shell、sleep、再问一遍」的重复轮询。
