/**
 * server/beacon.ts — receipts, checklists and bundles. Rebuilt 2026-08-04 (phase 3 of 4).
 *
 * Exports exactly what routes.ts imports: buildAndSignReceipt, verifyReceipt, evaluateChecklist,
 * RULES_LEVEL_100, RULES_LEVEL_200, buildBundle, verifyBundle.
 *
 * THIS IS AN ADAPTER, NOT A NEW IMPLEMENTATION — and the distinction is the whole point.
 * A receipt this lab signs has to verify under `src/beacon_verify.py`, the auditor's tool, which
 * states the contract plainly: "the signature must verify over the RFC 8785 canonical bytes of the
 * receipt with its signature block removed." Two things therefore must not drift:
 *
 *   1. CANONICALIZATION. `shared/canonical.js` is a byte-identical copy of
 *      `server/src/lib/canonical.js`, enforced by tests/unit/test_vendored_lab_components.py.
 *      It is copied rather than imported because the Docker build context is lab-service/, so the
 *      engine's directory is not reachable at build time. A copy plus a guard beats two
 *      implementations — the estate has already been bitten by a vendored file drifting silently
 *      (the pplx-hosted components kept shipping retired branding for weeks).
 *   2. THE SIGNATURE BLOCK. `alg: "Ed25519"`, `canonical_form`, `key_fpr`, `signature_ed25519`,
 *      matching docs/RECEIPT_SCHEMA.md and what beacons/_common.py produces.
 *
 * Ed25519 comes from `node:crypto`, not tweetnacl as the engine uses. That is deliberate: the
 * tenant keys stored by the live service are SPKI DER (`MCowBQYDK2VwAyEA…`), which is node:crypto's
 * native format and needs no conversion, and Ed25519 signatures are deterministic — the same key
 * over the same bytes yields the same signature regardless of library. Verified against the live
 * public key, which parses and re-exports byte-identically.
 */

import crypto from "node:crypto";
// @ts-expect-error — vendored JS from the engine, kept byte-identical on purpose (see above).
import { canonicalize } from "@shared/canonical.js";
import { ulid } from "./crypto.js";
import { storage, db, _internal } from "./storage.js";
import type { InventoryItem, Receipt, Tenant } from "@shared/schema";

const { receipts: receiptsTable, bundles: bundlesTable } = _internal.tables;

/** docs/RECEIPT_SCHEMA.md. `beacon_verify.py` accepts this or the Node engine's "RFC8785". */
const CANONICAL_FORM = "json/c14n-rfc8785";
const SIGNING_ALG = "Ed25519";
const SCHEMA_VERSION = "1.0.0";

/* ------------------------------------------------------------------- rules */

/**
 * A curriculum rule. `evaluate` is a server-side closure and is deliberately NOT sent to the
 * browser — `GET /api/curriculum/:level` strips it and ships only the declarative metadata, so a
 * trainee cannot read the answer out of the payload.
 */
export interface Rule {
  id: string;
  description: string;
  controlRef: string;
  evaluate: (item: InventoryItem) => boolean;
}

const meta = (i: InventoryItem): Record<string, unknown> =>
  (i.metadata ?? {}) as Record<string, unknown>;

/**
 * Read a field from an item, COLUMN FIRST, then `metadata`.
 *
 * The order is load-bearing. The live service's `GET /api/inventory` returns `version`,
 * `ownerEmail`, `useCase` and `model` as top-level columns, with `metadata` holding only the
 * extras (`dataset`, `piiHandling`, …). An earlier version of this file read metadata ONLY, so
 * every real inventory row failed L100.R2 (version pinned) and L100.R4 (owner email) — Lab 100
 * would have marked a perfectly governed inventory as non-compliant, which is worse than failing
 * loudly because the trainee would believe it.
 *
 * Caught by evaluating the LIVE Lab 100 checklist against the LIVE inventory: it returns
 * `overall: "pass"` with zero findings, over items whose metadata contains neither field. The
 * regression test in beacon.test.ts uses that same live-shaped row.
 *
 * Both sources are still consulted, because the L200 rules genuinely live in metadata
 * (`biasAssessment`, `dpiaCompleted`, `piiHandling`) and custom policy-eval rules may use either.
 */
const str = (i: InventoryItem, k: string): string => {
  // An EMPTY column falls back to metadata, not just a null one. The four columns were added to an
  // existing table with `DEFAULT ''`, so every pre-migration row now has empty strings where its
  // real values are still sitting in metadata. `??` alone would stop at the empty string and
  // report the field as missing — a migrated database would fail Lab 100 on rows that had always
  // passed. Caught by storage.migrate.test.ts.
  const col = String((i as unknown as Record<string, unknown>)[k] ?? "").trim();
  if (col) return col;
  return String(meta(i)[k] ?? "").trim();
};

/**
 * Level 100 — id, description and controlRef captured VERBATIM from the live service's
 * `GET /api/curriculum/100` on 2026-08-04. The predicates are reconstructed from those
 * descriptions; the wording is not paraphrased, because a trainee sees it.
 */
export const RULES_LEVEL_100: Rule[] = [
  {
    id: "L100.R1",
    description: "Risk tier classified (not null/empty).",
    controlRef: "NIST-AI-RMF:MAP-1.1",
    evaluate: (i) => !!(i.riskTier && String(i.riskTier).trim()),
  },
  {
    id: "L100.R2",
    description: "Model version is pinned (never 'latest').",
    controlRef: "NIST-AI-RMF:MANAGE-1.3",
    evaluate: (i) => {
      // `version` first: it is the column the live service returns. `modelVersion` is only a
      // fallback for metadata-carried rows (custom imports, and the older seed shape) — checking
      // it first would let a stale metadata copy overrule the column that actually holds the pin.
      const v = str(i, "version") || str(i, "modelVersion");
      return v.length > 0 && v.toLowerCase() !== "latest";
    },
  },
  {
    id: "L100.R3",
    description: "At least one control reference mapped.",
    controlRef: "NIST-AI-RMF:GOVERN-1.1",
    evaluate: (i) => Array.isArray(i.controlRefs) && i.controlRefs.length > 0,
  },
  {
    id: "L100.R4",
    description: "Owner email present (accountability).",
    controlRef: "NIST-AI-RMF:GOVERN-2.1",
    evaluate: (i) => /.+@.+\..+/.test(str(i, "ownerEmail")),
  },
  {
    id: "L100.R5",
    description: "Prohibited use cases must be retired, not approved.",
    controlRef: "EU-AI-Act:Art.5",
    // Only bites when the use case is actually prohibited — a normal item passes trivially.
    evaluate: (i) =>
      str(i, "useCase").toLowerCase() !== "prohibited" ||
      String(i.status).toLowerCase() === "retired",
  },
];

/**
 * Level 200 is CUMULATIVE — the live `GET /api/curriculum/200` returns L100.R1–R5 followed by
 * L200.R6–R9, so Lab 200 re-checks everything Lab 100 did and adds four. Rebuilding it as only the
 * four new rules would silently weaken the exercise.
 */
export const RULES_LEVEL_200: Rule[] = [
  ...RULES_LEVEL_100,
  {
    id: "L200.R6",
    description: "High-risk systems must have humanApprovalRequired or humanReviewRequired set.",
    controlRef: "NIST-AI-RMF:GOVERN-1.5",
    evaluate: (i) =>
      String(i.riskTier).toLowerCase() !== "high" ||
      truthy(meta(i).humanApprovalRequired) || truthy(meta(i).humanReviewRequired),
  },
  {
    id: "L200.R7",
    description: "High-risk systems must have biasAssessment != PENDING.",
    controlRef: "EU-AI-Act:Art.10",
    evaluate: (i) =>
      String(i.riskTier).toLowerCase() !== "high" ||
      (str(i, "biasAssessment").length > 0 && str(i, "biasAssessment").toUpperCase() !== "PENDING"),
  },
  {
    id: "L200.R8",
    description: "DPIA completed for high-risk systems.",
    controlRef: "GDPR:Art.35",
    evaluate: (i) =>
      String(i.riskTier).toLowerCase() !== "high" ||
      truthy(meta(i).dpiaCompleted) || str(i, "dpia").toUpperCase() === "COMPLETED",
  },
  {
    id: "L200.R9",
    description: "PII handling not 'NOT-CONFIGURED' on draft items.",
    controlRef: "NIST-AI-RMF:MEASURE-2.10",
    evaluate: (i) =>
      String(i.status).toLowerCase() !== "draft" ||
      str(i, "piiHandling").toUpperCase() !== "NOT-CONFIGURED",
  },
];

function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "required";
}

/* ------------------------------------------------------------- evaluation */

export interface ChecklistResult {
  overall: "pass" | "fail";
  /** RULE IDS, not counts — see the note in shared/schema.ts on why this matters. */
  rulesEvaluated: string[];
  rulesFailed: string[];
  /** Per-item detail so the UI can say WHICH row failed WHICH rule. */
  findings: Array<{ itemId: string; itemName: string; ruleId: string; description: string; controlRef: string }>;
}

/**
 * Evaluate every rule against every item.
 *
 * A rule counts as FAILED if any item fails it, and the run is `fail` if any rule failed. A rule
 * whose predicate throws is treated as failed rather than crashing the request: `/api/lab/policy-eval`
 * accepts CUSTOM rules from the request body, so a malformed one is user input, not a server bug.
 */
export function evaluateChecklist(items: InventoryItem[], rules: Rule[]): ChecklistResult {
  const failed = new Set<string>();
  const findings: ChecklistResult["findings"] = [];

  for (const rule of rules) {
    for (const item of items) {
      let ok: boolean;
      try {
        ok = rule.evaluate(item) === true;
      } catch {
        ok = false;
      }
      if (!ok) {
        failed.add(rule.id);
        findings.push({
          itemId: item.id, itemName: item.name, ruleId: rule.id,
          description: rule.description, controlRef: rule.controlRef,
        });
      }
    }
  }

  const rulesEvaluated = rules.map((r) => r.id);
  const rulesFailed = rulesEvaluated.filter((id) => failed.has(id));
  return {
    overall: rulesFailed.length === 0 ? "pass" : "fail",
    rulesEvaluated,
    rulesFailed,
    findings,
  };
}

/* --------------------------------------------------------------- receipts */

export interface ReceiptInput {
  tenantId: string;
  sessionId: string;
  userSub: string;
  userEmail: string;
  eventType: string;
  controlRefs: string[];
  subject: { name: string; data: string };
  decision: { result: string; rulesEvaluated: string[]; rulesFailed: string[] };
  extra?: Record<string, unknown>;
}

const sha256Hex = (s: string): string => crypto.createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Build the receipt envelope, sign it, persist it, and return it.
 *
 * THE SUBJECT IS HASHED, NOT STORED. `beacons/_common.py` puts it plainly: "beacons never record
 * raw payloads". The lab follows the same rule — a trainee's inventory is hashed into
 * `subject.digest`, and the raw JSON is not written to the receipt. That keeps a receipt safe to
 * export in an evidence bundle, which is the behaviour Lab 100 is teaching.
 */
export function buildAndSignReceipt(input: ReceiptInput): Receipt {
  const tenant = storage.getTenant(input.tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${input.tenantId}`);

  const id = ulid();
  const tsUtc = new Date().toISOString();
  const subjectDigest = `sha256:${sha256Hex(input.subject.data)}`;

  // The base is what gets canonicalized and signed. The signature block is attached AFTER, and
  // must not be part of the signed bytes — that is the contract beacon_verify.py enforces.
  const base = {
    id,
    ts_utc: tsUtc,
    schema_version: SCHEMA_VERSION,
    tenant_id: input.tenantId,
    session_id: input.sessionId,
    user: { sub: input.userSub, email: input.userEmail },
    event_type: input.eventType,
    environment: "lab",
    control_refs: input.controlRefs,
    subject: { name: input.subject.name, digest: subjectDigest },
    decision: input.decision,
    attributes: input.extra ?? null,
  };

  const canonicalBytes = Buffer.from(canonicalize(base), "utf8");
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(tenant.signingPrivateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  // Ed25519 in node:crypto takes a null algorithm — the curve implies SHA-512 internally.
  const signature = crypto.sign(null, canonicalBytes, privateKey).toString("base64");

  const envelope = {
    ...base,
    signature: {
      alg: SIGNING_ALG,
      key_fpr: tenant.keyFingerprint,
      canonical_form: CANONICAL_FORM,
      signature_ed25519: signature,
    },
  };

  const row: Receipt = {
    id,
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    eventType: input.eventType,
    subjectName: input.subject.name,
    subjectDigest,
    controlRef: input.controlRefs,
    // Store the exact bytes that were signed, with the signature block attached. Re-serialising
    // at verify time is how signature checks drift.
    envelope: JSON.stringify(envelope),
    signature,
    keyFingerprint: tenant.keyFingerprint,
    tsUtc,
    createdAt: new Date(),
  };
  db.insert(receiptsTable).values(row).run();
  return row;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  payload?: unknown;
}

/**
 * Verify a stored receipt against its tenant's public key.
 *
 * Strips the signature block, re-canonicalizes what remains, and checks the signature over those
 * bytes — exactly what `src/beacon_verify.py` does, so a receipt that passes here passes there.
 * A mismatched `key_fpr` is rejected before any crypto: a receipt signed by another tenant's key
 * is a different failure from a corrupted one, and the trainee should be told which.
 */
export function verifyReceipt(receipt: Receipt, tenant: Tenant | null): VerifyResult {
  if (!tenant) return { ok: false, reason: "Unknown tenant for this receipt" };
  if (receipt.keyFingerprint !== tenant.keyFingerprint) {
    return { ok: false, reason: `Key fingerprint mismatch: receipt ${receipt.keyFingerprint}, tenant ${tenant.keyFingerprint}` };
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(receipt.envelope);
  } catch {
    return { ok: false, reason: "Envelope is not valid JSON" };
  }

  const { signature: sigBlock, ...base } = envelope as any;
  if (!sigBlock?.signature_ed25519) return { ok: false, reason: "Receipt has no signature block" };

  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(tenant.signingPublicKey, "base64"),
      format: "der",
      type: "spki",
    });
    const ok = crypto.verify(
      null,
      Buffer.from(canonicalize(base), "utf8"),
      publicKey,
      Buffer.from(sigBlock.signature_ed25519, "base64"),
    );
    return ok
      ? { ok: true, payload: envelope }
      : { ok: false, reason: "Signature does not verify over the canonical bytes", payload: envelope };
  } catch (e) {
    return { ok: false, reason: `Verification error: ${(e as Error).message}` };
  }
}

/* ---------------------------------------------------------------- bundles */

/**
 * Build a portable evidence bundle over a set of receipts.
 *
 * The bundle digest is taken over the RECEIPT IDS AND THEIR SIGNATURES, not over the receipt
 * bodies. That makes the bundle tamper-evident without duplicating payloads: swapping a receipt
 * for a different one changes the digest, while the receipts remain independently verifiable on
 * their own signatures.
 */
export function buildBundle(tenantId: string, sessionId: string, receiptIds: string[]): Bundle {
  const tenant = storage.getTenant(tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${tenantId}`);

  const rows = receiptIds
    .map((id) => storage.getReceipt(id))
    .filter((r): r is Receipt => !!r && r.tenantId === tenantId);

  const manifest = {
    tenant_id: tenantId,
    session_id: sessionId,
    receipts: rows.map((r) => ({ id: r.id, signature: r.signature, key_fpr: r.keyFingerprint })),
  };
  const canonicalBytes = Buffer.from(canonicalize(manifest), "utf8");
  const digest = `sha256:${crypto.createHash("sha256").update(canonicalBytes).digest("hex")}`;

  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(tenant.signingPrivateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signature = crypto.sign(null, canonicalBytes, privateKey).toString("base64");

  const row: Bundle = {
    id: ulid(),
    tenantId,
    sessionId,
    receiptIds: rows.map((r) => r.id),
    digest,
    signature,
    keyFingerprint: tenant.keyFingerprint,
    createdAt: new Date(),
  };
  db.insert(bundlesTable).values(row).run();
  return row;
}

/**
 * Verify a bundle: its own signature, AND every receipt inside it.
 *
 * Checking only the bundle signature would be the hollow-green failure this estate keeps finding —
 * a bundle can be perfectly signed and still contain a receipt that does not verify. Both are
 * reported, so "the bundle is valid" means every claim inside it is too.
 */
export function verifyBundle(id: string): VerifyResult {
  const row = db.select().from(bundlesTable).where(_internal.helpers.eq(bundlesTable.id, id)).get();
  if (!row) return { ok: false, reason: "Bundle not found" };

  const tenant = storage.getTenant(row.tenantId);
  if (!tenant) return { ok: false, reason: "Unknown tenant for this bundle" };

  const rows = row.receiptIds.map((rid) => storage.getReceipt(rid));
  const missing = row.receiptIds.filter((_, i) => !rows[i]);
  if (missing.length) return { ok: false, reason: `Bundle references missing receipts: ${missing.join(", ")}` };

  const manifest = {
    tenant_id: row.tenantId,
    session_id: row.sessionId,
    receipts: (rows as Receipt[]).map((r) => ({ id: r.id, signature: r.signature, key_fpr: r.keyFingerprint })),
  };
  const canonicalBytes = Buffer.from(canonicalize(manifest), "utf8");

  let bundleOk = false;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(tenant.signingPublicKey, "base64"), format: "der", type: "spki",
    });
    bundleOk = crypto.verify(null, canonicalBytes, publicKey, Buffer.from(row.signature, "base64"));
  } catch (e) {
    return { ok: false, reason: `Bundle verification error: ${(e as Error).message}` };
  }
  if (!bundleOk) return { ok: false, reason: "Bundle signature does not verify" };

  const receiptResults = (rows as Receipt[]).map((r) => ({ id: r.id, ...verifyReceipt(r, tenant) }));
  const bad = receiptResults.filter((r) => !r.ok);
  return bad.length
    ? { ok: false, reason: `${bad.length} receipt(s) in the bundle do not verify`, payload: { receipts: receiptResults } }
    : { ok: true, payload: { digest: row.digest, receipts: receiptResults } };
}

// Imported late to avoid a circular type reference at module init.
import type { Bundle } from "@shared/schema";
