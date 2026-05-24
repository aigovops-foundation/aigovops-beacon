import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage, db as drizzleDb } from "./storage";
import { inventory as inventoryTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import { bootstrap, TENANT_SEEDS, reseedTenantInventory } from "./seed";
import {
  buildAndSignReceipt,
  verifyReceipt,
  evaluateChecklist,
  RULES_LEVEL_100,
  RULES_LEVEL_200,
  buildBundle,
  verifyBundle,
} from "./beacon";
import {
  randomToken,
  ulid,
  hashPassword,
  verifyPassword,
} from "./crypto";
import { insertInventorySchema, insertMagicLinkSchema } from "@shared/schema";
import type { Session, InventoryItem } from "@shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8h

function getBearerToken(req: Request): string | null {
  const auth = req.header("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });
  const s = storage.getSession(token);
  if (!s) return res.status(401).json({ error: "Invalid session" });
  if (s.expiresAt.getTime() < Date.now()) {
    storage.deleteSession(token);
    return res.status(401).json({ error: "Session expired" });
  }
  (req as any).session = s;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireSession(req, res, () => {
    const s = (req as any).session as Session;
    if (!s.isAdmin) return res.status(403).json({ error: "Admin required" });
    next();
  });
}

function checkNotPaused(req: Request, res: Response, next: NextFunction) {
  const s = (req as any).session as Session | undefined;
  if (s?.isAdmin) return next(); // admins bypass pause
  const state = storage.getAdminState();
  if (state?.paused) {
    return res.status(503).json({ error: "paused", message: state.pauseMessage });
  }
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Bootstrap with ADMIN_PASSWORD from env (default "beacon" for local dev)
  const adminPassword = process.env.ADMIN_PASSWORD || "beacon";
  bootstrap(adminPassword);

  // -------------------------------------------------------------------------
  // Public — status & tenants list (so login screen can show options)
  // -------------------------------------------------------------------------

  app.get("/api/status", (_req, res) => {
    const state = storage.getAdminState();
    const tenants = storage.listTenants().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      ein: t.ein,
      keyFingerprint: t.keyFingerprint,
      publicKey: t.signingPublicKey,
    }));
    res.json({
      labName: process.env.LAB_NAME || "AIGovOps Beacon Lab",
      paused: state?.paused ?? false,
      pauseMessage: state?.pauseMessage ?? "",
      tenants,
    });
  });

  // -------------------------------------------------------------------------
  // Admin login
  // -------------------------------------------------------------------------

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== "string") return res.status(400).json({ error: "Password required" });
    const state = storage.getAdminState();
    if (!state) return res.status(500).json({ error: "Admin state not initialized" });
    const ok = verifyPassword(password, state.passwordSalt, state.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid admin password" });
    const token = randomToken();
    const now = new Date();
    const session: Session = {
      id: token,
      tenantId: "_admin",
      label: "Administrator",
      role: "admin",
      isAdmin: true,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    };
    storage.createSession(session);
    res.json({ token, session });
  });

  // -------------------------------------------------------------------------
  // Trainee magic-link redemption (consumes link, creates session)
  // -------------------------------------------------------------------------

  app.post("/api/login", (req, res) => {
    const { token } = req.body ?? {};
    if (typeof token !== "string") return res.status(400).json({ error: "Token required" });
    const link = storage.getMagicLink(token);
    if (!link) return res.status(401).json({ error: "Invalid or unknown token" });
    if (link.revokedAt) return res.status(401).json({ error: "Token revoked" });
    if (link.consumedAt) return res.status(401).json({ error: "Token already used" });
    if (link.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ error: "Token expired" });
    }
    storage.consumeMagicLink(token);
    const sessionToken = randomToken();
    const now = new Date();
    const session: Session = {
      id: sessionToken,
      tenantId: link.tenantId,
      label: link.label,
      role: link.role,
      isAdmin: false,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    };
    storage.createSession(session);
    res.json({ token: sessionToken, session });
  });

  app.get("/api/me", requireSession, (req, res) => {
    const s = (req as any).session as Session;
    const tenant = s.isAdmin ? null : storage.getTenant(s.tenantId);
    res.json({
      session: s,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            description: tenant.description,
            ein: tenant.ein,
            keyFingerprint: tenant.keyFingerprint,
            publicKey: tenant.signingPublicKey,
          }
        : null,
    });
  });

  app.post("/api/logout", requireSession, (req, res) => {
    const s = (req as any).session as Session;
    storage.deleteSession(s.id);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Admin — pause/resume/reset/rotate-password
  // -------------------------------------------------------------------------

  app.post("/api/admin/pause", requireAdmin, (req, res) => {
    const message = typeof req.body?.message === "string"
      ? req.body.message
      : "Lab is paused. Please wait for instructor.";
    storage.setPaused(true, message);
    res.json({ ok: true });
  });

  app.post("/api/admin/resume", requireAdmin, (_req, res) => {
    storage.setPaused(false);
    res.json({ ok: true });
  });

  app.post("/api/admin/reset", requireAdmin, (_req, res) => {
    storage.resetLabData();
    for (const t of TENANT_SEEDS) {
      reseedTenantInventory(t.id);
    }
    res.json({ ok: true });
  });

  app.post("/api/admin/rotate-password", requireAdmin, (req, res) => {
    const { newPassword } = req.body ?? {};
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const { hash, salt } = hashPassword(newPassword);
    storage.updateAdminPassword(hash, salt);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Admin — magic links
  // -------------------------------------------------------------------------

  app.post("/api/admin/issue-link", requireAdmin, (req, res) => {
    const parsed = insertMagicLinkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const t = storage.getTenant(parsed.data.tenantId);
    if (!t) return res.status(400).json({ error: "Unknown tenant" });
    const now = new Date();
    const token = randomToken(24);
    storage.createMagicLink({
      token,
      tenantId: parsed.data.tenantId,
      label: parsed.data.label,
      email: parsed.data.email ?? null,
      role: parsed.data.role,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + parsed.data.ttlMinutes * 60 * 1000),
      consumedAt: null,
      revokedAt: null,
    });
    res.json({ token });
  });

  app.get("/api/admin/links", requireAdmin, (_req, res) => {
    res.json({ links: storage.listMagicLinks() });
  });

  app.post("/api/admin/revoke-link", requireAdmin, (req, res) => {
    const { token } = req.body ?? {};
    if (typeof token !== "string") return res.status(400).json({ error: "Token required" });
    storage.revokeMagicLink(token);
    res.json({ ok: true });
  });

  app.get("/api/admin/sessions", requireAdmin, (_req, res) => {
    res.json({ sessions: storage.listSessions() });
  });

  app.get("/api/admin/receipts/:tenantId", requireAdmin, (req, res) => {
    res.json({ receipts: storage.listReceipts(String(req.params.tenantId)) });
  });

  // -------------------------------------------------------------------------
  // Lab APIs — trainee-facing
  // -------------------------------------------------------------------------

  app.get("/api/inventory", requireSession, checkNotPaused, (req, res) => {
    const s = (req as any).session as Session;
    res.json({ items: storage.listInventory(s.tenantId) });
  });

  app.get("/api/tenant/keys", requireSession, (req, res) => {
    const s = (req as any).session as Session;
    const t = storage.getTenant(s.tenantId);
    if (!t) return res.status(404).json({ error: "No tenant" });
    res.json({ publicKey: t.signingPublicKey, keyFingerprint: t.keyFingerprint });
  });

  // Discovery — Lab 100 step 1: sign a discovery.scan receipt
  app.post("/api/lab/discover", requireSession, checkNotPaused, (req, res) => {
    const s = (req as any).session as Session;
    const items = storage.listInventory(s.tenantId);
    const receipt = buildAndSignReceipt({
      tenantId: s.tenantId,
      sessionId: s.id,
      userSub: s.id,
      userEmail: `${s.label.toLowerCase().replace(/\s+/g, ".")}@trainee.lab`,
      eventType: "discovery.scan",
      controlRefs: ["NIST-AI-RMF:MAP-1.1"],
      subject: {
        name: "ai-program-inventory",
        data: JSON.stringify(items.map((i) => ({ id: i.id, name: i.name, vendor: i.vendor }))),
      },
      decision: {
        result: "pass",
        rulesEvaluated: ["discovery.completeness"],
        rulesFailed: [],
      },
      extra: { itemCount: items.length },
    });
    res.json({ receipt, itemCount: items.length });
  });

  // Checklist — Lab 100 or Lab 200
  app.post("/api/lab/checklist", requireSession, checkNotPaused, (req, res) => {
    const s = (req as any).session as Session;
    const { lab, variant } = req.body ?? {};
    const labLevel = lab === "200" ? "200" : "100";
    const rules = labLevel === "200" ? RULES_LEVEL_200 : RULES_LEVEL_100;
    const items = storage.listInventory(s.tenantId);
    const evalResult = evaluateChecklist(items, rules);

    const receipt = buildAndSignReceipt({
      tenantId: s.tenantId,
      sessionId: s.id,
      userSub: s.id,
      userEmail: `${s.label.toLowerCase().replace(/\s+/g, ".")}@trainee.lab`,
      eventType: evalResult.overall === "pass" ? "gate.evaluated" : "gate.failed",
      controlRefs: rules.map((r) => r.controlRef),
      subject: {
        name: `checklist-${labLevel}`,
        data: JSON.stringify(evalResult),
      },
      decision: {
        result: evalResult.overall === "pass" ? "pass" : "fail",
        rulesEvaluated: evalResult.rulesEvaluated,
        rulesFailed: evalResult.rulesFailed,
      },
      extra: { lab: labLevel, variant: variant ?? "default" },
    });

    storage.createChecklistRun({
      id: ulid(),
      tenantId: s.tenantId,
      sessionId: s.id,
      lab: labLevel,
      variant: variant ?? "default",
      rulesEvaluated: evalResult.rulesEvaluated,
      rulesFailed: evalResult.rulesFailed,
      result: evalResult.overall,
      receiptId: receipt.id,
      createdAt: new Date(),
    });

    res.json({ result: evalResult, receipt });
  });

  // Update inventory (Lab 200 "fix the failing item" exercise)
  app.patch("/api/inventory/:id", requireSession, checkNotPaused, (req, res) => {
    const s = (req as any).session as Session;
    const item = storage.getInventoryItem(String(req.params.id));
    if (!item || item.tenantId !== s.tenantId) {
      return res.status(404).json({ error: "Not found" });
    }
    const { metadata, status, riskTier } = req.body ?? {};
    const newItem: InventoryItem = {
      ...item,
      metadata: metadata ?? item.metadata,
      status: status ?? item.status,
      riskTier: riskTier ?? item.riskTier,
    };
    drizzleDb
      .update(inventoryTable)
      .set({
        metadata: newItem.metadata,
        status: newItem.status,
        riskTier: newItem.riskTier,
      })
      .where(eq(inventoryTable.id, item.id))
      .run();

    // Issue a design.modified receipt
    const receipt = buildAndSignReceipt({
      tenantId: s.tenantId,
      sessionId: s.id,
      userSub: s.id,
      userEmail: `${s.label.toLowerCase().replace(/\s+/g, ".")}@trainee.lab`,
      eventType: "design.modified",
      controlRefs: item.controlRefs,
      subject: {
        name: `inventory:${item.name}`,
        data: JSON.stringify({ before: item, after: newItem }),
      },
      decision: { result: "pass", rulesEvaluated: ["design.review"], rulesFailed: [] },
      extra: { itemId: item.id },
    });
    res.json({ item: newItem, receipt });
  });

  // Bundle — create a signed bundle of receipts
  app.post("/api/lab/bundle", requireSession, checkNotPaused, (req, res) => {
    const s = (req as any).session as Session;
    const { receiptIds } = req.body ?? {};
    let ids: string[];
    if (Array.isArray(receiptIds) && receiptIds.length > 0) {
      ids = receiptIds.map(String);
    } else {
      // Default: bundle all receipts from this session
      ids = storage.listReceiptsBySession(s.id).map((r) => r.id);
    }
    if (ids.length === 0) {
      return res.status(400).json({ error: "No receipts to bundle" });
    }
    const bundle = buildBundle(s.tenantId, s.id, ids);
    res.json({ bundle });
  });

  // Verify a receipt
  app.get("/api/lab/verify/receipt/:id", requireSession, (req, res) => {
    const r = storage.getReceipt(String(req.params.id));
    if (!r) return res.status(404).json({ error: "Not found" });
    const t = storage.getTenant(r.tenantId);
    if (!t) return res.status(404).json({ error: "Tenant missing" });
    const result = verifyReceipt(r, t);
    res.json({ receipt: r, ...result });
  });

  // Verify a bundle
  app.get("/api/lab/verify/bundle/:id", requireSession, (req, res) => {
    const result = verifyBundle(String(req.params.id));
    res.json(result);
  });

  // List bundles
  app.get("/api/lab/bundles", requireSession, (req, res) => {
    const s = (req as any).session as Session;
    res.json({ bundles: storage.listBundles(s.tenantId) });
  });

  // Receipts for the current session
  app.get("/api/lab/receipts", requireSession, (req, res) => {
    const s = (req as any).session as Session;
    res.json({ receipts: storage.listReceiptsBySession(s.id) });
  });

  // Policy-as-Code editor (Lab 200) — evaluate a custom rule set
  app.post("/api/lab/policy-eval", requireSession, checkNotPaused, (req, res) => {
    const s = (req as any).session as Session;
    const { rules } = req.body ?? {};
    if (!Array.isArray(rules)) return res.status(400).json({ error: "rules[] required" });

    const customRules = rules
      .map((r: any, idx: number) => {
        if (!r || typeof r.id !== "string" || typeof r.field !== "string" || typeof r.op !== "string") {
          return null;
        }
        return {
          id: r.id,
          description: r.description ?? `Custom rule ${idx + 1}`,
          controlRef: r.controlRef ?? "custom",
          evaluate: (item: InventoryItem) => evalCustomRule(item, r),
        };
      })
      .filter(Boolean) as any[];

    const items = storage.listInventory(s.tenantId);
    const result = evaluateChecklist(items, customRules);

    const receipt = buildAndSignReceipt({
      tenantId: s.tenantId,
      sessionId: s.id,
      userSub: s.id,
      userEmail: `${s.label.toLowerCase().replace(/\s+/g, ".")}@trainee.lab`,
      eventType: result.overall === "pass" ? "gate.evaluated" : "gate.failed",
      controlRefs: ["custom.policy-as-code"],
      subject: {
        name: "policy-as-code-eval",
        data: JSON.stringify({ rules: customRules.map((r) => r.id), result }),
      },
      decision: {
        result: result.overall === "pass" ? "pass" : "fail",
        rulesEvaluated: result.rulesEvaluated,
        rulesFailed: result.rulesFailed,
      },
      extra: { lab: "200", variant: "policy-as-code", customRuleCount: customRules.length },
    });

    res.json({ result, receipt });
  });

  return httpServer;
}

// ---------------------------------------------------------------------------
// Policy-as-Code: evaluate a single user-supplied rule against an inventory item.
// Rule shape: { id, field: "riskTier" | "status" | "version" | "metadata.X", op: "equals"|"notEquals"|"in"|"notIn"|"exists"|"truthy", value?: any }
// ---------------------------------------------------------------------------

function evalCustomRule(item: InventoryItem, rule: any): boolean {
  let val: unknown;
  if (rule.field.startsWith("metadata.")) {
    const key = rule.field.slice("metadata.".length);
    val = (item.metadata as Record<string, unknown>)?.[key];
  } else {
    val = (item as any)[rule.field];
  }
  switch (rule.op) {
    case "equals":
      return val === rule.value;
    case "notEquals":
      return val !== rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(val);
    case "notIn":
      return Array.isArray(rule.value) && !rule.value.includes(val);
    case "exists":
      return val !== undefined && val !== null && val !== "";
    case "truthy":
      return Boolean(val);
    default:
      return true; // unknown op = ignore
  }
}
