/**
 * beacon-lab.js — Beacon Lab web components bundle.
 *
 * Defines three custom elements:
 *   <beacon-lab-step level="100" rule-id="L100.R1">
 *   <beacon-lab-inventory tenant-id="...">
 *   <beacon-lab-receipt receipt-id="...">
 *
 * No build step. Loaded as <script type="module"> from CDN.
 * Requires beacon-lab-bridge.js loaded first (for getToken()).
 *
 * Brand palette:
 *   teal       #01696f
 *   signal-green #2ecc71
 *   ink        #0c2226
 *   paper      #fbfaf6
 */

const API_BASE =
  (typeof window !== "undefined" && window.__BEACON_API_BASE__) ||
  "https://api.beacon-lab.aigovops.foundation";

// Tweetnacl CDN — used by <beacon-lab-receipt> for signature verification.
const NACL_CDN = "https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Fetch from the API, attaching the current JWT if available.
 */
async function apiFetch(path) {
  const token = window.beaconLabBridge?.getToken?.();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

/**
 * Base stylesheet shared across all shadow roots.
 */
const BASE_CSS = `
  :host {
    display: block;
    font-family: Inter, system-ui, sans-serif;
    color: #0c2226;
    background: #fbfaf6;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(1,105,111,0.18);
    margin-bottom: 0.75rem;
    box-sizing: border-box;
  }
  .loading { color: #01696f; font-size: 0.9rem; }
  .error   { color: #c0392b; font-size: 0.9rem; }
  .badge {
    display: inline-block;
    padding: 0.15em 0.55em;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    font-family: 'DM Mono', monospace;
    background: rgba(1,105,111,0.1);
    color: #01696f;
    margin-left: 0.4em;
  }
  .badge.pass { background: rgba(46,204,113,0.15); color: #1a7a3a; }
  .badge.fail { background: rgba(192,57,43,0.12); color: #c0392b; }
`;

// ── 1. <beacon-lab-step> ──────────────────────────────────────────────────────

/**
 * Renders one rule's title, description, control-ref, and a completion checkbox.
 * Reads rules from window.__BEACON_CURRICULUM__ if set (loaded at boot by page),
 * otherwise fetches /api/curriculum/{level} and caches in module scope.
 *
 * Attributes:
 *   level    — "100" or "200"
 *   rule-id  — e.g. "L100.R1"
 *
 * Events:
 *   beacon-step-completed — fired when checkbox changes; detail: { ruleId, checked }
 */

// Module-level curriculum cache so we only fetch once per level.
const _curriculumCache = {};

class BeaconLabStep extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this._render();
  }

  async _render() {
    const level = this.getAttribute("level") || "100";
    const ruleId = this.getAttribute("rule-id") || "";
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="loading">Loading…</span>`;

    try {
      const rule = await this._getRule(level, ruleId);
      if (!rule) {
        this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="error">Rule ${ruleId} not found.</span>`;
        return;
      }

      // Check localStorage for saved completion state.
      const storageKey = `beacon.step.${ruleId}`;
      const checked = localStorage.getItem(storageKey) === "1";

      this.shadowRoot.innerHTML = `
        <style>
          ${BASE_CSS}
          label { display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer; }
          input[type=checkbox] { width: 18px; height: 18px; accent-color: #01696f; flex-shrink: 0; margin-top: 2px; }
          .rule-id { font-family: 'DM Mono', monospace; font-size: 0.78rem; color: #01696f; margin-bottom: 0.25rem; }
          .desc { font-size: 0.95rem; line-height: 1.5; }
          .ctrl { font-size: 0.75rem; color: #5a7a7e; margin-top: 0.3rem; }
        </style>
        <label>
          <input type="checkbox" id="cb" ${checked ? "checked" : ""} />
          <div>
            <div class="rule-id">${escHtml(rule.id)}</div>
            <div class="desc">${escHtml(rule.description)}</div>
            <div class="ctrl">Control: <strong>${escHtml(rule.controlRef)}</strong></div>
          </div>
        </label>
      `;

      this.shadowRoot.getElementById("cb").addEventListener("change", (e) => {
        const v = e.target.checked ? "1" : "0";
        try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
        this.dispatchEvent(new CustomEvent("beacon-step-completed", {
          bubbles: true, composed: true,
          detail: { ruleId, checked: e.target.checked },
        }));
      });
    } catch (err) {
      this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="error">${escHtml(err.message)}</span>`;
    }
  }

  async _getRule(level, ruleId) {
    // Prefer page-provided curriculum (no network needed).
    const pageData = window.__BEACON_CURRICULUM__?.[level];
    if (pageData) return pageData.find((r) => r.id === ruleId) ?? null;

    // Fetch and cache.
    if (!_curriculumCache[level]) {
      _curriculumCache[level] = apiFetch(`/api/curriculum/${level}`);
    }
    const rules = await _curriculumCache[level];
    return rules.find((r) => r.id === ruleId) ?? null;
  }
}

customElements.define("beacon-lab-step", BeaconLabStep);

// ── 2. <beacon-lab-inventory> ─────────────────────────────────────────────────

/**
 * Fetches /api/inventory with the current JWT and renders a table of items.
 *
 * Attributes:
 *   tenant-id — informational only (auth comes from the JWT)
 *
 * Events:
 *   beacon-inventory-loaded — fired after data renders; detail: { count }
 */
class BeaconLabInventory extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this._render();
  }

  async _render() {
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="loading">Loading inventory…</span>`;
    try {
      const data = await apiFetch("/api/inventory");
      const items = data.items ?? [];

      if (items.length === 0) {
        this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><em>No inventory items.</em>`;
        return;
      }

      const rows = items.map((item) => `
        <tr>
          <td>${escHtml(item.name)}</td>
          <td>${escHtml(item.vendor)}</td>
          <td><span class="badge">${escHtml(item.riskTier ?? "—")}</span></td>
          <td><span class="badge ${item.status === "approved" ? "pass" : ""}">${escHtml(item.status)}</span></td>
        </tr>
      `).join("");

      this.shadowRoot.innerHTML = `
        <style>
          ${BASE_CSS}
          table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
          th { text-align: left; padding: 0.4rem 0.6rem; background: rgba(1,105,111,0.07);
               font-weight: 600; color: #01696f; border-bottom: 1px solid rgba(1,105,111,0.18); }
          td { padding: 0.35rem 0.6rem; border-bottom: 1px solid rgba(1,105,111,0.08); }
          tr:last-child td { border-bottom: none; }
          h4 { margin: 0 0 0.6rem; font-size: 0.9rem; color: #01696f; }
        </style>
        <h4>AI Inventory (${items.length} items)</h4>
        <table>
          <thead><tr><th>Name</th><th>Vendor</th><th>Risk tier</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      this.dispatchEvent(new CustomEvent("beacon-inventory-loaded", {
        bubbles: true, composed: true,
        detail: { count: items.length },
      }));
    } catch (err) {
      this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="error">${escHtml(err.message)}</span>`;
    }
  }
}

customElements.define("beacon-lab-inventory", BeaconLabInventory);

// ── 3. <beacon-lab-receipt> ───────────────────────────────────────────────────

/**
 * Verifies a receipt using tweetnacl Ed25519.  Falls back to static JSON at
 * docs/data/receipts/{id}.json if the API call fails (offline / no auth).
 *
 * Attributes:
 *   receipt-id — ULID of the receipt
 *
 * Events:
 *   beacon-receipt-verified — detail: { valid, reason, keyFingerprint }
 */

let _naclLoaded = false;

async function loadNacl() {
  if (_naclLoaded || window.nacl) { _naclLoaded = true; return; }
  await import(NACL_CDN).catch(() => {
    // Dynamic import of CDN module may fail in some environments.
    // Fallback: inject as classic script.
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = NACL_CDN;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  });
  _naclLoaded = true;
}

function b64ToUint8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

class BeaconLabReceipt extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this._render();
  }

  async _render() {
    const receiptId = this.getAttribute("receipt-id") || "";
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="loading">Verifying…</span>`;
    if (!receiptId) {
      this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="error">receipt-id attribute required.</span>`;
      return;
    }

    try {
      // Try live API first; fall back to static Pages JSON.
      let data;
      try {
        data = await apiFetch(`/api/lab/verify/receipt/${receiptId}`);
      } catch {
        const staticRes = await fetch(`./data/receipts/${receiptId}.json`);
        if (!staticRes.ok) throw new Error("Receipt not found (API + static)");
        data = await staticRes.json();
      }

      const receipt = data.receipt ?? data;
      const sig = receipt?.signature?.sig_b64 ?? receipt?.signature;
      const pubKey = receipt?.envelope?.tenant?.publicKey ??
        (await apiFetch("/api/status")).tenants?.[0]?.publicKey;

      let valid = false;
      let reason = "Signature verification skipped (tweetnacl unavailable)";

      if (sig && pubKey) {
        try {
          await loadNacl();
          if (window.nacl?.sign?.detached?.verify) {
            const canonical = receipt.canonicalForm ?? JSON.stringify(receipt.envelope);
            const msg = new TextEncoder().encode(canonical);
            const sigBytes = b64ToUint8(sig);
            const pkBytes = b64ToUint8(pubKey);
            valid = window.nacl.sign.detached.verify(msg, sigBytes, pkBytes);
            reason = valid ? "Ed25519 signature valid" : "Signature mismatch";
          }
        } catch (e) {
          reason = `Verify error: ${e.message}`;
        }
      }

      const keyFpr = receipt?.keyFingerprint ?? receipt?.signature?.key_fpr ?? "unknown";
      this.dispatchEvent(new CustomEvent("beacon-receipt-verified", {
        bubbles: true, composed: true,
        detail: { valid, reason, keyFingerprint: keyFpr },
      }));

      this.shadowRoot.innerHTML = `
        <style>
          ${BASE_CSS}
          .result { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 600; }
          .icon { font-size: 1.4rem; }
          .meta { font-size: 0.8rem; color: #5a7a7e; margin-top: 0.4rem; font-family: 'DM Mono', monospace; }
        </style>
        <div class="result">
          <span class="icon">${valid ? "✓" : "✗"}</span>
          <span class="badge ${valid ? "pass" : "fail"}">${valid ? "VALID" : "INVALID"}</span>
          <span style="font-size:0.9rem;font-weight:400;">${escHtml(reason)}</span>
        </div>
        <div class="meta">ID: ${escHtml(receiptId)}</div>
        <div class="meta">Key fingerprint: ${escHtml(keyFpr)}</div>
      `;
    } catch (err) {
      this.shadowRoot.innerHTML = `<style>${BASE_CSS}</style><span class="error">${escHtml(err.message)}</span>`;
    }
  }
}

customElements.define("beacon-lab-receipt", BeaconLabReceipt);

// ── Utility ───────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
