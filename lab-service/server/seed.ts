/**
 * seed.ts — the tenants and the demo inventory a cohort starts from.
 *
 * WHERE THIS DATA COMES FROM. The tenant identities (id, name, description, EIN) are captured
 * VERBATIM from the live service's `GET /api/status` on 2026-08-04, and the `aigovops-foundation`
 * inventory is captured verbatim from `GET /api/inventory` on the same day. This is a
 * reconstruction of a service whose source was lost, so anything not recovered from the running
 * deployment is marked as such below rather than quietly invented.
 *
 * WHAT COULD NOT BE RECOVERED, and why:
 *
 *   - `beacon-foundation-inc`'s inventory. `POST /api/demo/login` always issues a session for
 *     tenants[0], and the admin password was not available, so the second tenant's rows were never
 *     reachable through a public endpoint. The rows below are authored for this rebuild, in the
 *     recovered shape, and are deliberately a TEACHING set: unlike tenant one, this inventory
 *     contains failures, so an instructor can demonstrate a red checklist without editing data
 *     live. They do not claim to be what the old deployment held.
 *
 *   - The SIGNING PRIVATE KEYS, which is unavoidable and correct — a private key that could be
 *     read back out of a public API would be the real finding. `bootstrap()` therefore generates a
 *     fresh Ed25519 keypair per tenant on first run. CONSEQUENCE: receipts issued by the old
 *     deployment cannot be verified by this one, because the key that signed them no longer
 *     exists anywhere. New receipts verify normally, including under the auditor's
 *     `src/beacon_verify.py` (proven in tests/unit/test_lab_receipt_parity.py).
 *
 * Everything here is idempotent. `bootstrap()` runs on every boot and must be safe to re-run: it
 * never overwrites an existing tenant (which would rotate its keys and orphan every receipt signed
 * under the old one) and never resets an admin password an instructor has already rotated.
 */

import crypto from "node:crypto";
import { storage, db, _internal } from "./storage.js";
import { hashPassword, ulid } from "./crypto.js";
import type { InventoryItem } from "@shared/schema";

const { tenants, inventory, adminState } = _internal.tables;
const { eq } = _internal.helpers;

/**
 * Captured from the live `GET /api/status`, 2026-08-04.
 *
 * ONE DELIBERATE DEVIATION: the live service returns "AIGovOps Foundation", and this says
 * "AiGovOps Foundation". `routes.ts` (recovered from committed fragments) already defaults
 * `labName` to "AiGovOps Beacon Lab", and the repo runs 400 "AiGovOps" to 35 "AIGovOps", so
 * keeping the captured casing here would have put both spellings on the same screen — the tenant
 * card under the lab title. Normalised to the dominant form rather than shipping the mismatch.
 *
 * The wider inconsistency is NOT fixed here: docs/lab.html, docs/js/lab.js and published-lab.html
 * still say "AIGovOps". That is a branding decision across the public lab surface, not something
 * to change as a side effect of a backend rebuild.
 */
export const TENANT_SEEDS = [
  {
    id: "aigovops-foundation",
    name: "AiGovOps Foundation",
    description:
      "Open-source 501(c)(3) advancing community-owned AI governance standards. Demo inventory only — not real Foundation policy.",
    ein: "99-0000001",
  },
  {
    id: "beacon-foundation-inc",
    name: "Beacon Foundation Inc.",
    description:
      "Fictional 501(c)(3) used purely for training. Any resemblance to a real organization is coincidental.",
    ein: "99-0000002",
  },
] as const;

type SeedItem = Omit<InventoryItem, "id" | "tenantId" | "createdAt">;

/**
 * `aigovops-foundation` — captured verbatim from the live `GET /api/inventory`, 2026-08-04.
 * This set PASSES Lab 100 in full, which is what makes it a usable starting point: the trainee's
 * job in Lab 100 is to discover and attest an inventory, not to fix a broken one.
 */
const INVENTORY_AIGOVOPS: SeedItem[] = [
  {
    name: "Grant Application Triage",
    vendor: "OpenAI",
    model: "gpt-4o",
    version: "2024-08-06",
    useCase:
      "Pre-screens incoming community grant applications against eligibility checklist; flags items for human reviewer.",
    riskTier: "medium",
    status: "approved",
    ownerEmail: "grants@aigovops.org",
    controlRefs: ["NIST-AI-RMF:GOVERN-1.1", "NIST-AI-RMF:MAP-2.3", "EU-AI-Act:Art.10"],
    metadata: {
      dataset: "anonymized-grant-apps-2024",
      piiHandling: "redacted-before-prompt",
      humanReviewRequired: true,
    },
  },
  {
    name: "Volunteer Match Recommender",
    vendor: "Anthropic",
    model: "claude-sonnet-4",
    version: "20250514",
    useCase: "Matches volunteer skills to open community projects.",
    riskTier: "low",
    status: "approved",
    ownerEmail: "community@aigovops.org",
    controlRefs: ["NIST-AI-RMF:MEASURE-2.7"],
    metadata: { dataset: "volunteer-skills-public", optInOnly: true },
  },
  {
    name: "Educational Content Summarizer",
    vendor: "Google",
    model: "gemini-1.5-pro",
    version: "002",
    useCase: "Summarizes workshop transcripts into learner-facing recap notes.",
    riskTier: "low",
    status: "approved",
    ownerEmail: "education@aigovops.org",
    controlRefs: ["NIST-AI-RMF:MEASURE-2.11"],
    metadata: { dataset: "workshop-transcripts-public" },
  },
  {
    name: "Donor Sentiment Scorer (DRAFT)",
    vendor: "OpenAI",
    model: "gpt-4o-mini",
    version: "2024-07-18",
    useCase: "Scores donor outreach replies as positive/neutral/negative for follow-up prioritization.",
    riskTier: "high",
    status: "approved",
    ownerEmail: "development@aigovops.org",
    controlRefs: ["NIST-AI-RMF:GOVERN-2.1"],
    // High risk, so L200.R6/R7/R8 all bite here. The live row carries exactly the evidence they
    // ask for — this is the item that shows a trainee what "high risk, done properly" looks like.
    metadata: {
      dataset: "first-party-donor-feedback",
      piiHandling: "redacted-before-prompt",
      biasAssessment: "completed-2026-05",
      dpiaCompleted: true,
      humanApprovalRequired: true,
    },
  },
  {
    name: "Board Meeting Minute Drafting",
    vendor: "Anthropic",
    model: "claude-opus-4",
    version: "20250514",
    useCase: "Drafts board meeting minutes from human-confirmed transcript.",
    riskTier: "medium",
    status: "approved",
    ownerEmail: "boardops@aigovops.org",
    controlRefs: ["NIST-AI-RMF:GOVERN-1.5", "ISO-42001:6.2"],
    metadata: { dataset: "board-transcripts-internal", humanApprovalRequired: true },
  },
];

/**
 * `beacon-foundation-inc` — AUTHORED FOR THIS REBUILD, not recovered (see the header).
 *
 * Deliberately imperfect. Each row below fails a specific rule, so an instructor can show a red
 * checklist and the findings that explain it without hand-editing data in front of a cohort:
 *
 *   Shadow Resume Screener   → L100.R1 (no risk tier), L100.R2 (version "latest")
 *   Chatbot FAQ Assistant    → L100.R3 (no control refs), L100.R4 (no owner email)
 *   Emotion Detection Pilot  → L100.R5 (prohibited use case, still approved)
 *   Vendor Invoice Extractor → passes L100; fails L200.R7/R8 (high risk, bias + DPIA pending)
 */
const INVENTORY_BEACON_INC: SeedItem[] = [
  {
    name: "Shadow Resume Screener",
    vendor: "OpenAI",
    model: "gpt-4o",
    version: "latest",
    useCase: "Ranks job applicants for the hiring manager before any human reads the CV.",
    riskTier: null,
    status: "approved",
    ownerEmail: "hr@beaconfoundation.example",
    controlRefs: ["NIST-AI-RMF:MAP-1.1"],
    metadata: { dataset: "applicant-cvs", discoveredBy: "expense-report" },
  },
  {
    name: "Chatbot FAQ Assistant",
    vendor: "Google",
    model: "gemini-1.5-flash",
    version: "001",
    useCase: "Answers donor questions on the public website.",
    riskTier: "low",
    status: "approved",
    ownerEmail: "",
    controlRefs: [],
    metadata: { dataset: "public-faq" },
  },
  {
    name: "Emotion Detection Pilot",
    vendor: "Acme Vision",
    model: "affect-net",
    version: "3.1",
    useCase: "prohibited",
    riskTier: "high",
    status: "approved",
    ownerEmail: "innovation@beaconfoundation.example",
    controlRefs: ["EU-AI-Act:Art.5"],
    metadata: {
      dataset: "volunteer-webcam-pilot",
      note: "Inferring emotion in the workplace is a prohibited practice under EU AI Act Art. 5.",
      humanApprovalRequired: true,
      biasAssessment: "completed-2026-04",
      dpiaCompleted: true,
    },
  },
  {
    name: "Vendor Invoice Extractor",
    vendor: "Anthropic",
    model: "claude-haiku-4",
    version: "20251001",
    useCase: "Extracts totals and line items from supplier invoices for the finance team.",
    riskTier: "high",
    status: "approved",
    ownerEmail: "finance@beaconfoundation.example",
    controlRefs: ["NIST-AI-RMF:MEASURE-2.10", "GDPR:Art.35"],
    metadata: {
      dataset: "supplier-invoices",
      piiHandling: "redacted-before-prompt",
      humanApprovalRequired: true,
      biasAssessment: "PENDING",
      dpiaCompleted: false,
    },
  },
];

const INVENTORY_BY_TENANT: Record<string, SeedItem[]> = {
  "aigovops-foundation": INVENTORY_AIGOVOPS,
  "beacon-foundation-inc": INVENTORY_BEACON_INC,
};

/** A fresh Ed25519 keypair in the encodings the live service stored: SPKI / PKCS8, base64. */
function generateTenantKeys(): { pub: string; priv: string; fpr: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const priv = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  // Matches the live fingerprints' shape: "ed25519:" + first 16 hex of sha256(SPKI DER).
  const fpr = "ed25519:" + crypto.createHash("sha256").update(pub).digest("hex").slice(0, 16);
  return { pub: pub.toString("base64"), priv: priv.toString("base64"), fpr };
}

/**
 * Replace one tenant's inventory with its seed rows.
 *
 * Used by `POST /api/admin/reset` between cohorts, which is why it is scoped to a single tenant
 * and deletes before inserting: an instructor resetting the lab expects the SAME starting state,
 * not the seed rows appended to whatever the last cohort left behind.
 */
export function reseedTenantInventory(tenantId: string): void {
  const seeds = INVENTORY_BY_TENANT[tenantId];
  if (!seeds) return;
  const now = new Date();
  _internal.sqlite.transaction(() => {
    db.delete(inventory).where(eq(inventory.tenantId, tenantId)).run();
    for (const s of seeds) {
      db.insert(inventory).values({ ...s, id: ulid(), tenantId, createdAt: now }).run();
    }
  })();
}

/**
 * Bring an empty database up to a working lab. Safe to call on every boot.
 *
 * The admin password is only set when none exists. Re-hashing it here would silently undo
 * `POST /api/admin/rotate-password` on the next restart — an instructor would rotate the password,
 * the container would recycle, and the old one would work again.
 */
export function bootstrap(adminPassword: string): void {
  const now = new Date();

  for (const t of TENANT_SEEDS) {
    // Never overwrite: re-keying an existing tenant would orphan every receipt already signed
    // under the old fingerprint, and they would fail verification with no way back.
    if (storage.getTenant(t.id)) continue;
    const k = generateTenantKeys();
    db.insert(tenants)
      .values({
        id: t.id,
        name: t.name,
        description: t.description,
        ein: t.ein,
        keyFingerprint: k.fpr,
        signingPublicKey: k.pub,
        signingPrivateKey: k.priv,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }

  const state = storage.getAdminState();
  if (!state.passwordHash) {
    const { hash, salt } = hashPassword(adminPassword);
    storage.updateAdminPassword(hash, salt);
  }

  for (const t of TENANT_SEEDS) {
    if (storage.listInventory(t.id).length === 0) reseedTenantInventory(t.id);
  }

  db.update(adminState).set({ paused: false }).where(eq(adminState.id, 1)).run();
}
