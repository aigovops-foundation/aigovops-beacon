/**
 * storage.test.ts — one test per storage method, plus the behaviours the ROUTES depend on.
 *
 * This matters more than a normal unit suite because `storage.ts` is a REBUILD from inferred
 * shapes (see shared/schema.ts). The routes are committed and authoritative; this store is not.
 * So the tests below are written against what `routes.ts` actually assumes at each call site —
 * not against what the store happens to do.
 *
 * Three of them exist because getting the behaviour wrong would be silently dangerous rather than
 * merely broken, and each is called out where it appears:
 *   - an expired session must not come back (routes treat any returned session as valid)
 *   - a consumed or revoked magic link must not come back (routes never re-check)
 *   - resetLabData must preserve tenants (dropping them destroys signing keys, and every receipt a
 *     previous cohort exported stops verifying)
 *
 * Run: npm test   (tsx --test)
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the store at a throwaway DB BEFORE importing it — storage.ts opens the database at
// module load, so the env var has to be set first.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lab-storage-test-"));
process.env.BEACON_DATA_DIR = TMP;
process.env.BEACON_DB_PATH = path.join(TMP, "test.db");

const { storage, db, _internal } = await import("./storage.js");
const { tenants, inventory, receipts, bundles } = _internal.tables;

const TENANT = "aigovops-foundation";
const now = () => new Date();
const inMin = (m: number) => new Date(Date.now() + m * 60_000);

before(() => {
  db.insert(tenants).values({
    id: TENANT,
    name: "AIGovOps Foundation",
    description: "Demo inventory only — not real Foundation policy.",
    ein: "99-0000001",
    keyFingerprint: "ed25519:4fbee7bb7d23998a",
    signingPublicKey: "MCowBQYDK2VwAyEAKHFZvOQ0VTgx40tPNr2245DH2n3qBSufnZb79ntupfI=",
    signingPrivateKey: "test-private-key",
    createdAt: now(),
  }).onConflictDoNothing().run();
});

beforeEach(() => {
  // Wipe trainee data between tests, keeping the tenant — the same contract resetLabData has.
  storage.resetLabData();
});

/* ------------------------------------------------------------------ tenants */

test("listTenants + getTenant round-trip, and getTenant tolerates null", () => {
  const all = storage.listTenants();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, TENANT);

  const t = storage.getTenant(TENANT);
  assert.equal(t?.name, "AIGovOps Foundation");
  // routes.ts calls `storage.getTenant(s.tenantId)` where tenantId can be null for an admin
  // session (`s.isAdmin ? null : storage.getTenant(s.tenantId)`), so null must not throw.
  assert.equal(storage.getTenant(null), null);
  assert.equal(storage.getTenant("nope"), null);
});

/* ----------------------------------------------------------------- sessions */

test("createSession / getSession / deleteSession / listSessions", () => {
  const s = {
    id: "tok-1", tenantId: TENANT, label: "Anon:anon_01", role: "trainee",
    isAdmin: false, createdAt: now(), expiresAt: inMin(60),
  };
  storage.createSession(s);

  const got = storage.getSession("tok-1");
  assert.equal(got?.label, "Anon:anon_01");
  assert.equal(got?.isAdmin, false, "boolean must survive the integer round-trip");
  assert.ok(got?.expiresAt instanceof Date, "timestamps must come back as Date, not number");

  assert.equal(storage.listSessions().length, 1);
  storage.deleteSession("tok-1");
  assert.equal(storage.getSession("tok-1"), null);
});

test("getSession REFUSES an expired session and reaps it", () => {
  // routes.ts does `const s = storage.getSession(token); if (!s) return 401` — it never checks
  // expiry itself. If an expired row leaked through, every trainee session would last forever.
  storage.createSession({
    id: "stale", tenantId: TENANT, label: "old", role: "trainee",
    isAdmin: false, createdAt: new Date(Date.now() - 7200_000), expiresAt: new Date(Date.now() - 1000),
  });
  assert.equal(storage.getSession("stale"), null, "expired session must not be returned");
  assert.equal(storage.listSessions().length, 0, "and must be deleted, since the lab has no reaper");
});

test("getSession tolerates null/empty token", () => {
  // `requireSession` reads a cookie that may be absent.
  assert.equal(storage.getSession(null), null);
  assert.equal(storage.getSession(""), null);
});

/* -------------------------------------------------------------- magic links */

test("createMagicLink / getMagicLink / listMagicLinks", () => {
  storage.createMagicLink({
    token: "ml-1", tenantId: TENANT, label: "email:a@b.c|anonId:anon_01",
    email: "a@b.c", role: "trainee", issuedAt: now(), expiresAt: inMin(30),
    consumedAt: null, revokedAt: null,
  });
  const l = storage.getMagicLink("ml-1");
  assert.equal(l?.email, "a@b.c");
  // The anonId is recoverable from `label` on redemption — routes.ts depends on this encoding.
  assert.match(l!.label, /anonId:anon_01$/);
  assert.equal(storage.listMagicLinks().length, 1);
});

test("a magic link is SINGLE USE — consumed, revoked, or expired links do not come back", () => {
  // routes.ts does getMagicLink(token) then consumeMagicLink(token) and never re-checks state,
  // so single-use has to be a property of the store.
  const base = {
    tenantId: TENANT, label: "", email: "x@y.z", role: "trainee",
    issuedAt: now(), expiresAt: inMin(30), consumedAt: null, revokedAt: null,
  };
  storage.createMagicLink({ ...base, token: "used" });
  storage.consumeMagicLink("used");
  assert.equal(storage.getMagicLink("used"), null, "consumed link must not be redeemable twice");

  storage.createMagicLink({ ...base, token: "gone" });
  storage.revokeMagicLink("gone");
  assert.equal(storage.getMagicLink("gone"), null, "revoked link must not be redeemable");

  storage.createMagicLink({ ...base, token: "old", expiresAt: new Date(Date.now() - 1000) });
  assert.equal(storage.getMagicLink("old"), null, "expired link must not be redeemable");

  // …but all three remain visible to the admin console, which lists history.
  assert.equal(storage.listMagicLinks().length, 3);
});

/* ---------------------------------------------------------------- inventory */

test("listInventory is tenant-scoped; getInventoryItem round-trips json columns", () => {
  db.insert(inventory).values([
    { id: "inv-1", tenantId: TENANT, name: "Resume screener", vendor: "Acme",
      riskTier: "high", status: "proposed", controlRefs: ["NIST-AI-RMF:MAP-1.1"],
      metadata: { modelVersion: "latest", ownerEmail: "" }, createdAt: now() },
    { id: "inv-2", tenantId: "other-tenant", name: "Not mine", vendor: "X",
      riskTier: null, status: "proposed", controlRefs: [], metadata: {}, createdAt: now() },
  ]).run();

  const mine = storage.listInventory(TENANT);
  assert.equal(mine.length, 1, "must not leak another tenant's inventory");
  assert.equal(mine[0].name, "Resume screener");

  const item = storage.getInventoryItem("inv-1");
  assert.deepEqual(item?.controlRefs, ["NIST-AI-RMF:MAP-1.1"], "json array must round-trip");
  // The Lab-100 rules read these out of `metadata`, so the blob must survive intact.
  assert.equal((item?.metadata as any).modelVersion, "latest");
  assert.equal(storage.getInventoryItem("nope"), null);
});

/* ----------------------------------------------------------------- receipts */

const receiptRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, tenantId: TENANT, sessionId: "sess-1", eventType: "discovery.scan",
  subjectName: "ai-program-inventory", subjectDigest: "sha256:abc", controlRef: ["NIST-AI-RMF:MAP-1.1"],
  envelope: '{"canonical":"json"}', signature: "sig", keyFingerprint: "ed25519:4fbee7bb7d23998a",
  tsUtc: new Date().toISOString(), createdAt: now(), ...over,
});

test("listReceipts honours the optional limit (both call shapes in routes.ts)", () => {
  db.insert(receipts).values([receiptRow("r1"), receiptRow("r2"), receiptRow("r3")]).run();
  assert.equal(storage.listReceipts(TENANT).length, 3, "no limit → all");
  assert.equal(storage.listReceipts(TENANT, 2).length, 2, "limit → capped");
  assert.equal(storage.listReceipts("other-tenant").length, 0, "tenant-scoped");
});

test("listReceiptsBySession + getReceipt", () => {
  db.insert(receipts).values([receiptRow("r1"), receiptRow("r2", { sessionId: "sess-2" })]).run();
  assert.equal(storage.listReceiptsBySession("sess-1").length, 1);
  const r = storage.getReceipt("r1");
  // The signed bytes must come back byte-identical or verification drifts.
  assert.equal(r?.envelope, '{"canonical":"json"}');
  assert.equal(storage.getReceipt("nope"), null);
});

/* ------------------------------------------------------------------ bundles */

test("listBundles is tenant-scoped", () => {
  db.insert(bundles).values([
    { id: "b1", tenantId: TENANT, sessionId: "sess-1", receiptIds: ["r1", "r2"],
      digest: "sha256:zzz", signature: "sig", keyFingerprint: "ed25519:x", createdAt: now() },
    { id: "b2", tenantId: "other-tenant", sessionId: null, receiptIds: [],
      digest: "", signature: "", keyFingerprint: "", createdAt: now() },
  ]).run();
  const list = storage.listBundles(TENANT);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].receiptIds, ["r1", "r2"]);
});

/* ----------------------------------------------------------- checklist runs */

test("createChecklistRun accepts the literal routes.ts builds", () => {
  storage.createChecklistRun({
    id: "run-1", tenantId: TENANT, sessionId: "sess-1", lab: "100", variant: "default",
    rulesEvaluated: 5, rulesFailed: 2, result: "fail", receiptId: "r1", createdAt: now(),
  });
  const rows = _internal.sqlite.prepare("select * from checklist_runs").all() as any[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rules_failed, 2);
});

/* -------------------------------------------------------------- admin state */

test("getAdminState always returns a row; setPaused / updateAdminPassword persist", () => {
  const s0 = storage.getAdminState();
  assert.equal(s0.paused, false, "a fresh lab is not paused");

  storage.setPaused(true, "Quick pause for review");
  const paused = storage.getAdminState();
  assert.equal(paused.paused, true);
  assert.equal(paused.pauseMessage, "Quick pause for review");

  // Resuming keeps the message: the LIVE service returns pauseMessage while paused=false,
  // so clearing it here would diverge from observed behaviour.
  storage.setPaused(false);
  const resumed = storage.getAdminState();
  assert.equal(resumed.paused, false);
  assert.equal(resumed.pauseMessage, "Quick pause for review", "message is retained on resume");

  storage.updateAdminPassword("hash-x", "salt-y");
  const pw = storage.getAdminState();
  assert.equal(pw.passwordHash, "hash-x");
  assert.equal(pw.passwordSalt, "salt-y");
});

/* ---------------------------------------------------------------- the reset */

test("resetLabData wipes trainee work but PRESERVES tenants and the admin password", () => {
  storage.updateAdminPassword("keep-me", "keep-salt");
  storage.createSession({
    id: "s1", tenantId: TENANT, label: "x", role: "trainee",
    isAdmin: false, createdAt: now(), expiresAt: inMin(60),
  });
  db.insert(receipts).values(receiptRow("r1")).run();
  db.insert(inventory).values({
    id: "inv-9", tenantId: TENANT, name: "n", vendor: "v", riskTier: "low",
    status: "approved", controlRefs: [], metadata: {}, createdAt: now(),
  }).run();

  storage.resetLabData();

  assert.equal(storage.listSessions().length, 0, "sessions cleared");
  assert.equal(storage.listReceipts(TENANT).length, 0, "receipts cleared");
  assert.equal(storage.listInventory(TENANT).length, 0, "inventory cleared (seed.ts re-seeds it)");

  // The load-bearing half: dropping tenants would destroy per-tenant signing keys, and every
  // receipt a previous cohort exported would stop verifying.
  assert.equal(storage.listTenants().length, 1, "TENANTS MUST SURVIVE A RESET");
  assert.ok((storage.getTenant(TENANT)?.signingPublicKey?.length ?? 0) > 0,
    "the tenant's signing key must survive, or previously-exported receipts stop verifying");
  assert.equal(storage.getAdminState().passwordHash, "keep-me", "admin must not be locked out by a reset");
});
