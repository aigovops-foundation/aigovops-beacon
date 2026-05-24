import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// AIGovOps Beacon — Lab Service Schema
// ============================================================================

// Tenants — demo organizations the lab can simulate
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(), // slug, e.g. "aigovops-foundation"
  name: text("name").notNull(),
  description: text("description").notNull(),
  ein: text("ein"), // 501(c)(3) employer ID (fictional)
  signingPublicKey: text("signing_public_key").notNull(), // Ed25519 public key (b64)
  signingPrivateKey: text("signing_private_key").notNull(), // Ed25519 private key (b64) — demo only
  keyFingerprint: text("key_fingerprint").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Magic-link tokens — admin issues these for trainees
export const magicLinks = sqliteTable("magic_links", {
  token: text("token").primaryKey(), // 32-byte random hex
  tenantId: text("tenant_id").notNull(),
  label: text("label").notNull(), // human label e.g. "Trainee #3"
  email: text("email"), // optional, for admin's records
  role: text("role").notNull().default("trainee"), // "trainee" or "observer"
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

// Sessions — session tokens issued after magic-link redemption
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // session token, 32-byte hex
  tenantId: text("tenant_id").notNull(),
  label: text("label").notNull(),
  role: text("role").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// AI inventory items — what the tenant's "AI program" contains
export const inventory = sqliteTable("inventory", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  vendor: text("vendor").notNull(),
  model: text("model").notNull(),
  version: text("version").notNull(), // never "latest"
  useCase: text("use_case").notNull(),
  riskTier: text("risk_tier").notNull(), // low/medium/high/prohibited
  status: text("status").notNull().default("draft"), // draft/approved/retired
  ownerEmail: text("owner_email").notNull(),
  controlRefs: text("control_refs", { mode: "json" }).$type<string[]>().notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Receipts — OVERT 1.0 signed envelopes
export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(), // ULID
  tenantId: text("tenant_id").notNull(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(),
  subjectName: text("subject_name"),
  subjectDigest: text("subject_digest"),
  envelope: text("envelope", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  signature: text("signature").notNull(),
  keyFingerprint: text("key_fingerprint").notNull(),
  canonicalForm: text("canonical_form").notNull(),
  tsUtc: integer("ts_utc", { mode: "timestamp" }).notNull(),
});

// Checklist runs — each Level 100/200 lab evaluation
export const checklistRuns = sqliteTable("checklist_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sessionId: text("session_id").notNull(),
  lab: text("lab").notNull(), // "100" or "200"
  variant: text("variant").notNull(), // e.g. "discovery", "policy-as-code"
  rulesEvaluated: text("rules_evaluated", { mode: "json" }).$type<string[]>().notNull(),
  rulesFailed: text("rules_failed", { mode: "json" }).$type<string[]>().notNull(),
  result: text("result").notNull(), // pass/fail/warn
  receiptId: text("receipt_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Evidence bundles — signed collections of receipts
export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sessionId: text("session_id").notNull(),
  receiptIds: text("receipt_ids", { mode: "json" }).$type<string[]>().notNull(),
  merkleRoot: text("merkle_root").notNull(),
  signature: text("signature").notNull(),
  bundleJson: text("bundle_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Admin state — pause/resume + admin password hash
export const adminState = sqliteTable("admin_state", {
  id: text("id").primaryKey().default("singleton"),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  pauseMessage: text("pause_message").notNull().default("Lab is paused. Please wait for instructor."),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ============================================================================
// Zod insert schemas
// ============================================================================

export const insertInventorySchema = createInsertSchema(inventory).omit({
  id: true,
  createdAt: true,
});

export const insertMagicLinkSchema = z.object({
  tenantId: z.string(),
  label: z.string().min(1).max(100),
  email: z.string().email().optional(),
  role: z.enum(["trainee", "observer"]).default("trainee"),
  ttlMinutes: z.number().int().min(5).max(60 * 24 * 7).default(60),
});

// ============================================================================
// Exported types
// ============================================================================

export type Tenant = typeof tenants.$inferSelect;
export type MagicLink = typeof magicLinks.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type InventoryItem = typeof inventory.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventorySchema>;
export type Receipt = typeof receipts.$inferSelect;
export type ChecklistRun = typeof checklistRuns.$inferSelect;
export type Bundle = typeof bundles.$inferSelect;
export type AdminState = typeof adminState.$inferSelect;
