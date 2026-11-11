# 落印 / SignOff

> 你不需要做什么，照常进行任务，由它来守护这个过程。

SignOff 把「做完了」变成一个**别人能复核的判决**：七道关全过才放行，没过的当场拦住，并给出可执行的修法。
纯 Node（>= 18），不联网、不要账号、不装 Python；判决就是一个退出码（`0` 过 / `1` 红 / `2` 用法或环境错）。

English: [README.en.md](README.en.md)

---

## 1. 30 秒上手

```bash
npm i -g signoff-cli
cd your-repo
signoff init            # 装 pre-commit / commit-msg 钩子 + CI，之后不用记
signoff status          # 这个仓库现在被守护了吗
signoff report --html   # 一页只读看板（默认写 .signoff/report.html）
```

装一次就够：每个新克隆 `signoff ensure` 会幂等地补齐钩子、配置和 CI，不用再记命令。

---

## 2. 七道关：它到底挡什么

| 关 | 名字 | 挡什么 | 红了怎么办 |
| --- | --- | --- | --- |
| p1 | 测试 | 测试没跑、跑了没过、超预算 | 跑失败的那条用例，别改预算 |
| p2 | 覆盖率 | 改了代码但场景没覆盖到 | 补 `verify/scenarios/*.json` |
| p3 | 并发任务 | 两路任务改同一个文件 | 按任务卡 scope 拆开 |
| p4 | 危险动作 | 删库、改权限、发布这类动作没有记录 | 先 `signoff p4 ask` 再执行 |
| p5 | 文档 | 「彻底」「必然」这类没有数字支撑的断言 | 换成人话，补数字 |
| sec | 密钥 | 暂存区里有真的密钥 | 删掉值，或在 `.signoff/config.json` 放行这一条 |
| release | 发布 | 版本号 / `server.json` / `CHANGELOG` / tag 对不上 | 补齐四件，再 `signoff release --pre` |

判定细节只有一份：[docs/gates.md](docs/gates.md)（English: [docs/gates.en.md](docs/gates.en.md)）。
终端里问同一件事：`signoff explain p1`。

三条红线在任何模式下都不放开：`--no-verify`、`SIGNOFF_SKIP=1`、调阈值让红变绿。

---

## 3. 看板：一页看完，剩下点开

- `signoff report --html`：一个自包含单文件（离线可开、无外链），七个徽章 + 月历 + 按任务。
- **按项目名说话**：每组任务写成「SignOff 项目更新 4.4.x 版」，最近一次跑闸同一写法；没有版本号的组回落成「SignOff · 区域」。
- **DSH 菜单里的 SignOff 看板**：列出一页数据（判决、七关、最近一次跑闸、组任务），满一页才出现「打开完整页面」。
- 多仓库：`signoff report --repos a,b` 或 `signoff report --scan ~/code`，每仓单独判定，不合并。
- 给别的机器 / 别的 agent：`signoff report --html --mount` 写到 `~/.signoff/reports`，面板读的就是它。

平台与薄壳：一页核心，多个入口，见 [docs/SURFACES.md](docs/SURFACES.md)（English: [docs/SURFACES.en.md](docs/SURFACES.en.md)）。

---

## 4. 接入：同一套判决，六种入口

| 入口 | 一句话 |
| --- | --- |
| 本机钩子 | `signoff init` 装 pre-commit / commit-msg，提交时自动跑 |
| GitHub Actions | `signoff init` 顺带写 workflow（`--no-ci` 可跳过） |
| pre-commit | `.pre-commit-config.yaml` 里一行 hook |
| lefthook / husky | 已有钩子的仓库用 `signoff init --chain`，不抢你的钩子 |
| VS Code | `signoff init --editor vscode` 生成 tasks + 问题匹配器 |
| MCP | `signoff mcp` 以 stdio 提供同样的关 |

逐步做法：[docs/integrations.md](docs/integrations.md)（English: [docs/integrations.en.md](docs/integrations.en.md)）。

---

## 5. 和谁比（一律匿名）

同类不是代码审查工具，而是**抢同一个 `pre-commit` 钩子的那一层**。表格只留能判定的行为与量级：

| 同行 | 给判决 | 留证据 | 采用量 |
| --- | --- | --- | --- |
| B1 | 否（只传退出码） | 否 | 千万级/周以上 |
| B2 | 半（记录跑没跑） | 否 | 千万级/周以上 |
| B3 | 否 | 否 | 千万级/周以上 |
| C | 单关结论 | 只留扫描报告 | 数万 star 级 |
| **SignOff** | **是** | **是** | 数千/周 |

不写实现语言、不写包名、不写各家精确数字——一写就能反推到具体项目，标记就白做了。
完整对照：[docs/COMPARISON.md](docs/COMPARISON.md)（English: [docs/COMPARISON.en.md](docs/COMPARISON.en.md)）。

---

## 6. 边界：它不保证什么

- **它不替你做判断**：七关全过只说明「这七件事有人做过、有记录」，不说明产品对。
- **规模差得远**：同行在千万级/周的采用量，本工具是数千/周。**如果按采用量选型，今天就不该选它。**
- **没有第三方审计**：账本是本机自签的，能证明「没被人悄悄改过」，不能证明「跑的人可信」。
- **不做代码审查**：它挡的是「没验证就说完成」，不是「这段代码写得糙」。

信任模型与它不证明什么：[docs/trust.md](docs/trust.md)（English: [docs/trust.en.md](docs/trust.en.md)）。

---

## 7. 文档索引

**用户向**

| 文档 | 内容 |
| --- | --- |
| [docs/gates.md](docs/gates.md) | 七道关的判定与修法（唯一权威） |
| [docs/integrations.md](docs/integrations.md) | 钩子 / CI / MCP / 编辑器接法 |
| [docs/trust.md](docs/trust.md) | 证据链、篡改答复、威胁模型 |
| [docs/COMPARISON.md](docs/COMPARISON.md) | 匿名对照（含象限图） |
| [docs/SURFACES.md](docs/SURFACES.md) | 平台薄壳一览 |

**维护者向**

| 文档 | 内容 |
| --- | --- |
| [docs/ARCH-HEALTH.md](docs/ARCH-HEALTH.md) | 架构自检：依赖成环、超限文件、基线 |
| [docs/deletion.md](docs/deletion.md) | 卸载与删除数据的边界 |
| [docs/promotion.md](docs/promotion.md) | 对外讲述口径（提问从哪来） |
| [docs/diagrams/README.md](docs/diagrams/README.md) | 图源与重绘命令 |

**契约（改代码前必读）**

| 文档 | 内容 |
| --- | --- |
| [docs/REPORT-CONTRACT.md](docs/REPORT-CONTRACT.md) | 报告页与 `--json` 的契约（C1…C11） |
| [docs/INTEGRATION-CONTRACT.md](docs/INTEGRATION-CONTRACT.md) | 各平台薄壳的接线契约 |

英文版与中文版同构：上面每篇都有对应的 `.en.md`（契约类只有中文，英文摘要见各篇开头）。

---

## 许可

MIT。见 [LICENSE](LICENSE)。
