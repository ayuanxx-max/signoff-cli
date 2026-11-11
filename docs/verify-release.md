# 验证你手上的这个包

声明是"我说"，验证是"你能自己查"。这一页只写命令和判据——每条都能在你机器上跑出来。

## 1. 这个版本由谁构建（provenance）

从 4.7.1 起，npm 上的 `signoff-cli` 由 `.github/workflows/publish.yml` 在 GitHub Actions 上构建并附带
provenance 证明，绑定到**具体提交**与**具体工作流**。

```bash
# npm audit signatures 校验的是"已安装的依赖"，所以先在一个空目录里装上它
mkdir sigcheck && cd sigcheck && npm init -y && npm i signoff-cli@4.7.1
npm audit signatures
# 期望两行：
#   1 package has a verified registry signature
#   1 package has a verified attestation
```

逐条查：

```bash
npm view signoff-cli dist.attestations --json
# 期望：provenance.predicate.buildDefinition 里 externalParameters.workflow.path
#       等于 .github/workflows/publish.yml，且 resolvedDependencies 的提交与 tag 一致
```

没有 attestation 的版本（4.6.2 及更早）**就是没有**——这几版是本地 `npm publish` 发的，别把它们当成经过验证的构建。

## 2. 字节有没有被动过（integrity）

```bash
npm view signoff-cli@<version> dist.integrity dist.shasum
npm pack signoff-cli@<version>            # 下载 tarball
sha512sum signoff-cli-<version>.tgz       # Windows: certutil -hashfile <file> SHA512
# 把 sha512 转 base64 后应与 dist.integrity 的 sha512-<base64> 一致
```

## 3. 代码与 tag 是否一致（可复现）

```bash
git clone https://github.com/ayuanxx-max/signoff-cli && cd signoff-cli
git checkout v<version>                   # tag 必须等于 package.json 的 version
node test/selftest.js                     # 期望 全部通过
node bin/signoff.js p5                    # 期望 PASS
npm pack --dry-run                        # 对照 npm 上 tarball 的文件清单
```

tag 与 `package.json` 版本不一致是发布流水线里的硬失败条件，不会流出一个"标签对不上"的包。

## 4. 发现不一致怎么办

| 现象 | 含义 | 动作 |
| --- | --- | --- |
| 没有 attestation | 该版本不是 CI 构建 | 当作未验证版本，优先用有 attestation 的新版本 |
| integrity 对不上 | tarball 与 registry 记录不符 | 不要安装；报给 npm 与本仓库 issue |
| 工作流路径不是 publish.yml | 不是本仓库的发布入口 | 视为可疑发布，立即报告 |
| tag 与 version 不一致 | 发布流程被绕过 | 报告；该版本按未验证处理 |

## 5. 为什么只有这一页

版权符号、™、NOTICE 都不会阻止别人发一个叫 `signoff-cli` 的假包。能阻止的只有：
带 attestation 的构建、能复算的 integrity、能对照的 tag。所以排他这件事，本项目放在这里，
而不是放在更多的声明里。

## English

# Verify this package

Declarations are "I say"; verification is "you can check". This page lists only commands and criteria.

**1. Who built this version (provenance).** From 4.7.1 on, `signoff-cli` on npm is built by
`.github/workflows/publish.yml` on GitHub Actions with a provenance attestation bound to a specific
commit and workflow. Install it in an empty directory and run `npm audit signatures` (it audits
installed dependencies, not remote ones); expect `1 package has a verified registry signature` and
`1 package has a verified attestation`. `npm view signoff-cli dist.attestations --json` shows the
attestation URL too. Versions without an attestation (4.6.2 and earlier) were published locally and
are not verified builds.

**2. Whether the bytes were altered (integrity).** Compare `npm view signoff-cli@<version>
dist.integrity` with the `sha512` of the downloaded tarball, base64-encoded.

**3. Whether the code matches the tag (reproducible).** Clone, `git checkout v<version>`, run
`node test/selftest.js` and `node bin/signoff.js p5`, and compare `npm pack --dry-run` output with the
published file list. A tag that disagrees with `package.json` is a hard failure in the pipeline.

**4. If something does not match.** No attestation means treat the version as unverified; an integrity
mismatch means do not install and report it; an unexpected workflow path means suspect publishing; a
tag/version mismatch means the release path was bypassed.

**5. Why this page exists.** Copyright symbols, (TM) and NOTICE do not stop anyone from publishing a
fake `signoff-cli`. Attestations, recomputable integrity and tag/version agreement do. That is where
exclusivity lives here.
