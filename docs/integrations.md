# 接入：同一套判决，六种入口

> English: [integrations.en.md](integrations.en.md)

判决和退出码到哪都一样：0 过 / 1 红 / 2 用法或环境。下面每条都能单独用，也可以叠加；**装哪一层，判决都来自同一份 `lib/`**。

## 1. 本机钩子（最快）

```bash
npm i -g signoff-cli && cd your-repo && signoff init
```

之后 `git commit` 自动过闸。仓库里已有 lefthook / husky / 自写钩子时加 `--chain`，它只往你的钩子里追加一行，不覆盖。
`signoff status` 告诉你现在装没装上、钩子指向哪。

## 2. GitHub Actions

`signoff init` 会写 `.github/workflows/signoff.yml`（`--no-ci` 跳过）。手写也可以：

```yaml
- uses: ayuanxx-max/signoff-cli@v4.4.5
  with:
    args: all
```

红关会输出 `::error file=…,line=…` 注解并写步骤摘要。

## 3. pre-commit

```yaml
repos:
  - repo: https://github.com/ayuanxx-max/signoff-cli
    rev: v4.4.5
    hooks:
      - id: signoff-guard
```

## 4. lefthook

```yaml
pre-commit:
  commands:
    signoff:
      run: signoff guard
```

## 5. husky

```bash
echo 'signoff guard' > .husky/pre-commit
```

4.x 更推荐 `signoff init --chain`：它认得出 husky 的目录，不会把 `.husky/pre-commit` 覆盖成别的样子。

## 6. VS Code

```bash
signoff init --editor vscode
```

生成任务与问题匹配器，红关直接落到 Problems 面板。

## 7. MCP

`signoff mcp` 以 stdio 提供同样的关，客户端配置里写命令 `signoff`、参数 `mcp` 即可。
注册表条目：`io.github.ayuanxx-max/signoff-cli`（旧的 `io.github.ayuanxx-max/signoff` 冻结在 4.0.2，别再按它装）。

## 发布闸门自己怎么验

`signoff release --pre` 打包 → 装进临时目录 → 跑 `--version` → 完成 MCP 握手；`signoff release --post` 核 npm `latest`、
注册表 `isLatest` 与 `packages[].version`、README 图链。两条都在 `signoff release` 里，不需要额外脚本。
