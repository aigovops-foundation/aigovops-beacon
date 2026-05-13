// Beacon config resolution.
//
// Precedence, highest first:
//   1. Environment variables.
//   2. ~/.beacon/config.yaml.
//   3. Defaults defined in this file.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

const DEFAULTS = {
  beaconVersion: "0.1.0",
  dataDir: path.join(os.homedir(), ".beacon"),
  server: {
    host: "127.0.0.1",
    port: 8787,
    corsOrigins: ["http://localhost:5173"], // Vite default for the Studio
    logFormat: "tiny",
  },
  signing: {
    algorithm: "Ed25519",
    canonicalForm: "RFC8785",
    rotationDays: 90,
  },
  receipts: {
    defaultCaptureMode: "redacted", // hash_only | redacted | full
    schemaVersion: "1.0.0",
    anchorIntervalMinutes: 60,
  },
  policy: {
    productionReadinessRego:
      "policy/rego/production_readiness.rego",
    transactionSigningRego:
      "policy/rego/transaction_signing.rego",
  },
};

export function loadConfig() {
  const dataDir =
    process.env.BEACON_DATA_DIR || DEFAULTS.dataDir;

  const fileConfig = readConfigFile(path.join(dataDir, "config.yaml"));

  const merged = deepMerge(DEFAULTS, { ...fileConfig, dataDir });

  // Env overrides for the few values most likely to be tweaked.
  if (process.env.BEACON_HOST) merged.server.host = process.env.BEACON_HOST;
  if (process.env.BEACON_PORT)
    merged.server.port = Number(process.env.BEACON_PORT);
  if (process.env.BEACON_CAPTURE_MODE)
    merged.receipts.defaultCaptureMode = process.env.BEACON_CAPTURE_MODE;

  // Resolve repo-relative paths.
  merged.repoRoot = findRepoRoot();
  merged.policy.productionReadinessRego = path.resolve(
    merged.repoRoot,
    merged.policy.productionReadinessRego
  );
  merged.policy.transactionSigningRego = path.resolve(
    merged.repoRoot,
    merged.policy.transactionSigningRego
  );

  return merged;
}

function readConfigFile(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return YAML.parse(fs.readFileSync(p, "utf8")) || {};
  } catch {
    return {};
  }
}

function deepMerge(a, b) {
  if (b === undefined) return a;
  if (typeof a !== "object" || a === null) return b;
  if (typeof b !== "object" || b === null) return b;
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
  return out;
}

function findRepoRoot() {
  // Walk up from this file until we see a checklists/ directory.
  let dir = path.dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "checklists"))) return dir;
    dir = path.dirname(dir);
  }
  // Fallback: cwd.
  return process.cwd();
}
