// Beacon HTTP API surface. Versioned at /api/v1.
//
// Auth: v0.1 trusts a header-supplied identity (X-Beacon-User-Sub,
// X-Beacon-User-Email, X-Beacon-OIDC-Issuer) so an upstream proxy can
// inject the verified OIDC claims. Deploy behind that proxy. Direct
// internet exposure without OIDC is not a supported configuration.

import express from "express";
import { createInventoryService } from "../services/inventory.js";
import { createReceiptService } from "../services/receipts.js";
import { createDiscoveryService } from "../services/discovery.js";
import { createChecklistService } from "../services/checklists.js";
import { createGateService } from "../services/policies.js";
import { createExportService } from "../services/export.js";

export function createRouter(ctx) {
  const router = express.Router();

  // Identity middleware — pull from headers, do not invent.
  router.use((req, _res, next) => {
    req.user = {
      sub: req.header("X-Beacon-User-Sub") || null,
      email: req.header("X-Beacon-User-Email") || null,
      oidc_issuer: req.header("X-Beacon-OIDC-Issuer") || null,
    };
    next();
  });

  const inventoryService = createInventoryService(ctx);
  const receiptService = createReceiptService(ctx);
  const checklistService = createChecklistService({
    ...ctx,
    receiptService,
  });
  const discoveryService = createDiscoveryService({
    ...ctx,
    inventoryService,
    receiptService,
  });
  const gateService = createGateService({
    ...ctx,
    inventoryService,
    receiptService,
    checklistService,
  });
  const exportService = createExportService(ctx);

  // ─── Health and version ───────────────────────────────────────────────
  router.get("/health", (_req, res) => res.json({ ok: true }));
  router.get("/version", (_req, res) =>
    res.json({
      version: ctx.config.beaconVersion,
      schema_version: ctx.config.receipts.schemaVersion,
      key_fingerprint: ctx.activeKey.fingerprint,
    })
  );

  // ─── Discovery ────────────────────────────────────────────────────────
  router.post("/discover", asyncH(async (req, res) => {
    const { source, payload } = req.body || {};
    if (!source) return res.status(400).json({ error: "missing_source" });
    const result = await discoveryService.run({
      source,
      payload: payload || {},
      user: req.user,
    });
    res.json(result);
  }));

  // ─── Inventory ────────────────────────────────────────────────────────
  router.get("/inventory", (_req, res) => res.json(inventoryService.list()));

  router.get("/inventory/:id", (req, res) => {
    const row = inventoryService.getById(req.params.id);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  });

  router.post("/inventory", (req, res) => {
    const { vendor, model, version, environment } = req.body || {};
    if (!vendor || !model || !version || !environment) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const row = inventoryService.upsert({
      vendor,
      model,
      version,
      environment,
      discoverySrc: "api",
    });
    res.status(row.isNew ? 201 : 200).json(row);
  });

  router.post("/inventory/:id/trust", (req, res) => {
    const { tier } = req.body || {};
    const ok = inventoryService.setTier(req.params.id, tier);
    if (!ok) return res.status(404).json({ error: "not_found" });
    receiptService.write({
      user: req.user,
      vendor: "n/a",
      model: "n/a",
      version: "n/a",
      environment: "audit",
      event_type: "trust_tier_change",
      inventory_id: req.params.id,
      attributes: { new_tier: tier },
    });
    res.json({ ok: true });
  });

  // ─── Receipts ─────────────────────────────────────────────────────────
  router.post("/receipts", (req, res) => {
    const b = req.body || {};
    if (!b.vendor || !b.model || !b.version || !b.event_type) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const r = receiptService.write({ ...b, user: req.user });
    res.status(201).json(r);
  });

  router.get("/receipts", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    res.json(
      receiptService.list({
        limit,
        eventType: req.query.event_type,
        userSub: req.query.user_sub,
        inventoryId: req.query.inventory_id,
      })
    );
  });

  router.get("/receipts/:id", (req, res) => {
    const r = receiptService.getById(req.params.id);
    if (!r) return res.status(404).json({ error: "not_found" });
    res.json(r);
  });

  router.get("/receipts/:id/verify", (req, res) => {
    const v = receiptService.verifyById(req.params.id);
    if (!v.found) return res.status(404).json({ error: "not_found" });
    res.json(v);
  });

  // ─── Checklists ───────────────────────────────────────────────────────
  router.get("/checklists", (_req, res) => res.json(checklistService.list()));
  router.get("/checklists/:id", (req, res) => {
    const p = checklistService.get(req.params.id);
    if (!p) return res.status(404).json({ error: "not_found" });
    res.json(p);
  });
  router.post("/checklists/attest", (req, res) => {
    const { inventory_id, pack_id, item_id, answer, evidence_uri } =
      req.body || {};
    const out = checklistService.attest({
      inventoryId: inventory_id,
      packId: pack_id,
      itemId: item_id,
      answer,
      evidenceUri: evidence_uri,
      user: req.user,
    });
    res.status(201).json(out);
  });
  router.get(
    "/checklists/:packId/score/:inventoryId",
    (req, res) => {
      const s = checklistService.score(
        req.params.inventoryId,
        req.params.packId
      );
      if (!s) return res.status(404).json({ error: "not_found" });
      res.json(s);
    }
  );

  // ─── Gate ─────────────────────────────────────────────────────────────
  router.post("/gate/production-readiness", (req, res) => {
    const { inventory_id, tier_target, applicable_packs } = req.body || {};
    if (!inventory_id) return res.status(400).json({ error: "missing_fields" });
    const out = gateService.evaluateProductionReadiness({
      inventoryId: inventory_id,
      tierTarget: tier_target,
      applicablePacks: applicable_packs || [
        "nist-ai-rmf",
        "iso-iec-42001",
        "human-flourishing",
      ],
      user: req.user,
    });
    res.json(out);
  });

  // ─── Export ───────────────────────────────────────────────────────────
  router.post("/export", (req, res) => {
    const { inventory_id, from_date, to_date } = req.body || {};
    const out = exportService.build({
      inventoryId: inventory_id,
      fromDate: from_date,
      toDate: to_date,
      user: req.user,
    });
    res.status(201).json(out);
  });

  return router;
}

function asyncH(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
