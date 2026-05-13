// Receipt writer.
//
// Receipts go to two places:
//   1. Append-only NDJSON file: ~/.beacon/receipts/YYYY-MM-DD.ndjson
//   2. SQLite receipt_index: pointer with byte offset for fast lookup
//
// Order: canonicalize -> sign -> write NDJSON -> index. We index *after*
// the durable write so a crash mid-flight leaves the file truthful and
// the index merely stale (a reindex is safe and idempotent).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ulid } from "ulid";
import { canonicalize } from "../lib/canonical.js";
import { sign, verify } from "./keys.js";

export function createReceiptService(ctx) {
  const { config, db, activeKey } = ctx;

  const insertIdx = db.prepare(`
    INSERT INTO receipt_index
      (receipt_id, ts_utc, user_sub, vendor, model, version,
       event_type, environment, inventory_id, ndjson_path, byte_offset)
    VALUES (@receipt_id, @ts_utc, @user_sub, @vendor, @model, @version,
            @event_type, @environment, @inventory_id, @ndjson_path, @byte_offset)
  `);

  return {
    write(partial) {
      const ts = new Date().toISOString();
      const id = partial.id || ulid();
      const captureMode =
        partial.capture_mode || config.receipts.defaultCaptureMode;

      const base = {
        id,
        ts_utc: ts,
        schema_version: config.receipts.schemaVersion,
        user: partial.user || null,
        vendor: partial.vendor,
        model: partial.model,
        version: partial.version,
        event_type: partial.event_type, // 'invocation' | 'attestation' | 'gate_decision' | 'exception_granted' | 'discovery'
        environment: partial.environment || "unknown",
        latency_ms: partial.latency_ms ?? null,
        tokens: partial.tokens ?? null,
        evidence_id: partial.evidence_id ?? null,
        parent_receipt_id: partial.parent_receipt_id ?? null,
        attributes: partial.attributes ?? null,
      };

      // Capture-mode rules. hash_only never stores prompt/result.
      if (captureMode === "full") {
        base.prompt = partial.prompt ?? null;
        base.result = partial.result ?? null;
      }
      if (partial.prompt != null) {
        base.prompt_hash = sha256Hex(String(partial.prompt));
      }
      if (partial.result != null) {
        base.result_hash = sha256Hex(String(partial.result));
      }

      // Canonicalize *before* attaching the signature block.
      const canonicalBytes = Buffer.from(canonicalize(base), "utf8");
      const signature = {
        alg: config.signing.algorithm,
        key_fpr: activeKey.fingerprint,
        canonical_form: config.signing.canonicalForm,
        sig_b64: sign(activeKey.secretKey, canonicalBytes),
      };

      const receipt = { ...base, signature };

      // Append durable, then index.
      const day = ts.slice(0, 10);
      const ndjsonPath = path.join(
        config.dataDir,
        "receipts",
        `${day}.ndjson`
      );
      const line = JSON.stringify(receipt) + "\n";
      const offset = fs.existsSync(ndjsonPath)
        ? fs.statSync(ndjsonPath).size
        : 0;
      fs.appendFileSync(ndjsonPath, line);

      insertIdx.run({
        receipt_id: receipt.id,
        ts_utc: receipt.ts_utc,
        user_sub: receipt.user?.sub || null,
        vendor: receipt.vendor || null,
        model: receipt.model || null,
        version: receipt.version || null,
        event_type: receipt.event_type,
        environment: receipt.environment || null,
        inventory_id: partial.inventory_id || null,
        ndjson_path: ndjsonPath,
        byte_offset: offset,
      });

      return receipt;
    },

    getById(receiptId) {
      const row = db
        .prepare(
          `SELECT ndjson_path, byte_offset FROM receipt_index WHERE receipt_id = ?`
        )
        .get(receiptId);
      if (!row) return null;
      return readReceiptAt(row.ndjson_path, row.byte_offset);
    },

    verifyById(receiptId) {
      const r = this.getById(receiptId);
      if (!r) return { found: false };
      const { signature, ...rest } = r;
      const canonicalBytes = Buffer.from(canonicalize(rest), "utf8");
      const ok = verify(activeKey.publicKey, canonicalBytes, signature.sig_b64);
      return {
        found: true,
        receipt_id: r.id,
        key_fpr: signature.key_fpr,
        active_key_fpr: activeKey.fingerprint,
        canonical_form: signature.canonical_form,
        signature_verifies: ok,
      };
    },

    list({ limit = 100, eventType, userSub, inventoryId } = {}) {
      const where = [];
      const args = {};
      if (eventType) {
        where.push("event_type = @eventType");
        args.eventType = eventType;
      }
      if (userSub) {
        where.push("user_sub = @userSub");
        args.userSub = userSub;
      }
      if (inventoryId) {
        where.push("inventory_id = @inventoryId");
        args.inventoryId = inventoryId;
      }
      const sql = `
        SELECT receipt_id, ts_utc, user_sub, vendor, model, version,
               event_type, environment, inventory_id
        FROM receipt_index
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY ts_utc DESC
        LIMIT @limit
      `;
      return db.prepare(sql).all({ ...args, limit });
    },
  };
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function readReceiptAt(filePath, byteOffset) {
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(fd);
    const length = Math.min(stat.size - byteOffset, 1024 * 1024);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, byteOffset);
    const nl = buf.indexOf(0x0a);
    const slice = nl === -1 ? buf : buf.subarray(0, nl);
    return JSON.parse(slice.toString("utf8"));
  } finally {
    fs.closeSync(fd);
  }
}
