# License and legal boundary

> 中文: [legal.md](legal.md)（the same content in Chinese, also at the end of this file）

Three things: how the code is licensed, what the name and icons mean, and what compliance duty stays with the user.
It is a plain-language note for engineers and procurement, **not legal advice**; the binding terms are in
[LICENSE](../LICENSE).

## 1. Code license: MIT, worldwide, no territory limit

- Commercial use, modification, redistribution and private deployment are allowed; you do not have to publish
  your derivative source.
- The only obligation: keep the copyright and permission notice (the full LICENSE text) in copies or substantial
  portions.
- No warranty: the software is provided as is, and the authors are not liable for the consequences of use. That is
  stated by the MIT text itself; this note neither adds to nor removes from it.
- The copyright holder is written as `SignOff contributors`, not a personal name or mailbox: a multi-person project
  does not have to rewrite a legal file on every handover, and no individual is permanently bound into the repository.

## 2. Name, icons, trademarks: not granted by MIT

- `SignOff` / `落印`, the icons and the illustrations in the docs are outside the MIT grant.
- "based on SignOff" or "uses SignOff" is fine; implying you are the official release, an agent for it, or endorsed
  by it is not.
- Third-party tool names and registry entries are cited as facts only; their trademarks belong to their owners, and
  this project has no affiliation, sponsorship or endorsement relationship with them.
- Comparison material is always anonymous (peers A/B/C/D/E/F): no names, no third-party marks used for comparison.

## 3. Data and privacy: local, no telemetry

- No account, no upload, no request to any server; no installation id and no usage statistics.
- Ledger, checkpoints and cache live in the repository's `.signoff/` or the user's `~/.signoff/`; deletion is
  described in [deletion.md](deletion.md).
- The report page is one self-contained file: no external links, no third-party scripts, no remote fonts or images.
- So the tool itself does not process your personal data; what you put into the repository (commit messages, paths)
  is your responsibility.

## 4. User responsibility

- Export control, sanctions and sector regulation (finance, health) are duties on the user's side; this project
  provides no compliance certification and makes no compliance claim.
- Secret scanning reduces the leak surface; it is not a compliance audit. A green verdict does not mean any standard
  is met (SOC 2, ISO 27001).
- What it proves and does not prove: see [trust.md](trust.md).

## 5. Contributions

- A pull request means you license your contribution under MIT; no CLA is required.
- Do not include third-party proprietary code, real credentials or other people's personal data.

## 6. Jurisdiction and disputes

- The MIT text itself names no court; this project adds no exclusive jurisdiction or arbitration clause, so it does
  not collide with mandatory rules in any one legal system.
- Support, SLA and liability caps belong to a commercial contract, not to the open-source license. See
  [release-model.md](release-model.md).

## Appendix: trademark claim and placeholder holder

- (TM) on the name is a claim only; (R) must not be used before registration. Subjects, classes,
  fees and timeline are in `docs/brand-policy.en.md`.
- The copyright holder is the placeholder `SignOff` today. Fix it in four places at once: `LICENSE`,
  `NOTICE`, both READMEs, and the side-inscription inside the mark.
