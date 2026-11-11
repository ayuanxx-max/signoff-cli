# 发布标题的写法

`Releases` 列表里的标题不再写「改了什么」，只写「往哪个方向走了一步」。
细节一律留在 Release 正文（正文仍然是逐条事实、命令与测试结果）。

- 标题格式：`v<版本> — <一句抽象描述>`
- 标题里不出现：文件名、CI、徽章、测试数量、括号补充、"未改判定逻辑"这类限定语
- 正文里必须出现：具体改了什么、`npm test` 数字、`signoff p5` 结果

## 映射（2026-11 起）

| 版本 | 原标题 | 现标题 |
| --- | --- | --- |
| v4.6.2 | 首行徽章恢复（含 CI） | 位置重新对齐 |
| v4.6.1 | 中英同步与行尾无关 | 两种语言，一条线 |
| v4.6.0 | 中英同页、图归位、许可脱敏、发行论证 | 一页之内，两种说法 |
| v4.5.0 | 看板一页看全，说明中英同构 | 一页看全 |
| v4.4.5 | 看板按项目名说话 | 叫对名字 |
| v4.4.4 | 修 arch-health 空转 | 停住空转 |
| v4.4.3 | 对比匿名再收紧 | 再收一寸 |
| v4.4.2 | 对比一律匿名 | 不留名字 |
| v4.4.1 | 文档同步 / docs sync（代码未改） | 说法跟上做法 |
| v4.4.0 | 接口与自治理（判定逻辑未变） | 边界说清楚 |
| v4.3.1 | 英文系统不再误红 | 不再错怪 |
| v4.3.0 | 看板说两种语言 | 两种语言，一种判断 |
| v4.2.3 | 同一个仓库的两种写法 | 一个仓库，两个写法 |
| v4.2.2 | 判定说清楚哪项没过 | 指出是哪一项 |
| v4.2.1 | 看板三处落点 | 一个判决，三处落脚 |
| v4.1.10 | phantom registry versions are now a red gate | 影子版本现形 |
| v4.1.9 | （版本号） | 小步校正 |
| v4.1.8 | registry publish waits for npm | 等它真的落地 |
| v4.1.7 | （版本号） | 一起小修 |
| v4.1.5 | registry publish waits for npm | 发布要等得住 |
| v4.1.4 | docs inside the tarball match the repo | 包里包外一致 |
| v4.1.3 | bilingual docs aligned | 两种语言，一个口径 |
| v4.1.2 | release gate, and a real bug it found | 一道关卡，一个真问题 |
| v4.1.1 | registry ownership fixed | 归属理清 |
| v4.1.0 | repository renamed to signoff-cli | 换了门牌 |
| v4.0.2 | MCP registry publish fixed | 通道打通 |
| v4.0.1 | npx entry fixed | 入口修好 |
| v4.0.0 | renamed to signoff-cli | 从此叫这个名字 |
| v3.15.3 | （版本号） | 稳一点 |
| v3.15.2 | （版本号） | 细处 |

## 边界

- 只改标题（`name`），**正文（`body`）、tag、附件、发布时间一概不动**。
- 标题变虚，正文不变虚：读的人点进去仍然能看到逐条事实。
- 想回退：按上表右列反查，用同一脚本改回左列。
- 发布标题不是版本号来源；`package.json`、`server.json`、`CHANGELOG.md`、`git tag` 的一致性照旧由 `signoff report` 现算。
