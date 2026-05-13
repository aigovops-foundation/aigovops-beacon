// SQLite schema for inventory, attestations, gate decisions, and the
// hourly Merkle-anchor pointer table. Receipts themselves do not live
// here — they live in append-only NDJSON. SQLite is the index.

import path from "node:path";
import Database from "better-sqlite3";

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

export function openDatabase(config) {
  const dbPath = path.join(config.dataDir, "beacon.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
