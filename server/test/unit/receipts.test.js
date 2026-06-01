// Unit tests for the receipt builder's capture-mode and hashing rules.
//
// These run the real createReceiptService against an isolated instance so
// we can assert the exact on-the-wire shape of a receipt without going
// through HTTP. The pyramid's "unit" layer for the most security-relevant
// code path: what gets stored, what gets hashed, what gets signed.

import test from "node:test";
import assert from "node:assert/strict";
import { bootTestServer } from "../helpers/server.js";
import {
  assertReceiptShape,
  assertSignatureVerifies,
} from "../helpers/receipt.js";

const SAMPLE = {
  vendor: "anthropic",
  model: "claude-3-5-sonnet",
  version: "2024-10-22",
  event_type: "invocation",
  environment: "cloud_saas",
};

test("redacted (default) capture stores hashes, never raw text", async (t) => {
  const { ctx, cleanup } = await bootTestServer();
  t.after(cleanup);
  const svc = (await import("../../src/services/receipts.js")).createReceiptService(
    ctx
  );

  const r = svc.write({
    ...SAMPLE,
    prompt: "sensitive prompt",
    result: "sensitive result",
  });
  assertReceiptShape(r);
  assertSignatureVerifies(r, ctx.activeKey);
  assert.equal(r.prompt, undefined); // not captured in redacted mode
  assert.equal(r.result, undefined);
  assert.match(r.prompt_hash, /^[a-f0-9]{64}$/);
  assert.match(r.result_hash, /^[a-f0-9]{64}$/);
});

test("full capture mode stores raw prompt and result", async (t) => {
  const prev = process.env.BEACON_CAPTURE_MODE;
  process.env.BEACON_CAPTURE_MODE = "full";
  t.after(() => {
    if (prev === undefined) delete process.env.BEACON_CAPTURE_MODE;
    else process.env.BEACON_CAPTURE_MODE = prev;
  });

  const { ctx, cleanup } = await bootTestServer();
  t.after(cleanup);
  const svc = (await import("../../src/services/receipts.js")).createReceiptService(
    ctx
  );

  const r = svc.write({ ...SAMPLE, prompt: "keep me", result: "and me" });
  assert.equal(r.prompt, "keep me");
  assert.equal(r.result, "and me");
  assertSignatureVerifies(r, ctx.activeKey);
});

test("identical content hashes identically; different content differs", async (t) => {
  const { ctx, cleanup } = await bootTestServer();
  t.after(cleanup);
  const svc = (await import("../../src/services/receipts.js")).createReceiptService(
    ctx
  );

  const a = svc.write({ ...SAMPLE, prompt: "same" });
  const b = svc.write({ ...SAMPLE, prompt: "same" });
  const c = svc.write({ ...SAMPLE, prompt: "different" });
  assert.equal(a.prompt_hash, b.prompt_hash);
  assert.notEqual(a.prompt_hash, c.prompt_hash);
});

test("each receipt gets a unique, sortable ULID id", async (t) => {
  const { ctx, cleanup } = await bootTestServer();
  t.after(cleanup);
  const svc = (await import("../../src/services/receipts.js")).createReceiptService(
    ctx
  );

  const ids = Array.from({ length: 5 }, () => svc.write(SAMPLE).id);
  assert.equal(new Set(ids).size, 5);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted, "ULIDs are monotonically sortable");
});
