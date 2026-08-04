/**
 * server/storage.ts — the Lab's data access layer, rebuilt 2026-08-04.
 *
 * Exports exactly what `routes.ts` imports: `storage` (22 methods) and `db` (the Drizzle handle,
 * imported there as `drizzleDb` for the one place a route writes through Drizzle directly).
 *
 * Every method below exists because a call site demands it. The list was derived by extracting all
 * 22 `storage.*` call sites from routes.ts, and the argument shapes come from those calls — see
 * shared/schema.ts for what is ground truth versus inferred.
 *
 * SYNCHRONOUS ON PURPOSE. `routes.ts` calls these without `await` (`const s = storage.getSession(token)`,
 * `res.json({ links: storage.listMagicLinks() })`). better-sqlite3 is synchronous, so this matches
 * the original and avoids a rewrite of every route. Making these async later would be a breaking
 * change to callers, not a local refactor.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  tenants,
  sessions,
  magicLinks,
  inventory,
  receipts,
  bundles,
  checklistRuns,
  adminState,
  type Tenant,
  type Session,
  type MagicLink,
  type InventoryItem,
  type Receipt,
  type Bundle,
  type ChecklistRun,
  type AdminState,
} from "@shared/schema";

/* ------------------------------------------------------------ the database */

/**
 * `/data` is the Fly volume mount (see fly.toml). Falling back to a local file keeps `npm test`
 * and `docker build` working without a volume — the Dockerfile even pre-creates /data so the
 * health check can answer before the volume attaches.
 */
const DATA_DIR = process.env.BEACON_DATA_DIR || (fs.existsSync("/data") ? "/data" : path.resolve("./.data"));
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.BEACON_DB_PATH || path.join(DATA_DIR, "lab.db");

const sqlite = new Database(DB_PATH);
// WAL so a read (a trainee polling /api/inventory) never blocks a write (another trainee signing a
// receipt). A training lab is many concurrent readers against one small writer — the case WAL is for.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);

/**
 * Schema is created here rather than by drizzle-kit migrations. The original had no committed
 * migrations directory, and a lab that provisions a fresh volume needs to come up on first boot
 * without a migrate step in the Dockerfile. `IF NOT EXISTS` keeps it idempotent across restarts.
 */
export function ensureSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      ein TEXT NOT NULL DEFAULT '', key_fingerprint TEXT NOT NULL,
      signing_public_key TEXT NOT NULL, signing_private_key TEXT NOT NULL,
      created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, label TEXT NOT NULL, role TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS magic_links (
      token TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
      email TEXT, role TEXT NOT NULL DEFAULT 'trainee', issued_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, consumed_at INTEGER, revoked_at INTEGER);

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      vendor TEXT NOT NULL DEFAULT '', risk_tier TEXT, status TEXT NOT NULL DEFAULT 'proposed',
      control_refs TEXT NOT NULL DEFAULT '[]', metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT, event_type TEXT NOT NULL,
      subject_name TEXT NOT NULL DEFAULT '', subject_digest TEXT NOT NULL DEFAULT '',
      control_ref TEXT NOT NULL DEFAULT '[]', envelope TEXT NOT NULL, signature TEXT NOT NULL,
      key_fingerprint TEXT NOT NULL, ts_utc TEXT NOT NULL, created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS bundles (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT,
      receipt_ids TEXT NOT NULL DEFAULT '[]', digest TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '', key_fingerprint TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS checklist_runs (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, lab TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default', rules_evaluated INTEGER NOT NULL DEFAULT 0,
      rules_failed INTEGER NOT NULL DEFAULT 0, result TEXT NOT NULL, receipt_id TEXT,
      created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS admin_state (
      id INTEGER PRIMARY KEY, password_hash TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL DEFAULT '', paused INTEGER NOT NULL DEFAULT 0,
      pause_message TEXT NOT NULL DEFAULT '');

    -- Every hot read in routes.ts is tenant-scoped or session-scoped.
    CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_tenant  ON receipts(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_receipts_session ON receipts(session_id);
    CREATE INDEX IF NOT EXISTS idx_bundles_tenant   ON bundles(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  // The single admin_state row must exist before getAdminState() is ever read.
  sqlite.prepare("INSERT OR IGNORE INTO admin_state (id) VALUES (1)").run();
}

ensureSchema();

/* --------------------------------------------------------------- accessors */

export const storage = {
  /* -- tenants -- */

  listTenants(): Tenant[] {
    return db.select().from(tenants).all();
  },

  getTenant(id: string | null | undefined): Tenant | null {
    if (!id) return null;
    return db.select().from(tenants).where(eq(tenants.id, id)).get() ?? null;
  },

  /* -- sessions -- */

  /**
   * Expiry is enforced HERE, not left to the caller. `routes.ts` treats a returned session as
   * valid (`const s = storage.getSession(token); if (!s) ...`), so an expired row leaking through
   * would silently extend every trainee's session forever. Expired rows are deleted on read: the
   * lab has no reaper, and this is the only place that reliably notices.
   */
  getSession(token: string | null | undefined): Session | null {
    if (!token) return null;
    const row = db.select().from(sessions).where(eq(sessions.id, token)).get();
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      db.delete(sessions).where(eq(sessions.id, token)).run();
      return null;
    }
    return row;
  },

  createSession(session: Session): void {
    db.insert(sessions).values(session).onConflictDoUpdate({
      target: sessions.id,
      set: { expiresAt: session.expiresAt, label: session.label, role: session.role },
    }).run();
  },

  deleteSession(id: string): void {
    db.delete(sessions).where(eq(sessions.id, id)).run();
  },

  listSessions(): Session[] {
    return db.select().from(sessions).orderBy(desc(sessions.createdAt)).all();
  },

  /* -- magic links -- */

  createMagicLink(link: MagicLink): void {
    db.insert(magicLinks).values(link).run();
  },

  /**
   * Returns the row only if it is still redeemable. `routes.ts` does
   * `const link = storage.getMagicLink(token); ... storage.consumeMagicLink(token)` — it does not
   * re-check consumed/revoked/expired itself, so a token that has already been used must not come
   * back from here. Single-use is a property of the store, not of the caller remembering to ask.
   */
  getMagicLink(token: string | null | undefined): MagicLink | null {
    if (!token) return null;
    const row = db.select().from(magicLinks).where(eq(magicLinks.token, token)).get();
    if (!row) return null;
    if (row.consumedAt || row.revokedAt) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return row;
  },

  consumeMagicLink(token: string): void {
    db.update(magicLinks).set({ consumedAt: new Date() }).where(eq(magicLinks.token, token)).run();
  },

  revokeMagicLink(token: string): void {
    db.update(magicLinks).set({ revokedAt: new Date() }).where(eq(magicLinks.token, token)).run();
  },

  listMagicLinks(): MagicLink[] {
    return db.select().from(magicLinks).orderBy(desc(magicLinks.issuedAt)).all();
  },

  /* -- inventory -- */

  listInventory(tenantId: string): InventoryItem[] {
    return db.select().from(inventory).where(eq(inventory.tenantId, tenantId)).all();
  },

  getInventoryItem(id: string): InventoryItem | null {
    return db.select().from(inventory).where(eq(inventory.id, id)).get() ?? null;
  },

  /* -- receipts -- */

  /**
   * `limit` is optional because both call shapes appear in routes.ts:
   * `listReceipts(demoTenant.id, 50)` and `listReceipts(String(req.params.tenantId))`.
   */
  listReceipts(tenantId: string, limit?: number): Receipt[] {
    const q = db.select().from(receipts)
      .where(eq(receipts.tenantId, tenantId))
      .orderBy(desc(receipts.createdAt));
    return limit ? q.limit(limit).all() : q.all();
  },

  listReceiptsBySession(sessionId: string): Receipt[] {
    return db.select().from(receipts)
      .where(eq(receipts.sessionId, sessionId))
      .orderBy(desc(receipts.createdAt))
      .all();
  },

  getReceipt(id: string): Receipt | null {
    return db.select().from(receipts).where(eq(receipts.id, id)).get() ?? null;
  },

  /* -- bundles -- */

  listBundles(tenantId: string): Bundle[] {
    return db.select().from(bundles)
      .where(eq(bundles.tenantId, tenantId))
      .orderBy(desc(bundles.createdAt))
      .all();
  },

  /* -- checklist runs -- */

  createChecklistRun(run: ChecklistRun): void {
    db.insert(checklistRuns).values(run).run();
  },

  /* -- admin state -- */

  getAdminState(): AdminState {
    const row = db.select().from(adminState).where(eq(adminState.id, 1)).get();
    if (row) return row;
    // ensureSchema() seeds row 1, so this is belt-and-braces for a truncated volume.
    const seeded: AdminState = { id: 1, passwordHash: "", passwordSalt: "", paused: false, pauseMessage: "" };
    db.insert(adminState).values(seeded).onConflictDoNothing().run();
    return seeded;
  },

  /**
   * `setPaused(true, message)` and `setPaused(false)` are both called. When resuming, the previous
   * message is retained rather than cleared: `/api/status` surfaces `pauseMessage` alongside
   * `paused`, and the live service returns a message while `paused: false` — so clearing it here
   * would diverge from observed behaviour.
   */
  setPaused(paused: boolean, message?: string): void {
    const set: Partial<AdminState> = { paused };
    if (typeof message === "string") set.pauseMessage = message;
    db.update(adminState).set(set).where(eq(adminState.id, 1)).run();
  },

  updateAdminPassword(hash: string, salt: string): void {
    db.update(adminState).set({ passwordHash: hash, passwordSalt: salt }).where(eq(adminState.id, 1)).run();
  },

  /**
   * `POST /api/admin/reset` — wipe trainee work, keep the lab itself.
   *
   * Tenants and admin_state SURVIVE on purpose. Resetting is what an instructor does between
   * cohorts; dropping tenants would destroy the per-tenant signing keys, and every receipt a
   * previous cohort exported would stop verifying. Inventory is not deleted either — it is
   * re-seeded by `reseedTenantInventory` (server/seed.ts) so the next cohort starts from the same
   * known-bad fixtures the curriculum rules are written against.
   */
  resetLabData(): void {
    sqlite.transaction(() => {
      db.delete(checklistRuns).run();
      db.delete(bundles).run();
      db.delete(receipts).run();
      db.delete(sessions).run();
      db.delete(magicLinks).run();
      db.delete(inventory).run();
      db.update(adminState).set({ paused: false }).where(eq(adminState.id, 1)).run();
    })();
  },
};

export type Storage = typeof storage;

/** Exported for tests and for `seed.ts`, which needs bulk inserts this interface does not expose. */
export const _internal = { sqlite, tables: { tenants, sessions, magicLinks, inventory, receipts, bundles, checklistRuns, adminState }, helpers: { and, inArray } };
