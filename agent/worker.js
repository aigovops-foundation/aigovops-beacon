// aigovops-beacon-agent — Cloudflare Worker.
// Apache-2.0.
//
// A deliberately restricted agent. Universe of tools = the six AiGovOps
// Beacon governance tools, pulled from the hosted Beacon MCP `tools/list`.
// No web search, no shell, no file system. Every tool call produces a
// signed Beacon receipt the user's auditor can verify offline.
//
// BYO API key. The Worker forwards the user's Anthropic or OpenAI key on
// every request and never stores it. See ./README.md.

const SYSTEM_PROMPT = `You are the AiGovOps Beacon Governance Agent.

You are restricted to six tools — and only six:
  • record_decision     — emit a signed YES-Ship / YES-Steady / YES-Recover / hold / rollback receipt
  • verify_receipt      — cryptographically verify a Beacon receipt
  • query_inventory     — list discovered AI services
  • score_framework     — score a framework's checklist against the AI inventory
  • bundle_for_auditor  — produce a verifiable receipt bundle for a date window
  • replay_case         — replay one of the historical failure cases

Hard rules:
  1. Do not invent or imagine other tools (no web search, no email, no shell, no code execution).
  2. If the user asks for something outside this scope, explain politely that you only operate on
     AiGovOps Beacon governance data, and offer the closest tool that fits.
  3. Prefer one tool call at a time. Read the result, then decide.
  4. Every claim you make about the inventory, receipts, frameworks, or bundles MUST come from a
     tool call in this conversation. Do not fabricate counts, ids, signatures, or framework names.
  5. Be brief. The audience is busy. End every meaningful response with the next governance action
     the user should consider (in one sentence).

You speak in the YES-Ship / YES-Steady / YES-Recover vocabulary. The product tagline is
"Verifiable AI governance — Apache-2.0, no SaaS lock-in".`;

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>AiGovOps Beacon Agent</title>
<style>
  :root { --bg:#0c1416; --fg:#e6f1f0; --muted:#8aa4a3; --accent:#01696F; --accent2:#4F98A3; --line:#1d2f31; --user:#0f2326; --assistant:#0a181a; --tool:#1a2426; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; height:100%; background:var(--bg); color:var(--fg); font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  a { color: var(--accent2); }
  header { padding:14px 20px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; }
  header h1 { font-size:14px; margin:0; letter-spacing:.02em; }
  header .tag { color:var(--muted); font-size:12px; }
  main { display:grid; grid-template-rows: 1fr auto; height:calc(100% - 51px); }
  #log { padding:16px 20px; overflow-y:auto; }
  .msg { margin:0 0 12px; padding:10px 14px; border:1px solid var(--line); border-radius:8px; white-space:pre-wrap; }
  .msg.user      { background:var(--user); border-color:#143036; }
  .msg.assistant { background:var(--assistant); }
  .msg.tool      { background:var(--tool); color:#bcd3d2; font-family: ui-monospace, "JetBrains Mono", Menlo, monospace; font-size:12.5px; }
  .msg .who { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-bottom:4px; }
  form { display:flex; gap:8px; padding:12px 20px; border-top:1px solid var(--line); }
  textarea { flex:1; min-height:48px; max-height:200px; padding:10px 12px; background:#0a1416; color:var(--fg); border:1px solid var(--line); border-radius:8px; resize:vertical; font:inherit; }
  button { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:0 16px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.55; cursor:wait; }
  .row { display:flex; gap:10px; align-items:center; padding:10px 20px; border-top:1px solid var(--line); background:#0a1416; font-size:12px; }
  .row label { color:var(--muted); }
  .row input, .row select { background:#0a1416; color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:6px 8px; font:inherit; }
  .row input[type=password] { width: 320px; }
  code { font-family: ui-monospace, "JetBrains Mono", Menlo, monospace; font-size:12.5px; color:#bcd3d2; }
</style>
</head>
<body>
  <header>
    <h1>AiGovOps Beacon · Restricted Agent</h1>
    <span class="tag">six tools · no web · BYO key · every action signed</span>
  </header>
  <main>
    <div id="log"></div>
    <div class="row">
      <label>Provider</label>
      <select id="provider">
        <option value="anthropic">Anthropic (claude-3-5-sonnet)</option>
        <option value="openai">OpenAI (gpt-4o-mini)</option>
      </select>
      <label>API key</label>
      <input id="apiKey" type="password" placeholder="sk-... or sk-ant-..." autocomplete="off" />
      <span class="tag" id="mcp"></span>
    </div>
    <form id="f">
      <textarea id="q" placeholder="Try: show me the AI inventory and bundle the last 30 days for an EU AI Act audit."></textarea>
      <button id="send" type="submit">Send</button>
    </form>
  </main>
<script>
const $ = (id) => document.getElementById(id);
const log = $("log");
const messages = [];

function add(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role === "tool" ? "tool" : role;
  const body = document.createElement("div");
  body.textContent = text;
  div.appendChild(who); div.appendChild(body);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

fetch("/mcp-info").then(r=>r.json()).then(j => { $("mcp").textContent = "MCP: " + j.mcpUrl; });

document.getElementById("f").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const q = $("q").value.trim();
  if (!q) return;
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) { add("tool", "Paste your Anthropic or OpenAI key first."); return; }
  add("user", q);
  $("q").value = "";
  $("send").disabled = true;
  messages.push({ role: "user", content: q });
  try {
    const r = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, apiKey, provider: $("provider").value }),
    });
    if (!r.ok) { add("tool", "error: " + r.status + " " + (await r.text())); $("send").disabled=false; return; }
    const j = await r.json();
    for (const ev of (j.trace || [])) {
      if (ev.kind === "tool_use")    add("tool", "→ " + ev.name + " " + JSON.stringify(ev.input));
      if (ev.kind === "tool_result") add("tool", "← " + truncate(ev.output, 800));
    }
    if (j.final) {
      add("assistant", j.final);
      messages.push({ role: "assistant", content: j.final });
    } else if (j.error) {
      add("tool", "error: " + j.error);
    }
  } catch (e) {
    add("tool", "fetch failed: " + e.message);
  } finally {
    $("send").disabled = false;
  }
});

function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + " …(" + s.length + " chars)" : s; }
</script>
</body></html>`;

// ---- MCP wire helpers ----------------------------------------------------

async function mcpRpc(env, method, params) {
  const url = `${env.MCP_URL}/rpc`;
  const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || {} });
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!r.ok) throw new Error(`MCP ${method} HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`MCP ${method}: ${j.error.message}`);
  return j.result;
}

async function listAllowedTools(env) {
  const r = await mcpRpc(env, "tools/list", {});
  return r.tools;
}

async function callTool(env, name, args) {
  const r = await mcpRpc(env, "tools/call", { name, arguments: args });
  // r.content is an array of {type:"text", text:"..."}
  const text = (r.content || []).map((c) => c.text || "").join("");
  return text;
}

// ---- Anthropic loop ------------------------------------------------------

async function runAnthropic(env, apiKey, userMessages, mcpTools) {
  const tools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
  const messages = userMessages.map((m) => ({ role: m.role, content: m.content }));
  const trace = [];
  const allowedNames = new Set(mcpTools.map((t) => t.name));
  const maxHops = parseInt(env.MAX_HOPS || "6", 10);

  for (let hop = 0; hop < maxHops; hop++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const blocks = j.content || [];
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { final: text, trace };
    }
    const toolResults = [];
    for (const tu of toolUses) {
      if (!allowedNames.has(tu.name)) {
        trace.push({ kind: "tool_use",   name: tu.name, input: tu.input, refused: true });
        trace.push({ kind: "tool_result", output: `REFUSED: '${tu.name}' is not in the allowed Beacon tool set. Allowed: ${[...allowedNames].join(", ")}` });
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `REFUSED: '${tu.name}' is not allowed.`, is_error: true });
        continue;
      }
      trace.push({ kind: "tool_use", name: tu.name, input: tu.input });
      let out;
      try { out = await callTool(env, tu.name, tu.input || {}); }
      catch (e) { out = `MCP error: ${e.message}`; }
      trace.push({ kind: "tool_result", output: out });
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: toolResults });
  }
  return { final: "(max hops reached — stopping.)", trace };
}

// ---- OpenAI loop ---------------------------------------------------------

async function runOpenAI(env, apiKey, userMessages, mcpTools) {
  const tools = mcpTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const m of userMessages) messages.push({ role: m.role, content: m.content });
  const trace = [];
  const allowedNames = new Set(mcpTools.map((t) => t.name));
  const maxHops = parseInt(env.MAX_HOPS || "6", 10);

  for (let hop = 0; hop < maxHops; hop++) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
      }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error("openai: no message");
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (calls.length === 0) return { final: msg.content || "", trace };

    for (const c of calls) {
      const name = c.function.name;
      let args = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch {}
      if (!allowedNames.has(name)) {
        trace.push({ kind: "tool_use",   name, input: args, refused: true });
        trace.push({ kind: "tool_result", output: `REFUSED: '${name}' not in allowed Beacon tool set.` });
        messages.push({ role: "tool", tool_call_id: c.id, content: `REFUSED: '${name}' is not allowed.` });
        continue;
      }
      trace.push({ kind: "tool_use", name, input: args });
      let out;
      try { out = await callTool(env, name, args); }
      catch (e) { out = `MCP error: ${e.message}`; }
      trace.push({ kind: "tool_result", output: out });
      messages.push({ role: "tool", tool_call_id: c.id, content: out });
    }
  }
  return { final: "(max hops reached — stopping.)", trace };
}

// ---- HTTP entry point ----------------------------------------------------

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/") {
      return new Response(INDEX_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (req.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true, name: env.AGENT_NAME, mcp: env.MCP_URL });
    }
    if (req.method === "GET" && url.pathname === "/mcp-info") {
      try {
        const tools = await listAllowedTools(env);
        return Response.json({ mcpUrl: env.MCP_URL, tools: tools.map((t) => t.name) });
      } catch (e) {
        return Response.json({ mcpUrl: env.MCP_URL, error: String(e) }, { status: 502 });
      }
    }
    if (req.method === "POST" && url.pathname === "/chat") {
      let body;
      try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
      const { messages, apiKey, provider } = body || {};
      if (!apiKey || !Array.isArray(messages)) return new Response("missing apiKey or messages", { status: 400 });
      try {
        const mcpTools = await listAllowedTools(env);
        const out = provider === "openai"
          ? await runOpenAI(env, apiKey, messages, mcpTools)
          : await runAnthropic(env, apiKey, messages, mcpTools);
        return Response.json(out);
      } catch (e) {
        return Response.json({ error: String(e?.message || e) }, { status: 500 });
      }
    }
    return new Response("not found", { status: 404 });
  },
};
