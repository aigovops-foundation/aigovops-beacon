#!/usr/bin/env node
// AIGovOps Beacon — public hosted MCP server.
// Apache-2.0.
//
// One Node process. Two HTTP servers:
//   - INTERNAL :BEACON_PORT  Beacon core REST API (loopback only)
//   - PUBLIC   :PORT         MCP-SSE + /healthz + read-only /api/v1 proxy
//
// Demo-scoped. Ephemeral disk. Public read, MCP tools may write to the
// embedded Beacon (signed receipts) but those receipts live only as long
// as the Render dyno. This is the wire-protocol playground, not evidence
// of record. See ../mcp-public/README.md for posture.

import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PORT         = parseInt(process.env.PORT || "8080", 10);
const BEACON_PORT  = parseInt(process.env.BEACON_PORT || "8787", 10);
const DATA_DIR     = process.env.BEACON_DATA_DIR || "/tmp/beacon-public";
const PUBLIC_MODE  = process.env.PUBLIC_MODE !== "0";

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ---------- 1. Boot embedded Beacon core ----------

console.log(`[mcp-public] starting embedded Beacon core on :${BEACON_PORT}`);

// First: init the data dir (idempotent — server cli.js init is safe to re-run).
await new Promise((resolveInit, rejectInit) => {
  const init = spawn(
    process.execPath,
    [resolve(ROOT, "server/src/cli.js"), "init"],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, BEACON_DATA_DIR: DATA_DIR, BEACON_PORT: String(BEACON_PORT) },
    }
  );
  init.on("exit", (code) => {
    if (code === 0) resolveInit();
    else rejectInit(new Error(`beacon init exited ${code}`));
  });
});

const beacon = spawn(
  process.execPath,
  [resolve(ROOT, "server/src/index.js")],
  {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      BEACON_DATA_DIR: DATA_DIR,
      BEACON_PORT: String(BEACON_PORT),
      BEACON_HOST: "127.0.0.1",
    },
  }
);
beacon.on("exit", (code) => {
  console.error(`[mcp-public] embedded Beacon exited ${code} — terminating wrapper`);
  process.exit(code || 1);
});

// Wait for Beacon /api/v1/health
async function waitForBeacon(maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${BEACON_PORT}/api/v1/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Beacon core failed to become ready");
}
await waitForBeacon();
console.log(`[mcp-public] embedded Beacon ready on :${BEACON_PORT}`);

// ---------- 2. Load MCP tool registry, point at embedded Beacon ----------

const { tools } = await import(resolve(ROOT, "mcp/tools/index.js"));
const BEACON_URL = `http://127.0.0.1:${BEACON_PORT}`;

const SERVER_NAME = "aigovops-beacon-mcp-public";
const SERVER_VERSION = "2.3.0";
const PROTOCOL_VERSION = "2024-11-05";

async function dispatch(req) {
  const { id, method, params } = req;
  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {}, logging: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };
    }
    if (method === "notifications/initialized") return null;
    if (method === "tools/list") {
      return {
        jsonrpc: "2.0", id,
        result: {
          tools: Object.values(tools).map((t) => ({
            name: t.name, description: t.description, inputSchema: t.inputSchema,
          })),
        },
      };
    }
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      const tool = tools[name];
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      const result = await tool.handler(args || {}, { beaconUrl: BEACON_URL });
      return {
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false },
      };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    throw new Error(`Method not found: ${method}`);
  } catch (err) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: err.message || String(err) } };
  }
}

// ---------- 3. Public HTTP server (MCP-SSE + healthz + REST proxy) ----------

const sessions = new Map();

// Crude in-memory rate limiter — 60 req / IP / minute on writes.
const writeBuckets = new Map();
function allowWrite(ip) {
  const now = Date.now();
  const bucket = writeBuckets.get(ip) || { ts: now, count: 0 };
  if (now - bucket.ts > 60_000) { bucket.ts = now; bucket.count = 0; }
  bucket.count++;
  writeBuckets.set(ip, bucket);
  return bucket.count <= 60;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string";
  res.writeHead(status, {
    "Content-Type": isJson ? "application/json" : "text/plain; charset=utf-8",
    ...corsHeaders, ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders); res.end(); return; }

  // Banner
  if (req.method === "GET" && req.url === "/") {
    return send(res, 200, {
      name: SERVER_NAME, version: SERVER_VERSION, ok: true,
      transport: "sse", beacon: "embedded",
      endpoints: { sse: "/sse", messages: "/messages?sid=...", rpc: "/rpc", health: "/healthz", ready: "/readyz", api: "/api/v1/*" },
      tools: Object.keys(tools),
      docs: "https://github.com/bobrapp/aigovops-beacon/tree/main/mcp-public",
    });
  }

  if (req.method === "GET" && req.url === "/healthz") {
    return send(res, 200, { ok: true, name: SERVER_NAME, version: SERVER_VERSION, sessions: sessions.size });
  }

  if (req.method === "GET" && req.url === "/readyz") {
    try {
      const r = await fetch(`${BEACON_URL}/api/v1/health`);
      return send(res, r.ok ? 200 : 503, { ok: r.ok, beacon: r.ok });
    } catch (e) { return send(res, 503, { ok: false, error: String(e) }); }
  }

  // MCP-SSE handshake
  if (req.method === "GET" && req.url.startsWith("/sse")) {
    const sessionId = Math.random().toString(36).slice(2);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders,
    });
    res.write(`event: endpoint\ndata: /messages?sid=${sessionId}\n\n`);
    sessions.set(sessionId, { res });
    const heartbeat = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch {}
    }, 25_000);
    req.on("close", () => { clearInterval(heartbeat); sessions.delete(sessionId); });
    return;
  }

  // MCP-SSE inbox
  if (req.method === "POST" && req.url.startsWith("/messages")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sid = url.searchParams.get("sid");
    const session = sessions.get(sid);
    if (!session) { res.writeHead(404, corsHeaders).end(); return; }
    const ip = req.socket.remoteAddress || "?";
    if (!allowWrite(ip)) { res.writeHead(429, corsHeaders).end(); return; }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let rpcReq;
      try { rpcReq = JSON.parse(body); }
      catch { res.writeHead(400, corsHeaders).end(); return; }
      const rpcRes = await dispatch(rpcReq);
      res.writeHead(202, corsHeaders).end();
      if (rpcRes !== null) session.res.write(`event: message\ndata: ${JSON.stringify(rpcRes)}\n\n`);
    });
    return;
  }

  // Synchronous JSON-RPC endpoint — used by the Cloudflare Worker agent.
  // POST /rpc { jsonrpc, id, method, params } → 200 { jsonrpc, id, result|error }
  if (req.method === "POST" && req.url === "/rpc") {
    const ip = req.socket.remoteAddress || "?";
    if (!allowWrite(ip)) { res.writeHead(429, corsHeaders).end(); return; }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let rpcReq;
      try { rpcReq = JSON.parse(body); }
      catch { return send(res, 400, { error: "invalid JSON" }); }
      const rpcRes = await dispatch(rpcReq);
      send(res, 200, rpcRes ?? { jsonrpc: "2.0", id: rpcReq.id, result: {} });
    });
    return;
  }

  // Beacon REST proxy (read-only in PUBLIC_MODE)
  if (req.url.startsWith("/api/v1/")) {
    if (PUBLIC_MODE && req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, { error: "Read-only in public mode. Use MCP /sse for governed writes." });
    }
    const target = `${BEACON_URL}${req.url}`;
    try {
      const upstream = await fetch(target, { method: req.method, headers: { Accept: "application/json" } });
      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", ...corsHeaders });
      res.end(text);
    } catch (e) { return send(res, 502, { error: String(e) }); }
    return;
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mcp-public] public MCP-SSE listening on :${PORT}`);
  console.log(`[mcp-public] PUBLIC_MODE=${PUBLIC_MODE ? "on (REST read-only)" : "off"}`);
});

function shutdown(sig) {
  console.log(`[mcp-public] ${sig} received, shutting down`);
  try { beacon.kill("SIGTERM"); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
