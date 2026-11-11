# Brand and trademark policy (placeholder holder)

This file is the single source for "who owns what, when we may write ™, how we get ®".
`docs/legal.md` states the legal boundary; this file states what to actually do.

## 1. The holder: what we write today

| Surface | Today | After the name is fixed |
| --- | --- | --- |
| `LICENSE` | `Copyright (c) 2026 SignOff contributors` | legal name or registered company name |
| `NOTICE` / `README` code line | `© 2026 SignOff contributors` | same |
| Mark, name, illustrations | `© 2026 SignOff` | same |
| Mark side-inscription (inside the artwork) | `© 2026 SignOff` | same, requires re-export of SVG/PNG |

**`SignOff` is a placeholder holder, not a legal person.** Fixing the name touches exactly four
places: `LICENSE`, `NOTICE`, one line in each README, and the side-inscription inside the mark.
No script does this replacement, because changing the holder must be a human decision.

## 2. How to use ™ (available today)

- **™ requires no registration.** It is a claim only and can be used by anyone, in any class.
- Form: right after the name, `SignOff™`, `落印™`. No space before it.
- Use it **once, at first mention**. Repeating it adds nothing and reads like advertising.
- **Never write ® before registration.** Chinese trademark law treats an unregistered ® as
  "passing off as registered" and allows an order to correct it plus a fine.
- Current usage: the README heading line, the name section of `NOTICE`, the mark's `alt` text.

## 3. Exclusivity: what to register

### 3.1 Three filings

| Subject | Notes | Distinctiveness |
| --- | --- | --- |
| Word `SignOff` | English name | Weak: an ordinary phrase, easily read as descriptive |
| Word `落印` | Chinese name | Medium: coined compound, the better lead mark |
| Device (the S seal) | current mark | Strong: original drawing, the safest filing |

Strategy: file **`落印` word + device** first (low refusal risk), and file `SignOff` only as part of
a combined mark (`落印 SignOff` + device) to avoid a descriptiveness refusal on its own.

### 3.2 Classes (CNIPA, one mark per class)

| Class | Covers | Needed |
| --- | --- | --- |
| **9** | downloadable software, computer programs | yes |
| **42** | software design and development, SaaS, technical consulting | yes |
| 35 | advertising, business management, marketplace operation | if commercial |
| 41 | training, publishing, online content | optional |

### 3.3 Cost and timeline (China, subject to official notices)

| Item | Value |
| --- | --- |
| Official fee | about CNY 270 per class online (10 goods items, extra per item) |
| Agent fee | CNY 600–1500 per class (self-filing is free of agent cost) |
| Filing receipt | about 1 month |
| Substantive examination | about 4–6 months |
| Publication + opposition window | 3 months |
| Registration, if smooth | **about 7–10 months** |
| Term | 10 years, renewable within 12 months before expiry |

Two core classes × two subjects = 4 filings, about CNY 1080 in official fees.

### 3.4 International (only if needed)

| Route | Coverage | Order of cost |
| --- | --- | --- |
| Madrid system | many countries from one application, needs a Chinese base filing | CNY 10k–30k |
| USPTO | United States | USD 250–350 per class + agent |
| EUIPO | 27 countries | EUR 850 for the first class |

Do China properly first. The real risk for an open-source project is squatting on domestic
platforms and on npm, not overseas.

## 4. Search before filing

1. **CNIPA search** (`sbj.cnipa.gov.cn`) for `落印` and `SignOff`, classes 9 and 42.
2. Device search using the **black-and-white line drawing** of the mark, with colour removed.
3. Platform search: GitHub, npm, V2EX, Jike, Xiaohongshu for projects already using the name.
4. Domains and handles: related domains, GitHub org, npm scope, WeChat official account.

## 5. Evidence of use (start now)

- First commit: `git log --reverse --format='%ad %H %s' | head -1`
- npm launch time: `npm view signoff-cli time`
- Release page URLs and download counts
- Outward material carrying the mark

Archive quarterly under `docs/evidence/`, which is not shipped in the npm package.

## 6. After registration

1. Replace ™ with ® — **only in the registered classes and territory**.
2. Add the registration number and classes to README and NOTICE.
3. Watch: search for similar marks every six months; oppose within the 3-month publication window.

## 7. Minimum actions now

| Priority | Action | Cost |
| --- | --- | --- |
| P0 | Mark ™ in README/NOTICE, note the placeholder holder | 0 |
| P0 | One CNIPA search to see whether `落印` in classes 9/42 is free | 0 |
| P1 | File `落印` word + device, classes 9 and 42 (4 filings) | about CNY 1080 |
| P1 | Register the domain and npm scope | tens to hundreds per year |
| P2 | Archive first commit, npm launch, releases | 0 |
| P2 | Add class 35 and Madrid when commercialisation starts | depends |
