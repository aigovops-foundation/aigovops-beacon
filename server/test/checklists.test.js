import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/services/db.js";
import { createChecklistService } from "../src/services/checklists.js";

const PACK = {
  id: "pack-a",
  version: "1.0.0",
  title: "Pack A",
  short_title: "A",
  authority: "Test",
  url: "https://example.test/pack-a",
  functions: [
    {
      id: "fn-a",
      items: [
        { id: "i-critical", severity: "critical" },
        { id: "i-high", severity: "high" },
        { id: "i-medium", severity: "medium" },
      ],
    },
  ],
};

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-checklists-"));
  const db = openDatabase({ dataDir });
  db.prepare(
    `INSERT INTO inventory
      (id, vendor, model, version, environment, owner_email, trust_tier,
       first_seen_utc, last_seen_utc, discovery_src, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "inv-1",
    "OpenAI",
    "gpt",
    "v1",
    "prod",
    "owner@example.com",
    "T0",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
    "manual",
    null
  );

  let receiptCounter = 0;
  const checklistService = createChecklistService({
    db,
    checklists: [PACK],
    receiptService: {
      write() {
        receiptCounter += 1;
        return { id: `r-${receiptCounter}` };
      },
    },
  });

  return { dataDir, db, checklistService };
}

test("checklist service lists packs and resolves by id", () => {
  const { dataDir, db, checklistService } = setup();
  assert.equal(checklistService.list().length, 1);
  assert.equal(checklistService.list()[0].item_count, 3);
  assert.equal(checklistService.get("pack-a")?.title, "Pack A");
  assert.equal(checklistService.get("missing"), null);
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("attest validates unknown pack/item and invalid answer", () => {
  const { dataDir, db, checklistService } = setup();
  assert.throws(
    () =>
      checklistService.attest({
        inventoryId: "inv-1",
        packId: "missing",
        itemId: "i-critical",
        answer: "yes",
        user: { email: "a@example.com" },
      }),
    (err) => err.statusCode === 404 && err.code === "unknown_pack"
  );
  assert.throws(
    () =>
      checklistService.attest({
        inventoryId: "inv-1",
        packId: "pack-a",
        itemId: "missing-item",
        answer: "yes",
        user: { email: "a@example.com" },
      }),
    (err) => err.statusCode === 404 && err.code === "unknown_item"
  );
  assert.throws(
    () =>
      checklistService.attest({
        inventoryId: "inv-1",
        packId: "pack-a",
        itemId: "i-critical",
        answer: "maybe",
        user: { email: "a@example.com" },
      }),
    (err) => err.statusCode === 400 && err.code === "invalid_answer"
  );
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("score uses latest item answers and handles N/A weighting", () => {
  const { dataDir, db, checklistService } = setup();
  const insert = db.prepare(
    `INSERT INTO attestations
      (id, inventory_id, pack_id, item_id, answer, evidence_uri,
       attested_by, attested_at_utc, receipt_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insert.run(
    "a1",
    "inv-1",
    "pack-a",
    "i-critical",
    "yes",
    null,
    "auditor",
    "2026-01-01T00:00:00.000Z",
    "r1"
  );
  insert.run(
    "a2",
    "inv-1",
    "pack-a",
    "i-high",
    "no",
    null,
    "auditor",
    "2026-01-01T00:01:00.000Z",
    "r2"
  );
  insert.run(
    "a3",
    "inv-1",
    "pack-a",
    "i-high",
    "yes",
    null,
    "auditor",
    "2026-01-01T00:02:00.000Z",
    "r3"
  );
  insert.run(
    "a4",
    "inv-1",
    "pack-a",
    "i-medium",
    "na",
    null,
    "auditor",
    "2026-01-01T00:03:00.000Z",
    "r4"
  );

  const score = checklistService.score("inv-1", "pack-a");
  assert.equal(score.fraction, 1);
  assert.equal(score.possible_weight, 6);
  assert.equal(score.earned_weight, 6);
  assert.deepEqual(score.failing_critical, []);
  assert.equal(score.items_attested, 3);
  assert.equal(score.items_total, 3);
  assert.equal(checklistService.score("inv-1", "missing-pack"), null);

  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
