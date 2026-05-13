# Beacon Studio — the five-step flow

Studio is the workshop front door. It is designed for a non-technical auditor in a conference room with sticky notes, a projector, and a 90-minute calendar block.

Every step has three things and only three things: **a question, a thing to look at, and a single primary button.** No menus. No tabs. No jargon.

---

## Design rails

- **Voice:** clear, warm, declarative. No corporate-speak. No "leverage." No "synergy."
- **Type:** Inter for UI, DM Mono for evidence. 16px body floor. 18px button labels.
- **Color:** Nexus palette. `#01696F` Hydra Teal as the single accent. Status colors only when status is the message.
- **Motion:** under 200ms. `prefers-reduced-motion` respected.
- **Accessibility:** WCAG AA. Every primary button reachable in two tab presses. Live regions announce discoveries as they arrive.
- **No modals** in the happy path. Modals are a smell — auditors lose context.

---

## Step 1 — "What network are we looking at?"

**Question (h1):** *What network are we looking at?*

**Sub (muted):** *Beacon will look for AI models — what they are, who's using them, and how often. Nothing leaves your box unless you tell it to.*

**Input options (radio cards, one selected at a time):**

| Card | Sub-label | Field |
|---|---|---|
| A domain | "we'll fingerprint outbound calls" | `acmecorp.com` |
| A CSV | "use the AI Inventory workbook" | drop zone |
| A cloud account | "AWS, Azure, or Google" | OAuth button |
| A log file | "Squid, Envoy, or syslog" | drop zone |
| *(advanced)* A network range | "pcap or DNS log" | `10.0.0.0/8` |

**Primary button:** `Start the scan →`

**Receipt emitted:** `discovery.session.started` with the operator's user, timestamp, source type, scope hash. No payload contents.

---

## Step 2 — "Beacon is looking…"

**Question (h1):** *Beacon is looking on `<source>`.*

**Sub:** *This usually takes 30–90 seconds. Findings will appear here as they arrive.*

**Layout:** a live tile board. Each tile is one detected model:

```
┌─────────────────────────────────────┐
│  🏷 OpenAI                          │
│     gpt-4o-2024-08-06                │
│                                      │
│     1,840 calls this week            │
│     12 people · CX team              │
│     last seen 4 min ago              │
│                                      │
│     [ view receipts ]                │
└─────────────────────────────────────┘
```

Tiles fade in with a 120ms ease. New finds glow once. The board uses CSS grid, not a virtualized list — auditors need to *see* the count grow.

**Empty state (first 5 seconds):** a single animated radar mark. After 5 seconds with zero finds, a friendly note: *"Quiet so far. Try widening the scope, or upload a log file."*

**Primary button (sticky bottom right):** `I've seen enough — pick what's in scope →` (enabled after ≥1 detection)

**Receipt emitted per detection:** `discovery.model.found` with vendor, model, version, count, environment, source signal type, and an opaque `evidence_id` pointing to the underlying capture.

---

## Step 3 — "Pick what matters."

**Question (h1):** *Pick what matters.*

**Sub:** *Check the rows that are in scope for this audit. Beacon will write the checklist around what you check.*

**Layout:** the tile board collapses into a checkable table. Each row has a **plain-English explainer** below the model name — generated server-side, never invented client-side:

| ☑ | Model | What it is, in plain English | Use |
|---|---|---|---|
| ☑ | `gpt-4o` | *"OpenAI's general-purpose assistant. Used 1,840 times this week by 12 people in your support team."* | summarize · classify |
| ☑ | `claude-3-5-sonnet` | *"Anthropic's long-context assistant. Used 240 times this week by your legal team to summarize contracts."* | summarize · extract |
| ☐ | `llama-3-70b (local)` | *"Meta's open model, running on your own server. Used by engineering for code review."* | code · chat |

Above the table: a **Trust Tier badge per row** (T0/T1/T2/T3) so the auditor sees governance state at a glance. Click the badge → a tooltip explaining what it means.

**Primary button:** `Pick guardrails →`

---

## Step 4 — "Pick your guardrails."

**Question (h1):** *Pick your guardrails.*

**Sub:** *Each pack is a checklist of controls. You can pick more than one. Beacon will merge them and remove duplicates.*

**Layout:** card grid. Five cards out of the box:

| Pack | Description | Items |
|---|---|---|
| **NIST AI RMF** | *Federal-grade risk management. The default if you're in the US.* | 47 |
| **EU AI Act — Art. 13** | *Transparency obligations for high-risk systems.* | 18 |
| **ISO/IEC 42001** | *International AI management system standard.* | 31 |
| **HIPAA-for-AI** | *Healthcare-specific controls layered on top of the others.* | 22 |
| **Human Flourishing Gate** | *Dignity · Equity · Delight. The Foundation's differentiator.* | 12 |

Hover/focus on a card → preview the first three items in a quiet popover.

**Custom packs (advanced toggle):** load any `*.yaml` checklist conforming to `checklists/_schema.json`. Studio renders cards from the YAML metadata.

**Primary button:** `Build my audit →`

---

## Step 5 — "Here's your audit."

This is the screen the auditor came for. One screen. No tabs.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Your audit, ready.                                         │
│  19 controls passing · 4 needs review · 3 blocked           │
│                                                             │
│  [ ● ] EU AI Act Art. 13(b) — transparency disclosures      │
│         ✓ Receipts present for 100% of inferences           │
│         ✓ Model card linked: gpt-4o-2024-08-06             │
│         ▸ 17 evidence items                                 │
│                                                             │
│  [ ▲ ] NIST RMF MEASURE 2.7 — drift detection               │
│         ⚠ No monitoring receipt found for claude-3-5        │
│         ▸ Open the gap                                      │
│                                                             │
│  [ ✕ ] HIPAA-for-AI 1.4 — PHI redaction                     │
│         ✗ 3 prompts contain unmasked patient identifiers    │
│         ▸ Open the gap                                      │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│   [ Make it Policy as Code → ]   [ Export PDF receipt ]    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Status legend:** ● green = passing with receipts · ▲ amber = needs human review · ✕ red = blocked, evidence proves a violation.

Every green check links to the underlying receipt list. Every amber/red item has an **Open the gap** action that drafts a Governance Decision Record explaining what's missing and what to do about it.

**Primary button: `Make it Policy as Code →`**

Click → Studio emits:

1. `gate.<your-org>.v1.yaml` — the foundation-os gate schema
2. `<your-org>_audit.rego` — OPA rules that fail closed on violations
3. `GDR-0001-<slug>.md` — Governance Decision Record per amber/red item
4. `bundle.tar.gz` + `bundle.sig` — Ed25519-signed deliverable

…then opens a side panel:

> *Where should we put it?*
>
> ☐ Download the bundle
> ☐ Push to GitHub (will open a PR)
> ☐ Email to my team

**Receipt emitted:** `checklist.published` with the bundle hash, the auditor's user, the chosen packs, and the destination.

---

## Microcopy library

These are the exact strings Studio uses. Translators get this file. Designers get this file. No string lives in component code without a key here.

```yaml
studio.step1.h1: "What network are we looking at?"
studio.step1.sub: "Beacon will look for AI models — what they are, who's using them, and how often. Nothing leaves your box unless you tell it to."
studio.step1.cta: "Start the scan"

studio.step2.h1: "Beacon is looking on {source}."
studio.step2.sub: "This usually takes 30–90 seconds. Findings will appear here as they arrive."
studio.step2.empty.quiet: "Quiet so far. Try widening the scope, or upload a log file."
studio.step2.cta: "I've seen enough — pick what's in scope"

studio.step3.h1: "Pick what matters."
studio.step3.sub: "Check the rows that are in scope for this audit. Beacon will write the checklist around what you check."
studio.step3.cta: "Pick guardrails"

studio.step4.h1: "Pick your guardrails."
studio.step4.sub: "Each pack is a checklist of controls. You can pick more than one. Beacon will merge them and remove duplicates."
studio.step4.cta: "Build my audit"

studio.step5.h1: "Your audit, ready."
studio.step5.cta.primary: "Make it Policy as Code"
studio.step5.cta.secondary: "Export PDF receipt"
studio.step5.gap.open: "Open the gap"
```

---

## Accessibility checklist (run before every release)

- [ ] Every step's primary button reachable in ≤2 tab presses from page load
- [ ] Live region announces every new detection in Step 2
- [ ] All status icons paired with text labels (color is never the only signal)
- [ ] Contrast: body 4.5:1, large text 3:1, status badges 4.5:1
- [ ] `prefers-reduced-motion` disables tile glow and radar sweep
- [ ] Keyboard-only walkthrough recorded and posted with each release
- [ ] Screen-reader walkthrough (VoiceOver + NVDA) verified
