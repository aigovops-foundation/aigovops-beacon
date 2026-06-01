// Smoke test — the lowest rung of the pyramid for the Node server.
//
// Its job is narrow on purpose: prove the test runner discovers this
// directory and that a Beacon instance boots and answers a trivial
// request. This is the guard that keeps `npm test` from failing with
// "cannot find module .../server/test" the way it did before (issue #8).

import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { bootTestServer } from "./helpers/server.js";

test("server boots and answers GET /api/v1/health", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const res = await request(app).get("/api/v1/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test("root endpoint reports name and version", async (t) => {
  const { app, cleanup } = await bootTestServer();
  t.after(cleanup);

  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.equal(res.body.name, "AIGovOps Beacon");
  assert.match(res.body.version, /^\d+\.\d+\.\d+$/);
});
