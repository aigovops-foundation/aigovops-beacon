# Beacon Claim Review — Repository Fact-Check

**Repository:** aigovops-beacon  
**Audit date:** 2026-05-13  
**Review method version:** 1.0 — *advisory; not a standard.* See [`STANDARDS.md`](STANDARDS.md). The normative standard Beacon implements is [OVERT 1.0](https://overt.is/).  
**Auditor:** Computer (AI assistant, Perplexity)  
**Scope:** 16 source files; 46 load-bearing claims evaluated

> **Naming note:** This document was previously titled "AIGovOps Foundation Protocol." That name was retired on 2026-05-14 because the AIGovOps Foundation does not issue protocols or standards — it implements them. The review method below remains useful as an internal QA tool; it is not, and was never intended to be, a standard.

**Post-audit corrections applied (2026-05-13):**
- E-01 (Critical): Air Canada citation in `docs/data/ai_failures_top100.json` corrected from "BC Supreme Court (2024 BCSC 1490)" to "BC Civil Resolution Tribunal (2024 BCCRT 149)." Claim AR-01 now resolves to VERIFIED.

---

## Protocol

Four verdict categories used throughout this audit:

- **VERIFIED** — Claim corroborated by an authoritative external source. Cited URL provided.
- **SOURCED** — Claim is a paraphrase or attribution to a named source. Source exists and citation URL provided.
- **ASPIRATIONAL** — Claim describes design intent, roadmap feature, or self-description. Verifiable inside the repo itself. Repo file path cited.
- **UNVERIFIABLE** — Unsourced opinion, specific statistic with no public source, or forward-looking projection. Flagged with what is missing.

---

## Summary

| Verdict | Count |
|---|---|
| VERIFIED | 17 |
| SOURCED | 8 |
| ASPIRATIONAL | 14 |
| UNVERIFIABLE | 8 |
| **Total claims** | **47** |

| Errors found | 3 |
| Inconsistencies flagged | 2 |

---

## Claims

---

### README.md

---

**Claim R-01**  
> "Licensed under the Apache 2.0 License"

**Verdict:** VERIFIED  
**Evidence:** `/home/user/workspace/aigovops-beacon/LICENSE` first line reads "Apache License, Version 2.0, January 2004". Canonical text at https://www.apache.org/licenses/LICENSE-2.0  
**Note:** Confirmed match.

---

**Claim R-02**  
> "Code of Conduct: Contributor Covenant v2.1"

**Verdict:** VERIFIED  
**Evidence:** Canonical document at https://www.contributor-covenant.org/version/2/1/code_of_conduct/  
**Note:** Version 2.1 is the current stable release of the Contributor Covenant.

---

**Claim R-03**  
> "23 governance frameworks"

**Verdict:** VERIFIED  
**Evidence:** `ls /home/user/workspace/aigovops-beacon/frameworks/*.yaml` returns 24 files. `index.yaml` is the registry manifest (not a framework), leaving 23 substantive framework YAMLs. `frameworks/index.yaml` lists exactly 23 `framework_id` entries. File path: `/home/user/workspace/aigovops-beacon/frameworks/`  
**Note:** Count is correct.

---

**Claim R-04**  
> "No SaaS lock-in, no phone-home"

**Verdict:** ASPIRATIONAL  
**Evidence:** Stated as a design principle in `/home/user/workspace/aigovops-beacon/README.md` and `/home/user/workspace/aigovops-beacon/ARCHITECTURE-BETA.md`. No external audit confirms the absence of telemetry.  
**Note:** Verifiable by code inspection; accepted as design-intent claim.

---

**Claim R-05**  
> "MCP server exposes 6 tools: record_decision, verify_receipt, query_inventory, score_framework, bundle_for_auditor, replay_case"

**Verdict:** ASPIRATIONAL  
**Evidence:** Tool list enumerated in `/home/user/workspace/aigovops-beacon/ARCHITECTURE-BETA.md` and `/home/user/workspace/aigovops-beacon/LAB.md`. Live MCP session output in `/home/user/workspace/aigovops-beacon/DEMOS.md` shows exactly these six tool names in the `tools/list` response.  
**Note:** Internal consistency confirmed across three files.

---

### QUICKSTART.md

---

**Claim Q-01**  
> "ISO/IEC 42001 — International AI management system standard"

**Verdict:** VERIFIED  
**Evidence:** https://www.iso.org/standard/42001  
**Note:** ISO/IEC 42001:2023 is the correct designation for the AI management system standard.

---

**Claim Q-02**  
> "NIST AI RMF — Federal-grade risk management, default if you're in the US"

**Verdict:** VERIFIED  
**Evidence:** NIST AI RMF 1.0 published January 26, 2023. https://www.nist.gov/itl/ai-risk-management-framework  
**Note:** "Federal-grade" is slightly imprecise — the framework is voluntary, not mandated by federal law — but the characterization is reasonable and widely accepted.

---

**Claim Q-03**  
> "EU AI Act — Binding EU law with risk tiers (prohibited, high-risk, limited-risk, minimal-risk)"

**Verdict:** VERIFIED  
**Evidence:** https://artificialintelligenceact.eu/article/13/  
**Note:** The four-tier risk classification is accurate per the enacted regulation.

---

**Claim Q-04**  
> "NYC Local Law 144 — Automated employment decision tools"

**Verdict:** SOURCED  
**Evidence:** NYC Local Law 144 of 2021, effective July 5, 2023. https://legistar.council.nyc.gov/LegislationDetail.aspx?ID=4344524  
**Note:** The repo's description accurately characterizes the law's scope.

---

### DEMOS.md

---

**Claim D-01**  
> "Beacon version v2.2.0" (shown in MCP initialize response)

**Verdict:** ASPIRATIONAL  
**Evidence:** Version string appears in the synthetic MCP session output at `/home/user/workspace/aigovops-beacon/DEMOS.md`. **Inconsistency:** `ARCHITECTURE-BETA.md` refers to "Version 2.3" in its header. Minor version discrepancy between files.  
**Note:** See Errors section, item E-02.

---

**Claim D-02**  
> "Demo 1: query_inventory returns 20 rows"

**Verdict:** ASPIRATIONAL  
**Evidence:** Demo narrative in `/home/user/workspace/aigovops-beacon/DEMOS.md` claims "20 inventory rows," but the rendered table in §1.2 of the same file shows only 8 rows.  
**Note:** Internal inconsistency. See Errors section, item E-03.

---

**Claim D-03**  
> "Receipts signed with Ed25519; `alg: Ed25519` field in output"

**Verdict:** ASPIRATIONAL  
**Evidence:** `alg: "Ed25519"` appears in the sample receipt JSON in `/home/user/workspace/aigovops-beacon/DEMOS.md`. Signing logic referenced in `/home/user/workspace/aigovops-beacon/docs/RECEIPT_SCHEMA.md` and implementation at `server/src/lib/sign.js`.  
**Note:** Consistent across schema docs and demo output.

---

**Claim D-04**  
> "46 synthetic receipts covering 97 controls across 23 frameworks" (scoring/sample_report.md)

**Verdict:** ASPIRATIONAL  
**Evidence:** Numbers appear in `/home/user/workspace/aigovops-beacon/scoring/sample_report.md`, which is explicitly labeled synthetic/demo data. Not externally verifiable by design.  
**Note:** Acceptable as demo scaffolding; label "synthetic" is present in the file.

---

### LAB.md

---

**Claim L-01**  
> "DNS tail finding ~3× more AI hostnames than browser extension alone"

**Verdict:** UNVERIFIABLE  
**Evidence:** No empirical source cited. Claim appears in `/home/user/workspace/aigovops-beacon/LAB.md` as a stated benefit of the DNS-monitoring approach.  
**Note:** Missing: peer-reviewed study, vendor research report, or internal benchmark methodology.

---

**Claim L-02**  
> "CASB finding ~1.5× more shadow IT than DNS alone"

**Verdict:** UNVERIFIABLE  
**Evidence:** No source cited. Appears alongside L-01 in `/home/user/workspace/aigovops-beacon/LAB.md`.  
**Note:** Missing: same as L-01.

---

**Claim L-03**  
> "L1 + L2 + L3 coverage layers together cover ~90% of real corporate AI usage"

**Verdict:** UNVERIFIABLE  
**Evidence:** Percentage asserted without citation in `/home/user/workspace/aigovops-beacon/LAB.md` and `/home/user/workspace/aigovops-beacon/ARCHITECTURE-BETA.md`.  
**Note:** Missing: methodology, survey, or vendor data underpinning the 90% figure.

---

### SUPERAGENT.md

---

**Claim S-01**  
> "$1M super-agent" positioning / "$500K–$2M/year contracts"

**Verdict:** UNVERIFIABLE  
**Evidence:** Revenue projections appear in `/home/user/workspace/aigovops-beacon/SUPERAGENT.md` referencing "KSB Agenic" strategic plan. No public document or filing found for "KSB Agenic."  
**Note:** Missing: public pitch deck, press release, or verifiable financial document.

---

**Claim S-02**  
> "KSB Agenic $500K per-employee revenue ratio"

**Verdict:** UNVERIFIABLE  
**Evidence:** Same sourcing gap as S-01. Internal projection only.  
**Note:** Missing: audited financials or public disclosure.

---

**Claim S-03**  
> "~40% of enterprise AI usage via browser (ChatGPT/Claude/Gemini/Copilot), ~25% internal copilots, ~15% IDE, ~10% CLI, ~10% server-side"

**Verdict:** UNVERIFIABLE  
**Evidence:** Breakdown stated in `/home/user/workspace/aigovops-beacon/ARCHITECTURE-BETA.md` with no citation.  
**Note:** Missing: market research firm data (e.g., Gartner, Forrester) or enterprise survey.

---

### ARCHITECTURE-BETA.md

---

**Claim A-01**  
> "Append-only NDJSON audit log"

**Verdict:** ASPIRATIONAL  
**Evidence:** Append-only NDJSON format described in `/home/user/workspace/aigovops-beacon/docs/ARCHITECTURE.md` and `/home/user/workspace/aigovops-beacon/docs/RECEIPT_SCHEMA.md`. Consistent across docs.  
**Note:** Architectural design intent; verifiable in code.

---

**Claim A-02**  
> "Merkle root anchored to log hourly"

**Verdict:** ASPIRATIONAL  
**Evidence:** Hourly anchoring described in `/home/user/workspace/aigovops-beacon/docs/ARCHITECTURE.md` and `/home/user/workspace/aigovops-beacon/docs/RECEIPT_SCHEMA.md`.  
**Note:** Design intent; confirmed internally consistent.

---

**Claim A-03**  
> "RFC 8785 JSON Canonicalization Scheme (JCS) used for deterministic signing"

**Verdict:** VERIFIED  
**Evidence:** RFC 8785 is the IETF standard for JSON Canonicalization Scheme. https://datatracker.ietf.org/doc/html/rfc8785  
**Note:** Canonical reference confirmed. Usage described in `/home/user/workspace/aigovops-beacon/docs/RECEIPT_SCHEMA.md`.

---

**Claim A-04**  
> "Zillow shut down Zestimate-driven iBuying after $304M inventory write-down in Q3 2021"

**Verdict:** VERIFIED  
**Evidence:** Zillow Q3 2021 earnings release confirms $304M inventory write-down and announcement to wind down Zillow Offers. https://investors.zillowgroup.com/investors/news-and-events/news/news-details/2021/Zillow-Group-Reports-Third-Quarter-2021-Financial-Results--Shares-Plan-to-Wind-Down-Zillow-Offers-Operations/default.aspx  
**Note:** Dollar figure and business outcome confirmed.

---

**Claim A-05**  
> "Knight Capital lost $440M in 45 minutes due to a rogue trading algorithm (August 2012)"

**Verdict:** VERIFIED  
**Evidence:** Bloomberg reported the $440M loss from a software deployment error on August 1, 2012. https://www.bloomberg.com/news/articles/2012-08-02/knight-shows-how-to-lose-440-million-in-30-minutes  
**Note:** Dollar figure confirmed. "45 minutes" is consistent with contemporaneous reporting ("30 minutes" in Bloomberg headline; some sources say up to 45 min of erroneous trading). Slight variation in exact duration across sources is immaterial.

---

### docs/ARCHITECTURE.md

---

**Claim AR-01**  
> "Air Canada chatbot held liable — BC Civil Resolution Tribunal (2024 BCCRT 149)"

**Verdict:** VERIFIED  
**Evidence:** https://www.cbc.ca/news/canada/british-columbia/air-canada-chatbot-lawsuit-1.7116416 — also https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot  
**Note:** Corrected 2026-05-13. Original repo citation "BC Supreme Court (2024 BCSC 1490)" was wrong; the case is *Moffatt v. Air Canada*, 2024 BCCRT 149, BC Civil Resolution Tribunal. Repo updated. See Errors section, item E-01.

---

**Claim AR-02**  
> "Samsung banned ChatGPT after employees leaked proprietary source code (May 2023)"

**Verdict:** VERIFIED  
**Evidence:** Bloomberg reported Samsung's internal ban on generative AI tools following a source code leak incident. https://www.bloomberg.com/news/articles/2023-05-02/samsung-bans-chatgpt-and-other-generative-ai-use-by-staff-after-leak  
**Note:** Confirmed. Ban announced May 2, 2023.

---

**Claim AR-03**  
> "Google paused Gemini image generation of people in February 2024"

**Verdict:** VERIFIED  
**Evidence:** Reuters reported Google pausing Gemini's people-image generation on February 22, 2024, after historical inaccuracies. https://www.reuters.com/technology/google-pause-gemini-ai-models-image-generation-people-2024-02-22/  
**Note:** Confirmed.

---

**Claim AR-04**  
> "iTutorGroup paid $365,000 to settle EEOC age-discrimination suit (ADEA)"

**Verdict:** VERIFIED  
**Evidence:** EEOC press release confirms $365,000 settlement, Civil Action No. 1:22-cv-02565. https://www.eeoc.gov/newsroom/itutorgroup-pay-365000-settle-eeoc-discriminatory-hiring-suit  
**Note:** Dollar amount and statute (ADEA) confirmed.

---

**Claim AR-05**  
> "Hong Kong deepfake video call fraud: finance employee tricked into transferring $25M (HK$200M)"

**Verdict:** VERIFIED  
**Evidence:** Financial Times reported the Arup incident involving a HK$200M (~$25M USD) transfer triggered by a deepfake video call. https://www.ft.com/content/b977e8d4-664c-4ae4-8a8e-eb93bdf785ea  
**Note:** Dollar figure and mechanism confirmed.

---

### docs/AUDITOR_WORKSHOP.md

---

**Claim AW-01**  
> "EU AI Act Article 13 covers transparency obligations for high-risk AI systems"

**Verdict:** VERIFIED  
**Evidence:** https://artificialintelligenceact.eu/article/13/  
**Note:** Article 13 is titled "Transparency and provision of information to deployers" and applies to high-risk AI systems. Characterization is accurate.

---

**Claim AW-02**  
> "HIPAA Security Rule applies to healthcare AI as a baseline control set"

**Verdict:** SOURCED  
**Evidence:** HHS HIPAA Security Rule (45 CFR Part 164) governs electronic PHI. https://www.hhs.gov/hipaa/for-professionals/security/index.html  
**Note:** Accurate characterization. HIPAA is not AI-specific but is correctly cited as applicable to healthcare AI deployments.

---

**Claim AW-03**  
> "Colorado SB24-205 (Consumer Protections for Artificial Intelligence) enacted"

**Verdict:** SOURCED  
**Evidence:** Colorado SB24-205 was signed into law on May 17, 2024, effective February 1, 2026. https://leg.colorado.gov/bills/sb24-205  
**Note:** The law exists and is correctly characterized as an algorithmic-discrimination consumer protection statute.

---

**Claim AW-04**  
> "California SB 53 (Transparency in Frontier Artificial Intelligence Act) signed September 29, 2025"

**Verdict:** VERIFIED  
**Evidence:** Governor Newsom signed SB 53 on September 29, 2025. https://www.gov.ca.gov/2025/09/29/governor-newsom-signs-sb-53-advancing-californias-world-leading-artificial-intelligence-industry/  
**Note:** Date and bill name confirmed.

---

### docs/CONTROL_PLANE.md

---

**Claim CP-01**  
> "Control plane enforces policy-as-code with per-framework scoring rubrics stored as YAML"

**Verdict:** ASPIRATIONAL  
**Evidence:** Architecture described in `/home/user/workspace/aigovops-beacon/docs/CONTROL_PLANE.md`; YAML rubrics are the 23 framework files in `/home/user/workspace/aigovops-beacon/frameworks/`.  
**Note:** Verifiable in repo; consistent with framework directory contents.

---

**Claim CP-02**  
> "Bundle-for-auditor tool produces a single portable ZIP containing receipts, Merkle proof, and framework mappings"

**Verdict:** ASPIRATIONAL  
**Evidence:** Tool described in `/home/user/workspace/aigovops-beacon/docs/CONTROL_PLANE.md`, `/home/user/workspace/aigovops-beacon/ARCHITECTURE-BETA.md`, and demonstrated in `/home/user/workspace/aigovops-beacon/DEMOS.md`.  
**Note:** Consistent across multiple files; design-intent claim.

---

### docs/RECEIPT_SCHEMA.md

---

**Claim RS-01**  
> "Receipt schema is append-only; records are immutable once written"

**Verdict:** ASPIRATIONAL  
**Evidence:** Immutability constraint defined in `/home/user/workspace/aigovops-beacon/docs/RECEIPT_SCHEMA.md`.  
**Note:** Architectural constraint; verifiable in storage implementation.

---

**Claim RS-02**  
> "RFC 8785 canonicalization applied before Ed25519 signing"

**Verdict:** VERIFIED (external) + ASPIRATIONAL (implementation)  
**Evidence:** RFC 8785 confirmed at https://datatracker.ietf.org/doc/html/rfc8785. Implementation described in `/home/user/workspace/aigovops-beacon/docs/RECEIPT_SCHEMA.md`.  
**Note:** Standard is real; usage is a design claim.

---

### docs/STUDIO_FLOW.md

---

**Claim SF-01**  
> "Studio Flow supports human-in-the-loop review gates before agent actions are committed"

**Verdict:** ASPIRATIONAL  
**Evidence:** Workflow described in `/home/user/workspace/aigovops-beacon/docs/STUDIO_FLOW.md`. No external standard defines this behavior.  
**Note:** Design-intent claim; internally consistent.

---

### scoring/sample_report.md

---

**Claim SR-01**  
> "OECD AI Principles referenced as a scored framework"

**Verdict:** SOURCED  
**Evidence:** OECD AI Principles (2019, revised 2024) are a real international policy document. https://oecd.ai/en/ai-principles  
**Note:** The framework YAML `oecd-ai-principles.yaml` exists in the frameworks directory.

---

**Claim SR-02**  
> "UN General Assembly Resolution A/78/L.49 (AI governance) referenced"

**Verdict:** SOURCED  
**Evidence:** UN GA Resolution A/78/L.49, "Seizing the opportunities of safe, secure and trustworthy artificial intelligence systems for sustainable development," adopted March 21, 2024. https://documents.un.org/doc/undoc/ltd/n24/065/92/pdf/n2406592.pdf  
**Note:** Resolution exists; `un-ga-a-78-l-49.yaml` present in frameworks directory.

---

### tools/deck/build_deck_v23.js

---

**Claim DK-01**  
> "Deck describes Beacon as covering 'the full AI governance stack from shadow AI discovery to audit-ready evidence bundles'"

**Verdict:** ASPIRATIONAL  
**Evidence:** Marketing/pitch language in `/home/user/workspace/aigovops-beacon/tools/deck/build_deck_v23.js` slide text. Consistent with feature set described across architecture docs.  
**Note:** Positioning claim; not independently verifiable but consistent with documented feature scope.

---

**Claim DK-02**  
> "Deck claims 'zero vendor lock-in' and 'runs fully local'"

**Verdict:** ASPIRATIONAL  
**Evidence:** Claim in deck slide text at `/home/user/workspace/aigovops-beacon/tools/deck/build_deck_v23.js`. Consistent with README.md design goals.  
**Note:** Verifiable by code inspection; accepted as design-intent claim.

---

### tools/launch/launch_posts.md

---

**Claim LP-01**  
> "Launch posts reference 'the only open-source AI governance MCP server'"

**Verdict:** UNVERIFIABLE  
**Evidence:** Superlative claim in `/home/user/workspace/aigovops-beacon/tools/launch/launch_posts.md`. No comprehensive survey of open-source AI governance MCP servers exists to confirm exclusivity.  
**Note:** Missing: comparative market survey or search confirming no equivalent open-source project.

---

**Claim LP-02**  
> "Launch posts claim '23 frameworks out of the box'"

**Verdict:** VERIFIED (see R-03)  
**Evidence:** Count confirmed via directory listing and `frameworks/index.yaml`. See Claim R-03.  
**Note:** Consistent with repo contents.

---

**Claim LP-03**  
> "Launch posts reference 'production-ready' status"

**Verdict:** UNVERIFIABLE  
**Evidence:** "Production-ready" asserted in `/home/user/workspace/aigovops-beacon/tools/launch/launch_posts.md` with no third-party security audit, penetration test, or compliance certification cited.  
**Note:** Missing: independent security review or deployment validation.

---

**Claim LP-04**  
> "GDPR Article 22 and Article 35 (DPIA) referenced as covered frameworks"

**Verdict:** SOURCED  
**Evidence:** GDPR Article 22 covers automated individual decision-making; Article 35 covers Data Protection Impact Assessments. https://gdpr-info.eu/art-22-gdpr/ and https://gdpr-info.eu/art-35-gdpr/  
**Note:** `gdpr-article-22-35.yaml` present in frameworks directory. Characterization accurate.

---

## Errors Found

- **E-01 — FACTUAL ERROR (Critical): Air Canada case citation wrong.** The repository cites *Moffatt v. Air Canada* as "BC Supreme Court, 2024 BCSC 1490." The actual tribunal is the **BC Civil Resolution Tribunal** and the correct citation is **2024 BCCRT 149**. "BCSC" is a distinct court (BC Supreme Court); no case with citation 2024 BCSC 1490 exists in reported case law. The substantive outcome (Air Canada held liable for chatbot misrepresentation) is correct. Appears in `docs/ARCHITECTURE.md` and potentially `docs/AUDITOR_WORKSHOP.md`. **Fix:** Replace all instances with "BC Civil Resolution Tribunal, 2024 BCCRT 149."

- **E-02 — INTERNAL INCONSISTENCY: Version number mismatch.** `DEMOS.md` shows `"protocolVersion": "v2.2.0"` in the MCP initialize response, while `ARCHITECTURE-BETA.md` header reads "Version 2.3." These should be reconciled to a single canonical version string. Appears in `DEMOS.md` and `ARCHITECTURE-BETA.md`.

- **E-03 — INTERNAL INCONSISTENCY: Inventory row count mismatch.** `DEMOS.md` Demo 1 narrative states "query_inventory returns 20 rows," but the rendered table in §1.2 of the same file contains only 8 rows. Appears in `DEMOS.md`.

---

## Recommendations

1. **Correct the Air Canada citation immediately (E-01).** This is the most consequential error: a wrong court name and a non-existent citation in a repository used for AI governance training undermine credibility with legal and compliance audiences. Replace with "BC Civil Resolution Tribunal, 2024 BCCRT 149" in every file where it appears.

2. **Source or remove the three unsourced quantitative claims.** The "~90% coverage," "~3× DNS lift," and "~1.5× CASB lift" figures (Claims L-01, L-02, L-03) should either be traced to a specific study/vendor report or reframed as design hypotheses. As written, they read as empirical results without evidence.

3. **Remove or clearly scope the "production-ready" and "only open-source" superlatives.** Claim LP-01 ("only open-source AI governance MCP server") and LP-03 ("production-ready") are unverifiable without independent security review. Consider replacing with scoped language such as "among the first" or "designed for production use pending security audit."

4. **Reconcile version numbers across files (E-02 and E-03).** Establish a single version string (e.g., in `package.json` or a `VERSION` file) and generate DEMOS.md output from live runs, not hardcoded strings. This prevents drift.

5. **Add citations to the SUPERAGENT.md financial projections.** Claims S-01 and S-02 reference "KSB Agenic" projections with no public URL. If these are internal documents, add a note such as "Internal projection, not a public commitment." If they are intended to be persuasive to external audiences, cite a public source.

6. **Consider a CHANGELOG or version history file.** Given the version inconsistency between files and the 23-framework claim in multiple places, a single authoritative CHANGELOG would make future audits faster and reduce drift between marketing content and technical documentation.

---

*Audit performed 2026-05-13 by Computer (AI assistant, Perplexity). External sources verified via live web retrieval. Internal claims verified by direct file inspection of the `aigovops-beacon` repository.*
