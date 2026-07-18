#!/usr/bin/env node
// Beacon command-line companion. Five verbs, no surprises.
//
//   beacon init                Create ~/.beacon and the first signing key
//   beacon keygen [--rotate]   Mint a new Ed25519 key
//   beacon serve               Same as `npm start`
//   beacon seed                Insert example inventory + attestations
//   beacon verify <bundle>     Independently verify an exported bundle

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./lib/config.js";
import { ensureLayout } from "./lib/layout.js";
import { openDatabase } from "./services/db.js";
import {
  loadOrCreateActiveKey,
  generateAndPersistKey,
  verify,
} from "./services/keys.js";
import { canonicalize } from "./lib/canonical.js";

const cmd = process.argv[2];

async function main() {
  const config = loadConfig();
  await ensureLayout(config);

  switch (cmd) {
    case "init": {
      const db = openDatabase(config);
      const key = await loadOrCreateActiveKey(config, db);
      console.log(`Beacon initialized.`);
      console.log(`  data dir: ${config.dataDir}`);
      console.log(`  key fpr:  ${key.fingerprint}`);
      break;
    }
    case "keygen": {
      const key = generateAndPersistKey(config);
      console.log(`New active key: ${key.fingerprint}`);
      console.log(`Created at:     ${key.createdAt}`);
      console.log(
        `Remember: a T3 human must sign the rotation receipt in the Studio.`
      );
      break;
    }
    case "serve": {
      const { bootstrap } = await import("./index.js");
      await bootstrap();
      break;
    }
    case "seed": {
      await runSeed(config);
      break;
    }
    case "verify": {
      const bundlePath = process.argv[3];
      if (!bundlePath) {
        console.error("Usage: beacon verify <bundle_dir>");
        process.exit(2);
      }
      await runVerify(bundlePath);
      break;
    }
    default:
      console.error(
        "Usage: beacon <init|keygen|serve|seed|verify <bundle_dir>>"
      );
      process.exit(2);
  }
}

async function runSeed(config) {
  const db = openDatabase(config);
  const key = await loadOrCreateActiveKey(config, db);

  const { createInventoryService } = await import("./services/inventory.js");
  const { createReceiptService } = await import("./services/receipts.js");
  const inv = createInventoryService({ db });
  const rec = createReceiptService({ config, db, activeKey: key });

  const user = {
    sub: "demo|alice",
    email: "alice@example.org",
    oidc_issuer: "https://accounts.example.org",
  };

  const rows = [
    { vendor: "OpenAI", model: "gpt-4o-mini", version: "2024-07-18", environment: "production" },
    { vendor: "Anthropic", model: "claude-sonnet-4", version: "2025-02-20", environment: "production" },
    { vendor: "Google", model: "gemini-2.5-pro", version: "2025-03-25", environment: "staging" },
    { vendor: "Mistral", model: "mistral-large", version: "2407", environment: "dev" },
  ];
  for (const r of rows) {
    const row = inv.upsert({ ...r, discoverySrc: "seed" });
    rec.write({
      user,
      vendor: row.vendor,
      model: row.model,
      version: row.version,
      environment: row.environment,
      event_type: "discovery",
      inventory_id: row.id,
      attributes: { source: "seed" },
    });
    rec.write({
      user,
      vendor: row.vendor,
      model: row.model,
      version: row.version,
      environment: row.environment,
      event_type: "invocation",
      inventory_id: row.id,
      prompt: "Summarize the AiGovOps Foundation operating thesis.",
      result:
        "Agents do the bureaucracy; humans hold moral legitimacy.",
      latency_ms: 412,
      tokens: { in: 18, out: 11 },
    });
  }
  console.log(`Seeded ${rows.length} inventory rows and ${rows.length * 2} receipts.`);
}

async function runVerify(bundlePath) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(bundlePath, "manifest.json"), "utf8")
  );
  console.log(`Bundle generated at: ${manifest.generated_at_utc}`);
  console.log(`Active key fpr:      ${manifest.active_key_fingerprint}`);

  const pubPath = path.join(
    bundlePath,
    "public_keys",
    `${manifest.active_key_fingerprint}.pem`
  );
  const crypto = await import("node:crypto");
  const pubKey = crypto.createPublicKey(fs.readFileSync(pubPath, "utf8"));
  const raw = pubKey.export({ format: "der", type: "spki" });
  // Strip 12-byte SPKI prefix for Ed25519 to get the 32 raw bytes.
  const publicKey = raw.subarray(raw.length - 32);

  let ok = 0;
  let bad = 0;
  const receiptDir = path.join(bundlePath, "receipts");
  for (const f of fs.readdirSync(receiptDir)) {
    for (const line of fs
      .readFileSync(path.join(receiptDir, f), "utf8")
      .split("\n")
      .filter(Boolean)) {
      const r = JSON.parse(line);
      const { signature, ...rest } = r;
      const bytes = Buffer.from(canonicalize(rest), "utf8");
      if (verify(publicKey, bytes, signature.sig_b64)) ok++;
      else bad++;
    }
  }
  console.log(`Receipts verified: ${ok}, failed: ${bad}`);
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
