// Test helper: boot a fully isolated Beacon instance for a single test run.
//
// Each call uses a fresh temp BEACON_DATA_DIR so SQLite, keys, and receipt
// NDJSON never leak between tests. The HTTP listener binds an ephemeral
// port (BEACON_PORT=0) so parallel jobs never collide. We hand the Express
// `app` to supertest, which opens its own short-lived connections.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Boot the server with an isolated data dir. Returns { app, ctx, dataDir,
// cleanup }. `cleanup()` closes the DB and removes the temp dir.
export async function bootTestServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-test-"));
  const prev = {
    BEACON_DATA_DIR: process.env.BEACON_DATA_DIR,
    BEACON_PORT: process.env.BEACON_PORT,
    BEACON_HOST: process.env.BEACON_HOST,
    BEACON_NO_LISTEN: process.env.BEACON_NO_LISTEN,
  };
  process.env.BEACON_DATA_DIR = dataDir;
  process.env.BEACON_PORT = "0"; // ephemeral, if ever used
  process.env.BEACON_HOST = "127.0.0.1";
  process.env.BEACON_NO_LISTEN = "1"; // supertest drives the app directly

  // Import fresh each boot. The module caches config at call time, not at
  // import time, so a plain dynamic import is enough here.
  const { bootstrap } = await import("../../src/index.js");
  const { app, ctx } = await bootstrap();

  return {
    app,
    ctx,
    dataDir,
    cleanup() {
      try {
        ctx.db.close();
      } catch {
        /* already closed */
      }
      // Close the listener if bootstrap opened one.
      try {
        ctx.server?.close?.();
      } catch {
        /* ignore */
      }
      restoreEnv(prev);
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

function restoreEnv(prev) {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// Standard identity headers an upstream OIDC proxy would inject.
export const AUTH_HEADERS = {
  "X-Beacon-User-Sub": "test-sub-001",
  "X-Beacon-User-Email": "auditor@example.org",
  "X-Beacon-OIDC-Issuer": "https://issuer.example.org",
};
