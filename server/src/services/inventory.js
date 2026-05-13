// Inventory upserts and reads. Inventory is the spine — every receipt,
// attestation, and gate decision hangs off an inventory row.

import { ulid } from "ulid";

export function createInventoryService(ctx) {
  const { db } = ctx;

  const findStmt = db.prepare(`
    SELECT * FROM inventory
    WHERE vendor = @vendor AND model = @model
      AND version = @version AND environment = @environment
  `);

  const insertStmt = db.prepare(`
    INSERT INTO inventory
      (id, vendor, model, version, environment, owner_email,
       trust_tier, first_seen_utc, last_seen_utc, discovery_src, notes)
    VALUES (@id, @vendor, @model, @version, @environment, @owner_email,
            @trust_tier, @first_seen_utc, @last_seen_utc, @discovery_src, @notes)
  `);

  const touchStmt = db.prepare(`
    UPDATE inventory SET last_seen_utc = @ts WHERE id = @id
  `);

  const setTierStmt = db.prepare(`
    UPDATE inventory SET trust_tier = @tier WHERE id = @id
  `);

  return {
    upsert({ vendor, model, version, environment, discoverySrc }) {
      const ts = new Date().toISOString();
      const existing = findStmt.get({ vendor, model, version, environment });
      if (existing) {
        touchStmt.run({ id: existing.id, ts });
        return { ...existing, last_seen_utc: ts, isNew: false };
      }
      const row = {
        id: ulid(),
        vendor,
        model,
        version,
        environment,
        owner_email: null,
        trust_tier: "T0",
        first_seen_utc: ts,
        last_seen_utc: ts,
        discovery_src: discoverySrc || "manual",
        notes: null,
      };
      insertStmt.run(row);
      return { ...row, isNew: true };
    },

    list() {
      return db
        .prepare("SELECT * FROM inventory ORDER BY last_seen_utc DESC")
        .all();
    },

    getById(id) {
      return db.prepare("SELECT * FROM inventory WHERE id = ?").get(id);
    },

    setTier(id, tier) {
      if (!["T0", "T1", "T2", "T3"].includes(tier)) {
        throw Object.assign(new Error(`invalid tier: ${tier}`), {
          statusCode: 400,
          code: "invalid_tier",
        });
      }
      const r = setTierStmt.run({ id, tier });
      return r.changes === 1;
    },
  };
}
