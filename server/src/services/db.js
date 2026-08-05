// SQLite schema for inventory, attestations, gate decisions, and the
// hourly Merkle-anchor pointer table. Receipts themselves do not live
// here — they live in append-only NDJSON. SQLite is the index.

import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS inventory (
  id              TEXT PRIMARY KEY,
  vendor          TEXT NOT NULL,
  model           TEXT NOT NULL,
  version         TEXT NOT NULL,
  environment     TEXT NOT NULL,
  owner_email     TEXT,
  trust_tier      TEXT NOT NULL DEFAULT 'T0',
  first_seen_utc  TEXT NOT NULL,
  last_seen_utc   TEXT NOT NULL,
  discovery_src   TEXT,
  notes           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_uq
  ON inventory(vendor, model, version, environment);

CREATE TABLE IF NOT EXISTS attestations (
  id              TEXT PRIMARY KEY,
  inventory_id    TEXT NOT NULL,
  pack_id         TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  answer          TEXT NOT NULL,    -- 'yes' | 'no' | 'na'
  evidence_uri    TEXT,
  attested_by     TEXT NOT NULL,
  attested_at_utc TEXT NOT NULL,
  receipt_id      TEXT NOT NULL,
  FOREIGN KEY(inventory_id) REFERENCES inventory(id)
);

CREATE INDEX IF NOT EXISTS attestations_inv
  ON attestations(inventory_id, pack_id);

CREATE TABLE IF NOT EXISTS gate_decisions (
  id              TEXT PRIMARY KEY,
  inventory_id    TEXT NOT NULL,
  gate_id         TEXT NOT NULL,
  tier_target     TEXT NOT NULL,
  result          TEXT NOT NULL,    -- 'PASS' | 'FAIL'
  reasons_json    TEXT NOT NULL,
  decided_at_utc  TEXT NOT NULL,
  receipt_id      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS gate_decisions_inv
  ON gate_decisions(inventory_id, gate_id, decided_at_utc);

CREATE TABLE IF NOT EXISTS receipt_index (
  receipt_id      TEXT PRIMARY KEY,
  ts_utc          TEXT NOT NULL,
  user_sub        TEXT,
  vendor          TEXT,
  model           TEXT,
  version         TEXT,
  event_type      TEXT NOT NULL,
  environment     TEXT,
  inventory_id    TEXT,
  ndjson_path     TEXT NOT NULL,
  byte_offset     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS receipt_idx_user
  ON receipt_index(user_sub, ts_utc);
CREATE INDEX IF NOT EXISTS receipt_idx_inv
  ON receipt_index(inventory_id, ts_utc);

CREATE TABLE IF NOT EXISTS anchors (
  id              TEXT PRIMARY KEY,
  window_start    TEXT NOT NULL,
  window_end      TEXT NOT NULL,
  merkle_root     TEXT NOT NULL,
  receipt_count   INTEGER NOT NULL,
  signed_root     TEXT NOT NULL,    -- base64 Ed25519 sig over merkle_root
  key_fpr         TEXT NOT NULL
);
`;

// ---------------------------------------------------------------------------
// Driver selection
//
// Two drivers can back this file, and both are real:
//
//   node:sqlite      built in since Node 22.13 (no flag) — nothing to compile.
//   better-sqlite3   a native addon — the only option on Node 20.
//
// Preferring the built-in is what makes the documented quickstart work. On any
// modern Node (24, 26) `npm install` used to die compiling better-sqlite3
// against a V8 it predates — six compile errors, no prebuilt binary for that
// ABI — so `cd server && npm install`, the first command in README.md, failed
// outright while CI (pinned to Node 20/22) stayed green.
//
// better-sqlite3 is kept as an OPTIONAL dependency, not deleted: Node 20 has no
// node:sqlite, and both the Node 20 CI lane and the runtime stage of
// deploy/Dockerfile still run on it. Optional means a failed native build is a
// warning instead of a fatal install error, so the quickstart survives on new
// Node and keeps working on old Node.
//
// Set BEACON_SQLITE_DRIVER=node|better-sqlite3 to pin one explicitly. The test
// suite uses it to run the same assertions against both, which is the only way
// "the drivers agree" stays true rather than aspirational.
// ---------------------------------------------------------------------------

function loadNodeSqlite() {
  try {
    // require, not `import`: a static import of node:sqlite is a hard failure on
    // Node 20 (ERR_UNKNOWN_BUILTIN_MODULE) that no try/catch here could reach.
    return require("node:sqlite").DatabaseSync;
  } catch {
    return null;
  }
}

function loadBetterSqlite3() {
  try {
    return require("better-sqlite3");
  } catch {
    // Absent, or present but with an unbuilt/incompatible native binding.
    return null;
  }
}

// node:sqlite returns rows with a NULL prototype; better-sqlite3 returns
// ordinary objects. Everything the services do (spread, JSON.stringify,
// optional chaining) works either way, but `assert.deepStrictEqual` compares
// prototypes — so an un-normalised row would make tests pass under one driver
// and fail under the other. Copying to a plain object keeps them substitutable.
function plainRow(row) {
  return row == null ? row : { ...row };
}

function wrapStatement(stmt) {
  // Bare named parameters (`{ id }` binding to `@id`) are the default, but pin
  // it — every call site in src/services depends on it.
  stmt.setAllowBareNamedParameters?.(true);
  return {
    get: (...args) => plainRow(stmt.get(...args)),
    all: (...args) => stmt.all(...args).map(plainRow),
    run: (...args) => {
      const r = stmt.run(...args);
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
    },
  };
}

function openNodeSqlite(DatabaseSync, dbPath) {
  const db = new DatabaseSync(dbPath);
  return {
    driver: "node:sqlite",
    // better-sqlite3's db.pragma() can also READ; this shim only sets, because
    // that is all this codebase does with it. Add a read path deliberately if a
    // caller ever needs one — don't assume it is already there.
    pragma: (statement) => db.exec(`PRAGMA ${statement};`),
    exec: (sql) => db.exec(sql),
    prepare: (sql) => wrapStatement(db.prepare(sql)),
    close: () => db.close(),
  };
}

export function selectDriver(preference = process.env.BEACON_SQLITE_DRIVER) {
  if (preference === "node") {
    const DatabaseSync = loadNodeSqlite();
    if (!DatabaseSync) {
      throw new Error(
        "BEACON_SQLITE_DRIVER=node, but node:sqlite is unavailable " +
          `(Node ${process.versions.node}; it is built in from 22.13).`
      );
    }
    return { kind: "node:sqlite", DatabaseSync };
  }
  if (preference === "better-sqlite3") {
    const Database = loadBetterSqlite3();
    if (!Database) {
      throw new Error(
        "BEACON_SQLITE_DRIVER=better-sqlite3, but it is not installed or its " +
          "native binding failed to build."
      );
    }
    return { kind: "better-sqlite3", Database };
  }

  if (preference) {
    // A typo must not quietly auto-detect and look like it worked.
    throw new Error(
      `Unknown BEACON_SQLITE_DRIVER=${preference}; expected "node" or ` +
        '"better-sqlite3".'
    );
  }

  const DatabaseSync = loadNodeSqlite();
  if (DatabaseSync) return { kind: "node:sqlite", DatabaseSync };
  const Database = loadBetterSqlite3();
  if (Database) return { kind: "better-sqlite3", Database };

  throw new Error(
    `No SQLite driver available on Node ${process.versions.node}. Upgrade to ` +
      "Node 22.13+ for the built-in node:sqlite, or install better-sqlite3 " +
      "(`npm install better-sqlite3`) on Node 20."
  );
}

export function openDatabase(config) {
  const dbPath = path.join(config.dataDir, "beacon.sqlite");
  const driver = selectDriver();
  const db =
    driver.kind === "node:sqlite"
      ? openNodeSqlite(driver.DatabaseSync, dbPath)
      : Object.assign(new driver.Database(dbPath), { driver: "better-sqlite3" });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
