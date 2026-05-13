import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/lib/config.js";

function withCleanBeaconEnv(fn) {
  const prev = {
    BEACON_DATA_DIR: process.env.BEACON_DATA_DIR,
    BEACON_HOST: process.env.BEACON_HOST,
    BEACON_PORT: process.env.BEACON_PORT,
    BEACON_CAPTURE_MODE: process.env.BEACON_CAPTURE_MODE,
  };
  delete process.env.BEACON_DATA_DIR;
  delete process.env.BEACON_HOST;
  delete process.env.BEACON_PORT;
  delete process.env.BEACON_CAPTURE_MODE;
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("loadConfig uses defaults when no config file exists", () =>
  withCleanBeaconEnv(() => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-config-"));
    process.env.BEACON_DATA_DIR = dataDir;

    const config = loadConfig();

    assert.equal(config.dataDir, dataDir);
    assert.equal(config.server.host, "127.0.0.1");
    assert.equal(config.server.port, 8787);
    assert.equal(config.receipts.defaultCaptureMode, "redacted");
    assert.ok(path.isAbsolute(config.policy.productionReadinessRego));
    assert.ok(path.isAbsolute(config.policy.transactionSigningRego));

    fs.rmSync(dataDir, { recursive: true, force: true });
  }));

test("loadConfig merges config file and applies env overrides", () =>
  withCleanBeaconEnv(() => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-config-"));
    const yamlPath = path.join(dataDir, "config.yaml");
    fs.writeFileSync(
      yamlPath,
      [
        "server:",
        "  host: 10.0.0.1",
        "  port: 9999",
        "  corsOrigins:",
        "    - https://example.org",
        "receipts:",
        "  defaultCaptureMode: full",
        "policy:",
        "  productionReadinessRego: policy/rego/custom.rego",
      ].join("\n")
    );

    process.env.BEACON_DATA_DIR = dataDir;
    process.env.BEACON_HOST = "0.0.0.0";
    process.env.BEACON_PORT = "7777";
    process.env.BEACON_CAPTURE_MODE = "hash_only";

    const config = loadConfig();

    assert.equal(config.dataDir, dataDir);
    assert.equal(config.server.host, "0.0.0.0");
    assert.equal(config.server.port, 7777);
    assert.deepEqual(config.server.corsOrigins, ["https://example.org"]);
    assert.equal(config.receipts.defaultCaptureMode, "hash_only");
    assert.ok(
      config.policy.productionReadinessRego.endsWith(
        path.join("policy", "rego", "custom.rego")
      )
    );

    fs.rmSync(dataDir, { recursive: true, force: true });
  }));

test("loadConfig tolerates malformed config files", () =>
  withCleanBeaconEnv(() => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-config-"));
    fs.writeFileSync(path.join(dataDir, "config.yaml"), "server: [oops");
    process.env.BEACON_DATA_DIR = dataDir;

    const config = loadConfig();
    assert.equal(config.server.port, 8787);
    assert.equal(config.receipts.defaultCaptureMode, "redacted");

    fs.rmSync(dataDir, { recursive: true, force: true });
  }));
