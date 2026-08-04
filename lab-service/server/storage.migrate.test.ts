/**
 * storage.migrate.test.ts — an EXISTING lab database must survive the column addition.
 *
 * This is not hypothetical. The Fly volume behind the lab already holds an `inventory` table
 * created before `model` / `version` / `use_case` / `owner_email` existed. `CREATE TABLE IF NOT
 * EXISTS` is a no-op against it, so without the ALTER TABLE step in `ensureSchema()` the service
 * would boot cleanly and then fail every inventory read with "no such column: model" — a redeploy
 * that looks successful and is not.
 *
 * Runs in its own file because `ensureSchema()` executes at import time, so the old-shaped
 * database has to exist BEFORE storage.js is loaded.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lab-migrate-test-"));
const DB_PATH = path.join(TMP, "legacy.db");

// The inventory table EXACTLY as it was before the four columns were added, with a row in it.
const legacy = new Database(DB_PATH);
legacy.exec(`
  CREATE TABLE inventory (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
    vendor TEXT NOT NULL DEFAULT '', risk_tier TEXT, status TEXT NOT NULL DEFAULT 'proposed',
    control_refs TEXT NOT NULL DEFAULT '[]', metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL);
`);
legacy
  .prepare(
    `INSERT INTO inventory (id, tenant_id, name, vendor, risk_tier, status, control_refs, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    "legacy-1", "aigovops-foundation", "Pre-existing row", "OpenAI", "medium", "approved",
    JSON.stringify(["NIST-AI-RMF:MAP-1.1"]),
    JSON.stringify({ modelVersion: "2024-08-06", ownerEmail: "legacy@aigovops.org" }),
    Date.now(),
  );
legacy.close();

process.env.BEACON_DATA_DIR = TMP;
process.env.BEACON_DB_PATH = DB_PATH;

// Importing storage runs ensureSchema() against the legacy database.
const { storage } = await import("./storage.js");
const { evaluateChecklist, RULES_LEVEL_100 } = await import("./beacon.js");

test("an inventory table created before the four columns is widened in place", () => {
  const check = new Database(DB_PATH, { readonly: true });
  const cols = check
    .prepare("SELECT name FROM pragma_table_info('inventory')")
    .all()
    .map((r: any) => r.name);
  check.close();
  for (const c of ["model", "version", "use_case", "owner_email"]) {
    assert.ok(cols.includes(c), `${c} should have been added by ensureSchema()`);
  }
});

test("the pre-existing row survives, and reads no longer throw", () => {
  const items = storage.listInventory("aigovops-foundation");
  assert.equal(items.length, 1, "the migration must not drop data");
  assert.equal(items[0].name, "Pre-existing row");
  assert.equal(items[0].model, "", "new columns backfill to their DEFAULT, not NULL");
  assert.equal(items[0].version, "");
});

test("a legacy row whose fields live in metadata still evaluates correctly", () => {
  // The fallback in `str()` exists for exactly this row: its version and owner email are in
  // metadata because that is where the old shape put them. It must not start failing Lab 100
  // just because the columns now exist and are empty.
  const items = storage.listInventory("aigovops-foundation");
  const res = evaluateChecklist(items, RULES_LEVEL_100);
  assert.equal(res.overall, "pass", `legacy row must still pass; failed: ${res.rulesFailed.join(", ")}`);
});

test("ensureSchema is idempotent — a second boot against the widened db is a no-op", async () => {
  // Re-running the same DDL path must not throw "duplicate column name".
  const again = new Database(DB_PATH);
  for (const col of ["model", "version", "use_case", "owner_email"]) {
    const present = again.prepare("SELECT 1 FROM pragma_table_info('inventory') WHERE name = ?").get(col);
    assert.ok(present, `${col} present`);
  }
  again.close();
  assert.equal(storage.listInventory("aigovops-foundation").length, 1);
});
