// End-to-end tests for the Beacon HTTP API.
//
// Every route in src/routes/index.js is exercised here against a real
// Express app (via supertest), a real SQLite database, and a real signing
// key — only the data dir is a throwaway temp. Where a route writes a
// receipt, we assert the response carries a well-formed, verifiable
// receipt (see test/helpers/receipt.js).

import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { bootTestServer, AUTH_HEADERS } from "../helpers/server.js";
import {
  assertReceiptShape,
  assertSignatureVerifies,
} from "../helpers/receipt.js";

const API = "/api/v1";

// ─── Health & version ──────────────────────────────────────────────────

test("GET /health returns ok", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app).get(`${API}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test("GET /version exposes version, schema, key fingerprint", async (t) => {
  const { app, ctx, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app).get(`${API}/version`);
  assert.equal(res.status, 200);
  assert.equal(res.body.version, ctx.config.beaconVersion);
  assert.equal(res.body.schema_version, ctx.config.receipts.schemaVersion);
  assert.equal(res.body.key_fingerprint, ctx.activeKey.fingerprint);
});

// ─── Inventory ───────────────────────────────────────────────────────────

test("POST /inventory creates then idempotently upserts", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const body = {
    vendor: "anthropic",
    model: "claude-3-5-sonnet",
    version: "2024-10-22",
    environment: "cloud_saas",
  };
  const created = await request(app)
    .post(`${API}/inventory`)
    .set(AUTH_HEADERS)
    .send(body);
  assert.equal(created.status, 201);
  assert.equal(created.body.isNew, true);
  assert.equal(created.body.trust_tier, "T0");
  const id = created.body.id;

  // Same tuple again → 200, not new.
  const again = await request(app)
    .post(`${API}/inventory`)
    .set(AUTH_HEADERS)
    .send(body);
  assert.equal(again.status, 200);
  assert.equal(again.body.isNew, false);
  assert.equal(again.body.id, id);
});

test("POST /inventory rejects missing fields with 400", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app)
    .post(`${API}/inventory`)
    .set(AUTH_HEADERS)
    .send({ vendor: "openai" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "missing_fields");
});

test("GET /inventory and /inventory/:id round-trip", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const created = await request(app)
    .post(`${API}/inventory`)
    .set(AUTH_HEADERS)
    .send({
      vendor: "openai",
      model: "gpt-4o",
      version: "2024-08-06",
      environment: "private_cloud",
    });
  const id = created.body.id;

  const list = await request(app).get(`${API}/inventory`);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some((r) => r.id === id));

  const one = await request(app).get(`${API}/inventory/${id}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.id, id);

  const missing = await request(app).get(`${API}/inventory/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "not_found");
});

test("POST /inventory/:id/trust writes a verifiable receipt", async (t) => {
  const { app, ctx, cleanup } = await bootTestServer();
  t.after(cleanup);

  const created = await request(app)
    .post(`${API}/inventory`)
    .set(AUTH_HEADERS)
    .send({
      vendor: "meta",
      model: "llama-3.1-70b",
      version: "2024-07-23",
      environment: "on_prem",
    });
  const id = created.body.id;

  const ok = await request(app)
    .post(`${API}/inventory/${id}/trust`)
    .set(AUTH_HEADERS)
    .send({ tier: "T2" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: true });

  // The tier change is reflected and a receipt exists for it.
  const after = await request(app).get(`${API}/inventory/${id}`);
  assert.equal(after.body.trust_tier, "T2");

  const receipts = await request(app)
    .get(`${API}/receipts`)
    .query({ event_type: "trust_tier_change" });
  assert.ok(receipts.body.length >= 1);

  // Invalid tier surfaces the structured error from the error middleware.
  const bad = await request(app)
    .post(`${API}/inventory/${id}/trust`)
    .set(AUTH_HEADERS)
    .send({ tier: "T9" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, "invalid_tier");
});

// ─── Receipts ──────────────────────────────────────────────────────────

test("POST /receipts creates a signed, verifiable receipt", async (t) => {
  const { app, ctx, cleanup } = await bootTestServer();
  t.after(cleanup);

  const res = await request(app)
    .post(`${API}/receipts`)
    .set(AUTH_HEADERS)
    .send({
      vendor: "anthropic",
      model: "claude-3-5-sonnet",
      version: "2024-10-22",
      event_type: "invocation",
      environment: "cloud_saas",
      prompt: "summarize the contract",
      result: "ok",
      latency_ms: 412,
    });
  assert.equal(res.status, 201);
  assertReceiptShape(res.body);
  assertSignatureVerifies(res.body, ctx.activeKey);
  // Redacted capture mode (the default) stores hashes, never raw text.
  assert.equal(res.body.prompt, undefined);
  assert.equal(res.body.result, undefined);
  assert.match(res.body.prompt_hash, /^[a-f0-9]{64}$/);
});

test("POST /receipts rejects missing required fields", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app)
    .post(`${API}/receipts`)
    .set(AUTH_HEADERS)
    .send({ vendor: "openai", model: "gpt-4o" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "missing_fields");
});

test("GET /receipts, /receipts/:id, /receipts/:id/verify", async (t) => {
  const { app, ctx, cleanup } = await bootTestServer();
  t.after(cleanup);

  const created = await request(app)
    .post(`${API}/receipts`)
    .set(AUTH_HEADERS)
    .send({
      vendor: "google",
      model: "gemini-1.5-pro",
      version: "2024-09-24",
      event_type: "invocation",
      environment: "cloud_saas",
    });
  const id = created.body.id;

  const list = await request(app).get(`${API}/receipts`).query({ limit: 10 });
  assert.equal(list.status, 200);
  assert.ok(list.body.some((r) => r.receipt_id === id));

  const one = await request(app).get(`${API}/receipts/${id}`);
  assert.equal(one.status, 200);
  assertReceiptShape(one.body);
  assertSignatureVerifies(one.body, ctx.activeKey);

  const verify = await request(app).get(`${API}/receipts/${id}/verify`);
  assert.equal(verify.status, 200);
  assert.equal(verify.body.found, true);
  assert.equal(verify.body.signature_verifies, true);

  const missing = await request(app).get(`${API}/receipts/NOPE/verify`);
  assert.equal(missing.status, 404);
});

// ─── Checklists ──────────────────────────────────────────────────────────

test("GET /checklists lists packs and GET /checklists/:id returns one", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const list = await request(app).get(`${API}/checklists`);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));
  const nist = list.body.find((p) => p.id === "nist-ai-rmf");
  assert.ok(nist, "nist-ai-rmf pack is loaded");
  assert.ok(nist.item_count > 0);

  const one = await request(app).get(`${API}/checklists/nist-ai-rmf`);
  assert.equal(one.status, 200);
  assert.equal(one.body.id, "nist-ai-rmf");

  const missing = await request(app).get(`${API}/checklists/no-such-pack`);
  assert.equal(missing.status, 404);
});

test("POST /checklists/attest records an attestation and scores it", async (t) => {
  const { app, ctx, cleanup } = await bootTestServer();
  t.after(cleanup);

  const inv = await request(app)
    .post(`${API}/inventory`)
    .set(AUTH_HEADERS)
    .send({
      vendor: "openai",
      model: "gpt-4o",
      version: "2024-08-06",
      environment: "cloud_saas",
    });
  const inventoryId = inv.body.id;

  // Find a real item id from the pack so the attest is realistic.
  const pack = (await request(app).get(`${API}/checklists/nist-ai-rmf`)).body;
  const firstFn = (pack.functions || pack.lenses || [])[0];
  const itemId = firstFn.items[0].id;

  const attest = await request(app)
    .post(`${API}/checklists/attest`)
    .set(AUTH_HEADERS)
    .send({
      inventory_id: inventoryId,
      pack_id: "nist-ai-rmf",
      item_id: itemId,
      answer: "yes",
      evidence_uri: "https://evidence.example.org/policy.pdf",
    });
  assert.equal(attest.status, 201);
  assert.equal(attest.body.pack_id, "nist-ai-rmf");
  assert.equal(attest.body.item_id, itemId);

  const score = await request(app).get(
    `${API}/checklists/nist-ai-rmf/score/${inventoryId}`
  );
  assert.equal(score.status, 200);
  assert.equal(score.body.pack_id, "nist-ai-rmf");
  assert.ok(score.body.items_attested >= 1);
});

// ─── Discovery ─────────────────────────────────────────────────────────

test("POST /discover with manual_csv upserts inventory", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const csv =
    "vendor,model,version,environment\n" +
    "OpenAI,gpt-4o,2024-08-06,cloud_saas\n" +
    "Anthropic,claude-3-5-sonnet,2024-10-22,cloud_saas\n";

  const res = await request(app)
    .post(`${API}/discover`)
    .set(AUTH_HEADERS)
    .send({ source: "manual_csv", payload: { content: csv } });
  assert.equal(res.status, 200);
  assert.equal(res.body.scanned, 2);
  assert.equal(res.body.new_inventory_rows, 2);
  assert.equal(res.body.results.length, 2);
});

test("POST /discover rejects a missing source", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app)
    .post(`${API}/discover`)
    .set(AUTH_HEADERS)
    .send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "missing_source");
});

test("POST /discover rejects an unknown source with structured error", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app)
    .post(`${API}/discover`)
    .set(AUTH_HEADERS)
    .send({ source: "telepathy", payload: {} });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "unknown_source");
});

// ─── Gate ─────────────────────────────────────────────────────────────

test("POST /gate/production-readiness evaluates and records a decision", async (t) => {
  const { app, ctx, cleanup } = await bootTestServer();
  t.after(cleanup);

  const inv = await request(app)
    .post(`${API}/inventory`)
    .set(AUTH_HEADERS)
    .send({
      vendor: "in-house",
      model: "risk-scorer",
      version: "1.4.0",
      environment: "on_prem",
    });
  const inventoryId = inv.body.id;

  const res = await request(app)
    .post(`${API}/gate/production-readiness`)
    .set(AUTH_HEADERS)
    .send({ inventory_id: inventoryId, tier_target: "T1" });
  assert.equal(res.status, 200);
  assert.ok(["PASS", "FAIL"].includes(res.body.result));
  assert.ok(Array.isArray(res.body.reasons));
  assert.match(res.body.receipt_id, /^[0-9A-HJKMNP-TV-Z]{26}$/);

  // The decision produced a verifiable gate_decision receipt.
  const verify = await request(app).get(
    `${API}/receipts/${res.body.receipt_id}/verify`
  );
  assert.equal(verify.body.signature_verifies, true);
});

test("POST /gate/production-readiness 400 without inventory_id", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app)
    .post(`${API}/gate/production-readiness`)
    .set(AUTH_HEADERS)
    .send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "missing_fields");
});

test("POST /gate/production-readiness 404 for unknown inventory", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);
  const res = await request(app)
    .post(`${API}/gate/production-readiness`)
    .set(AUTH_HEADERS)
    .send({ inventory_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "unknown_inventory");
});

// ─── Export ───────────────────────────────────────────────────────────

test("POST /export builds a self-verifying bundle", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  // Seed one receipt so the bundle is non-empty.
  await request(app)
    .post(`${API}/receipts`)
    .set(AUTH_HEADERS)
    .send({
      vendor: "anthropic",
      model: "claude-3-5-sonnet",
      version: "2024-10-22",
      event_type: "invocation",
      environment: "cloud_saas",
    });

  const res = await request(app)
    .post(`${API}/export`)
    .set(AUTH_HEADERS)
    .send({});
  assert.equal(res.status, 201);
  assert.match(res.body.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(res.body.verification.receipts_failed, 0);
  assert.ok(res.body.verification.receipts_verified >= 1);
});
