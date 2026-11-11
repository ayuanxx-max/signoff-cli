# 信任与威胁：它凭什么值得你装钩子

> English: [trust.en.md](trust.en.md)

本文回答两个问题：**这个提交当时真的过了吗**（证据），以及**一个判定工具凭什么被请进仓库**（权限边界）。
两件事写在一起，因为答案互相约束：证据再强，也不能超出它拿到的权限。

## 1. 它站在什么位置

装上钩子之后，它的能力接近「仓库的 CI，但跑在你的机器上、以你的身份」：

| 它能 | 因为 |
| --- | --- |
| 读你的工作区 | 要算暂存树、扫密钥、读场景文件 |
| 以你的身份执行命令 | p1 要跑测试套件，p3 要读收集结果 |
| 写 `.signoff/` | marker、账本、检查点、缓存 |
| 装或改 git 钩子 | `init`、`ensure`、机器层 `core.hooksPath` |
| 拦住一次提交 | 非零退出码即判决 |

所以信任边界不是「一个 CLI」，而是「一段会在我提交时自动执行的代码」。

## 2. 四层证据

| 层 | 内容 | 怎么打假 |
| --- | --- | --- |
| 1 marker | `.signoff/passed` = `{tree, mode, ts}`，tree 是 `git write-tree` 的 40 位哈希 | 改动暂存内容后 tree 变，marker 失效 |
| 2 trailer | 提交信息尾部 `Signoff-Pass: <tree12>` + `Signoff-Key` + `Signoff-Sig` | 签名覆盖完整 40 位 tree，改一个字就验不过 |
| 3 账本 | `.signoff/audit.log`，每条 `hash = sha256(prev + body)` | 改内容 → 本条 hash 对不上；改顺序 → prev 对不上 |
| 4 检查点 | `.signoff/checkpoint.json` = `{seq, head, root, key, sig}`，root 是记录哈希的 Merkle 根 | 删掉末尾记录 → seq 与 root 对不上 |

第 4 层补的是前三层的盲区：**删掉末尾几条记录，链本身仍然自洽**。检查点写死「第 N 条之后的样子」，
并允许把一行锚点发布到仓库之外：

```
signoff1:12:9f2c1ab34d0e:71b0c9d2e4a85f61
```

## 3. 篡改与答复

| 攻击 | 结果 |
| --- | --- |
| 改提交信息里的 trailer | `audit --verify` 报 `bad-signature` |
| 改账本某条记录的内容 | `p4 verify` 报 `content hash mismatch` |
| 删掉账本末尾的记录 | `p4 verify --checkpoint` 报 `records were removed` |
| 换一把 key 重新签 | 只有 key 在 `.signoff/allowed_signers` 里才算 `verified`，否则是 `self-signed` |
| 把锚点贴到别处对不上 | `p4 verify --checkpoint --anchor <那行>` 报锚点不匹配 |

## 4. 攻击清单

七条都要求「该红必须红」，不是「成功必须成功」——闸门类工具最容易出的错是该拦的时候放过去了。

| # | 攻击 | 期望结果 |
| --- | --- | --- |
| A1 | 改提交信息里的 `Signoff-Pass` | `bad-signature` |
| A2 | 改账本某条记录内容 | `content hash mismatch` |
| A3 | 删掉账本末尾 N 条 | `records were removed` |
| A4 | 换 key 重新签 | 只算 `self-signed`，除非 key 在 `allowed_signers` |
| A5 | 用陈旧 marker 冒充本次提交 | 不写入 trailer |
| A6 | `--no-verify` 静默跳过 | 提交能成，但 `audit` 报 `skipped` |
| A7 | 把锚点贴到别处对不上 | 锚点不匹配 |

这七条在 `test/selftest.js` 里都有对应的退出码断言；`npm test` 是它们的现场。

## 5. 怎么用

```bash
signoff p4 checkpoint     # 每个仓库一次：写第一个检查点
signoff guard             # 之后每次通过都会自动续签（同一份账本不重复签）
signoff p4 anchor         # 把这一行发到仓库之外：发版说明、CI 步骤摘要、同事的消息
signoff p4 verify --checkpoint --anchor signoff1:12:9f2c1ab34d0e:71b0c9d2e4a85f61
```

## 6. 它不证明什么

- **不证明「是谁」**：默认是仓库内自签。要绑定身份，把公钥写进 `.signoff/allowed_signers`。
- **不证明「活是真人干的」**：测试可以是假的，它只证明「当时这套命令过了」。
- **不防 key 泄露**：拿到私钥的人可以重新签；锚点只能让重写历史变得可见。
- **同时重写账本与检查点并重新签名、且从未发布过锚点**——这种情况下本地无法察觉。
- **不做命令沙箱**：它执行的是仓库自己声明的命令（测试套件、收集脚本），隔离边界该由容器或 CI 提供。
- **不做代码审查**：挡的是「没验证就说完成」，不是「写得糙」。
- **不做产品判断**：七关全过只说明这七件事有人做过、有记录。

## 7. 外部审计就绪清单

审计买不买是预算问题，「能不能被审计」是工程问题。下面每项都要求审计员能自己复现：

| # | 项目 | 状态 | 位置 |
| --- | --- | --- | --- |
| 1 | 威胁模型与信任边界 | 已写 | 本文 |
| 2 | 攻击清单与对应测试 | 已写（A1–A7） | 本文 + `test/selftest.js` |
| 3 | 负面用例：该红必须红 | 有（420 个用例） | `npm test` |
| 4 | 密钥与凭据处理 | 已写 | `lib/secrets.js`、`docs/gates.md` |
| 5 | 依赖面 | 运行时零依赖（仅 Node + git） | `package.json` |
| 6 | 架构自检 | 已加 | `tools/arch-health.mjs`、`docs/ARCH-HEALTH.md` |
| 7 | 发布产物可复现 | 已写 | `signoff release --pre/--post` |
| 8 | 漏洞披露与响应时限 | 已写 | `SECURITY.md` |
| 9 | 第三方审计报告 | **未做** | — |

第 9 项缺着。前 8 项的作用是：审计员来了不用先花两周摸清边界，而不是「我们已经安全」。
