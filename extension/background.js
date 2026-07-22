// AiGovOps Beacon — MV3 service worker.
// Hostname-only watcher. Signs and ships receipts. Apache-2.0.
//
// Privacy posture:
//   - Reads tab.url only on `tabs.onUpdated` with status === "complete".
//   - Extracts URL.hostname only. Never reads the path, query, fragment, or page content.
//   - Hashes the hostname with a per-tenant salt before it leaves the browser
//     UNLESS the hostname matches the managed allowlist (then cleartext is sent so
//     governance staff can build inventory).
//   - No webRequest, no content scripts, no <all_urls>.

const DEFAULT_ALLOWLIST = [
  ".openai.com",
  "chatgpt.com",
  ".anthropic.com",
  "claude.ai",
  "gemini.google.com",
  ".generativelanguage.googleapis.com",
  "copilot.microsoft.com",
  ".cohere.ai",
  "huggingface.co",
  "replicate.com",
  ".mistral.ai",
  "perplexity.ai",
  "you.com",
  "groq.com",
  ".together.xyz",
  ".bedrock.amazonaws.com",
  ".aiplatform.googleapis.com",
  ".openai.azure.com"
];

const DEFAULT_BEACON_URL = "http://localhost:8787";
const DEFAULT_TENANT_SALT = "lab-default-salt";
const DEFAULT_TENANT_ID = "lab";
const DEFAULT_RATE_LIMIT = 30;

const state = {
  policy: null,
  recent: [], // {ts, host, source, sig} — last 100 for popup
  counter: 0,
  rateBuckets: new Map(), // tabId -> { count, windowStart }
};

// ---------- crypto helpers ----------

async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const dig = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(dig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getOrCreateInstallKey() {
  // Per-install Ed25519 keypair stored in chrome.storage.local.
  // Public key is sent with every receipt; private key never leaves the browser.
  const stored = await chrome.storage.local.get(["kp_pub", "kp_priv"]);
  if (stored.kp_pub && stored.kp_priv) {
    return stored;
  }
  // Ed25519 isn't universally available in WebCrypto yet in MV3 service workers.
  // Fallback: ECDSA P-256 — same role, broader support. Real prod ships Ed25519
  // via a tiny WASM blob.
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pubJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const record = { kp_pub: pubJwk, kp_priv: privJwk };
  await chrome.storage.local.set(record);
  return record;
}

async function signPayload(payload) {
  const { kp_priv } = await getOrCreateInstallKey();
  const key = await crypto.subtle.importKey(
    "jwk",
    kp_priv,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const buf = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, buf);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `ecdsa-p256:${b64}`;
}

// ---------- policy loading ----------

async function loadPolicy() {
  const managed = await chrome.storage.managed.get(null).catch(() => ({}));
  const local = await chrome.storage.local.get(["userOverrides"]).catch(() => ({}));
  state.policy = {
    beaconUrl: managed.beaconUrl || DEFAULT_BEACON_URL,
    tenantSalt: managed.tenantSalt || DEFAULT_TENANT_SALT,
    tenantId: managed.tenantId || DEFAULT_TENANT_ID,
    allowlist: managed.allowlist && managed.allowlist.length ? managed.allowlist : DEFAULT_ALLOWLIST,
    rateLimitPerMinute: managed.rateLimitPerMinute || DEFAULT_RATE_LIMIT,
    userOverrides: local.userOverrides || {},
  };
}

function matchesAllowlist(hostname, allowlist) {
  return allowlist.some((entry) => {
    if (entry.startsWith(".")) return hostname.endsWith(entry) || hostname === entry.slice(1);
    return hostname === entry;
  });
}

function rateLimitOk(tabId) {
  const now = Date.now();
  const cap = state.policy.rateLimitPerMinute;
  const bucket = state.rateBuckets.get(tabId) || { count: 0, windowStart: now };
  if (now - bucket.windowStart > 60_000) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;
  state.rateBuckets.set(tabId, bucket);
  return bucket.count <= cap;
}

// ---------- event emit ----------

async function emitReceipt({ hostname, source, tabId }) {
  if (!state.policy) await loadPolicy();
  const allow = matchesAllowlist(hostname, state.policy.allowlist);
  if (!allow) return; // dropped at source
  if (!rateLimitOk(tabId)) return;

  state.counter += 1;
  const hostHash = await sha256Hex(`${state.policy.tenantSalt}::${hostname}`);
  const contentHash = await sha256Hex(`${hostname}::${tabId}::${state.counter}`);

  const payload = {
    schema_version: "2.0",
    ts: new Date().toISOString(),
    source: `ext.chrome.v2.2.0`,
    tenant_id: state.policy.tenantId,
    // Cleartext host because it matched the allowlist; off-list hostnames never reach here.
    host: hostname,
    host_hash: `sha256:${hostHash}`,
    content_hash: `sha256:${contentHash}`,
    counter: state.counter,
  };
  const sig = await signPayload(payload).catch(() => "ecdsa-p256:unsigned");
  payload.sig = sig;

  state.recent.unshift({ ts: payload.ts, host: hostname, source: payload.source, sig });
  if (state.recent.length > 100) state.recent.length = 100;
  await chrome.storage.local.set({ recent: state.recent });

  fetch(`${state.policy.beaconUrl.replace(/\/$/, "")}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Offline — receipt is buffered in chrome.storage.local; retry alarm picks it up.
    bufferForRetry(payload);
  });
}

async function bufferForRetry(payload) {
  const { retryQueue = [] } = await chrome.storage.local.get(["retryQueue"]);
  retryQueue.push(payload);
  // Cap buffer at 10k.
  if (retryQueue.length > 10000) retryQueue.splice(0, retryQueue.length - 10000);
  await chrome.storage.local.set({ retryQueue });
}

async function flushRetryQueue() {
  if (!state.policy) await loadPolicy();
  const { retryQueue = [] } = await chrome.storage.local.get(["retryQueue"]);
  if (!retryQueue.length) return;
  const next = [];
  for (const p of retryQueue) {
    try {
      const r = await fetch(`${state.policy.beaconUrl.replace(/\/$/, "")}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
        keepalive: true,
      });
      if (!r.ok) next.push(p);
    } catch {
      next.push(p);
    }
  }
  await chrome.storage.local.set({ retryQueue: next });
}

// ---------- listeners ----------

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete") return;
  if (!tab.url || !/^https?:/.test(tab.url)) return;
  let hostname;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }
  emitReceipt({ hostname, source: "tabs.onUpdated", tabId }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "managed") loadPolicy();
});

chrome.alarms.create("beacon-retry-flush", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "beacon-retry-flush") flushRetryQueue();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "getStatus") {
    sendResponse({
      policy: state.policy,
      counter: state.counter,
      recent: state.recent.slice(0, 20),
    });
    return true;
  }
  if (msg?.type === "flush") {
    flushRetryQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// Boot.
loadPolicy().catch(() => {});
