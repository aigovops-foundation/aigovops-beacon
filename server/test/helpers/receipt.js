// Shared assertions about the shape of a runtime receipt.
//
// The published OVERT envelope lives at
// docs/blueprint/artifacts/receipt.schema.json. The running server emits
// the `aigovops-beacon.v1` runtime *profile* of that envelope, which keeps
// the same signed-evidence guarantees but uses the server's internal
// event-type vocabulary (invocation / attestation / gate_decision /
// discovery / trust_tier_change) and a hex key fingerprint rather than the
// SSH-style "SHA256:" form. These helpers assert the invariants the
// runtime actually guarantees, and confirm the signature verifies against
// the active key — which is the property that matters for an auditor.

import assert from "node:assert/strict";
import { canonicalize } from "../../src/lib/canonical.js";
import { verify } from "../../src/services/keys.js";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Assert the structural invariants every runtime receipt must hold.
export function assertReceiptShape(r) {
  assert.ok(r && typeof r === "object", "receipt is an object");
  assert.match(r.id, ULID_RE, "id is a ULID");
  assert.match(r.ts_utc, ISO_RE, "ts_utc is ISO-8601 UTC");
  assert.equal(typeof r.schema_version, "string");
  assert.equal(typeof r.event_type, "string");
  assert.ok("vendor" in r && "model" in r && "version" in r);

  const sig = r.signature;
  assert.ok(sig && typeof sig === "object", "signature block present");
  assert.equal(sig.alg, "Ed25519");
  assert.equal(typeof sig.key_fpr, "string");
  assert.equal(typeof sig.sig_b64, "string");
  assert.equal(typeof sig.canonical_form, "string");
}

// Assert the embedded signature actually verifies against the active key.
export function assertSignatureVerifies(r, activeKey) {
  const { signature, ...rest } = r;
  const bytes = Buffer.from(canonicalize(rest), "utf8");
  const ok = verify(activeKey.publicKey, bytes, signature.sig_b64);
  assert.equal(ok, true, "embedded signature verifies against active key");
}
