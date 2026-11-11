# 许可与法律边界

> English: [legal.en.md](legal.en.md)（同一份内容的英文版，也在本文末尾）

本文说明三件事：代码怎么被授权、名字与图标怎么算、使用者在合规上承担什么。
它是给工程与采购看的白话版，**不构成法律意见**；正式条款以 [LICENSE](../LICENSE) 原文为准。

## 1. 代码许可：MIT，全球范围、无地域限制

- 允许商业使用、修改、分发、私有化部署，不要求公开你的衍生代码。
- 唯一义务：在副本或实质部分里保留版权声明与许可声明（即 LICENSE 全文）。
- 无担保：软件按现状提供，作者不为使用后果承担赔偿责任 —— 这段由 MIT 原文规定，本文不增加也不削减。
- 著作权人写作 `SignOff contributors`（项目名义），不写个人姓名或私人邮箱：
  多人协作时不必反复改法律文件，也避免把个人身份长期绑在仓库里。

## 2. 名字、图标与商标：MIT 不授予

- `SignOff` / `落印`、图标与文档插图不在 MIT 授权范围内。
- 可以写「基于 SignOff」「uses SignOff」，但不能让人误以为你是官方发行、代理或获得背书。
- 文中出现的第三方工具名、注册表条目只作事实性引用；商标归各自所有者，本项目与它们没有隶属、赞助或背书关系。
- 对比材料一律匿名（同行 A/B/C/D/E/F），不点名、不引用他人商标做比较。

## 3. 数据与隐私：本机运行、无遥测

- 不收集账号，不上传代码，不向任何服务端发请求；没有安装 ID，也没有使用统计。
- 账本、检查点、缓存写在仓库的 `.signoff/` 或用户目录的 `~/.signoff/` 下，删除方式见 [deletion.md](deletion.md)。
- 报告页是自包含单文件：没有外链、不加载第三方脚本、不引用远程字体或图片。
- 因此本工具本身不处理你的个人数据；你放进仓库的内容（提交信息、文件路径）由你负责。

## 4. 使用者责任

- 出口管制、制裁、行业监管（金融、医疗等）的合规义务在使用者一侧；本项目不提供合规认证，也不做合规声明。
- 密钥扫描的作用是减少泄漏面，不等同于合规审计；判定通过不代表满足任何标准（如 SOC 2、ISO 27001）。
- 它能证明什么、不证明什么，见 [trust.md](trust.md)。

## 5. 贡献

- 提交即表示你同意以 MIT 许可你的贡献；不要求签署 CLA（贡献者许可协议）。
- 贡献里不要包含第三方专有代码、真实密钥或他人个人信息。

## 6. 管辖与争议

- MIT 文本本身不指定管辖法院；本项目不在许可里额外加入排他管辖或仲裁条款，避免与不同法域的强制规定冲突。
- 采购合同层面的支持、SLA、赔偿上限属于商业合同，不在开源许可里承诺；讨论见 [release-model.md](release-model.md)。

<!-- EN-BEGIN auto-embedded from docs/legal.en.md; edit that file and run node tools/sync-bilingual.mjs -->

## English

## License and legal boundary

> 中文: [legal.md](legal.md)（the same content in Chinese, also at the end of this file）

Three things: how the code is licensed, what the name and icons mean, and what compliance duty stays with the user.
It is a plain-language note for engineers and procurement, **not legal advice**; the binding terms are in
[LICENSE](../LICENSE).

### 1. Code license: MIT, worldwide, no territory limit

- Commercial use, modification, redistribution and private deployment are allowed; you do not have to publish
  your derivative source.
- The only obligation: keep the copyright and permission notice (the full LICENSE text) in copies or substantial
  portions.
- No warranty: the software is provided as is, and the authors are not liable for the consequences of use. That is
  stated by the MIT text itself; this note neither adds to nor removes from it.
- The copyright holder is written as `SignOff contributors`, not a personal name or mailbox: a multi-person project
  does not have to rewrite a legal file on every handover, and no individual is permanently bound into the repository.

### 2. Name, icons, trademarks: not granted by MIT

- `SignOff` / `落印`, the icons and the illustrations in the docs are outside the MIT grant.
- "based on SignOff" or "uses SignOff" is fine; implying you are the official release, an agent for it, or endorsed
  by it is not.
- Third-party tool names and registry entries are cited as facts only; their trademarks belong to their owners, and
  this project has no affiliation, sponsorship or endorsement relationship with them.
- Comparison material is always anonymous (peers A/B/C/D/E/F): no names, no third-party marks used for comparison.

### 3. Data and privacy: local, no telemetry

- No account, no upload, no request to any server; no installation id and no usage statistics.
- Ledger, checkpoints and cache live in the repository's `.signoff/` or the user's `~/.signoff/`; deletion is
  described in [deletion.md](deletion.md).
- The report page is one self-contained file: no external links, no third-party scripts, no remote fonts or images.
- So the tool itself does not process your personal data; what you put into the repository (commit messages, paths)
  is your responsibility.

### 4. User responsibility

- Export control, sanctions and sector regulation (finance, health) are duties on the user's side; this project
  provides no compliance certification and makes no compliance claim.
- Secret scanning reduces the leak surface; it is not a compliance audit. A green verdict does not mean any standard
  is met (SOC 2, ISO 27001).
- What it proves and does not prove: see [trust.md](trust.md).

### 5. Contributions

- A pull request means you license your contribution under MIT; no CLA is required.
- Do not include third-party proprietary code, real credentials or other people's personal data.

### 6. Jurisdiction and disputes

- The MIT text itself names no court; this project adds no exclusive jurisdiction or arbitration clause, so it does
  not collide with mandatory rules in any one legal system.
- Support, SLA and liability caps belong to a commercial contract, not to the open-source license. See
  [release-model.md](release-model.md).

<!-- EN-END -->
