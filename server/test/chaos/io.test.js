// Chaos — filesystem failure injection.
//
// Receipts are written to disk before they are indexed. We inject the
// failures a real disk throws — EACCES (permission), ENOSPC (full disk),
// and a partial/short read — and assert Beacon degrades gracefully: it
// returns a structured error through the middleware and the process keeps
// serving subsequent requests. It must never leak an HTML stack trace or
// take the server down.
//
// We use node:test's built-in mock to patch fs methods, then restore.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import request from "supertest";
import { bootTestServer, AUTH_HEADERS } from "../helpers/server.js";

const VALID = {
  vendor: "anthropic",
  model: "claude-3-5-sonnet",
  version: "2024-10-22",
  event_type: "invocation",
  environment: "cloud_saas",
};

function efail(code, msg) {
  return () => {
    const e = new Error(msg);
    e.code = code;
    throw e;
  };
}

test("EACCES on receipt append → structured 5xx, server survives", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const mock = t.mock.method(fs, "appendFileSync", efail("EACCES", "permission denied"));

  const res = await request(app)
    .post("/api/v1/receipts")
    .set(AUTH_HEADERS)
    .send(VALID);
  assert.equal(res.status, 500);
  assert.equal(typeof res.body, "object");
  assert.ok("error" in res.body, "structured error envelope");
  assert.ok(!/<html/i.test(JSON.stringify(res.body)), "no HTML stack");

  // Restore and prove the server still works afterward.
  mock.mock.restore();
  const ok = await request(app).get("/api/v1/health");
  assert.deepEqual(ok.body, { ok: true });
});

test("ENOSPC on receipt append → structured 5xx, server survives", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const mock = t.mock.method(fs, "appendFileSync", efail("ENOSPC", "no space left on device"));

  const res = await request(app)
    .post("/api/v1/receipts")
    .set(AUTH_HEADERS)
    .send(VALID);
  assert.equal(res.status, 500);
  assert.ok("error" in res.body);

  mock.mock.restore();
  const ok = await request(app).get("/api/v1/version");
  assert.equal(ok.status, 200);
});

test("read failure on receipt fetch → 5xx, not a hang or crash", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  // Write a receipt cleanly first.
  const created = await request(app)
    .post("/api/v1/receipts")
    .set(AUTH_HEADERS)
    .send(VALID);
  assert.equal(created.status, 201);
  const id = created.body.id;

  // Now make the durable read explode with a short/failed read.
  const mock = t.mock.method(fs, "readSync", efail("EIO", "input/output error"));

  const res = await request(app).get(`/api/v1/receipts/${id}`);
  assert.ok(res.status >= 500, `expected 5xx on read failure, got ${res.status}`);

  mock.mock.restore();
  // After restore, the same receipt reads back fine.
  const after = await request(app).get(`/api/v1/receipts/${id}`);
  assert.equal(after.status, 200);
  assert.equal(after.body.id, id);
});

test("export with an unwritable bundle dir degrades cleanly", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const mock = t.mock.method(fs, "mkdirSync", efail("EACCES", "permission denied"));

  const res = await request(app).post("/api/v1/export").set(AUTH_HEADERS).send({});
  assert.ok(res.status >= 500, `expected 5xx, got ${res.status}`);
  assert.ok("error" in res.body);

  mock.mock.restore();
  const ok = await request(app).get("/api/v1/health");
  assert.deepEqual(ok.body, { ok: true });
});
