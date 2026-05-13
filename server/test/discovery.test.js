import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDiscoveryService } from "../src/services/discovery.js";

function makeDiscoveryService() {
  const seen = new Set();
  const writes = [];
  const service = createDiscoveryService({
    inventoryService: {
      upsert(input) {
        const key = `${input.vendor}|${input.model}|${input.version}|${input.environment}`;
        const isNew = !seen.has(key);
        seen.add(key);
        return {
          id: key,
          vendor: input.vendor,
          model: input.model,
          version: input.version,
          environment: input.environment,
          isNew,
        };
      },
    },
    receiptService: {
      write(r) {
        writes.push(r);
      },
    },
  });
  return { service, writes };
}

test("manual_csv source parses rows and writes discovery receipts", async () => {
  const { service, writes } = makeDiscoveryService();
  const result = await service.run({
    source: "manual_csv",
    payload: {
      content:
        "vendor,model,version,environment\nOpenAI,gpt-4.1,v1,prod\n,custom,,",
    },
    user: { sub: "u-1" },
  });

  assert.equal(result.scanned, 2);
  assert.equal(result.new_inventory_rows, 2);
  assert.equal(result.touched_inventory_rows, 0);
  assert.equal(result.results[0].vendor, "OpenAI");
  assert.equal(result.results[1].vendor, "unknown");
  assert.equal(result.results[1].version, "unspecified");
  assert.equal(result.results[1].environment, "unknown");
  assert.equal(writes.length, 2);
  assert.equal(writes[0].event_type, "discovery");
  assert.equal(writes[0].attributes.source, "manual_csv");
});

test("http_proxy_log source de-duplicates host hits and maps model guess", async () => {
  const prevEnv = process.env.BEACON_ENV;
  process.env.BEACON_ENV = "staging";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-discovery-"));
  const logPath = path.join(tmpDir, "proxy.log");
  fs.writeFileSync(
    logPath,
    [
      "GET https://api.openai.com/v1/chat/completions",
      "GET https://api.openai.com/v1/models",
      "GET https://api.anthropic.com/v1/messages",
    ].join("\n")
  );

  const { service } = makeDiscoveryService();
  const result = await service.run({
    source: "http_proxy_log",
    payload: { path: logPath },
    user: { sub: "u-2" },
  });

  assert.equal(result.scanned, 2);
  assert.equal(result.new_inventory_rows, 2);
  assert.equal(
    result.results.find((r) => r.vendor === "OpenAI")?.model,
    "gpt (family unknown)"
  );
  assert.equal(
    result.results.find((r) => r.vendor === "Anthropic")?.environment,
    "staging"
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (prevEnv == null) delete process.env.BEACON_ENV;
  else process.env.BEACON_ENV = prevEnv;
});

test("unknown discovery source returns a typed 400 error", async () => {
  const { service } = makeDiscoveryService();
  await assert.rejects(
    () => service.run({ source: "nope", payload: {}, user: { sub: "u-3" } }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, "unknown_source");
      return true;
    }
  );
});
