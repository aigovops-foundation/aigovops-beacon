// Thin client for the Beacon API. The Vite dev server proxies /api to
// http://127.0.0.1:8787. In production, the Studio is served from the
// same origin as the API.

const BASE = "/api/v1";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  version: () => call("GET", "/version"),
  discover: (source, payload) =>
    call("POST", "/discover", { source, payload }),
  inventory: () => call("GET", "/inventory"),
  setTier: (id, tier) => call("POST", `/inventory/${id}/trust`, { tier }),
  receipts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return call("GET", "/receipts" + (qs ? `?${qs}` : ""));
  },
  verifyReceipt: (id) => call("GET", `/receipts/${id}/verify`),
  checklists: () => call("GET", "/checklists"),
  checklist: (id) => call("GET", `/checklists/${id}`),
  attest: (body) => call("POST", "/checklists/attest", body),
  score: (packId, inventoryId) =>
    call("GET", `/checklists/${packId}/score/${inventoryId}`),
  runGate: (body) => call("POST", "/gate/production-readiness", body),
  exportBundle: (body) => call("POST", "/export", body),
};
