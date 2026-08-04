/**
 * seed.test.ts — the starting state of a cohort, and the two ways bootstrap could quietly ruin it.
 *
 * `bootstrap()` runs on EVERY boot. The dangerous failures are not "it did not seed" (obvious, the
 * lab is empty) but the silent ones: re-keying a tenant, which orphans every receipt already
 * signed under the old fingerprint, and re-hashing the admin password, which would undo an
 * instructor's rotation on the next container recycle.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lab-seed-test-"));
process.env.BEACON_DATA_DIR = TMP;
process.env.BEACON_DB_PATH = path.join(TMP, "seed.db");

const { storage, db, _internal } = await import("./storage.js");
const { bootstrap, TENANT_SEEDS, reseedTenantInventory } = await import("./seed.js");
const { evaluateChecklist, RULES_LEVEL_100, RULES_LEVEL_200 } = await import("./beacon.js");
const { hashPassword, verifyPassword } = await import("./crypto.js");

/** A truly empty database — resetLabData deliberately preserves tenants and the admin password. */
function wipeEverything(): void {
  const t = _internal.tables;
  _internal.sqlite.transaction(() => {
    storage.resetLabData();
    db.delete(t.tenants).run();
    _internal.sqlite.prepare("UPDATE admin_state SET password_hash = '', password_salt = ''").run();
  })();
}

beforeEach(() => wipeEverything());

test("bootstrap seeds both tenants, with distinct keys and matching fingerprints", () => {
  bootstrap("beacon");
  const list = storage.listTenants();
  assert.equal(list.length, TENANT_SEEDS.length);
  assert.deepEqual(
    list.map((t) => t.id).sort(),
    ["aigovops-foundation", "beacon-foundation-inc"],
  );
  const [a, b] = list;
  assert.notEqual(a.signingPrivateKey, b.signingPrivateKey, "each tenant must have its OWN key");
  for (const t of list) {
    assert.match(t.keyFingerprint, /^ed25519:[0-9a-f]{16}$/);
    assert.ok(t.signingPublicKey.startsWith("MCowBQYDK2VwAyEA"), "SPKI DER base64, as the live service stored");
  }
});

test("bootstrap NEVER re-keys an existing tenant", () => {
  // Re-keying on boot would orphan every receipt signed under the old fingerprint: they would all
  // fail verification, with the private key that could have vindicated them already gone.
  bootstrap("beacon");
  const before = storage.getTenant("aigovops-foundation")!;
  bootstrap("beacon");
  bootstrap("something-else");
  const after = storage.getTenant("aigovops-foundation")!;
  assert.equal(after.keyFingerprint, before.keyFingerprint);
  assert.equal(after.signingPrivateKey, before.signingPrivateKey);
});

test("bootstrap does NOT undo an admin password rotation", () => {
  bootstrap("beacon");
  const { hash, salt } = hashPassword("instructor-rotated-this");
  storage.updateAdminPassword(hash, salt);

  bootstrap("beacon"); // the container recycles

  const st = storage.getAdminState();
  assert.ok(verifyPassword("instructor-rotated-this", st.passwordSalt, st.passwordHash), "rotation must survive a reboot");
  assert.ok(!verifyPassword("beacon", st.passwordSalt, st.passwordHash), "the seed password must NOT work again");
});

test("an EMPTY admin password stores NO hash, and a real one set later is adopted", () => {
  // The production path: deployed with ADMIN_PASSWORD unset, so the admin console is disabled
  // rather than guarding a password written in the source. Hashing "" instead would look
  // configured and make every later ADMIN_PASSWORD a no-op — locking the console permanently.
  bootstrap("");
  const st = storage.getAdminState();
  assert.equal(st.passwordHash, "", "no hash may be stored for an unset password");
  assert.equal(verifyPassword("", st.passwordSalt, st.passwordHash), false, "admin login is disabled");
  assert.equal(verifyPassword("beacon", st.passwordSalt, st.passwordHash), false);

  // Operator sets the secret and the machine restarts.
  bootstrap("set-after-the-fact");
  const after = storage.getAdminState();
  assert.ok(verifyPassword("set-after-the-fact", after.passwordSalt, after.passwordHash),
    "the password set after an unconfigured boot must be adopted");
});

test("bootstrap is idempotent — inventory is not duplicated across boots", () => {
  bootstrap("beacon");
  const n = storage.listInventory("aigovops-foundation").length;
  assert.ok(n > 0);
  bootstrap("beacon");
  bootstrap("beacon");
  assert.equal(storage.listInventory("aigovops-foundation").length, n);
});

test("the recovered AIGovOps inventory PASSES Lab 100 — it is a starting point, not an exercise", () => {
  bootstrap("beacon");
  const items = storage.listInventory("aigovops-foundation");
  assert.equal(items.length, 5, "five rows, as captured from the live service");
  const res = evaluateChecklist(items, RULES_LEVEL_100);
  assert.equal(res.overall, "pass", `failed: ${res.rulesFailed.join(", ")}`);
});

test("the teaching tenant fails exactly the rules it is documented to fail", () => {
  // If this drifts, an instructor's demo stops matching what seed.ts claims it shows.
  bootstrap("beacon");
  const items = storage.listInventory("beacon-foundation-inc");
  const l100 = evaluateChecklist(items, RULES_LEVEL_100);
  assert.deepEqual(
    l100.rulesFailed.sort(),
    ["L100.R1", "L100.R2", "L100.R3", "L100.R4", "L100.R5"],
    "each Lab 100 rule has a row that demonstrates it failing",
  );
  const l200 = evaluateChecklist(items, RULES_LEVEL_200);
  for (const id of ["L200.R7", "L200.R8"]) {
    assert.ok(l200.rulesFailed.includes(id), `${id} should fail on the invoice extractor`);
  }
  assert.ok(l100.findings.length > 0 && l100.findings[0].itemName, "findings name the offending row");
});

test("reseed restores the SAME starting state, it does not append to what a cohort left", () => {
  bootstrap("beacon");
  const before = storage.listInventory("aigovops-foundation").map((i) => i.name).sort();

  // A cohort works in the lab: adds a row, and the reset must not keep it.
  db.insert(_internal.tables.inventory).values({
    id: "cohort-leftover", tenantId: "aigovops-foundation", name: "Trainee scratch item",
    vendor: "", model: "", version: "", useCase: "", ownerEmail: "",
    riskTier: "low", status: "proposed", controlRefs: [], metadata: {}, createdAt: new Date(),
  }).run();
  assert.equal(storage.listInventory("aigovops-foundation").length, before.length + 1);

  storage.resetLabData();
  for (const t of TENANT_SEEDS) reseedTenantInventory(t.id);

  const after = storage.listInventory("aigovops-foundation").map((i) => i.name).sort();
  assert.deepEqual(after, before, "reset returns the exact starting inventory");
});

test("reseed is scoped to one tenant and ignores an unknown id", () => {
  bootstrap("beacon");
  const other = storage.listInventory("beacon-foundation-inc").length;
  reseedTenantInventory("aigovops-foundation");
  assert.equal(storage.listInventory("beacon-foundation-inc").length, other, "the other tenant is untouched");
  reseedTenantInventory("no-such-tenant"); // must not throw
});
