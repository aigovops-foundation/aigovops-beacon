/* AiGovOps Beacon — Framework Lab completion certificate generator.
 *
 * When all 4 attestation checkboxes on a lesson page are checked, a "Get your
 * signed certificate" button reveals. The student enters their name, the page:
 *   1. Generates an ephemeral Ed25519 keypair (or reuses the one from the
 *      Section 4 sandbox if they ran it).
 *   2. Builds a certificate object: name, level, timestamp_utc, attestations,
 *      Beacon project public key fingerprint, student public key.
 *   3. Canonicalizes (JCS sorted-keys, no whitespace), signs with the student's
 *      ephemeral key.
 *   4. Renders a printable HTML diploma and offers a JSON receipt download.
 *
 * Beacon project public key fingerprint (already public, in the audit log):
 *   TrUguILJje1UUyeQie1g6w
 *
 * Cryptographic model:
 *   - Student's signature attests THEIR completion.
 *   - Beacon project fingerprint stamps the issuing authority.
 *   - Counter-signing by Bob/Ken (if requested) happens offline by emailing the
 *     JSON receipt to LAB@... — the script provides a one-click mailto.
 */
(function () {
  'use strict';

  var BEACON_PROJECT_FP = 'TrUguILJje1UUyeQie1g6w';
  var FOUNDATION_EMAILS = ['bob.rapp@aigovops.community', 'ken.johnston@aigovops.community'];

  function ready(fn) {
    if (window.nacl && window.nacl.sign && window.nacl.util && window.JSZip) fn();
    else setTimeout(function () { ready(fn); }, 50);
  }

  function b64(bytes) { return window.nacl.util.encodeBase64(bytes); }
  function b64u(bytes) {
    return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object') {
      var keys = Object.keys(value).sort();
      return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canonical(value[k]); }).join(',') + '}';
    }
    throw new Error('Cannot canonicalize: ' + typeof value);
  }

  function fingerprintOf(publicKey) {
    return crypto.subtle.digest('SHA-256', publicKey).then(function (digest) {
      var arr = new Uint8Array(digest).slice(0, 16);
      return b64u(arr);
    });
  }

  function nowISO() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init() {
    // Each lesson page (l100/l200) has a .attest container with 4 checkboxes
    // and an .attest-final div. We inject the certificate UI block after it.
    document.querySelectorAll('.attest').forEach(function (attestEl) {
      var page = document.body.getAttribute('data-lab-level');
      if (!page) return;
      // For SPA single-page version, scope by the closest [data-view]
      var view = attestEl.closest('[data-view]');
      var levelForCert = view
        ? (view.getAttribute('data-view') === 'l100' ? '100'
           : view.getAttribute('data-view') === 'l200' ? '200' : page)
        : page;

      if (attestEl.querySelector('.cert-block')) return; // idempotent

      var block = document.createElement('div');
      block.className = 'cert-block';
      block.innerHTML = ''
        + '<h3>Issue your signed completion certificate</h3>'
        + '<p class="cert-intro">Check all four statements above to unlock. Your certificate is signed in your browser with a fresh Ed25519 key (private key never leaves this tab) and stamped with the Beacon project fingerprint as the issuing authority. The lab teaches the evidence model — your certificate uses it.</p>'
        + '<div class="cert-form">'
        +   '<label><span class="kicker">Your name (printed on the certificate)</span>'
        +     '<input type="text" data-cert-name placeholder="e.g. Maya Iyer" autocomplete="name" />'
        +   '</label>'
        +   '<label><span class="kicker">Organization (optional)</span>'
        +     '<input type="text" data-cert-org placeholder="e.g. Acme Audit, Inc." />'
        +   '</label>'
        +   '<div class="cert-actions">'
        +     '<button type="button" class="btn-primary btn-sm" data-cert-action="issue" disabled>Issue certificate</button>'
        +   '</div>'
        +   '<p class="cert-status" data-cert-status>Pending — complete all 4 attestation statements above.</p>'
        + '</div>'
        + '<div class="cert-result" data-cert-result hidden>'
        +   '<div class="cert-diploma" data-cert-diploma></div>'
        +   '<div class="cert-actions" style="margin-top: var(--space-4);">'
        +     '<button type="button" class="btn-primary btn-sm" data-cert-action="download-json">Download JSON receipt</button>'
        +     '<button type="button" class="btn-ghost btn-sm" data-cert-action="download-html">Download HTML diploma</button>'
        +     '<button type="button" class="btn-ghost btn-sm" data-cert-action="print">Print diploma</button>'
        +     '<a class="btn-ghost btn-sm" data-cert-mailto href="#">Email to AiGovOps Foundation for counter-sign</a>'
        +   '</div>'
        +   '<p class="cert-note">The JSON receipt is what an auditor would verify. The HTML diploma is the human-friendly one for screenshots and prints.</p>'
        + '</div>';
      attestEl.appendChild(block);

      var nameEl = block.querySelector('[data-cert-name]');
      var orgEl = block.querySelector('[data-cert-org]');
      var issueBtn = block.querySelector('[data-cert-action="issue"]');
      var statusEl = block.querySelector('[data-cert-status]');
      var resultEl = block.querySelector('[data-cert-result]');
      var diplomaEl = block.querySelector('[data-cert-diploma]');
      var mailtoEl = block.querySelector('[data-cert-mailto]');

      var lastReceipt = null;
      var lastDiplomaHtml = null;

      function checkUnlock() {
        var checks = attestEl.querySelectorAll('input[type=checkbox][data-attest-n]');
        var allChecked = checks.length > 0 && Array.prototype.every.call(checks, function (c) { return c.checked; });
        issueBtn.disabled = !(allChecked && (nameEl.value || '').trim().length > 0);
        statusEl.textContent = !allChecked
          ? 'Pending — complete all 4 attestation statements above.'
          : !(nameEl.value || '').trim()
            ? 'Ready — enter your name to issue.'
            : 'Ready to issue.';
      }

      attestEl.addEventListener('change', checkUnlock);
      nameEl.addEventListener('input', checkUnlock);
      checkUnlock();

      issueBtn.addEventListener('click', function () {
        if (issueBtn.disabled) return;
        var name = (nameEl.value || '').trim();
        var org = (orgEl.value || '').trim();
        var kp = window.nacl.sign.keyPair();
        fingerprintOf(kp.publicKey).then(function (studentFp) {
          var receipt = {
            schema: 'aigovops-beacon-completion-v1',
            level: 'Framework Lab Level ' + levelForCert,
            student_name: name,
            organization: org || null,
            timestamp_utc: nowISO(),
            attestations: [
              'I can show what AI is in scope.',
              'I can point to a signed receipt and explain it.',
              'I can hand an auditor a verifiable bundle.',
              'I can map one real failure to missing governance evidence.'
            ],
            student_public_key_b64: b64(kp.publicKey),
            student_key_fingerprint: studentFp,
            issuing_authority: 'AiGovOps Foundation — Beacon project',
            beacon_project_key_fingerprint: BEACON_PROJECT_FP,
            verify_hint: 'Verify offline: nacl.sign.detached.verify(canonical(receipt_minus_signature), base64Decode(signature), base64Decode(student_public_key))'
          };
          var canonStr = canonical(receipt);
          var canonBytes = window.nacl.util.decodeUTF8(canonStr);
          var sig = window.nacl.sign.detached(canonBytes, kp.secretKey);
          var signed = Object.assign({}, receipt, {
            signature_ed25519: b64u(sig),
            canonical_form: 'JCS-flat (sorted keys, no whitespace, UTF-8)'
          });
          lastReceipt = signed;
          lastDiplomaHtml = renderDiploma(signed);
          diplomaEl.innerHTML = lastDiplomaHtml;
          resultEl.removeAttribute('hidden');

          // Wire mailto
          var subject = 'LAB — Framework Lab Level ' + levelForCert + ' certificate counter-sign request';
          var body = 'Hello AiGovOps Foundation,\n\n'
            + 'I completed Framework Lab Level ' + levelForCert + ' on ' + signed.timestamp_utc + '.\n\n'
            + 'Attached below is my self-signed completion receipt for optional counter-signing with the Beacon project key.\n\n'
            + 'Best,\n' + name + (org ? '\n' + org : '')
            + '\n\n--- BEGIN AIGOVOPS-BEACON RECEIPT ---\n'
            + JSON.stringify(signed, null, 2)
            + '\n--- END AIGOVOPS-BEACON RECEIPT ---\n';
          mailtoEl.href = 'mailto:' + FOUNDATION_EMAILS.join(',')
            + '?subject=' + encodeURIComponent(subject)
            + '&body=' + encodeURIComponent(body);

          statusEl.textContent = 'Certificate issued. seq=' + signed.timestamp_utc + ' · fp=' + studentFp;
          statusEl.classList.add('pass');
          // Scroll to the result
          setTimeout(function () { resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
        });
      });

      block.querySelector('[data-cert-action="download-json"]').addEventListener('click', function () {
        if (!lastReceipt) return;
        downloadBlob(
          new Blob([JSON.stringify(lastReceipt, null, 2)], { type: 'application/json' }),
          'aigovops-beacon-completion-' + lastReceipt.student_key_fingerprint + '.json'
        );
      });

      block.querySelector('[data-cert-action="download-html"]').addEventListener('click', function () {
        if (!lastDiplomaHtml) return;
        var full = standaloneDiploma(lastDiplomaHtml);
        downloadBlob(
          new Blob([full], { type: 'text/html' }),
          'aigovops-beacon-completion-' + lastReceipt.student_key_fingerprint + '.html'
        );
      });

      block.querySelector('[data-cert-action="print"]').addEventListener('click', function () {
        if (!lastDiplomaHtml) return;
        var w = window.open('', '_blank');
        if (!w) return;
        w.document.write(standaloneDiploma(lastDiplomaHtml));
        w.document.close();
        setTimeout(function () { w.focus(); w.print(); }, 250);
      });
    });

    function renderDiploma(r) {
      return ''
        + '<div class="diploma-inner">'
        +   '<div class="diploma-medallion" aria-hidden="true">'
        +     '<svg viewBox="0 0 64 64" width="64" height="64">'
        +       '<circle cx="32" cy="32" r="30" fill="#01696f"/>'
        +       '<circle cx="32" cy="32" r="22" fill="none" stroke="#2ecc71" stroke-width="1.5" opacity="0.7"/>'
        +       '<text x="32" y="40" font-family="Inter,sans-serif" font-size="20" font-weight="700" fill="#2ecc71" text-anchor="middle">Y</text>'
        +     '</svg>'
        +   '</div>'
        +   '<p class="diploma-kicker">Certificate of completion</p>'
        +   '<h2 class="diploma-h">This certifies that</h2>'
        +   '<p class="diploma-name">' + escapeHtml(r.student_name) + '</p>'
        +   (r.organization ? '<p class="diploma-org">' + escapeHtml(r.organization) + '</p>' : '')
        +   '<p class="diploma-body">has completed</p>'
        +   '<p class="diploma-level">AiGovOps Beacon Framework Lab — Level ' + escapeHtml(r.level.split(' ').pop()) + '</p>'
        +   '<p class="diploma-attest">attesting in their own words that they can show what AI is in scope, point to a signed receipt and explain it, hand an auditor a verifiable bundle, and map one real failure to missing governance evidence.</p>'
        +   '<dl class="diploma-fields">'
        +     '<dt>Issued</dt><dd>' + escapeHtml(r.timestamp_utc) + '</dd>'
        +     '<dt>Issuing authority</dt><dd>' + escapeHtml(r.issuing_authority) + '</dd>'
        +     '<dt>Beacon project key fingerprint</dt><dd><code>' + escapeHtml(r.beacon_project_key_fingerprint) + '</code></dd>'
        +     '<dt>Student key fingerprint</dt><dd><code>' + escapeHtml(r.student_key_fingerprint) + '</code></dd>'
        +     '<dt>Signature (Ed25519)</dt><dd><code>' + escapeHtml((r.signature_ed25519 || '').slice(0, 36)) + '…</code></dd>'
        +   '</dl>'
        +   '<p class="diploma-footer">Verifiable offline against the receipt JSON. Counter-signing by the AiGovOps Foundation is available on request — email LAB to Bob &amp; Ken.</p>'
        + '</div>';
    }

    function standaloneDiploma(innerHtml) {
      return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>AiGovOps Beacon — Framework Lab Diploma</title>'
        + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">'
        + '<style>'
        + 'body{margin:0;background:#fbfaf6;color:#0e1b1c;font-family:"Inter",system-ui,sans-serif;display:flex;justify-content:center;padding:3rem;}'
        + '.diploma-inner{background:#fff;border:3px solid #01696f;border-radius:14px;padding:3rem 4rem;max-width:780px;box-shadow:0 14px 40px -20px rgba(14,27,28,0.18);}'
        + '.diploma-medallion{display:flex;justify-content:center;margin-bottom:1rem;}'
        + '.diploma-kicker{font-family:"DM Mono",monospace;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.18em;color:#01696f;text-align:center;margin:0 0 0.5rem;}'
        + '.diploma-h{text-align:center;font-size:1.2rem;font-weight:500;color:#3a4a4b;margin:0 0 0.5rem;letter-spacing:-0.01em;}'
        + '.diploma-name{font-size:2.6rem;font-weight:700;text-align:center;margin:0.5rem 0 0.2rem;letter-spacing:-0.03em;color:#0e1b1c;}'
        + '.diploma-org{text-align:center;color:#3a4a4b;margin:0 0 1.2rem;font-style:italic;}'
        + '.diploma-body{text-align:center;color:#3a4a4b;margin:0 0 0.3rem;}'
        + '.diploma-level{text-align:center;font-size:1.4rem;font-weight:600;color:#01696f;margin:0 0 1.5rem;}'
        + '.diploma-attest{text-align:center;font-size:0.95rem;color:#3a4a4b;font-style:italic;border-top:1px solid #d8d4c4;border-bottom:1px solid #d8d4c4;padding:1rem 0;margin:1rem 0 1.5rem;}'
        + '.diploma-fields{display:grid;grid-template-columns:max-content 1fr;gap:0.4rem 1.5rem;font-size:0.85rem;color:#3a4a4b;margin:0 0 1.5rem;}'
        + '.diploma-fields dt{font-family:"DM Mono",monospace;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:#7a8889;}'
        + '.diploma-fields dd{margin:0;}'
        + '.diploma-fields code{font-family:"DM Mono",monospace;font-size:0.78rem;}'
        + '.diploma-footer{font-size:0.78rem;color:#7a8889;text-align:center;margin:0;font-style:italic;}'
        + '@media print{body{padding:0;}.diploma-inner{border:2px solid #01696f;box-shadow:none;page-break-inside:avoid;}}'
        + '</style></head><body>' + innerHtml + '</body></html>';
    }

    function downloadBlob(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  ready(init);
})();
