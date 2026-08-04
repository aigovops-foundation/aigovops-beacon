/**
 * shared/schema.ts — the Lab's data model (Drizzle + zod), rebuilt 2026-08-04.
 *
 * WHY THIS FILE IS A REBUILD, NOT THE ORIGINAL. lab-service's source was never fully committed:
 * `package.json`, this schema, and six server modules exist only inside a Perplexity sandbox that
 * could not be located (see lab-service/docs/deploy-fly.md). Recovery was exhausted — no
 * sourcemaps on the deployment, nothing in either Perplexity account, nothing across 133 GitHub
 * repos — so the model below is DERIVED, and it is worth being precise about from what:
 *
 *   - committed code, which is authoritative: `server/routes.ts` constructs `Session`,
 *     `MagicLink` and `ChecklistRun` literally, field by field, and `server/jwt.ts` fixes the
 *     token claims. Those shapes are not guesses.
 *   - the LIVE service, captured 2026-08-04 while it still ran: `GET /api/status` returned the two
 *     real tenants (ids, names, EINs, ed25519 fingerprints, public keys) and
 *     `GET /api/curriculum/100` returned the five Lab-100 rules. Those are ground truth.
 *   - the 22 `storage.*` call sites, which constrain every table that has to exist.
 *
 * What is genuinely inferred is column-level detail: nullability, defaults, indexes, and the exact
 * split between typed columns and the `metadata` blob. If the original database is ever recovered,
 * expect a migration — that is a known, accepted cost of rebuilding rather than a defect.
 *
 * WHY `metadata` IS A JSON BLOB AND NOT COLUMNS. `PATCH /api/inventory/:id` accepts exactly
 * `{ metadata, status, riskTier }`, while the Lab-100 curriculum checks facts that appear in none
 * of those columns — "model version is pinned (never 'latest')", "owner email present". Those live
 * inside `metadata`, which is what makes the Lab-200 "fix the failing item" exercise possible
 * without a schema migration per rule. Keep it a blob.
 */

import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ------------------------------------------------------------------ tenants */

/**
 * A training tenant. Two exist in the live lab, both fictional-by-design:
 * `aigovops-foundation` and `beacon-foundation-inc` (see server/seed.ts).
 *
 * `signingPrivateKey` never leaves the server — `/api/status` projects only
 * `signingPublicKey` (as `publicKey`) and `keyFingerprint`. Receipts are signed per tenant so a
 * trainee can verify that the receipt they just produced carries THEIR tenant's key and not the
 * lab's, which is the whole pedagogical point.
 */
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ein: text("ein").notNull().default(""),
  keyFingerprint: text("key_fingerprint").notNull(),
  signingPublicKey: text("signing_public_key").notNull(),
  signingPrivateKey: text("signing_private_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* ----------------------------------------------------------------- sessions */

/**
 * Shape taken verbatim from `routes.ts`, which builds `const session: Session = {...}` in four
 * places. `id` IS the opaque session token (`randomToken()`), so it doubles as the cookie value —
 * that is why `deleteSession(token)` and `deleteSession(s.id)` are both correct in the routes.
 *
 * `role` is text rather than an enum because the routes write "trainee" here while the JWT carries
 * "anon" for a not-yet-promoted visitor; widening it later must not need a migration.
 */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  label: text("label").notNull(),
  role: text("role").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

/* -------------------------------------------------------------- magic links */

/**
 * Single-use, time-limited trainee invitations. Fields are exactly those `routes.ts` passes to
 * `createMagicLink`, including the two null-initialised timestamps.
 *
 * `label` carries `email:<addr>|anonId:<id>` for links issued via `/api/anon/email-link`. The
 * original author flagged that as a shortcut ("a dedicated metadata column is the day-2
 * improvement"). It is reproduced AS-IS deliberately: changing the encoding here would silently
 * break redemption of any link already in flight, and this rebuild's first job is behavioural
 * parity, not tidiness. The day-2 improvement stays day-2.
 */
export const magicLinks = sqliteTable("magic_links", {
  token: text("token").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  label: text("label").notNull().default(""),
  email: text("email"),
  role: text("role").notNull().default("trainee"),
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

/* ---------------------------------------------------------------- inventory */

/**
 * The AI-system inventory a trainee governs. Typed columns are the ones the routes read directly
 * (`i.id`, `i.name`, `i.vendor`, `item.riskTier`, `item.status`, `item.controlRefs`); everything a
 * curriculum rule inspects but no route projects — model version, owner email, use case — lives in
 * `metadata`. See the note at the top of this file for why that split is deliberate.
 *
 * `controlRefs` is JSON-encoded text rather than a relation: Lab 100 rule R3 only asks "at least
 * one control reference mapped", and a join table would add migration weight for a check that is
 * satisfied by counting.
 */
export const inventory = sqliteTable("inventory", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  vendor: text("vendor").notNull().default(""),
  riskTier: text("risk_tier"),
  status: text("status").notNull().default("proposed"),
  controlRefs: text("control_refs", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* ----------------------------------------------------------------- receipts */

/**
 * Signed evidence. Field names come from how `routes.ts` reads them back
 * (`r.envelope`, `r.signature`, `r.keyFingerprint`, `r.subjectDigest`, `r.subjectName`,
 * `r.eventType`, `r.tsUtc`, `r.controlRef`).
 *
 * `envelope` stores the exact canonical JSON that was signed — not a re-serialisation of the
 * columns. Re-canonicalising at verify time is how signature checks drift: RFC-8785 output must be
 * byte-identical, and the only way to guarantee that is to keep the bytes. `beacons/_common.py`
 * and `server/src/lib/canonical.js` are the canonical implementations; this table just stores them.
 */
export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sessionId: text("session_id"),
  eventType: text("event_type").notNull(),
  subjectName: text("subject_name").notNull().default(""),
  subjectDigest: text("subject_digest").notNull().default(""),
  controlRef: text("control_ref", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  envelope: text("envelope").notNull(),
  signature: text("signature").notNull(),
  keyFingerprint: text("key_fingerprint").notNull(),
  tsUtc: text("ts_utc").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* ------------------------------------------------------------------ bundles */

/** Portable evidence bundles — `listBundles(tenantId)` is the only route-facing accessor. */
export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sessionId: text("session_id"),
  receiptIds: text("receipt_ids", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  digest: text("digest").notNull().default(""),
  signature: text("signature").notNull().default(""),
  keyFingerprint: text("key_fingerprint").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* ----------------------------------------------------------- checklist runs */

/** Shape taken verbatim from the `createChecklistRun({...})` literal in `routes.ts`. */
export const checklistRuns = sqliteTable("checklist_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sessionId: text("session_id").notNull(),
  lab: text("lab").notNull(),
  variant: text("variant").notNull().default("default"),
  // RULE IDS, NOT COUNTS. Phase 1 declared these as integers; phase 3 proved that wrong. The
  // discovery route passes the literal `rulesEvaluated: ["discovery.completeness"], rulesFailed: []`
  // into the receipt decision, and the checklist route passes the SAME values from evaluateChecklist
  // into both the decision and createChecklistRun. Storing a count would have silently destroyed
  // which rules failed — the one thing a trainee needs to see, and the reason the run is recorded.
  rulesEvaluated: text("rules_evaluated", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  rulesFailed: text("rules_failed", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  result: text("result").notNull(),
  receiptId: text("receipt_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/* -------------------------------------------------------------- admin state */

/**
 * Single-row table (`id` pinned to 1). The routes read `state.passwordHash`, `state.passwordSalt`
 * and `state.pauseMessage`, and `setPaused(true, message)` / `setPaused(false)` toggle the lab.
 *
 * Salt is stored beside the hash rather than embedded in it because `server/crypto.ts` exposes
 * `hashPassword`/`verifyPassword` as a pair taking both — and `rotate-password` writes
 * `updateAdminPassword(hash, salt)` as two arguments.
 */
export const adminState = sqliteTable("admin_state", {
  id: integer("id").primaryKey().default(1),
  passwordHash: text("password_hash").notNull().default(""),
  passwordSalt: text("password_salt").notNull().default(""),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  pauseMessage: text("pause_message").notNull().default(""),
});

/* ------------------------------------------------------------------- types */

export type Tenant = typeof tenants.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type MagicLink = typeof magicLinks.$inferSelect;
export type InventoryItem = typeof inventory.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type Bundle = typeof bundles.$inferSelect;
export type ChecklistRun = typeof checklistRuns.$inferSelect;
export type AdminState = typeof adminState.$inferSelect;

/* ---------------------------------------------------------- insert schemas */

/**
 * `routes.ts` imports exactly these two and uses `.safeParse(req.body)` on request bodies, so they
 * validate CLIENT INPUT — not full rows. Server-owned fields (ids, timestamps, tenant scoping) are
 * omitted so a caller can never set them: `POST /api/admin/issue-link` must not be able to choose
 * its own token or back-date `issuedAt`.
 */
export const insertInventorySchema = createInsertSchema(inventory).omit({
  id: true,
  tenantId: true,
  createdAt: true,
});

export const insertMagicLinkSchema = createInsertSchema(magicLinks)
  .omit({
    token: true,
    issuedAt: true,
    expiresAt: true,
    consumedAt: true,
    revokedAt: true,
  })
  .extend({
    // The admin route reads `parsed.data.tenantId` before calling `storage.getTenant(...)`, so it
    // must survive parsing — unlike the inventory schema, where tenant comes from the session.
    tenantId: z.string().min(1),

    // These three use `.default()` rather than `.optional()` on purpose. `routes.ts` consumes the
    // parsed result directly and unguarded — `label: parsed.data.label`, `role: parsed.data.role`,
    // and `now + parsed.data.ttlMinutes * 60 * 1000` — so an optional here is not merely a type
    // error, it is `NaN` in an expiry timestamp at runtime, which would mint a link that can never
    // be redeemed. A zod default keeps the client free to omit them while guaranteeing the route a
    // concrete value. (tsc caught this: the first draft used .optional() and failed to compile
    // against the committed route.)
    label: z.string().default(""),
    role: z.string().default("trainee"),
    ttlMinutes: z.number().int().positive().max(60 * 24 * 7).default(60),
  });

export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InsertMagicLink = z.infer<typeof insertMagicLinkSchema>;
