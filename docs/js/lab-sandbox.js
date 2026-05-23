/* AIGovOps Beacon — Framework Lab in-browser Ed25519 receipt sandbox.
 *
 * Requires (already loaded by Beacon index.html — reused by lab pages):
 *   - https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl.min.js
 *   - https://cdn.jsdelivr.net/npm/tweetnacl-util@0.15.1/nacl-util.min.js
 *   - https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
 *
 * What it does — all client-side, zero network traffic:
 *   1. Generate an Ed25519 keypair with tweetnacl
 *   2. Canonicalize a receipt object (sorted keys, no whitespace) — RFC 8785 JCS approximation
 *      sufficient for flat objects without floats; documented as such in the sandbox UI
 *   3. Sign the canonical bytes
 *   4. Verify in-browser
 *   5. Bundle one or more receipts into a downloadable evidence.zip via jszip
 *
 * Mirrors the production Beacon flow shown on the Beacon home page. The lab
 * version is intentionally minimal so auditors can step through and see every
 * line.
 */
(function () {
  'use strict';

  // Wait for tweetnacl / jszip — they load with `defer` in index.html style.
  function ready(fn) {
    if (window.nacl && window.nacl.sign && window.nacl.util && window.JSZip) {
      fn();
    } else {
      setTimeout(function () { ready(fn); }, 50);
    }
  }

  // -------- Helpers --------
  function utf8(str) { return window.nacl.util.decodeUTF8(str); }
  function b64(bytes) { return window.nacl.util.encodeBase64(bytes); }
  function b64u(bytes) {
    return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Minimal JCS-style canonicalization. Sorted keys, no whitespace, UTF-8.
   * Sufficient for the flat receipt objects used in this lab. Real RFC 8785
   * also defines float canonicalization and we document that out of scope.
   */
  function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      return JSON.stringify(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(canonical).join(',') + ']';
    }
    if (typeof value === 'object') {
      var keys = Object.keys(value).sort();
      return '{' + keys.map(function (k) {
        return JSON.stringify(k) + ':' + canonical(value[k]);
      }).join(',') + '}';
    }
    throw new Error('Cannot canonicalize: ' + typeof value);
  }

  function fingerprint(publicKey) {
    // First 16 bytes of SHA-256(publicKey), base64-URL no-pad
    return crypto.subtle
      .digest('SHA-256', publicKey)
      .then(function (digest) {
        var arr = new Uint8Array(digest).slice(0, 16);
        return b64u(arr);
      });
  }

  function nowISO() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  // -------- Sandbox state --------
  function init() {
    var sandbox = document.querySelector('[data-sandbox="ed25519-receipt"]');
    if (!sandbox) return;

    var state = {
      keypair: null,
      fp: null,
      receipts: []
    };

    var statusEl = sandbox.querySelector('[data-sandbox-status]');
    var pubEl = sandbox.querySelector('[data-sandbox-pubkey]');
    var fpEl = sandbox.querySelector('[data-sandbox-fp]');
    var receiptJsonEl = sandbox.querySelector('[data-sandbox-receipt-json]');
    var receiptCanonEl = sandbox.querySelector('[data-sandbox-receipt-canon]');
    var receiptSigEl = sandbox.querySelector('[data-sandbox-receipt-sig]');
    var verifyEl = sandbox.querySelector('[data-sandbox-verify]');
    var receiptListEl = sandbox.querySelector('[data-sandbox-receipts]');
    var bundlePill = sandbox.querySelector('[data-sandbox-pill]');

    // Live receipt editor
    var modelEl = sandbox.querySelector('[data-receipt-model]');
    var vendorEl = sandbox.querySelector('[data-receipt-vendor]');
    var promptEl = sandbox.querySelector('[data-receipt-prompt]');
    var envEl = sandbox.querySelector('[data-receipt-env]');

    function setStatus(msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.classList.remove('pass', 'fail');
      if (kind) statusEl.classList.add(kind);
    }

    // -------- Step 1: Generate key --------
    sandbox.querySelector('[data-action="generate-key"]').addEventListener('click', function () {
      var kp = window.nacl.sign.keyPair();
      state.keypair = kp;
      fingerprint(kp.publicKey).then(function (fp) {
        state.fp = fp;
        if (pubEl) pubEl.textContent = b64(kp.publicKey);
        if (fpEl) fpEl.textContent = fp;
        setStatus('Ed25519 keypair generated in your browser. The private key never leaves this tab.', 'pass');
        if (bundlePill) bundlePill.classList.add('live');
        if (bundlePill) bundlePill.textContent = 'key · ready';
      });
    });

    // -------- Step 2: Sign a receipt --------
    sandbox.querySelector('[data-action="sign-receipt"]').addEventListener('click', function () {
      if (!state.keypair) {
        setStatus('Generate a key first.', 'fail');
        return;
      }
      var receipt = {
        seq: state.receipts.length + 1,
        timestamp_utc: nowISO(),
        vendor: (vendorEl && vendorEl.value) || 'OpenAI',
        model: (modelEl && modelEl.value) || 'gpt-4o-mini',
        version: '2024-07-18',
        environment: (envEl && envEl.value) || 'production',
        event_type: 'invocation',
        prompt: (promptEl && promptEl.value) || 'summarize the policy',
        result_hash: 'sha256:' + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''),
        actor: 'oidc|alice@example.org'
      };
      var canonStr = canonical(receipt);
      var canonBytes = utf8(canonStr);
      var sig = window.nacl.sign.detached(canonBytes, state.keypair.secretKey);
      var verified = window.nacl.sign.detached.verify(canonBytes, sig, state.keypair.publicKey);

      var signedReceipt = Object.assign({}, receipt, {
        signature_ed25519: b64u(sig),
        key_fingerprint: state.fp
      });

      state.receipts.push({ receipt: receipt, canonical: canonStr, signature: b64u(sig), verified: verified, signed: signedReceipt });

      if (receiptJsonEl) receiptJsonEl.textContent = JSON.stringify(receipt, null, 2);
      if (receiptCanonEl) receiptCanonEl.textContent = canonStr;
      if (receiptSigEl) receiptSigEl.textContent = b64u(sig);
      if (verifyEl) {
        verifyEl.textContent = verified ? 'Ed25519 ✓ verified in-browser' : 'Ed25519 ✗ verification FAILED';
        verifyEl.classList.toggle('pass', !!verified);
        verifyEl.classList.toggle('fail', !verified);
      }

      // Append to list
      if (receiptListEl) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="receipt-seq">#' + receipt.seq + '</span>'
          + '<span>' + escapeHtml(receipt.vendor + '/' + receipt.model) + '</span>'
          + '<span style="color:var(--ink-faint);font-size:var(--text-sm);">' + escapeHtml(receipt.timestamp_utc) + '</span>'
          + '<span style="margin-left:auto;color:var(--pass);font-family:DM Mono,monospace;font-size:var(--text-xs);">' + (verified ? '✓ signed' : '✗ broken') + '</span>';
        receiptListEl.appendChild(li);
      }
      setStatus('Receipt #' + receipt.seq + ' signed and verified.', 'pass');
    });

    // -------- Step 3: Bundle --------
    sandbox.querySelector('[data-action="bundle"]').addEventListener('click', function () {
      if (!state.receipts.length) {
        setStatus('Sign at least one receipt first.', 'fail');
        return;
      }
      var zip = new window.JSZip();
      // NDJSON receipt log
      var ndjson = state.receipts.map(function (r) { return JSON.stringify(r.signed); }).join('\n') + '\n';
      zip.file('receipts.ndjson', ndjson);
      // Public key
      zip.file('public-key.b64', b64(state.keypair.publicKey));
      // VERIFY.md
      var verifyMd = '# VERIFY.md\n\n'
        + 'This bundle was generated by the AIGovOps Beacon Framework Lab.\n\n'
        + '## Contents\n\n'
        + '- `receipts.ndjson` — append-only signed receipts, one per line\n'
        + '- `public-key.b64` — Ed25519 public key, base64\n'
        + '- `manifest.json` — bundle metadata\n\n'
        + '## Verify offline\n\n'
        + 'No Beacon installation required. With `openssl` and a base64 decoder you can verify any signature in `receipts.ndjson` against `public-key.b64`.\n\n'
        + '1. Strip `signature_ed25519` and `key_fingerprint` from one entry, re-serialize with sorted keys (JCS).\n'
        + '2. Base64-decode the signature.\n'
        + '3. Run `openssl pkeyutl -verify -pubin -inkey pub.pem -sigfile sig.bin -in canonical.bytes` after converting the b64 pub to a PEM.\n\n'
        + 'Bundle generated at ' + nowISO() + '\n'
        + 'Receipt count: ' + state.receipts.length + '\n'
        + 'Key fingerprint: ' + state.fp + '\n';
      zip.file('VERIFY.md', verifyMd);
      // Manifest
      var manifest = {
        bundle_version: 'lab-v1',
        generated_utc: nowISO(),
        receipt_count: state.receipts.length,
        key_fingerprint: state.fp,
        algorithm: 'Ed25519',
        canonicalization: 'JCS-flat (sorted keys, no whitespace, UTF-8)'
      };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'beacon-lab-bundle-' + Date.now() + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus('Bundle of ' + state.receipts.length + ' receipts assembled and downloaded — anyone with openssl can verify it.', 'pass');
      });
    });

    // -------- Reset --------
    sandbox.querySelector('[data-action="reset-sandbox"]').addEventListener('click', function () {
      state.keypair = null;
      state.fp = null;
      state.receipts = [];
      if (pubEl) pubEl.textContent = '—';
      if (fpEl) fpEl.textContent = '—';
      if (receiptJsonEl) receiptJsonEl.textContent = '—';
      if (receiptCanonEl) receiptCanonEl.textContent = '—';
      if (receiptSigEl) receiptSigEl.textContent = '—';
      if (verifyEl) {
        verifyEl.textContent = '—';
        verifyEl.classList.remove('pass', 'fail');
      }
      if (receiptListEl) receiptListEl.innerHTML = '';
      if (bundlePill) {
        bundlePill.classList.remove('live');
        bundlePill.textContent = 'key · pending';
      }
      setStatus('Sandbox reset.', null);
    });

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  ready(init);
})();
