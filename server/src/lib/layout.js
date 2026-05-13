// Ensures the on-disk layout for Beacon's data directory.
//
//   ~/.beacon/
//     beacon.sqlite          SQLite database (inventory, attestations, jobs)
//     keys/                  Ed25519 signing keys, one file per generation
//     receipts/              Append-only NDJSON, one file per UTC day
//     anchors.ndjson         Hourly Merkle anchors
//     bundles/               Generated audit-export tarballs
//     config.yaml            Optional, hand-edited config

import fs from "node:fs";
import path from "node:path";

const SUBDIRS = ["keys", "receipts", "bundles"];

export async function ensureLayout(config) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  for (const sub of SUBDIRS) {
    fs.mkdirSync(path.join(config.dataDir, sub), { recursive: true });
  }
  const anchors = path.join(config.dataDir, "anchors.ndjson");
  if (!fs.existsSync(anchors)) fs.writeFileSync(anchors, "");
}
