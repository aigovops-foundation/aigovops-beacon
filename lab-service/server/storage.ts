import {
  tenants,
  magicLinks,
  sessions,
  inventory,
  receipts,
  checklistRuns,
  bundles,
  adminState,
  type Tenant,
  type MagicLink,
  type Session,
  type InventoryItem,
  type Receipt,
  type ChecklistRun,
  type Bundle,
  type AdminState,
  type InsertInventoryItem,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Bootstrap schema with raw SQL (so we don't require drizzle-kit on startup)
// ---------------------------------------------------------------------------
sqlite.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  ein TEXT,
  signing_public_key TEXT NOT NULL,
  signing_private_key TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_links (
  token TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'trainee',
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  role TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  model TEXT NOT NULL,
  version TEXT NOT NULL,
  use_case TEXT NOT NULL,
  risk_tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  owner_email TEXT NOT NULL,
  control_refs TEXT NOT NULL,
  metadata TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subject_name TEXT,
  subject_digest TEXT,
  envelope TEXT NOT NULL,
  signature TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  canonical_form TEXT NOT NULL,
  ts_utc INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  lab TEXT NOT NULL,
  variant TEXT NOT NULL,
  rules_evaluated TEXT NOT NULL,
  rules_failed TEXT NOT NULL,
  result TEXT NOT NULL,
  receipt_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  receipt_ids TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  signature TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  paused INTEGER NOT NULL DEFAULT 0,
  pause_message TEXT NOT NULL DEFAULT 'Lab is paused. Please wait for instructor.',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_receipts_session ON receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_checklist_tenant ON checklist_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bundles_tenant ON bundles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_magic_tenant ON magic_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
`);

export const db = drizzle(sqlite);

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export const storage = {
  // ---- Tenants ----
  listTenants(): Tenant[] {
    return db.select().from(tenants).all() as Tenant[];
  },
  getTenant(id: string): Tenant | undefined {
    return db.select().from(tenants).where(eq(tenants.id, id)).get() as Tenant | undefined;
  },
  upsertTenant(t: Tenant) {
    const existing = this.getTenant(t.id);
    if (existing) return existing;
    db.insert(tenants).values(t).run();
    return t;
  },

  // ---- Magic links ----
  createMagicLink(m: MagicLink) {
    db.insert(magicLinks).values(m).run();
    return m;
  },
  getMagicLink(token: string): MagicLink | undefined {
    return db.select().from(magicLinks).where(eq(magicLinks.token, token)).get() as MagicLink | undefined;
  },
  consumeMagicLink(token: string) {
    db.update(magicLinks)
      .set({ consumedAt: new Date() })
      .where(eq(magicLinks.token, token))
      .run();
  },
  revokeMagicLink(token: string) {
    db.update(magicLinks)
      .set({ revokedAt: new Date() })
      .where(eq(magicLinks.token, token))
      .run();
  },
  listMagicLinks(): MagicLink[] {
    return db.select().from(magicLinks).orderBy(desc(magicLinks.issuedAt)).all() as MagicLink[];
  },

  // ---- Sessions ----
  createSession(s: Session) {
    db.insert(sessions).values(s).run();
    return s;
  },
  getSession(id: string): Session | undefined {
    return db.select().from(sessions).where(eq(sessions.id, id)).get() as Session | undefined;
  },
  deleteSession(id: string) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
  },
  listSessions(): Session[] {
    return db.select().from(sessions).orderBy(desc(sessions.createdAt)).all() as Session[];
  },

  // ---- Inventory ----
  listInventory(tenantId: string): InventoryItem[] {
    return db.select().from(inventory).where(eq(inventory.tenantId, tenantId)).all() as InventoryItem[];
  },
  getInventoryItem(id: string): InventoryItem | undefined {
    return db.select().from(inventory).where(eq(inventory.id, id)).get() as InventoryItem | undefined;
  },
  createInventoryItem(item: InventoryItem) {
    db.insert(inventory).values(item).run();
    return item;
  },
  updateInventoryStatus(id: string, status: string) {
    db.update(inventory).set({ status }).where(eq(inventory.id, id)).run();
  },

  // ---- Receipts ----
  createReceipt(r: Receipt) {
    db.insert(receipts).values(r).run();
    return r;
  },
  getReceipt(id: string): Receipt | undefined {
    return db.select().from(receipts).where(eq(receipts.id, id)).get() as Receipt | undefined;
  },
  listReceipts(tenantId: string, limit = 100): Receipt[] {
    return db.select().from(receipts)
      .where(eq(receipts.tenantId, tenantId))
      .orderBy(desc(receipts.tsUtc))
      .limit(limit)
      .all() as Receipt[];
  },
  listReceiptsBySession(sessionId: string): Receipt[] {
    return db.select().from(receipts)
      .where(eq(receipts.sessionId, sessionId))
      .orderBy(desc(receipts.tsUtc))
      .all() as Receipt[];
  },

  // ---- Checklist runs ----
  createChecklistRun(c: ChecklistRun) {
    db.insert(checklistRuns).values(c).run();
    return c;
  },
  listChecklistRuns(tenantId: string): ChecklistRun[] {
    return db.select().from(checklistRuns)
      .where(eq(checklistRuns.tenantId, tenantId))
      .orderBy(desc(checklistRuns.createdAt))
      .all() as ChecklistRun[];
  },

  // ---- Bundles ----
  createBundle(b: Bundle) {
    db.insert(bundles).values(b).run();
    return b;
  },
  getBundle(id: string): Bundle | undefined {
    return db.select().from(bundles).where(eq(bundles.id, id)).get() as Bundle | undefined;
  },
  listBundles(tenantId: string): Bundle[] {
    return db.select().from(bundles)
      .where(eq(bundles.tenantId, tenantId))
      .orderBy(desc(bundles.createdAt))
      .all() as Bundle[];
  },

  // ---- Admin state ----
  getAdminState(): AdminState | undefined {
    return db.select().from(adminState).where(eq(adminState.id, "singleton")).get() as AdminState | undefined;
  },
  setAdminState(s: AdminState) {
    const existing = this.getAdminState();
    if (existing) {
      db.update(adminState).set(s).where(eq(adminState.id, "singleton")).run();
    } else {
      db.insert(adminState).values(s).run();
    }
    return s;
  },
  setPaused(paused: boolean, message?: string) {
    const s = this.getAdminState();
    if (!s) return;
    db.update(adminState)
      .set({
        paused,
        pauseMessage: message ?? s.pauseMessage,
        updatedAt: new Date(),
      })
      .where(eq(adminState.id, "singleton"))
      .run();
  },
  updateAdminPassword(passwordHash: string, passwordSalt: string) {
    db.update(adminState)
      .set({ passwordHash, passwordSalt, updatedAt: new Date() })
      .where(eq(adminState.id, "singleton"))
      .run();
  },

  // ---- Reset (admin only) ----
  resetLabData() {
    // Clears trainee data; keeps tenants + admin state.
    db.delete(receipts).run();
    db.delete(checklistRuns).run();
    db.delete(bundles).run();
    db.delete(sessions).run();
    db.delete(magicLinks).run();
    // Re-seed inventory? handled by caller
  },

  resetInventory(tenantId: string) {
    db.delete(inventory).where(eq(inventory.tenantId, tenantId)).run();
  },
};
