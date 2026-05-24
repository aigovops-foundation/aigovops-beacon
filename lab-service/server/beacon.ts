/**
 * Beacon Evidence Engine — OVERT 1.0 envelopes + checklist evaluation + bundles.
 */
import { storage } from "./storage";
import {
  canonicalize,
  sha256Hex,
  signEd25519,
  ulid,
  merkleRoot,
  verifyEd25519,
} from "./crypto";
import type { Tenant, InventoryItem, Receipt } from "@shared/schema";

const OVERT_PROFILE = "aigovops-beacon.v1";

export interface ReceiptInput {
  tenantId: string;
  sessionId: string;
  userSub: string; // session id
  userEmail: string;
  eventType: string;
  vendor?: string;
  model?: string;
  version?: string;
  subject?: { name: string; data: string };
  promptHash?: string;
  resultHash?: string;
  controlRefs?: string[];
  decision?: {
    result: "pass" | "fail" | "warn";
    rulesEvaluated: string[];
    rulesFailed: string[];
    exceptionId?: string;
  };
  lineage?: {
    openlineageRunId?: string;
    parentDatasets?: string[];
    parentModels?: string[];
  };
  environment?: "lab" | "dev" | "prod";
  extra?: Record<string, unknown>;
}

export function buildAndSignReceipt(input: ReceiptInput): Receipt {
  const tenant = storage.getTenant(input.tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${input.tenantId}`);

  const id = ulid();
  const tsUtc = new Date();
  const envelope: Record<string, unknown> = {
    overt_version: "1.0",
    profile: OVERT_PROFILE,
    id,
    ts_utc: tsUtc.toISOString(),
    user: {
      sub: input.userSub,
      email: input.userEmail,
      oidc_issuer: "lab://aigovops-beacon",
    },
    vendor: input.vendor ?? null,
    model: input.model ?? null,
    version: input.version ?? null,
    prompt_hash: input.promptHash ?? null,
    result_hash: input.resultHash ?? null,
    event_type: input.eventType,
    environment: input.environment ?? "lab",
    tenant: { id: tenant.id, name: tenant.name },
  };

  if (input.controlRefs?.length) envelope.control_refs = input.controlRefs;
  if (input.subject) {
    envelope.subject = {
      name: input.subject.name,
      digest: "sha256:" + sha256Hex(input.subject.data),
    };
  }
  if (input.decision) {
    envelope.decision = {
      result: input.decision.result,
      rules_evaluated: input.decision.rulesEvaluated,
      rules_failed: input.decision.rulesFailed,
      ...(input.decision.exceptionId ? { exception_id: input.decision.exceptionId } : {}),
    };
  }
  if (input.lineage) {
    envelope.lineage = {
      openlineage_run_id: input.lineage.openlineageRunId ?? null,
      parent_datasets: input.lineage.parentDatasets ?? [],
      parent_models: input.lineage.parentModels ?? [],
    };
  }
  if (input.extra) envelope.extra = input.extra;

  // Canonicalize and sign
  const canonical = canonicalize(envelope);
  const sigB64 = signEd25519(tenant.signingPrivateKey, canonical);

  // Add signature block (NOT part of canonical form)
  const signedEnvelope = {
    ...envelope,
    signature: {
      alg: "Ed25519",
      key_fpr: tenant.keyFingerprint,
      sig_b64: sigB64,
      canonical_form: "RFC8785-JCS",
    },
  };

  const receipt: Receipt = {
    id,
    tenantId: tenant.id,
    sessionId: input.sessionId,
    eventType: input.eventType,
    subjectName: input.subject?.name ?? null,
    subjectDigest: input.subject ? ("sha256:" + sha256Hex(input.subject.data)) : null,
    envelope: signedEnvelope,
    signature: sigB64,
    keyFingerprint: tenant.keyFingerprint,
    canonicalForm: canonical,
    tsUtc,
  };
  storage.createReceipt(receipt);
  return receipt;
}

export function verifyReceipt(receipt: Receipt, tenant: Tenant): { valid: boolean; reason?: string } {
  // Recompute canonical form from envelope minus signature
  const env = { ...(receipt.envelope as Record<string, unknown>) };
  delete env.signature;
  const canonical = canonicalize(env);
  if (canonical !== receipt.canonicalForm) {
    return { valid: false, reason: "Canonical form mismatch (envelope was modified)" };
  }
  const ok = verifyEd25519(tenant.signingPublicKey, canonical, receipt.signature);
  if (!ok) return { valid: false, reason: "Signature failed verification" };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Checklist evaluation — Beacon Level 100 / Level 200 lab variants
// ---------------------------------------------------------------------------

export interface ChecklistRule {
  id: string;
  description: string;
  controlRef: string;
  evaluate: (item: InventoryItem) => boolean; // true = pass
}

export const RULES_LEVEL_100: ChecklistRule[] = [
  {
    id: "L100.R1",
    description: "Risk tier classified (not null/empty).",
    controlRef: "NIST-AI-RMF:MAP-1.1",
    evaluate: (i) => !!i.riskTier && ["low", "medium", "high", "prohibited"].includes(i.riskTier),
  },
  {
    id: "L100.R2",
    description: "Model version is pinned (never 'latest').",
    controlRef: "NIST-AI-RMF:MANAGE-1.3",
    evaluate: (i) => !!i.version && i.version.toLowerCase() !== "latest",
  },
  {
    id: "L100.R3",
    description: "At least one control reference mapped.",
    controlRef: "NIST-AI-RMF:GOVERN-1.1",
    evaluate: (i) => i.controlRefs.length > 0,
  },
  {
    id: "L100.R4",
    description: "Owner email present (accountability).",
    controlRef: "NIST-AI-RMF:GOVERN-2.1",
    evaluate: (i) => !!i.ownerEmail && i.ownerEmail.includes("@"),
  },
  {
    id: "L100.R5",
    description: "Prohibited use cases must be retired, not approved.",
    controlRef: "EU-AI-Act:Art.5",
    evaluate: (i) => i.riskTier !== "prohibited" || i.status === "retired",
  },
];

export const RULES_LEVEL_200: ChecklistRule[] = [
  ...RULES_LEVEL_100,
  {
    id: "L200.R6",
    description: "High-risk systems must have humanApprovalRequired or humanReviewRequired set.",
    controlRef: "NIST-AI-RMF:GOVERN-1.5",
    evaluate: (i) => {
      if (i.riskTier !== "high") return true;
      const m = i.metadata as Record<string, unknown>;
      return Boolean(m.humanApprovalRequired) || Boolean(m.humanReviewRequired);
    },
  },
  {
    id: "L200.R7",
    description: "High-risk systems must have biasAssessment != PENDING.",
    controlRef: "EU-AI-Act:Art.10",
    evaluate: (i) => {
      if (i.riskTier !== "high") return true;
      const m = i.metadata as Record<string, unknown>;
      return m.biasAssessment !== undefined && m.biasAssessment !== "PENDING";
    },
  },
  {
    id: "L200.R8",
    description: "DPIA completed for high-risk systems.",
    controlRef: "GDPR:Art.35",
    evaluate: (i) => {
      if (i.riskTier !== "high") return true;
      const m = i.metadata as Record<string, unknown>;
      return m.dpiaCompleted === true;
    },
  },
  {
    id: "L200.R9",
    description: "PII handling not 'NOT-CONFIGURED' on draft items.",
    controlRef: "NIST-AI-RMF:MEASURE-2.10",
    evaluate: (i) => {
      const m = i.metadata as Record<string, unknown>;
      return m.piiHandling !== "NOT-CONFIGURED";
    },
  },
];

export function evaluateChecklist(items: InventoryItem[], rules: ChecklistRule[]) {
  const itemResults = items.map((item) => {
    const failed: string[] = [];
    for (const rule of rules) {
      if (!rule.evaluate(item)) failed.push(rule.id);
    }
    return {
      itemId: item.id,
      itemName: item.name,
      riskTier: item.riskTier,
      status: item.status,
      failedRules: failed,
      passed: failed.length === 0,
    };
  });
  const allFailedSet = new Set<string>();
  itemResults.forEach((r) => r.failedRules.forEach((f) => allFailedSet.add(f)));
  const overall: "pass" | "fail" =
    itemResults.every((r) => r.passed) ? "pass" : "fail";
  return {
    overall,
    items: itemResults,
    rulesEvaluated: rules.map((r) => r.id),
    rulesFailed: Array.from(allFailedSet),
  };
}

// ---------------------------------------------------------------------------
// Bundling — signed evidence pack
// ---------------------------------------------------------------------------

export function buildBundle(tenantId: string, sessionId: string, receiptIds: string[]) {
  const tenant = storage.getTenant(tenantId);
  if (!tenant) throw new Error("Unknown tenant");
  const allReceipts = receiptIds.map((id) => {
    const r = storage.getReceipt(id);
    if (!r) throw new Error(`Missing receipt ${id}`);
    return r;
  });
  const leaves = allReceipts.map((r) => sha256Hex(r.canonicalForm));
  const root = merkleRoot(leaves);
  const bundleId = ulid();
  const bundleJson = {
    overt_version: "1.0",
    profile: OVERT_PROFILE + ".bundle",
    bundle_id: bundleId,
    tenant: { id: tenant.id, name: tenant.name },
    ts_utc: new Date().toISOString(),
    receipts: allReceipts.map((r) => ({
      id: r.id,
      event_type: r.eventType,
      subject: r.subjectName,
      digest_sha256: sha256Hex(r.canonicalForm),
    })),
    merkle: {
      algorithm: "sha256",
      root,
      leaf_count: leaves.length,
    },
    signing_key_fpr: tenant.keyFingerprint,
  };
  const canonical = canonicalize(bundleJson);
  const sig = signEd25519(tenant.signingPrivateKey, canonical);
  const signedBundle = {
    ...bundleJson,
    signature: {
      alg: "Ed25519",
      key_fpr: tenant.keyFingerprint,
      sig_b64: sig,
      canonical_form: "RFC8785-JCS",
    },
  };
  const bundle = {
    id: bundleId,
    tenantId,
    sessionId,
    receiptIds,
    merkleRoot: root,
    signature: sig,
    bundleJson: signedBundle,
    createdAt: new Date(),
  };
  storage.createBundle(bundle);
  return bundle;
}

export function verifyBundle(bundleId: string) {
  const b = storage.getBundle(bundleId);
  if (!b) return { valid: false, reason: "Bundle not found" };
  const tenant = storage.getTenant(b.tenantId);
  if (!tenant) return { valid: false, reason: "Tenant not found" };
  // Verify signature
  const env = { ...(b.bundleJson as Record<string, unknown>) };
  delete env.signature;
  const canonical = canonicalize(env);
  const sigOk = verifyEd25519(tenant.signingPublicKey, canonical, b.signature);
  if (!sigOk) return { valid: false, reason: "Bundle signature invalid" };
  // Recompute merkle root
  const receiptList = b.receiptIds as string[];
  const leaves = receiptList.map((id) => {
    const r = storage.getReceipt(id);
    if (!r) throw new Error("Missing receipt for verify");
    return sha256Hex(r.canonicalForm);
  });
  const root = merkleRoot(leaves);
  if (root !== b.merkleRoot) {
    return { valid: false, reason: "Merkle root mismatch — receipts changed since bundle creation" };
  }
  // Verify each receipt
  for (const id of receiptList) {
    const r = storage.getReceipt(id);
    if (!r) return { valid: false, reason: `Receipt ${id} missing` };
    const vr = verifyReceipt(r, tenant);
    if (!vr.valid) return { valid: false, reason: `Receipt ${id}: ${vr.reason}` };
  }
  return { valid: true, root, receiptCount: receiptList.length };
}
