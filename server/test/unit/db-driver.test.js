// The SQLite driver adapter, and the parity that makes it safe.
//
// openDatabase() can sit on either driver: the built-in node:sqlite (Node
// 22.13+, nothing to compile) or the better-sqlite3 native addon (the only
// option on Node 20, and what the Node 20 CI lane and the Dockerfile's runtime
// stage use). Every service in src/services talks to whichever one is loaded,
// so "the two agree" has to be MEASURED, not assumed.
//
// These tests run the same assertions against each driver available on the
// running Node, exercising exactly the API surface src/services actually uses:
// pragma, exec, prepare, positional and bare-named parameters, .get/.all/.run,
// .changes, and a miss returning undefined. On CI's Node 20 that is
// better-sqlite3 alone; on Node 22 it is both, which is where a divergence
// would actually be caught.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, selectDriver } from "../../src/services/db.js";

function availableDrivers() {
  const found = [];
  for (const name of ["node", "better-sqlite3"]) {
    try {
      selectDriver(name);
      found.push(name);
    } catch {
      // Not available on this Node — the point of the adapter.
    }
  }
  return found;
}

function withDriver(name, fn) {
  const prev = process.env.BEACON_SQLITE_DRIVER;
  process.env.BEACON_SQLITE_DRIVER = name;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-db-"));
  let db;
  try {
    db = openDatabase({ dataDir });
    fn(db);
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (prev === undefined) delete process.env.BEACON_SQLITE_DRIVER;
    else process.env.BEACON_SQLITE_DRIVER = prev;
  }
}

test("at least one SQLite driver is available", () => {
  assert.ok(
    availableDrivers().length > 0,
    `no SQLite driver on Node ${process.versions.node}`
  );
});

test("an unknown driver name fails loudly rather than silently falling back", () => {
  // A typo in BEACON_SQLITE_DRIVER must not quietly land on the other driver.
  assert.throws(() => selectDriver("sqlite3"), /Unknown BEACON_SQLITE_DRIVER/);
});

for (const name of availableDrivers()) {
  test(`${name}: schema applies and the pragmas take`, () => {
    withDriver(name, (db) => {
      // openDatabase ran the schema; the tables it created must be there.
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);
      for (const t of [
        "anchors",
        "attestations",
        "gate_decisions",
        "inventory",
        "receipt_index",
      ]) {
        assert.ok(tables.includes(t), `missing table ${t}`);
      }

      // foreign_keys defaults OFF in better-sqlite3 and ON in node:sqlite, so
      // this asserts the explicit pragma landed rather than a driver default.
      assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
      assert.equal(
        db.prepare("PRAGMA journal_mode").get().journal_mode,
        "wal"
      );
    });
  });

  test(`${name}: bare named parameters, positional parameters, and .changes`, () => {
    withDriver(name, (db) => {
      const row = {
        id: "01ABC",
        vendor: "acme",
        model: "m",
        version: "1",
        environment: "prod",
        owner_email: null, // NULL binding — src/services/inventory.js does this
        trust_tier: "T0",
        first_seen_utc: "2026-01-01T00:00:00.000Z",
        last_seen_utc: "2026-01-01T00:00:00.000Z",
        discovery_src: "manual",
        notes: null,
      };
      // `@name` placeholders bound from bare object keys — the form every
      // statement in src/services uses.
      const inserted = db
        .prepare(
          `INSERT INTO inventory
             (id, vendor, model, version, environment, owner_email, trust_tier,
              first_seen_utc, last_seen_utc, discovery_src, notes)
           VALUES (@id, @vendor, @model, @version, @environment, @owner_email,
                   @trust_tier, @first_seen_utc, @last_seen_utc, @discovery_src,
                   @notes)`
        )
        .run(row);
      assert.equal(inserted.changes, 1);

      // Positional.
      const got = db
        .prepare("SELECT * FROM inventory WHERE id = ?")
        .get("01ABC");
      assert.equal(got.vendor, "acme");
      assert.equal(got.owner_email, null);

      // A miss is undefined, not null — services test it with `if (!row)`.
      assert.equal(
        db.prepare("SELECT * FROM inventory WHERE id = ?").get("nope"),
        undefined
      );

      // .changes drives inventory.setTier()'s boolean return.
      const updated = db
        .prepare("UPDATE inventory SET trust_tier = @tier WHERE id = @id")
        .run({ id: "01ABC", tier: "T2" });
      assert.equal(updated.changes, 1);
      const missed = db
        .prepare("UPDATE inventory SET trust_tier = @tier WHERE id = @id")
        .run({ id: "absent", tier: "T2" });
      assert.equal(missed.changes, 0);

      // Variadic spread of positional args — src/services/export.js builds an
      // `IN (?,?,?)` list this way.
      const all = db
        .prepare("SELECT * FROM inventory WHERE id IN (?,?)")
        .all("01ABC", "absent");
      assert.equal(all.length, 1);
    });
  });

  test(`${name}: rows are ordinary objects, so deepStrictEqual works`, () => {
    // node:sqlite hands back NULL-prototype rows; better-sqlite3 hands back
    // ordinary ones. deepStrictEqual compares prototypes, so without the
    // adapter's normalisation this assertion would pass on one driver and fail
    // on the other — the exact bug this file exists to prevent.
    withDriver(name, (db) => {
      db.prepare(
        `INSERT INTO receipt_index
           (receipt_id, ts_utc, event_type, ndjson_path, byte_offset)
         VALUES (@receipt_id, @ts_utc, @event_type, @ndjson_path, @byte_offset)`
      ).run({
        receipt_id: "r1",
        ts_utc: "2026-01-01T00:00:00.000Z",
        event_type: "invocation",
        ndjson_path: "/tmp/x.ndjson",
        byte_offset: 42,
      });

      const got = db
        .prepare(
          "SELECT receipt_id, event_type, byte_offset FROM receipt_index WHERE receipt_id = ?"
        )
        .get("r1");

      assert.deepStrictEqual(got, {
        receipt_id: "r1",
        event_type: "invocation",
        byte_offset: 42,
      });
      // INTEGER comes back as a JS number, not a BigInt or a string.
      assert.equal(typeof got.byte_offset, "number");
    });
  });

  test(`${name}: COUNT(*) aliases to a number`, () => {
    // src/services/policies.js does `.get(...)?.n ?? 0` on this shape.
    withDriver(name, (db) => {
      const n = db
        .prepare("SELECT COUNT(*) AS n FROM receipt_index WHERE event_type = ?")
        .get("invocation")?.n;
      assert.equal(n, 0);
      assert.equal(typeof n, "number");
    });
  });
}
