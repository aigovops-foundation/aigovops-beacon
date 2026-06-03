"""
Build a single-page version of the Framework Lab for publishing as one
Hyperagent webpage. Merges hub + Level 100 + Level 200 + HIBT into a view-
toggled SPA, inlines all CSS and JS, and embeds the audit log so the HIBT
view works without fetching external files.

The 100-failure dataset still loads from the live aigovops-foundation.github.io URL
because it's already publicly served there with CORS headers.

Output: published-lab.html
"""

from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DATA_URL = "https://aigovops-foundation.github.io/aigovops-beacon/data/ai_failures_top100.json"


def extract_main(html: str) -> str:
    """Pull <main>...</main> from a page (greedy across newlines)."""
    m = re.search(r"<main[^>]*>(.*?)</main>", html, re.DOTALL)
    if not m:
        raise ValueError("No <main> block found")
    return m.group(1).strip()


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def build(offline: bool = False) -> Path:
    # Source content
    hub_html = read(DOCS / "lab.html")
    l100_html = read(DOCS / "lab-100.html")
    l200_html = read(DOCS / "lab-200.html")
    hibt_html = read(DOCS / "howibuilt.html")

    # Pull <main> bodies
    hub_main = extract_main(hub_html)
    l100_main = extract_main(l100_html)
    l200_main = extract_main(l200_html)
    hibt_main = extract_main(hibt_html)

    # Strip the sticky progress bar div from L100/L200 mains (we move it under each view's hero)
    # Actually keep it — it lives inside <main> via class "lesson-progress" which we'll
    # restyle to be non-sticky in the merged page.

    # Rewrite cross-page anchor links inside each main so they switch views
    # within the SPA instead of trying to load separate URLs.
    def rewrite_links(html: str) -> str:
        substitutions = [
            ('href="./lab.html"',          'href="#" data-view="hub"'),
            ('href="./lab-100.html"',      'href="#" data-view="l100"'),
            ('href="./lab-200.html"',      'href="#" data-view="l200"'),
            ('href="./howibuilt.html"',    'href="#" data-view="hibt"'),
            ('href="./"',                  'href="#" data-view="hub"'),
            # Worksheet HTML files - link out to the live GitHub Pages copies once they're up
            ('href="./lab/worksheet-100.html"',  'href="https://aigovops-foundation.github.io/aigovops-beacon/lab/worksheet-100.html" target="_blank" rel="noopener"'),
            ('href="./lab/worksheet-200.html"',  'href="https://aigovops-foundation.github.io/aigovops-beacon/lab/worksheet-200.html" target="_blank" rel="noopener"'),
            ('href="./downloads/lab-worksheet-100.pdf"',  'href="https://aigovops-foundation.github.io/aigovops-beacon/downloads/lab-worksheet-100.pdf" target="_blank" rel="noopener"'),
            ('href="./downloads/lab-worksheet-200.pdf"',  'href="https://aigovops-foundation.github.io/aigovops-beacon/downloads/lab-worksheet-200.pdf" target="_blank" rel="noopener"'),
            ('href="./data/ai_failures_top100.json"',  'href="' + DATA_URL + '" target="_blank" rel="noopener"'),
            # Misc data refs
            ('"./data/ai_failures_top100.json"',  '"' + DATA_URL + '"'),
        ]
        for old, new in substitutions:
            html = html.replace(old, new)
        return html

    hub_main = rewrite_links(hub_main)
    l100_main = rewrite_links(l100_main)
    l200_main = rewrite_links(l200_main)
    hibt_main = rewrite_links(hibt_main)

    # CSS — full site.css from upstream + our lab.css
    # Use the upstream copy we already have in the recon dir to avoid drift
    site_css = (ROOT.parent / "beacon-recon" / "docs_css_site.css").read_text(encoding="utf-8")
    lab_css = read(DOCS / "css" / "lab.css")

    # JS — lab.js, lab-sandbox.js, lab-failures.js
    lab_js = read(DOCS / "js" / "lab.js")
    sandbox_js = read(DOCS / "js" / "lab-sandbox.js")
    failures_js = read(DOCS / "js" / "lab-failures.js")
    cert_js = read(DOCS / "js" / "lab-certificate.js")
    splash_js = read(DOCS / "js" / "lab-splash.js")
    # lab-failures.js does fetch('./data/...') — patch to the absolute URL
    failures_js = failures_js.replace("'./data/ai_failures_top100.json'", "'" + DATA_URL + "'")

    # OFFLINE mode — inline the dataset and have failures.js prefer the inlined
    # constant over the live fetch. Output gets a different filename.
    failures_inline = ""
    if offline:
        dataset_path = ROOT.parent / "beacon-recon" / "ai_failures_top100.json"
        dataset_json = dataset_path.read_text(encoding="utf-8")
        failures_inline = "window.__BEACON_FAILURES__ = " + dataset_json + ";\n"
        # Patch failures_js to check for the inlined constant first
        failures_js = failures_js.replace(
            "fetch('" + DATA_URL + "', { cache: 'no-store' })",
            "(window.__BEACON_FAILURES__ ? Promise.resolve({ ok: true, json: function(){return Promise.resolve(window.__BEACON_FAILURES__);} }) : fetch('" + DATA_URL + "', { cache: 'no-store' }))"
        )

    # Audit log — inline so HIBT view doesn't need to fetch anything
    audit_log_path = ROOT / "audit" / "audit-log-after-d.jsonl"
    audit_entries = []
    with audit_log_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                audit_entries.append(json.loads(line))
    audit_log_json = json.dumps(audit_entries)

    # SPA shim — view toggle + nav highlight + per-view body-class for data-lab-level
    spa_shim_js = """
(function () {
  var nav = document.getElementById('viewNav');
  var views = document.querySelectorAll('section.view');
  var body = document.body;

  function show(name) {
    views.forEach(function (v) {
      v.classList.toggle('active', v.getAttribute('data-view') === name);
    });
    document.querySelectorAll('[data-view-target]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view-target') === name);
    });
    // Set data-lab-level so lab.js progress tracker scopes localStorage correctly
    if (name === 'l100') body.setAttribute('data-lab-level', '100');
    else if (name === 'l200') body.setAttribute('data-lab-level', '200');
    else body.removeAttribute('data-lab-level');
    // Scroll to top of view
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
  }

  // Wire view-toggle buttons
  document.body.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-view], [data-view-target]');
    if (!t) return;
    var name = t.getAttribute('data-view') || t.getAttribute('data-view-target');
    if (!name) return;
    ev.preventDefault();
    show(name);
  });

  // Initial view from URL hash
  var initial = (location.hash || '#hub').replace('#', '');
  if (!['hub','l100','l200','hibt'].includes(initial)) initial = 'hub';
  show(initial);
})();
"""

    # HIBT renderer — drop-in replacement for the IIFE in howibuilt.html that uses
    # the inline audit log instead of fetching audit-log.jsonl
    hibt_renderer_js = """
(function () {
  var logEl = document.getElementById('hibtLog');
  if (!logEl || !window.__BEACON_AUDIT_LOG__) return;
  var entries = window.__BEACON_AUDIT_LOG__;
  var searchEl = document.getElementById('hibtSearch');
  var countEl = document.getElementById('hibtCount');
  var fpEl = document.getElementById('hibtFingerprint');
  var chainEl = document.getElementById('hibtChainStatus');
  var filterStatusEl = document.getElementById('hibtFilterStatus');
  var state = { q: '' };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function shortHash(h) {
    if (!h) return '—';
    if (h === 'GENESIS') return 'GENESIS';
    return h.slice(0, 8) + '…' + h.slice(-6);
  }
  function renderEntry(e) {
    var assets = (e.assets || [])
      .map(function (a) { return '<code class="hibt-asset">' + escapeHtml(a) + '</code>'; })
      .join(' ');
    var modelLine = (e.model || e.platform)
      ? '<span class="hibt-model">' + escapeHtml(e.model || '') + (e.platform ? ' · ' + escapeHtml(e.platform) : '') + '</span>'
      : '';
    return '<li class="hibt-entry">'
      + '<div class="hibt-entry-head">'
      +   '<span class="hibt-seq">#' + escapeHtml(String(e.seq).padStart(3,'0')) + '</span>'
      +   '<span class="hibt-action">' + escapeHtml(e.action) + '</span>'
      +   '<span class="hibt-ts">' + escapeHtml(e.timestamp_utc) + '</span>'
      + '</div>'
      + '<div class="hibt-entry-body">'
      +   '<p class="hibt-prompt"><strong>Prompt —</strong> ' + escapeHtml(e.prompt) + '</p>'
      +   '<p class="hibt-result"><strong>Result —</strong> ' + escapeHtml(e.result) + '</p>'
      +   (assets ? '<p class="hibt-assets"><strong>Assets —</strong> ' + assets + '</p>' : '')
      +   '<p class="hibt-meta">'
      +     '<span class="hibt-user">' + escapeHtml(e.user || '') + ' · ' + escapeHtml(e.user_email || '') + '</span>'
      +     (modelLine ? ' · ' + modelLine : '')
      +   '</p>'
      +   '<details class="hibt-receipt"><summary>Show signed receipt</summary>'
      +     '<dl class="hibt-receipt-fields">'
      +       '<dt>prev_entry_sha256</dt><dd><code>' + escapeHtml(shortHash(e.prev_entry_sha256)) + '</code></dd>'
      +       '<dt>entry_sha256</dt><dd><code>' + escapeHtml(shortHash(e.entry_sha256)) + '</code></dd>'
      +       '<dt>signature_ed25519</dt><dd><code>' + escapeHtml((e.signature_ed25519 || '').slice(0,28)) + '…</code></dd>'
      +       '<dt>key_fingerprint</dt><dd><code>' + escapeHtml(e.key_fingerprint || '—') + '</code></dd>'
      +     '</dl>'
      +   '</details>'
      + '</div>'
      + '</li>';
  }
  function render() {
    var q = state.q.trim().toLowerCase();
    var rows = entries.filter(function (e) {
      if (!q) return true;
      var hay = (e.action + ' ' + e.prompt + ' ' + e.result + ' ' + (e.assets||[]).join(' ')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    logEl.innerHTML = rows.length
      ? rows.slice().reverse().map(renderEntry).join('')
      : '<li class="hibt-empty">No entries match.</li>';
    if (filterStatusEl) {
      filterStatusEl.textContent = rows.length === entries.length
        ? ('showing all ' + entries.length + ' entries')
        : ('showing ' + rows.length + ' of ' + entries.length + ' entries');
    }
  }
  function verifyChain() {
    var prev = 'GENESIS';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.seq !== (i + 1)) return { ok: false, reason: 'seq gap at ' + e.seq };
      if (e.prev_entry_sha256 !== prev) return { ok: false, reason: 'chain break at seq ' + e.seq };
      prev = e.entry_sha256;
    }
    return { ok: true };
  }
  if (searchEl) {
    searchEl.addEventListener('input', function (ev) {
      state.q = ev.target.value || '';
      render();
    });
  }
  var check = verifyChain();
  if (chainEl) {
    chainEl.textContent = check.ok
      ? 'chain · structurally OK (verify signatures with python -m src.audit_log verify)'
      : 'chain · BROKEN — ' + check.reason;
    chainEl.classList.add(check.ok ? 'pass' : 'fail');
  }
  if (countEl) countEl.textContent = entries.length + ' entries';
  if (fpEl) {
    var fp = entries.length ? entries[entries.length - 1].key_fingerprint : '—';
    fpEl.textContent = 'fp · ' + (fp || '—');
  }
  render();
})();
"""

    # SPA-specific styles to make the views toggleable
    spa_css = """
/* SPA view toggle */
section.view { display: none; }
section.view.active { display: block; }
/* Make the sticky lesson-progress non-sticky in the SPA context (it conflicts
   with the global header / SPA tab bar) */
.lesson-progress { position: static !important; top: auto !important; }
/* Top tab bar styling for the view toggle */
.spa-nav {
  display: flex; gap: var(--space-2); flex-wrap: wrap;
  padding: var(--space-3) var(--space-6);
  background: var(--paper-card);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 100;
  box-shadow: var(--shadow-sm);
}
.spa-nav button {
  background: var(--paper-soft);
  color: var(--ink-soft);
  border: 1px solid var(--border);
  padding: 0.4em 1em;
  font-size: var(--text-sm);
  font-weight: 500;
}
.spa-nav button.on {
  background: var(--hydra-teal);
  color: var(--paper);
  border-color: var(--hydra-teal);
}
.spa-nav .spa-brand {
  display: inline-flex; align-items: center; gap: var(--space-2);
  margin-right: auto; font-weight: 600;
}
.spa-nav .spa-brand .brand-mark {
  display: inline-block; width: 28px; height: 28px;
}
.spa-notice {
  background: var(--hydra-teal-soft);
  border: 1px solid var(--hydra-teal);
  padding: var(--space-3) var(--space-6);
  font-size: var(--text-sm);
  color: var(--ink-soft);
  text-align: center;
}
"""

    head = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Framework Lab for AIGovOps Auditors</title>
  <meta name="description" content="A two-tier interactive lab for AI auditors built on AIGovOps Beacon. Level 100 walks the 30-minute Beacon flow; Level 200 covers the Suitcase Lab, the 9 lab variants, Policy-as-Code, the receipt API, and the 100-failure deep-dive." />
  <meta name="theme-color" content="#01696f" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
"""

    inline_css = "  <style>\n" + site_css + "\n\n/* === lab.css === */\n" + lab_css + "\n\n/* === SPA overlay === */\n" + spa_css + "\n  </style>\n</head>\n"

    spa_header = """
<body class="lab-body">
  <nav class="spa-nav" id="viewNav" aria-label="View toggle">
    <span class="spa-brand">
      <svg class="brand-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#01696f"/>
        <circle cx="16" cy="16" r="9" fill="none" stroke="#2ecc71" stroke-width="1.2" opacity="0.5"/>
        <text x="16" y="20.5" font-family="Inter,sans-serif" font-size="11" font-weight="700" fill="#2ecc71" text-anchor="middle">Y</text>
      </svg>
      AIGovOps Beacon &middot; Framework Lab
    </span>
    <button type="button" data-view-target="hub">Hub</button>
    <button type="button" data-view-target="l100">Level 100</button>
    <button type="button" data-view-target="l200">Level 200</button>
    <button type="button" data-view-target="hibt">How I Built This</button>
  </nav>
  <div class="spa-notice">
    Live preview while GitHub Pages catches up. The canonical pages will live at
    <a href="https://aigovops-foundation.github.io/aigovops-beacon/" target="_blank" rel="noopener">aigovops-foundation.github.io/aigovops-beacon</a>
    once the build lands on main. The 100-failure dataset is loaded live from the canonical Beacon site.
  </div>
"""

    body_sections = (
        '<section class="view" data-view="hub">\n'
        + hub_main + '\n</section>\n'
        + '<section class="view lesson-body" data-view="l100">\n'
        + l100_main + '\n</section>\n'
        + '<section class="view lesson-body" data-view="l200">\n'
        + l200_main + '\n</section>\n'
        + '<section class="view hibt-body" data-view="hibt">\n'
        + hibt_main + '\n</section>\n'
    )

    cdn = """
  <script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/tweetnacl-util@0.15.1/nacl-util.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
"""

    inline_js = (
        '\n  <script>\nwindow.__BEACON_AUDIT_LOG__ = '
        + audit_log_json
        + ';\n' + failures_inline + '  </script>\n'
        + '  <script>\n' + lab_js + '\n  </script>\n'
        + '  <script>\n' + sandbox_js + '\n  </script>\n'
        + '  <script>\n' + failures_js + '\n  </script>\n'
        + '  <script>\n' + hibt_renderer_js + '\n  </script>\n'
        + '  <script>\n' + cert_js + '\n  </script>\n'
        + '  <script>\n' + splash_js + '\n  </script>\n'
        + '  <script>\n' + spa_shim_js + '\n  </script>\n'
    )

    closing = "</body>\n</html>\n"

    out_html = (
        head
        + inline_css
        + spa_header
        + body_sections
        + cdn
        + inline_js
        + closing
    )

    out_name = "published-lab-offline.html" if offline else "published-lab.html"
    out_path = ROOT / out_name
    out_path.write_text(out_html, encoding="utf-8")
    return out_path


if __name__ == "__main__":
    import sys
    offline = "--offline" in sys.argv
    p = build(offline=offline)
    mode = "offline" if offline else "online"
    print(f"Wrote {p}  ({p.stat().st_size:,} bytes)  [{mode}]")
