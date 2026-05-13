#!/usr/bin/env node
// AIGovOps Beacon — MCP server (stdio + SSE)
// Apache-2.0. Speaks the Model Context Protocol (JSON-RPC 2.0).
//
// Transports:
//   stdio  — default. Use this from Claude Desktop / Cursor / Continue / Goose / Zed.
//   sse    — set MCP_TRANSPORT=sse and MCP_PORT (default 8799). For remote agents.
//
// Tools exposed:
//   record_decision    — write a signed governance decision receipt
//   verify_receipt     — verify a receipt by id or hash, return chain-of-custody
//   query_inventory    — list discovered AI services
//   score_framework    — run a framework checklist and return score + gaps
//   bundle_for_auditor — produce a verifiable receipt bundle
//   replay_case        — replay one of the 100 historical failure cases
//
// Talks to Beacon core at BEACON_URL (default http://localhost:8787).
// Zero-dep — uses only Node stdlib.

import http from "node:http";
import { stdin, stdout, env } from "node:process";
import readlinePkg from "node:readline";
import { tools } from "./tools/index.js";

const BEACON_URL = env.BEACON_URL || "http://localhost:8787";
const TRANSPORT = env.MCP_TRANSPORT || "stdio";
const PORT = parseInt(env.MCP_PORT || "8799", 10);
const SERVER_NAME = "aigovops-beacon";
const SERVER_VERSION = "2.2.0";
const PROTOCOL_VERSION = "2024-11-05";

// ---------- JSON-RPC dispatch ----------

async function dispatch(req) {
  const { id, method, params } = req;

  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {}, logging: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };
    }

    if (method === "notifications/initialized") {
      return null; // notification, no response
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: Object.values(tools).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
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
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false,
        },
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    throw new Error(`Method not found: ${method}`);
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err.message || String(err) },
    };
  }
}

// ---------- stdio transport ----------

function runStdio() {
  const rl = readlinePkg.createInterface({ input: stdin });
  rl.on("line", async (line) => {
    line = line.trim();
    if (!line) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }
    const res = await dispatch(req);
    if (res !== null) {
      stdout.write(JSON.stringify(res) + "\n");
    }
  });
  rl.on("close", () => process.exit(0));
}

// ---------- SSE transport ----------

function runSse() {
  const sessions = new Map(); // sessionId -> { res }

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url.startsWith("/sse")) {
      const sessionId = Math.random().toString(36).slice(2);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`event: endpoint\ndata: /messages?sid=${sessionId}\n\n`);
      sessions.set(sessionId, { res });
      req.on("close", () => sessions.delete(sessionId));
      return;
    }

    if (req.method === "POST" && req.url.startsWith("/messages")) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sid = url.searchParams.get("sid");
      const session = sessions.get(sid);
      if (!session) {
        res.writeHead(404).end();
        return;
      }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        let rpcReq;
        try {
          rpcReq = JSON.parse(body);
        } catch {
          res.writeHead(400).end();
          return;
        }
        const rpcRes = await dispatch(rpcReq);
        res.writeHead(202).end();
        if (rpcRes !== null) {
          session.res.write(`event: message\ndata: ${JSON.stringify(rpcRes)}\n\n`);
        }
      });
      return;
    }

    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          name: SERVER_NAME,
          version: SERVER_VERSION,
          transport: "sse",
          sessions: sessions.size,
        })
      );
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(PORT, () => {
    console.error(`[aigovops-beacon-mcp] SSE listening on :${PORT}`);
    console.error(`[aigovops-beacon-mcp] BEACON_URL=${BEACON_URL}`);
  });
}

// ---------- main ----------

if (TRANSPORT === "sse") runSse();
else runStdio();
