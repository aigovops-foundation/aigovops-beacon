// Discovery — how Beacon finds AI models that are running on your
// network. The v0.1 surface is intentionally modest: three sources that
// every team has within reach, none of which need agents installed on
// endpoints.
//
//   1. http_proxy_log     — parse access logs that already exist
//                           (NGINX, Envoy, an API gateway) for known
//                           AI vendor hostnames.
//   2. dns_query_log      — parse DNS resolver logs for the same set.
//   3. manual_csv         — accept a CSV the auditor already has.
//
// Each emits a discovery receipt. Inventory is upserted from the
// discovery payload.

import fs from "node:fs";
import readline from "node:readline";

const VENDOR_HOSTS = [
  { vendor: "OpenAI", host: "api.openai.com" },
  { vendor: "OpenAI", host: "openai.azure.com" },
  { vendor: "Anthropic", host: "api.anthropic.com" },
  { vendor: "Google", host: "generativelanguage.googleapis.com" },
  { vendor: "Google", host: "aiplatform.googleapis.com" },
  { vendor: "Mistral", host: "api.mistral.ai" },
  { vendor: "Cohere", host: "api.cohere.ai" },
  { vendor: "Perplexity", host: "api.perplexity.ai" },
  { vendor: "AWS Bedrock", host: "bedrock-runtime.amazonaws.com" },
  { vendor: "Databricks", host: "databricks.com" },
  { vendor: "Hugging Face", host: "api-inference.huggingface.co" },
];

export function createDiscoveryService(ctx) {
  const { inventoryService, receiptService } = ctx;

  return {
    async run({ source, payload, user }) {
      let hits = [];
      if (source === "http_proxy_log") {
        hits = await scanProxyLog(payload.path);
      } else if (source === "dns_query_log") {
        hits = await scanDnsLog(payload.path);
      } else if (source === "manual_csv") {
        hits = parseManualCsv(payload.content);
      } else {
        throw Object.assign(new Error(`unknown discovery source: ${source}`), {
          statusCode: 400,
          code: "unknown_source",
        });
      }

      const upserted = [];
      for (const h of hits) {
        const row = inventoryService.upsert({
          vendor: h.vendor,
          model: h.model || "unknown",
          version: h.version || "unspecified",
          environment: h.environment || "unknown",
          discoverySrc: source,
        });
        receiptService.write({
          user,
          vendor: row.vendor,
          model: row.model,
          version: row.version,
          environment: row.environment,
          event_type: "discovery",
          inventory_id: row.id,
          attributes: { source, evidence: h.evidence ?? null },
        });
        upserted.push(row);
      }

      return {
        scanned: hits.length,
        new_inventory_rows: upserted.filter((r) => r.isNew).length,
        touched_inventory_rows: upserted.filter((r) => !r.isNew).length,
        results: upserted,
      };
    },
  };
}

async function scanProxyLog(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const seen = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    for (const v of VENDOR_HOSTS) {
      if (line.includes(v.host)) {
        const key = `${v.vendor}|${v.host}`;
        if (!seen.has(key)) {
          seen.set(key, {
            vendor: v.vendor,
            model: hostToModelGuess(v.host),
            version: "unspecified",
            environment: process.env.BEACON_ENV || "production",
            evidence: { host: v.host, source: "http_proxy_log" },
          });
        }
      }
    }
  }
  return [...seen.values()];
}

async function scanDnsLog(filePath) {
  // DNS logs typically resolve to host only — same matcher, different
  // input shape. We keep it identical for v0.1.
  return scanProxyLog(filePath);
}

function parseManualCsv(content) {
  if (!content) return [];
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines.shift().split(",").map((h) => h.trim().toLowerCase());
  return lines.map((line) => {
    const cells = splitCsv(line);
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] || "").trim()));
    return {
      vendor: row.vendor || "unknown",
      model: row.model || "unknown",
      version: row.version || "unspecified",
      environment: row.environment || "unknown",
      evidence: { source: "manual_csv" },
    };
  });
}

function splitCsv(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function hostToModelGuess(host) {
  if (host.includes("openai")) return "gpt (family unknown)";
  if (host.includes("anthropic")) return "claude (family unknown)";
  if (host.includes("googleapis")) return "gemini (family unknown)";
  if (host.includes("mistral")) return "mistral (family unknown)";
  if (host.includes("cohere")) return "command (family unknown)";
  if (host.includes("perplexity")) return "sonar (family unknown)";
  if (host.includes("bedrock")) return "bedrock (family unknown)";
  if (host.includes("huggingface")) return "hf-inference (family unknown)";
  return "unknown";
}
