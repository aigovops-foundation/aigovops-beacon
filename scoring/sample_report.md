# AIGovOps Beacon — sample scoring report

Generated from **46 synthetic receipts** covering the evidence types a maturing AI program typically has on hand at the end of its first quarter. The org touches **97 controls** across the 23 frameworks in the registry.

## Executive summary

The org's **AI Risk Index is 55.42 / 100** (lower is better). The strongest coverage is in voluntary, governance-led standards — ISO/IEC 23894, SOC 2, and ISO/IEC 42001 — where management-system evidence already exists from broader compliance programs. The weakest coverage is in jurisdictional regimes that require **post-deployment surveillance, incident reporting, and redress** (India DPDP, China Interim Measures, NYC LL 144, GDPR Art 22/35). The single biggest lift across the portfolio is a credible incident-response and bias-audit posture; closing those two evidence families would move the index by roughly 8–12 points.

## Per-framework scores

| Framework | Score | Controls covered | Open gaps | Top gap |
|---|---:|---:|---:|---|
| `iso-iec-23894` (AI risk management) | 80.3 | 8/10 | 2 | 6.1 |
| `soc-2-tsc` (SOC 2 TSC) | 69.9 | 7/10 | 3 | CC7.1 |
| `iso-iec-42001` (ISO 42001) | 65.8 | 6/10 | 4 | 6.2 |
| `uk-ai-regulation-white-paper` (UK AI White Paper) | 62.6 | 6/10 | 4 | Contestability and redress |
| `australia-ai-ethics-voluntary-ai-safety-standard` (AI Ethics + VAISS) | 61.5 | 6/10 | 4 | C-04 |
| `brazil-pl-2338-2023-lgpd` (Brazil AI Bill / LGPD) | 61.2 | 6/10 | 4 | ART-19 |
| `nist-ai-rmf` (AI RMF) | 58.4 | 5/9 | 4 | GOVERN-2.1 |
| `singapore-model-ai-governance-framework-genai-2024` (GenAI MGF) | 57.1 | 5/9 | 4 | D6 |
| `eu-ai-act` (EU AI Act) | 50.0 | 5/10 | 5 | Art. 12 |
| `oecd-ai-principles` (OECD AI Principles) | 50.0 | 4/9 | 5 | 1.4 |
| `colorado-ai-act-sb24-205` (Colorado AI Act) | 47.5 | 5/10 | 5 | 6-1-1702(1) |
| `korea-ai-basic-act` (AI Basic Act) | 45.7 | 4/10 | 6 | Art. 4 |
| `us-ai-bill-of-rights` (AI Bill of Rights) | 40.0 | 4/10 | 6 | SAFE-2 |
| `ieee-7000-2021` (IEEE 7000) | 37.3 | 3/8 | 5 | IEEE7000-1 |
| `sb-53-ca` (SB 53) | 36.5 | 3/9 | 6 | C-03 |
| `hipaa-security-rule` (HIPAA Security Rule) | 32.5 | 3/10 | 7 | 164.308(a)(1)(ii)(D) |
| `gdpr-article-22-35` (GDPR) | 32.2 | 3/10 | 7 | Art. 22(1) |
| `aida-canada` (AIDA) | 29.6 | 3/10 | 7 | s.7 |
| `texas-responsible-ai-governance-act` (TRAIGA) | 29.4 | 3/10 | 7 | 551.051 |
| `nyc-local-law-144` (Local Law 144) | 25.9 | 3/10 | 7 | 20-871(a)(1) |
| `un-ga-a-78-l-49` (UN AI resolution) | 25.4 | 2/8 | 6 | OP1 |
| `china-interim-measures-generative-ai-services` (Generative AI Measures) | 19.1 | 2/12 | 10 | Art. 2 |
| `india-dpdp-act` (DPDP Act) | 9.4 | 1/10 | 9 | 3 |

## Highest-severity gaps (across all frameworks)

| Framework | Control | Severity | Weight | Statement |
|---|---|---|---:|---|
| `aida-canada` | `s.17` | critical | 10 | Cease using or making available a high-impact system if ordered because it gives rise to a serious risk of imminent harm. |
| `brazil-pl-2338-2023-lgpd` | `LGPD-PRINCIPLES` | critical | 10 | Personal data processed by AI must comply with LGPD principles including purpose, adequacy, necessity, transparency, security, prevention, nondiscrimination, ac |
| `china-interim-measures-generative-ai-services` | `Art. 14` | critical | 10 | Detect illegal content, stop generation and transmission, remediate via model optimization where needed, preserve records, and report to authorities. |
| `colorado-ai-act-sb24-205` | `6-1-1703(4)(b)(I)-(III)` | critical | 10 | For adverse consequential decisions, a deployer must provide principal reasons, an opportunity to correct incorrect personal data, and an appeal process with hu |
| `eu-ai-act` | `Art. 15` | critical | 10 | High-risk AI systems must achieve an appropriate level of accuracy, robustness, and cybersecurity, and those properties must be validated and maintained. |
| `eu-ai-act` | `Art. 99` | critical | 10 | Member States must lay down effective, proportionate, and dissuasive penalties for infringements of the Regulation and ensure enforcement mechanisms are in plac |
| `gdpr-article-22-35` | `Art. 22(4)` | critical | 10 | Do not base qualifying automated decisions on special-category personal data unless Article 9(2)(a) or 9(2)(g) applies and safeguards are in place. |
| `gdpr-article-22-35` | `Art. 35(3)(a)` | critical | 10 | Perform a DPIA for systematic and extensive evaluation of personal aspects based on automated processing, including profiling, when decisions produce legal effe |
| `ieee-7000-2021` | `IEEE7000-4` | high | 10 | Ethical values shall be traced in the concept of operations, ethical requirements, and ethical risk-based design. |
| `india-dpdp-act` | `6` | critical | 10 | Obtain valid, specific, informed, unambiguous, affirmative consent and support easy withdrawal and consent-manager handling where used. |
| `india-dpdp-act` | `8(1)-(8)` | critical | 10 | Maintain organizational accountability for processor use, data quality for consequential decisions, security safeguards, breach notification, retention/erasure, |
| `india-dpdp-act` | `9` | critical | 10 | If the AI system processes children's data, obtain verifiable parental or guardian consent and avoid tracking, behavioural monitoring, and targeted advertising  |
| `iso-iec-42001` | `8.2` | critical | 10 | The organization shall perform AI risk assessment at planned intervals and when significant changes are proposed or occur, and retain documented information of  |
| `nyc-local-law-144` | `20-871(a)(1)` | high | 10 | Do not use an AEDT to screen a candidate or employee unless the tool has undergone a bias audit no more than one year before use. |
| `nyc-local-law-144` | `20-872(a)` | critical | 10 | Avoid each civil-penalty-triggering violation of the subchapter or implementing rule, including unlawful AEDT use and notice failures. |

## How to read this report

- **Framework score** = `100 · Σ(weight · present) / Σ(weight)`. A control is *present* iff at least one signed receipt in the bundle maps to one of its `evidence_types` via `scoring/mapping.yaml`.
- **org_ai_risk_index** = `100 − weighted_mean(framework_scores, by control_count)`. Lower is better.
- **Gaps** are sorted by weight × severity. The top of that list is the recommended remediation backlog.
- Every number on this page is replayable: re-run `python engine.py --receipts <ndjson>` and the bytes should match. If they don't, your bundle has been tampered with.
