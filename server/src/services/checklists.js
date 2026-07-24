// Loads checklist packs from /checklists/*.yaml and scores them.

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ulid } from "ulid";

const SEVERITY_WEIGHTS = {
  critical: 4,
  high: 2,
  medium: 1,
  low: 0.5,
};

export function loadChecklistPacks(config) {
  const dir = path.join(config.repoRoot, "checklists");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => YAML.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

export function createChecklistService(ctx) {
  const { db, checklists, receiptService } = ctx;

  const insertAttest = db.prepare(`
    INSERT INTO attestations
      (id, inventory_id, pack_id, item_id, answer, evidence_uri,
       attested_by, attested_at_utc, receipt_id)
    VALUES (@id, @inventory_id, @pack_id, @item_id, @answer, @evidence_uri,
            @attested_by, @attested_at_utc, @receipt_id)
  `);

  return {
    list() {
      return checklists.map((pack) => ({
        id: pack.id,
        version: pack.version,
        title: pack.title,
        short_title: pack.short_title,
        authority: pack.authority,
        url: pack.url,
        item_count: countItems(pack),
      }));
    },

    get(packId) {
      return checklists.find((p) => p.id === packId) || null;
    },

    attest({ inventoryId, packId, itemId, answer, evidenceUri, user }) {
      const pack = this.get(packId);
      if (!pack) {
        throw Object.assign(new Error(`unknown pack: ${packId}`), {
          statusCode: 404,
          code: "unknown_pack",
        });
      }
      const item = findItem(pack, itemId);
      if (!item) {
        throw Object.assign(new Error(`unknown item: ${itemId}`), {
          statusCode: 404,
          code: "unknown_item",
        });
      }
      if (!["yes", "no", "na"].includes(answer)) {
        throw Object.assign(new Error(`invalid answer: ${answer}`), {
          statusCode: 400,
          code: "invalid_answer",
        });
      }

      const ts = new Date().toISOString();
      const receipt = receiptService.write({
        user,
        vendor: "n/a",
        model: "n/a",
        version: "n/a",
        environment: "audit",
        event_type: "attestation",
        inventory_id: inventoryId,
        attributes: { pack_id: packId, item_id: itemId, answer, evidenceUri },
      });

      const rec = {
        id: ulid(),
        inventory_id: inventoryId,
        pack_id: packId,
        item_id: itemId,
        answer,
        evidence_uri: evidenceUri || null,
        attested_by: user?.email || user?.sub || "unknown",
        attested_at_utc: ts,
        receipt_id: receipt.id,
      };
      insertAttest.run(rec);
      return rec;
    },

    score(inventoryId, packId) {
      const pack = this.get(packId);
      if (!pack) return null;

      const rows = db
        .prepare(
          `SELECT item_id, answer FROM attestations
           WHERE inventory_id = ? AND pack_id = ?
           ORDER BY attested_at_utc DESC`
        )
        .all(inventoryId, packId);

      // Latest answer wins per item.
      const latest = new Map();
      for (const r of rows) if (!latest.has(r.item_id)) latest.set(r.item_id, r.answer);

      let earned = 0;
      let possible = 0;
      const failingCritical = [];
      for (const item of allItems(pack)) {
        const w = SEVERITY_WEIGHTS[item.severity || "medium"];
        possible += w;
        const ans = latest.get(item.id);
        if (ans === "yes") earned += w;
        else if (ans === "na") possible -= w;
        else if (item.severity === "critical") failingCritical.push(item.id);
      }
      const fraction = possible === 0 ? 1 : earned / possible;
      return {
        pack_id: packId,
        version: pack.version,
        fraction,
        possible_weight: possible,
        earned_weight: earned,
        failing_critical: failingCritical,
        items_attested: latest.size,
        items_total: countItems(pack),
      };
    },
  };
}

function countItems(pack) {
  let n = 0;
  for (const _ of allItems(pack)) n++;
  return n;
}

function* allItems(pack) {
  const fns = pack.functions || pack.lenses || [];
  for (const fn of fns) for (const it of fn.items || []) yield it;
}

function findItem(pack, itemId) {
  for (const it of allItems(pack)) if (it.id === itemId) return it;
  return null;
}
