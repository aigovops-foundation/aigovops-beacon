// AIGovOps Beacon MCP tools.
// Each tool: { name, description, inputSchema (JSON Schema), handler(args, ctx) -> any }.
// Apache-2.0.

import http from "node:http";
import https from "node:https";

function fetchJson(url, { method = "GET", body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = data ? JSON.parse(data) : {};
            if (res.statusCode >= 400)
              reject(new Error(`HTTP ${res.statusCode}: ${json.error || data}`));
            else resolve(json);
          } catch (e) {
            // Beacon core may be offline — in lab mode we degrade to a simulated response.
            resolve({ _offline: true, _status: res.statusCode, _body: data });
          }
        });
      }
    );
    req.on("error", (e) =>
      // Offline-tolerant: return a structured response so MCP clients still see a result.
      resolve({ _offline: true, _error: e.message })
    );
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function nowIso() {
  return new Date().toISOString();
}

import { createHash } from "node:crypto";
function hash(s) {
  return "sha256:" + createHash("sha256").update(s).digest("hex");
}

export const tools = {
  record_decision: {
    name: "record_decision",
    description:
      "Record a governance decision and emit a signed Beacon receipt. " +
      "Use when an approver decides to ship, hold, or roll back an AI capability against a framework control.",
    inputSchema: {
      type: "object",
      required: ["approver", "framework", "controls", "decision", "scope"],
      properties: {
        approver: { type: "string", description: "Email or opaque ID of the human approver." },
        framework: {
          type: "string",
          description: "Framework key from frameworks/index.yaml (e.g. nist-ai-rmf-1.0).",
        },
        controls: {
          type: "array",
          items: { type: "string" },
          description: "Control IDs covered (e.g. ['MAP-2.1', 'MEASURE-3.4']).",
        },
        decision: {
          type: "string",
          enum: ["yes-ship", "yes-steady", "yes-recover", "hold", "rollback"],
          description: "YES-Ship / YES-Steady / YES-Recover or a hold/rollback.",
        },
        scope: {
          type: "string",
          description: "What this decision applies to (model name, app name, dataset, etc.).",
        },
        rationale: { type: "string", description: "Short rationale, stored hashed." },
      },
    },
    async handler(args, { beaconUrl }) {
      const payload = {
        ts: nowIso(),
        source: "mcp.record_decision",
        approver: args.approver,
        framework: args.framework,
        controls: args.controls,
        decision: args.decision,
        scope: args.scope,
        rationale_hash: args.rationale ? hash(args.rationale) : null,
      };
      const res = await fetchJson(`${beaconUrl}/api/decisions`, {
        method: "POST",
        body: payload,
      });
      if (res._offline) {
        return {
          ok: true,
          mode: "offline-simulation",
          receipt_id: "sim:" + Date.now(),
          ts: payload.ts,
          summary: `Decision recorded (simulated; Beacon core unreachable at ${beaconUrl}). Decision: ${args.decision}, framework: ${args.framework}, controls: ${args.controls.join(", ")}.`,
        };
      }
      return res;
    },
  },

  verify_receipt: {
    name: "verify_receipt",
    description:
      "Verify a Beacon receipt by id or content hash. Returns signature validity, chain-of-custody, and the framework/control mapping.",
    inputSchema: {
      type: "object",
      properties: {
        receipt_id: { type: "string", description: "The receipt's opaque id." },
        content_hash: {
          type: "string",
          description: "Hex content hash (sha256:...). Either receipt_id or content_hash required.",
        },
      },
    },
    async handler(args, { beaconUrl }) {
      const qs = new URLSearchParams();
      if (args.receipt_id) qs.set("id", args.receipt_id);
      if (args.content_hash) qs.set("hash", args.content_hash);
      const res = await fetchJson(`${beaconUrl}/api/receipts/verify?${qs}`);
      if (res._offline) {
        return {
          ok: false,
          mode: "offline-simulation",
          message:
            "Beacon core unreachable. In lab mode this would return signature validity, the prev_hash chain, and the framework/control mapping for the receipt.",
        };
      }
      return res;
    },
  },

  query_inventory: {
    name: "query_inventory",
    description:
      "Return the discovered AI-service inventory. Filter by source (extension/dns/casb), window (e.g. '7d'), or risk level.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["extension", "dns", "casb", "ebpf", "vpc", "all"],
          description: "Discovery layer to filter on. Default 'all'.",
        },
        window: { type: "string", description: "Time window (e.g. '24h', '7d', '30d'). Default '7d'." },
        risk: {
          type: "string",
          enum: ["any", "low", "medium", "high"],
          description: "Risk level filter. Default 'any'.",
        },
      },
    },
    async handler(args, { beaconUrl }) {
      const qs = new URLSearchParams({
        source: args.source || "all",
        window: args.window || "7d",
        risk: args.risk || "any",
      });
      const res = await fetchJson(`${beaconUrl}/api/inventory?${qs}`);
      if (res._offline) {
        return {
          mode: "offline-simulation",
          message: "Beacon core unreachable; returning shape only.",
          shape: {
            services: [
              {
                hostname: "chatgpt.com",
                first_seen: "2026-05-01T...",
                last_seen: "2026-05-13T...",
                receipt_count: 0,
                sources: ["extension", "dns"],
                risk: "medium",
              },
            ],
          },
        };
      }
      return res;
    },
  },

  score_framework: {
    name: "score_framework",
    description:
      "Score the current organization against a framework checklist. Returns overall score, per-control results, and gap list.",
    inputSchema: {
      type: "object",
      required: ["framework"],
      properties: {
        framework: { type: "string", description: "Framework key (e.g. nist-ai-rmf-1.0)." },
        scope: { type: "string", description: "Optional scope filter (model/app/dataset)." },
      },
    },
    async handler(args, { beaconUrl }) {
      const qs = new URLSearchParams({ framework: args.framework });
      if (args.scope) qs.set("scope", args.scope);
      const res = await fetchJson(`${beaconUrl}/api/score?${qs}`);
      if (res._offline) {
        return {
          mode: "offline-simulation",
          framework: args.framework,
          message:
            "Beacon core unreachable; in lab mode would return { score: 0..100, controls: [{id, status, evidence_receipts: [...]}], gaps: [...] }.",
        };
      }
      return res;
    },
  },

  bundle_for_auditor: {
    name: "bundle_for_auditor",
    description:
      "Produce a verifiable receipt bundle for a date range and framework. Returns a download URL and the Merkle root.",
    inputSchema: {
      type: "object",
      required: ["from", "to"],
      properties: {
        from: { type: "string", description: "ISO date or '7d ago'." },
        to: { type: "string", description: "ISO date or 'now'." },
        framework: { type: "string", description: "Optional framework filter." },
        scope: { type: "string", description: "Optional scope filter." },
      },
    },
    async handler(args, { beaconUrl }) {
      const res = await fetchJson(`${beaconUrl}/api/bundles`, {
        method: "POST",
        body: {
          from: args.from,
          to: args.to,
          framework: args.framework || null,
          scope: args.scope || null,
        },
      });
      if (res._offline) {
        return {
          mode: "offline-simulation",
          message:
            "Beacon core unreachable; in lab mode would return { url, merkle_root, sig, receipt_count, size_bytes }.",
        };
      }
      return res;
    },
  },

  replay_case: {
    name: "replay_case",
    description:
      "Replay one of the 100 historical AI failure cases (docs/data/ai_failures_top100.json) against current controls and emit a decision receipt. Useful for regression testing the framework scorer.",
    inputSchema: {
      type: "object",
      required: ["case_id"],
      properties: {
        case_id: {
          type: ["string", "integer"],
          description: "Numeric id (1..100) or slug (e.g. 'itutor-group-hiring-bias').",
        },
        framework: { type: "string", description: "Framework to score against. Default nist-ai-rmf-1.0." },
      },
    },
    async handler(args, { beaconUrl }) {
      const res = await fetchJson(`${beaconUrl}/api/replay`, {
        method: "POST",
        body: {
          case_id: args.case_id,
          framework: args.framework || "nist-ai-rmf-1.0",
        },
      });
      if (res._offline) {
        return {
          mode: "offline-simulation",
          case_id: args.case_id,
          message:
            "Beacon core unreachable; in lab mode would return { case, classification: 'YES-Ship|YES-Steady|YES-Recover', controls_that_would_have_caught_it: [...], receipt_id }.",
        };
      }
      return res;
    },
  },
};
