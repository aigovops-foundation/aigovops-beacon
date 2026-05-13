# Beacon Control Plane — advanced mode

Control Plane is the second front door. Same backend, same evidence, same receipts. Different audience: the platform engineer, the SRE, the governance architect who needs to query, slice, and integrate.

## When to send someone here

- They want **filters, search, and raw event streams** — not a guided wizard.
- They're integrating Beacon into an existing SIEM, observability stack, or CI/CD pipeline.
- They're authoring or editing **policy YAML and Rego** directly.
- They're auditing trust-tier promotions or signing-key rotations.

If the user clicked the toggle in the top right of Studio, they're already here. There's no "advanced features behind a paywall" — this is just the other half of the same app.

---

## Layout

A persistent left rail with six surfaces. Everything is keyboard-driven; `?` opens the shortcut sheet.

```
┌─────────────┬───────────────────────────────────────────────┐
│             │                                               │
│  Inventory  │                                               │
│  Receipts   │                                               │
│  Checklists │            [ active surface ]                 │
│  Policies   │                                               │
│  Gates      │                                               │
│  Integ.     │                                               │
│             │                                               │
│  ─────────  │                                               │
│  Settings   │                                               │
│             │                                               │
└─────────────┴───────────────────────────────────────────────┘
```

### Inventory
The same table Studio shows in Step 3, but with:
- Multi-column sort, faceted filters (vendor, env, trust tier, owner)
- Bulk-edit trust tiers (each edit emits a receipt with the approver)
- `inventory.csv` and `inventory.json` export — round-trips with the AIGovOps Foundation Inventory Workbook
- Saved views, shareable URLs

### Receipts
Live tail of the append-only NDJSON stream. Each row shows: time · user · vendor/model/version · event type · signature OK?
- Filters: time range, user, model, event type, signature status
- Verify any receipt locally: `beacon verify <receipt-id>` (CLI generates the exact command for the selected row)
- Export as `.ndjson` or as a signed `.tar.gz` bundle for legal hold

### Checklists
Library view of every pack — both the bundled ones and any custom YAML the operator has loaded.
- Diff view between versions (regulators ship updates; auditors need to see what changed)
- Map view: per-control coverage across the current inventory
- Promote a draft pack to "published" (requires human approver per `policy/gate.beacon.v1.yaml`)

### Policies
Code editor (Monaco) for `gate.*.yaml` and `*.rego`. Live syntax check + OPA dry-run against the current inventory.
- "Test against last 24h" button replays recent receipts through the proposed policy and shows what would have passed/failed
- Version history with author attribution and required co-sign for publish

### Gates
Visual representation of the AiDevOps pipeline: Pre-Dev → Data → Model → Deployment → Post-Production → Human Flourishing. Each gate shows its current pass/fail rate, top three failing controls, and links to receipts.

### Integrations
- **GitHub** — push policy bundles, open PRs, read repo metadata for the discovery scanner
- **Slack / Teams** — post amber/red findings to a channel
- **SIEM (Splunk, Sentinel, Chronicle)** — forward the receipt stream
- **PagerDuty** — page on `gate.failed` events for T3 models
- **OIDC SSO** — Okta, Entra ID, Google Workspace

Each integration shows the receipts it has emitted in the last 7 days.

---

## Power-user commands

A command palette (`Cmd+K` / `Ctrl+K`) exposes everything:

| Command | What it does |
|---|---|
| `discover run --source <csv\|domain\|cloud>` | Kick a one-off discovery session |
| `inventory promote <model-id> --tier T2` | Promote with required justification (recorded) |
| `policy test <file>` | Replay last N receipts through a draft policy |
| `bundle sign` | Re-sign the current bundle (key rotation) |
| `bundle verify <hash>` | Verify a bundle's signature locally |
| `export siem --since 24h` | Stream the last 24h of receipts to the configured SIEM |
| `gate fail --reason "..."` | Manually fail a gate (always emits a receipt, always requires reason) |

---

## API

Every Studio action is also an API call. Same auth, same receipts.

```
POST   /api/v1/discover              start a scan
GET    /api/v1/inventory             list discovered models
GET    /api/v1/inventory/:id         single model
POST   /api/v1/inventory/:id/trust   promote/demote trust tier (requires approver)
GET    /api/v1/receipts              tail / page / filter receipts
GET    /api/v1/receipts/:id          single receipt + signature
GET    /api/v1/receipts/:id/verify   server-side verification helper
GET    /api/v1/checklists            list packs
POST   /api/v1/checklists/run        evaluate a pack against the inventory
POST   /api/v1/export                build + sign a bundle
GET    /api/v1/health                liveness
GET    /api/v1/version               build SHA + signing key fingerprint
```

OpenAPI 3.1 spec lives at `/api/v1/openapi.json`. Generated TypeScript and Python clients ship in `clients/`.

---

## What requires a human approver

The Foundation's constitution puts a hard line under four actions. Control Plane enforces it via dual-control on every one:

1. **Trust-tier promotion to T3**
2. **Publishing a new or modified policy YAML / Rego rule**
3. **Granting a control exception**
4. **Rotating the signing key**

Each action requires the requester *and* a separate human approver, both via OIDC, both recorded in receipts with their key fingerprints.

---

## Observability of Beacon itself

Beacon dogfoods its own discipline. Every Control Plane action emits a receipt against Beacon's own inventory (yes, Beacon appears in its own inventory). The Settings surface includes:

- **Self-audit pack** — runs the same checklists against Beacon's own behavior
- **Signing-key health** — last rotation, next required rotation, current Merkle root
- **Append-only log integrity** — hourly Merkle anchor results; any anomaly is a P0

If Beacon can't prove its own evidence, you should not trust the evidence it produces about anything else.
