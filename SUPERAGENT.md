# Beacon and the Super-Agent

*The receipts layer that makes a million-dollar super-agent shippable.*

---

## The pitch in one paragraph

A super-agent — a "brains in a box" autonomous consultant that lives at a
client site, decides, acts, and reports — is now a buildable thing. It is
also, today, an **uninsurable** thing. Beacon is the layer that closes the
last mile: every decision the super-agent makes becomes a signed,
verifiable, framework-mapped receipt; every tool it can touch is
enumerated and gated; the kill switch is a single bundle the auditor can
verify offline. Without that layer, the super-agent is a research demo.
With it, you can ship a $1M annual contract.

---

## What a super-agent actually is

Drawing from the KSB Agenic strategic plan: a super-agent is an
**orchestrator** that runs continuously at a client site, coordinating
specialist agents — research, strategy, ops, verify — to deliver work
that used to require a 12-person consulting engagement. It is sold as a
subscription (the client *rents* the agent), it operates 24/7, and it
acts.

Five things make a super-agent different from a chatbot:

1. **It chooses.** It picks the next move from a non-trivial action space.
2. **It writes.** Not just text — it modifies records, files tickets,
   moves money, drafts contracts, calls APIs.
3. **It coordinates.** Specialist agents call each other; the orchestrator
   keeps state.
4. **It persists.** It does not end when the chat window closes.
5. **It is contracted.** Somebody is going to pay $500K–$2M/year for it
   and somebody else is going to ask for the audit log.

Numbers 1–4 are now table stakes (any decent agent framework gives you
these). Number 5 is where almost every super-agent project dies in
procurement.

---

## Why procurement kills super-agents

Three questions stop the deal:

| Question (asked by) | What they actually mean |
| --- | --- |
| *"What can it do?"* (Security) | Enumerate every tool and side effect, in writing. |
| *"How do you prove it did the right thing?"* (Audit) | Show me cryptographic evidence per decision, not screenshots. |
| *"How do you turn it off?"* (Risk) | Show me an instant rollback and a sealed evidence bundle for the regulator. |

These questions are not solvable with prompts, logs, or vendor promises.
They are governance primitives: **enumeration, attestation, verification,
sealing.** Beacon ships exactly those primitives, in 1.6 MB of Node.js,
on a USB stick.

---

## How Beacon answers each question

### 1. *"What can it do?"* → enumeration

The super-agent's universe of tools is the Beacon **inventory**.
Discovery ingests proxy logs, DNS logs, CASB exports, and (in v2.3)
browser-extension hostname observations. Anything the agent can call
shows up in `/api/v1/inventory` with vendor, model, version, environment,
and a first-seen timestamp.

You cannot have a tool that isn't on the inventory. The
[restricted Cloudflare Worker agent](agent/README.md) demonstrates this
literally: the agent's tool list is filtered through Beacon's
`tools/list` and any name outside that set is refused before the LLM
ever sees a result.

### 2. *"How do you prove it did the right thing?"* → attestation

Every decision the super-agent makes is funneled through
`record_decision`, which writes an Ed25519-signed receipt:

```json
{
  "id": "01J...",
  "event_type": "decision",
  "vendor": "...", "model": "...", "version": "...",
  "attributes": {
    "approver": "agent@client.com",
    "framework": "nist-ai-rmf-1.0",
    "controls": ["MAP-2.1","MEASURE-3.4"],
    "decision": "yes-ship",
    "scope": "campaign-launch-mar-2026",
    "rationale_sha256": "..."
  },
  "signature": { "alg": "Ed25519", "key_fpr": "07dc9b9a...", "sig_b64": "..." }
}
```

YES-Ship / YES-Steady / YES-Recover is the standard decision vocabulary.
The rationale is hashed (privacy-preserving), the controls map to a
named framework, the signature key fingerprint is rotatable. Receipts
are append-only. The auditor can verify them with `beacon verify`
offline — no network, no Beacon process, no vendor.

### 3. *"How do you turn it off?"* → sealing

`bundle_for_auditor` produces a tarball containing every receipt in a
window, the signing key's public half, the framework checklists that
were active, and a `manifest.sha256`. The auditor unzips it on their
own laptop and verifies. If they want to revoke, the rotated key
fingerprint travels with the next bundle. If they want to roll back,
you ship a `decision: rollback` receipt that references the offending
scope and the super-agent is now contractually obligated to stop
acting on it.

This is what we mean by "kill switch as a bundle": the off-switch is
not a button on someone's dashboard, it is a piece of signed evidence
that flows through your existing change-control process.

---

## The KSB-style stack, with Beacon underneath

```
                          ┌─────────────────────────────────────┐
                          │      KSB Super-Agent Orchestrator   │
                          │   (Adam-Grant / Bill-Gates / Jobs   │
                          │     / McKinsey "brains in a box")   │
                          └────────────────┬────────────────────┘
                                           │ every tool call
                                           │ every decision
                                           ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  AIGovOps Beacon  (Apache-2.0, runs at client site or in suitcase) │
        │                                                                    │
        │   inventory ◄── discovery (proxy · DNS · CASB · MV3 extension)     │
        │   receipts  ──► Ed25519 signed, append-only, framework-mapped      │
        │   checklists ─► NIST AI RMF · EU AI Act · ISO 42001 · HIPAA · ...  │
        │   gates     ──► production-readiness, deny-by-default              │
        │   export    ──► verifiable bundle, manifest sha256                 │
        └────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                          ┌─────────────────────────────────────┐
                          │            Auditor / Regulator      │
                          │   (verifies bundle offline; no SaaS)│
                          └─────────────────────────────────────┘
```

The orchestrator owns *what* the super-agent does. Beacon owns
*evidence that it did it, against what control, by whose authority,
and how to undo it.* Those are two different jobs. Keeping them
separate is what lets a super-agent ship into a regulated industry.

---

## Why this is a "$1M super-agent" enabler, not a competing product

KSB Agenic projects $500K per-employee revenue ratios and contracts in
the $500K–$2M range. Beacon is **free, Apache-2.0, no SaaS**. That is
on purpose. Beacon is to a super-agent what HTTPS is to a SaaS app:
necessary infrastructure that you do not pay anyone for and that
nobody owns. The super-agent vendor sells the brains. Beacon makes
the brains shippable into JPMorgan, into Pfizer, into the European
Commission. Pricing flows to the vendor, evidence flows to the
auditor, control stays with the client.

The pitch to a super-agent founder: *Use Beacon as your governance
substrate, and you can answer "yes" to every procurement question on
the first call.*

The pitch to a buyer: *Run Beacon next to whatever super-agent you
buy. If the vendor refuses, that is a signal.*

---

## What we shipped in v2.3 to make this concrete

- **[Hosted MCP server](mcp-public/README.md)** — public SSE / JSON-RPC
  endpoint a super-agent can call. Six tools, embedded Beacon, free
  Render dyno.
- **[Restricted Cloudflare Worker agent](agent/README.md)** — a
  reference super-agent whose tool universe is **exactly** the six
  Beacon tools, with refusal on anything else. BYO LLM key.
- **[Interactive walkthrough](docs/walkthrough/index.html)** — 12
  screens animating discovery → receipts → bundle → verification.
  Runs offline, fits on a USB stick.
- **[Three verified deployment shapes](DEMOS.md)** — suitcase,
  lab-on-corp, beta hybrid. Same wire format, three postures.

## What's next

The next super-agent unlock is **multi-tenant receipts** — proving to
a customer that *their* receipts are isolated from other customers',
cryptographically. That is on the v2.4 roadmap and is straightforward
because Beacon's signing keys are already per-deployment. The hard
part is procurement, not crypto, and procurement is what the
"verifiable bundle" already solves.

---

## TL;DR

Super-agent = the brain. Beacon = the audit trail, the kill switch,
and the procurement answer. Together, the deal closes.

— **YES-Ship AI · YES-Steady AI · YES-Recover AI** —
*Verifiable AI governance — Apache-2.0, no SaaS lock-in.*

Maintainers: [bob.rapp@aigovops.community](mailto:bob.rapp@aigovops.community) ·
[ken.johnston@aigovops.community](mailto:ken.johnston@aigovops.community) ·
[aigovopsfoundation.org](https://www.aigovopsfoundation.org/)
