/**
 * beacon.test.ts — receipts, checklists and bundles. Phase 3 of the lab-service rebuild.
 *
 * The signing tests matter more than the rest of this suite. A receipt this lab issues has to
 * verify under `src/beacon_verify.py`, the auditor's tool, whose contract is: the signature must
 * verify over the RFC 8785 canonical bytes of the receipt WITH ITS SIGNATURE BLOCK REMOVED.
 * Cross-implementation agreement is checked separately and for real in
 * tests/unit/test_lab_receipt_parity.py, which signs here and verifies in Python.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lab-beacon-test-"));
process.env.BEACON_DATA_DIR = TMP;
process.env.BEACON_DB_PATH = path.join(TMP, "test.db");

const { storage, db, _internal } = await import("./storage.js");
const {
  buildAndSignReceipt, verifyReceipt, evaluateChecklist,
  RULES_LEVEL_100, RULES_LEVEL_200, buildBundle, verifyBundle,
} = await import("./beacon.js");
const { tenants, inventory } = _internal.tables;

const TENANT = "aigovops-foundation";

/** A real Ed25519 keypair in the same encodings the live service stored (SPKI / PKCS8 base64). */
function makeTenantKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const priv = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const fpr = "ed25519:" + crypto.createHash("sha256").update(pub).digest("hex").slice(0, 16);
  return { pub: pub.toString("base64"), priv: priv.toString("base64"), fpr };
}

before(() => {
  const k = makeTenantKeys();
  db.insert(tenants).values({
    id: TENANT, name: "AIGovOps Foundation", description: "", ein: "99-0000001",
    keyFingerprint: k.fpr, signingPublicKey: k.pub, signingPrivateKey: k.priv, createdAt: new Date(),
  }).onConflictDoNothing().run();
});

beforeEach(() => storage.resetLabData());

const item = (over: Record<string, unknown> = {}) => ({
  id: "inv-" + Math.random().toString(36).slice(2, 8),
  tenantId: TENANT, name: "Resume screener", vendor: "Acme",
  riskTier: "low", status: "approved",
  controlRefs: ["NIST-AI-RMF:MAP-1.1"],
  metadata: { modelVersion: "1.2.3", ownerEmail: "owner@example.org" },
  createdAt: new Date(), ...over,
}) as any;

const receiptInput = (over: Record<string, unknown> = {}) => ({
  tenantId: TENANT, sessionId: "sess-1", userSub: "sess-1", userEmail: "anon@trainee.lab",
  eventType: "discovery.scan", controlRefs: ["NIST-AI-RMF:MAP-1.1"],
  subject: { name: "ai-program-inventory", data: JSON.stringify([{ id: "a" }]) },
  decision: { result: "pass", rulesEvaluated: ["discovery.completeness"], rulesFailed: [] },
  extra: { itemCount: 1 }, ...over,
});

/* ---------------------------------------------------------------- receipts */

test("a signed receipt verifies against its tenant key", () => {
  const r = buildAndSignReceipt(receiptInput());
  assert.ok(r.id.length === 26, "receipt id is a ULID");
  const result = verifyReceipt(r, storage.getTenant(TENANT));
  assert.equal(result.ok, true, result.reason);
});

test("the SUBJECT IS HASHED, never stored raw", () => {
  // "beacons never record raw payloads" — beacons/_common.py. A receipt must be safe to export
  // in an evidence bundle, which is the behaviour Lab 100 teaches.
  const secret = JSON.stringify([{ id: "x", name: "SECRET-INVENTORY-NAME" }]);
  const r = buildAndSignReceipt(receiptInput({ subject: { name: "inv", data: secret } }));
  assert.match(r.subjectDigest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(!r.envelope.includes("SECRET-INVENTORY-NAME"), "raw subject must not appear in the envelope");
});

test("tampering with ANY signed field breaks verification", () => {
  const r = buildAndSignReceipt(receiptInput());
  const env = JSON.parse(r.envelope);
  env.decision.result = "fail"; // flip the verdict — the thing an attacker would actually change
  const tampered = { ...r, envelope: JSON.stringify(env) };
  const result = verifyReceipt(tampered, storage.getTenant(TENANT));
  assert.equal(result.ok, false, "a modified decision must not verify");
});

test("a receipt signed by another tenant's key is rejected by fingerprint, with a clear reason", () => {
  const r = buildAndSignReceipt(receiptInput());
  const other = { ...storage.getTenant(TENANT)!, keyFingerprint: "ed25519:0000000000000000" };
  const result = verifyReceipt(r, other as any);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /fingerprint/i, "the trainee should be told WHICH failure this is");
});

test("verifyReceipt never throws on corrupt input", () => {
  const r = buildAndSignReceipt(receiptInput());
  assert.equal(verifyReceipt({ ...r, envelope: "not json" }, storage.getTenant(TENANT)).ok, false);
  assert.equal(verifyReceipt(r, null).ok, false);
});

/* -------------------------------------------------------------- checklists */

test("RULES_LEVEL_200 is CUMULATIVE — it re-checks everything Lab 100 did", () => {
  // The live GET /api/curriculum/200 returned L100.R1–R5 followed by L200.R6–R9. Rebuilding it as
  // only the four new rules would silently weaken the exercise.
  const ids100 = RULES_LEVEL_100.map((r) => r.id);
  const ids200 = RULES_LEVEL_200.map((r) => r.id);
  assert.deepEqual(ids100, ["L100.R1", "L100.R2", "L100.R3", "L100.R4", "L100.R5"]);
  assert.deepEqual(ids200.slice(0, 5), ids100, "L200 must start with all of L100");
  assert.deepEqual(ids200.slice(5), ["L200.R6", "L200.R7", "L200.R8", "L200.R9"]);
});

test("a clean item passes Lab 100; each rule fails for its own documented reason", () => {
  assert.equal(evaluateChecklist([item()], RULES_LEVEL_100).overall, "pass");

  const cases: Array<[string, any]> = [
    ["L100.R1", item({ riskTier: null })],
    ["L100.R2", item({ metadata: { modelVersion: "latest", ownerEmail: "o@e.org" } })],
    ["L100.R3", item({ controlRefs: [] })],
    ["L100.R4", item({ metadata: { modelVersion: "1.0" } })],
    ["L100.R5", item({ status: "approved", metadata: { modelVersion: "1.0", ownerEmail: "o@e.org", useCase: "prohibited" } })],
  ];
  for (const [ruleId, bad] of cases) {
    const res = evaluateChecklist([bad], RULES_LEVEL_100);
    assert.ok(res.rulesFailed.includes(ruleId), `${ruleId} should fail for its own case`);
    assert.equal(res.overall, "fail");
  }
});

test("evaluateChecklist returns RULE IDS and per-item findings, not counts", () => {
  const res = evaluateChecklist([item({ riskTier: null })], RULES_LEVEL_100);
  assert.ok(Array.isArray(res.rulesEvaluated) && typeof res.rulesEvaluated[0] === "string");
  assert.ok(res.findings.length > 0, "the UI must be able to say WHICH row failed WHICH rule");
  assert.equal(res.findings[0].ruleId, "L100.R1");
});

test("a rule whose predicate throws is treated as failed, not as a 500", () => {
  // /api/lab/policy-eval accepts CUSTOM rules from the request body, so a malformed one is user
  // input, not a server bug.
  const boom = { id: "X.1", description: "explodes", controlRef: "custom",
    evaluate: () => { throw new Error("boom"); } };
  const res = evaluateChecklist([item()], [boom as any]);
  assert.equal(res.overall, "fail");
  assert.deepEqual(res.rulesFailed, ["X.1"]);
});

/* ----------------------------------------------------------------- bundles */

test("a bundle verifies, and verifying it also verifies every receipt inside", () => {
  const r1 = buildAndSignReceipt(receiptInput());
  const r2 = buildAndSignReceipt(receiptInput({ eventType: "gate.evaluated" }));
  const b = buildBundle(TENANT, "sess-1", [r1.id, r2.id]);
  const res = verifyBundle(b.id);
  assert.equal(res.ok, true, res.reason);
  assert.equal((res.payload as any).receipts.length, 2);
});

test("a bundle whose receipt was tampered with FAILS, even though the bundle signature is intact", () => {
  // Checking only the bundle signature would be the hollow-green failure: a bundle can be
  // perfectly signed and still contain a receipt that does not verify.
  const r1 = buildAndSignReceipt(receiptInput());
  const b = buildBundle(TENANT, "sess-1", [r1.id]);

  const env = JSON.parse(r1.envelope);
  env.decision.result = "fail";
  _internal.sqlite.prepare("UPDATE receipts SET envelope = ? WHERE id = ?").run(JSON.stringify(env), r1.id);

  const res = verifyBundle(b.id);
  assert.equal(res.ok, false, "a bundle is only valid if every claim inside it is");
  assert.match(res.reason!, /do not verify/);
});

test("verifyBundle reports missing receipts rather than silently succeeding", () => {
  const r1 = buildAndSignReceipt(receiptInput());
  const b = buildBundle(TENANT, "sess-1", [r1.id]);
  _internal.sqlite.prepare("DELETE FROM receipts WHERE id = ?").run(r1.id);
  const res = verifyBundle(b.id);
  assert.equal(res.ok, false);
  assert.match(res.reason!, /missing receipts/);
});
