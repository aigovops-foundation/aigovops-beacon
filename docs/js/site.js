/* ============================================================
 * AIGovOps Beacon — site.js
 * In-browser demo: discovery → JCS canonicalize → Ed25519 sign → bundle
 * Dependencies (loaded via CDN in index.html): tweetnacl, tweetnacl-util, jszip
 * ============================================================ */

(() => {
  "use strict";

  // ---------- tiny helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const speed = reduced ? 0.25 : 1; // collapse waits when user prefers reduced motion
  const wait = (ms) => sleep(ms * speed);
  const nowIso = () => new Date().toISOString();
  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  };

  // ---------- JCS canonicalization (RFC 8785) ----------
  // Mirrors server/src/lib/canonical.js semantics: sort keys, no whitespace, escape per spec.
  function jcs(value) {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("JCS: non-finite number");
      // RFC 8785 number serialization is essentially ES6 Number.prototype.toString
      return String(value);
    }
    if (typeof value === "string") return jcsString(value);
    if (Array.isArray(value)) {
      return "[" + value.map(jcs).join(",") + "]";
    }
    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      const parts = [];
      for (const k of keys) {
        if (value[k] === undefined) continue;
        parts.push(jcsString(k) + ":" + jcs(value[k]));
      }
      return "{" + parts.join(",") + "}";
    }
    throw new Error("JCS: unsupported type " + typeof value);
  }
  function jcsString(s) {
    let out = '"';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      switch (c) {
        case 0x22: out += '\\"'; break;
        case 0x5C: out += "\\\\"; break;
        case 0x08: out += "\\b"; break;
        case 0x09: out += "\\t"; break;
        case 0x0A: out += "\\n"; break;
        case 0x0C: out += "\\f"; break;
        case 0x0D: out += "\\r"; break;
        default:
          if (c < 0x20) out += "\\u" + c.toString(16).padStart(4, "0");
          else out += s[i];
      }
    }
    return out + '"';
  }

  // ---------- Ed25519 signing via tweetnacl ----------
  let keyPair = null;
  let fingerprint = "";
  function ensureKey() {
    if (keyPair) return keyPair;
    keyPair = nacl.sign.keyPair();
    // fingerprint = first 8 bytes of SHA-256(public_key), hex
    return keyPair;
  }
  async function sha256Hex(bytes) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  }
  async function computeFingerprint() {
    const hex = await sha256Hex(keyPair.publicKey);
    fingerprint = hex.slice(0, 16);
    return fingerprint;
  }
  function signCanonical(canonStr) {
    const msg = nacl.util.decodeUTF8(canonStr);
    const sig = nacl.sign.detached(msg, keyPair.secretKey);
    return nacl.util.encodeBase64(sig);
  }
  function publicKeyPem() {
    // raw 32-byte Ed25519 SPKI prefix: 302a300506032b6570032100
    const prefix = new Uint8Array([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]);
    const der = new Uint8Array(prefix.length + keyPair.publicKey.length);
    der.set(prefix, 0);
    der.set(keyPair.publicKey, prefix.length);
    const b64 = nacl.util.encodeBase64(der);
    const lines = b64.match(/.{1,64}/g).join("\n");
    return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
  }

  // ---------- Sample inventory ----------
  const SAMPLE_CSV = `OpenAI,gpt-4o,chat-completions,us-east
Anthropic,claude-3-5-sonnet,chat-completions,us-west
Cohere,embed-multilingual-v3,embeddings,eu-central
Stability AI,sdxl-1.0,image-generation,us-east
Mistral,mistral-large,chat-completions,eu-west`;

  function parseCsv(text) {
    return text.trim().split(/\r?\n/).map(line => {
      const [vendor, model, capability, residency] = line.split(",").map(s => (s || "").trim());
      return { vendor, model, capability, residency };
    }).filter(r => r.vendor && r.model);
  }

  // ---------- UI references ----------
  const ui = {};
  function bindUI() {
    Object.assign(ui, {
      telemetryBody: $("#telemetryBody"),
      telemetryStatus: $("#telemetryStatus"),
      medallionPulse: $("#medallionPulse"),
      btnAutoplay: $("#btnAutoplay"),
      btnInteractive: $("#btnInteractive"),
      btnReset: $("#btnReset"),
      csvInputWrap: $("#csvInputWrap"),
      csvInput: $("#csvInput"),
      btnRunInteractive: $("#btnRunInteractive"),
      inventoryBoard: $("#inventoryBoard"),
      receiptReveal: $("#receiptReveal"),
      receiptJson: $("#receiptJson"),
      receiptCanonical: $("#receiptCanonical"),
      sigStamp: $("#sigStamp"),
      fileYard: $("#fileYard"),
      bundleResult: $("#bundleResult"),
      bundleSha: $("#bundleSha"),
      btnDownloadBundle: $("#btnDownloadBundle"),
      siteHeader: $("#siteHeader"),
    });
  }

  // ---------- Telemetry ticker ----------
  function pushTelemetry({ ev, body, sig }) {
    const row = document.createElement("div");
    row.className = "telemetry-row";
    row.innerHTML = `
      <span class="t">${nowTime()}</span>
      <span class="ev">${ev}</span>
      <span class="body">${body}</span>
      <span class="sig">${sig || "—"}</span>
      <span class="check" aria-hidden="true"></span>
    `;
    ui.telemetryBody.prepend(row);
    // cap to ~10 rows
    const rows = $$(".telemetry-row", ui.telemetryBody);
    rows.slice(10).forEach(r => r.remove());
  }
  function setStatus(t) { if (ui.telemetryStatus) ui.telemetryStatus.textContent = t; }

  // ---------- Medallion pulse ----------
  function pulse() {
    if (!ui.medallionPulse) return;
    ui.medallionPulse.classList.remove("beat");
    void ui.medallionPulse.offsetWidth; // restart animation
    ui.medallionPulse.classList.add("beat");
  }

  // ---------- Inventory cards ----------
  function renderInventoryCard(row) {
    const card = document.createElement("div");
    card.className = "inv-card arriving";
    card.innerHTML = `
      <div>
        <div class="vendor">${escapeHtml(row.vendor)}</div>
        <div class="model">${escapeHtml(row.model)}</div>
      </div>
      <div class="meta">
        <span class="pill teal">${escapeHtml(row.capability)}</span>
        <span class="pill">${escapeHtml(row.residency)}</span>
      </div>
    `;
    ui.inventoryBoard.appendChild(card);
    // promote to tagged on next paint
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.classList.remove("arriving");
      card.classList.add("tagged");
    }));
    return card;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // ---------- Build a receipt object ----------
  function buildReceipt(row, idx) {
    return {
      schema: "aigovops.receipt/v1",
      id: `rcpt-${Date.now()}-${idx}`,
      timestamp: nowIso(),
      subject: {
        vendor: row.vendor,
        model: row.model,
        capability: row.capability,
        residency: row.residency,
      },
      attestation: {
        framework: ["nist-ai-rmf", "eu-ai-act-art13", "iso-iec-42001"],
        verdict: "pass",
        evidence: `inventory-discovery@${nowIso().slice(0,10)}`,
      },
      signer: {
        algorithm: "Ed25519",
        public_key_fingerprint: fingerprint,
      },
    };
  }

  // ---------- Receipt reveal panel ----------
  let allReceipts = []; // [{receipt, canonical, signature}]
  function showReceipt(entry) {
    ui.receiptReveal.hidden = false;
    ui.receiptJson.textContent = JSON.stringify(entry.receipt, null, 2);
    ui.receiptCanonical.textContent = entry.canonical;
    ui.sigStamp.classList.remove("show");
    ui.sigStamp.querySelector(".pill").innerHTML = `Ed25519 ✓ <code style="font-family:DM Mono,monospace; font-size:11px">${entry.signature.slice(0,28)}…</code>`;
    requestAnimationFrame(() => requestAnimationFrame(() => ui.sigStamp.classList.add("show")));
  }

  // ---------- File chips for bundle assembly ----------
  const BUNDLE_FILES = [
    { name: "manifest.json",          ico: "📋" },
    { name: "receipts/2026-05-13.ndjson", ico: "🧾" },
    { name: "public_keys/<fpr>.pem",  ico: "🔑" },
    { name: "policies/policy.yaml",   ico: "📜" },
    { name: "checklists/nist-ai-rmf.yaml", ico: "✅" },
    { name: "VERIFY.md",              ico: "🧭" },
  ];
  function spawnFileChip(spec) {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    chip.innerHTML = `<span class="ico" aria-hidden="true">${spec.ico}</span><span>${escapeHtml(spec.name)}</span>`;
    ui.fileYard.appendChild(chip);
    requestAnimationFrame(() => requestAnimationFrame(() => chip.classList.add("in")));
    return chip;
  }

  // ---------- Bundle building (real .zip) ----------
  async function buildBundle() {
    const zip = new JSZip();
    const fpr = fingerprint || "unknown";
    const ndjson = allReceipts.map(r => JSON.stringify({
      ...r.receipt,
      signature: r.signature,
      canonical_sha256: r.canonicalSha,
    })).join("\n") + "\n";

    const manifest = {
      schema: "aigovops.bundle.manifest/v1",
      generated: nowIso(),
      generator: "aigovops-beacon (browser demo)",
      receipt_count: allReceipts.length,
      signer_fingerprint: fpr,
      files: [
        "receipts/2026-05-13.ndjson",
        `public_keys/${fpr}.pem`,
        "VERIFY.md",
      ],
    };

    const verifyMd = [
      "# Verify this bundle",
      "",
      "This evidence bundle was produced by AIGovOps Beacon. To re-verify the receipts",
      "you do **not** need Beacon — just openssl and jq.",
      "",
      "```bash",
      "# 1. Extract the public key",
      `cp public_keys/${fpr}.pem signer.pem`,
      "",
      "# 2. For each line in receipts/2026-05-13.ndjson:",
      "#    a) strip the `signature` and `canonical_sha256` fields",
      "#    b) re-canonicalize with JCS (RFC 8785)",
      "#    c) openssl pkeyutl -verify -pubin -inkey signer.pem -rawin -sigfile <sig>",
      "```",
      "",
      `Bundle generated: ${nowIso()}`,
      `Signer fingerprint: ${fpr}`,
      "",
      "Apache-2.0 · AIGovOps Foundation · https://www.aigovopsfoundation.org/",
      "",
    ].join("\n");

    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("receipts/2026-05-13.ndjson", ndjson);
    zip.file(`public_keys/${fpr}.pem`, publicKeyPem());
    zip.file("VERIFY.md", verifyMd);

    const blob = await zip.generateAsync({ type: "blob" });
    const buf = await blob.arrayBuffer();
    const sha = await sha256Hex(new Uint8Array(buf));
    return { blob, sha };
  }

  // ---------- The choreographed demo ----------
  let demoRunning = false;
  let demoBundle = null;

  async function runDemo(rows) {
    if (demoRunning) return;
    demoRunning = true;
    setStatus("running");
    ui.btnAutoplay.disabled = true;
    ui.btnInteractive.disabled = true;
    ui.btnReset.disabled = true;
    ui.inventoryBoard.innerHTML = "";
    ui.fileYard.innerHTML = "";
    ui.bundleResult.hidden = true;
    ui.receiptReveal.hidden = true;
    allReceipts = [];

    // Act 0: key generation
    ensureKey();
    await computeFingerprint();
    pushTelemetry({
      ev: "key.gen",
      body: `Ed25519 signing key generated · fpr ${fingerprint}`,
      sig: "—",
    });
    pulse();
    await wait(700);

    // Act 1: discovery — drop inventory cards in
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      renderInventoryCard(r);
      pushTelemetry({
        ev: "discover",
        body: `${r.vendor} / ${r.model} · ${r.capability} · ${r.residency}`,
        sig: "—",
      });
      await wait(450);
    }

    await wait(600);

    // Act 2: sign each
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const receipt = buildReceipt(r, i);
      const canonical = jcs(receipt);
      const signature = signCanonical(canonical);
      const canonicalSha = await sha256Hex(new TextEncoder().encode(canonical));
      const entry = { receipt, canonical, signature, canonicalSha };
      allReceipts.push(entry);

      // last one wins the receipt panel
      showReceipt(entry);

      pushTelemetry({
        ev: "attest",
        body: `${r.vendor}/${r.model} → verdict=pass · sha256 ${canonicalSha.slice(0,12)}…`,
        sig: signature.slice(0,10) + "…",
      });
      pulse();
      await wait(600);
    }

    await wait(400);

    // Act 3: bundle assembly
    for (const spec of BUNDLE_FILES) {
      const name = spec.name.replace("<fpr>", fingerprint || "unknown");
      spawnFileChip({ ...spec, name });
      pushTelemetry({
        ev: "bundle",
        body: `+ ${name}`,
        sig: "—",
      });
      await wait(280);
    }

    // Build the real zip
    demoBundle = await buildBundle();
    ui.bundleSha.textContent = demoBundle.sha;
    ui.bundleResult.hidden = false;
    pushTelemetry({
      ev: "bundle.ready",
      body: `bundle.zip · ${(demoBundle.blob.size/1024).toFixed(1)} KB · sha256 ${demoBundle.sha.slice(0,16)}…`,
      sig: "ed25519",
    });
    pulse();

    setStatus("complete — bundle ready");
    demoRunning = false;
    ui.btnAutoplay.disabled = false;
    ui.btnAutoplay.textContent = "▶ Replay";
    ui.btnInteractive.disabled = false;
    ui.btnReset.disabled = false;
  }

  // ---------- Wiring ----------
  function wireEvents() {
    ui.btnAutoplay.addEventListener("click", () => {
      runDemo(parseCsv(SAMPLE_CSV));
      // scroll the demo into view
      $("#demo").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });

    ui.btnInteractive.addEventListener("click", () => {
      ui.csvInputWrap.hidden = false;
      ui.csvInput.focus();
    });

    ui.btnRunInteractive.addEventListener("click", () => {
      const rows = parseCsv(ui.csvInput.value);
      if (rows.length === 0) {
        alert("Paste at least one CSV row: vendor,model,capability,residency");
        return;
      }
      runDemo(rows);
    });

    ui.btnReset.addEventListener("click", () => {
      ui.inventoryBoard.innerHTML = "";
      ui.fileYard.innerHTML = "";
      ui.bundleResult.hidden = true;
      ui.receiptReveal.hidden = true;
      ui.telemetryBody.innerHTML = "";
      pushTelemetry({ ev: "idle", body: "Reset — press play to run again", sig: "—" });
      setStatus("idle");
      ui.btnAutoplay.textContent = "▶ Play the demo";
    });

    ui.btnDownloadBundle.addEventListener("click", () => {
      if (!demoBundle) return;
      const url = URL.createObjectURL(demoBundle.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aigovops-beacon-bundle-${fingerprint}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // Header scroll state
    let lastY = 0;
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      ui.siteHeader.classList.toggle("scrolled", y > 12);
      lastY = y;
    }, { passive: true });
  }

  // ---------- Boot ----------
  function boot() {
    bindUI();
    wireEvents();
    // Greet the telemetry strip so it's never empty
    setStatus("ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
