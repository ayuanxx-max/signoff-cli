# SignOff 看板（DSH 面板）

DSH 菜单里的「SignOff 看板」：只读，一页数据，满一页才给「打开完整页面」。

## 它显示什么

一个仓库一张卡：

| 行 | 内容 |
| --- | --- |
| 标题行 | 仓库名 · 判决（全过 / 未过 / 待测） · 过闸率 · 提交数 · 组任务数 |
| 最近一次跑闸 | `SignOff 项目更新 4.4.x 版 · 最近一次跑闸 · 全过 · 0.61s` |
| 挡路项 | 最多 3 条：哪一关、为什么、怎么修 |
| 七关徽章 | p1 / p2 / p3 / p4 / p5 / sec / release |
| 组任务 | 最多 9 行（挡路项占几行，任务就少几行） |
| 按钮 | 只有还有没画完的组任务时，才出现「打开完整页面（还有 N 组）」 |

一页就是这些：不做滚动加载、不折叠、不弹窗。想看全部就点按钮，用系统浏览器打开 `.signoff/reports/<slug>/latest.html`。

## 数据从哪来

`signoff report --html --mount` 写到 `~/.signoff/reports/`：`index.json` + 每仓一个 `report.json` / `latest.html`。
面板只读这几个文件，不跑任何关、不写任何状态、不改变阈值（与报告契约 C1、C2 一致）。

## 平台

面板本身不依赖平台：只要宿主能把 `integrations/dsh-panel` 当插件加载，卡片内容一致。
其他入口（CLI 页面、MCP、CI 摘要）见 [docs/SURFACES.md](../../docs/SURFACES.md)。

English: the panel is read-only. One card per repository, one page of data, and the "Open full page" button appears
only when there are task groups left to show.
