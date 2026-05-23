/* AIGovOps Beacon — Framework Lab full 100-failure deep-dive.
 *
 * Used by lab-200.html. Loads docs/data/ai_failures_top100.json (the same
 * dataset rendered on the Beacon home page) and offers:
 *   - frameworks cleanup (the source JSON has Python-repr-style string
 *     fragments like "['NIST AI RMF'" and "'OECD AI Principles']")
 *   - multi-filter UI: act, framework, harm type, sector, year decade
 *   - text search across incident, regulator, root cause, frameworks
 *   - click-to-expand panel with full root cause, regulator, control, source
 *   - cross-links from the "Beacon artifact" hint to the relevant
 *     Level 200 section (variants, receipt API, policy-as-code)
 */
(function () {
  'use strict';

  var listEl = document.getElementById('deepfailList');
  if (!listEl) return;

  var searchEl = document.getElementById('deepfailSearch');
  var actEl = document.getElementById('deepfailAct');
  var fwEl = document.getElementById('deepfailFramework');
  var harmEl = document.getElementById('deepfailHarm');
  var sectorEl = document.getElementById('deepfailSector');
  var statsEl = document.getElementById('deepfailStats');

  var state = {
    all: [],
    filters: { q: '', act: 'all', framework: 'all', harm: 'all', sector: 'all' }
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * The source frameworks field is a list of strings that together encode a
   * Python repr. Example raw input:
   *   ["['NIST AI RMF'", "'ISO/IEC 42001'", "'ISO/IEC 23894'", "'OECD AI Principles']"]
   * We strip leading/trailing brackets and quotes from each entry and discard empties.
   */
  function cleanFrameworks(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(function (s) {
        return String(s || '')
          .replace(/^[\s\[\]'"]+/, '')   // leading bracket / quote / whitespace
          .replace(/[\s\[\]'"]+$/, '')   // trailing bracket / quote / whitespace
          .trim();
      })
      .filter(Boolean);
  }

  function parseHarms(str) {
    if (!str) return [];
    return String(str).split(/[,/]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function decadeOf(year) {
    var m = String(year || '').match(/(\d{4})/);
    if (!m) return 'unknown';
    var y = parseInt(m[1], 10);
    return Math.floor(y / 10) * 10 + 's';
  }

  function actClass(act) {
    if (act === 'YES-Ship AI') return 'ship';
    if (act === 'YES-Steady AI') return 'steady';
    if (act === 'YES-Recover AI') return 'recover';
    return '';
  }

  function actShort(act) {
    return (act || '').replace('YES-', '').replace(' AI', '');
  }

  /**
   * Map a control hint to a cross-link into the Level 200 page.
   * Heuristic — if the control mentions specific Beacon artifacts we know
   * about, point the reader to the matching Level 200 section.
   */
  function crosslinkFor(control) {
    var c = String(control || '').toLowerCase();
    if (c.indexOf('policy as code') !== -1 || c.indexOf('rego') !== -1 || c.indexOf('gate') !== -1) {
      return { href: '#policy-as-code', label: 'Policy-as-Code lab' };
    }
    if (c.indexOf('checklist receipt') !== -1) {
      return { href: '#variants', label: 'Lab 4 — score a framework' };
    }
    if (c.indexOf('mcp') !== -1) {
      return { href: '#variants', label: 'Lab 6 — MCP attest' };
    }
    if (c.indexOf('scoring') !== -1) {
      return { href: '#variants', label: 'Lab 4 — score a framework' };
    }
    if (c.indexOf('api') !== -1 || c.indexOf('receipt') !== -1) {
      return { href: '#receipt-api', label: 'Receipt API lab' };
    }
    return { href: '#variants', label: 'Lab variants' };
  }

  function renderRow(c, i) {
    var frameworks = cleanFrameworks(c.frameworks);
    var fwChips = frameworks.slice(0, 6).map(function (f) {
      return '<span class="fw-chip">' + escapeHtml(f) + '</span>';
    }).join('');
    var src = c.source || {};
    var srcHtml = src.url
      ? '<a href="' + escapeHtml(src.url) + '" target="_blank" rel="noopener">'
        + escapeHtml(src.text || 'Source') + ' &#8599;</a>'
      : escapeHtml(src.text || '');
    var cross = crosslinkFor(c.control);

    return ''
      + '<details class="deepfail-row" data-act="' + escapeHtml(c.act) + '">'
      +   '<summary>'
      +     '<span class="row-idx">' + String(i + 1).padStart(3, '0') + '</span>'
      +     '<div>'
      +       '<div class="row-incident">' + escapeHtml(c.incident) + '</div>'
      +       '<div style="font-size:var(--text-xs); color:var(--ink-faint); margin-top:0.2em;">'
      +         escapeHtml(c.sector || '') + ' &middot; ' + escapeHtml(c.damage || '')
      +       '</div>'
      +     '</div>'
      +     '<span class="row-year">' + escapeHtml(c.year || '') + '</span>'
      +     '<span class="row-act ' + actClass(c.act) + '">' + escapeHtml(actShort(c.act)) + '</span>'
      +   '</summary>'
      +   '<div class="row-body">'
      +     '<dl>'
      +       '<dt>Root cause</dt><dd>' + escapeHtml(c.root_cause || '') + '</dd>'
      +       '<dt>Harm type</dt><dd>' + escapeHtml(c.harm_type || '') + '</dd>'
      +       '<dt>Regulator action</dt><dd>' + escapeHtml(c.regulator || '') + '</dd>'
      +       '<dt>Beacon artifact</dt><dd>' + escapeHtml(c.control || '') + '</dd>'
      +       '<dt>Source</dt><dd>' + srcHtml + '</dd>'
      +     '</dl>'
      +     '<div class="fw-chips">' + fwChips + '</div>'
      +     '<p style="margin-top:var(--space-3); font-size:var(--text-sm);">'
      +       '<a href="' + cross.href + '" class="btn-ghost btn-sm">→ ' + escapeHtml(cross.label) + '</a>'
      +     '</p>'
      +   '</div>'
      + '</details>';
  }

  function populateFilters(rows) {
    var fws = {}, harms = {}, sectors = {};
    rows.forEach(function (r) {
      cleanFrameworks(r.frameworks).forEach(function (f) { fws[f] = true; });
      parseHarms(r.harm_type).forEach(function (h) { harms[h] = true; });
      if (r.sector) sectors[r.sector] = true;
    });
    fillSelect(fwEl, Object.keys(fws).sort());
    fillSelect(harmEl, Object.keys(harms).sort());
    fillSelect(sectorEl, Object.keys(sectors).sort());
  }

  function fillSelect(el, options) {
    if (!el) return;
    var html = '<option value="all">All</option>';
    options.forEach(function (o) {
      html += '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>';
    });
    el.innerHTML = html;
  }

  function matches(c, f) {
    if (f.act !== 'all' && c.act !== f.act) return false;
    if (f.framework !== 'all') {
      var fws = cleanFrameworks(c.frameworks);
      if (fws.indexOf(f.framework) === -1) return false;
    }
    if (f.harm !== 'all') {
      var harms = parseHarms(c.harm_type);
      if (harms.indexOf(f.harm) === -1) return false;
    }
    if (f.sector !== 'all' && c.sector !== f.sector) return false;
    if (f.q) {
      var hay = (c.incident + ' ' + c.sector + ' ' + c.regulator + ' '
        + c.root_cause + ' ' + (c.control || '') + ' '
        + cleanFrameworks(c.frameworks).join(' ')).toLowerCase();
      if (hay.indexOf(f.q) === -1) return false;
    }
    return true;
  }

  function render() {
    var rows = state.all.filter(function (c) { return matches(c, state.filters); });
    listEl.innerHTML = rows.length
      ? rows.map(renderRow).join('')
      : '<p style="color:var(--ink-faint); text-align:center; padding:var(--space-8);">No cases match those filters.</p>';
    if (statsEl) {
      var counts = { all: rows.length, ship: 0, steady: 0, recover: 0 };
      rows.forEach(function (c) {
        if (c.act === 'YES-Ship AI') counts.ship++;
        else if (c.act === 'YES-Steady AI') counts.steady++;
        else if (c.act === 'YES-Recover AI') counts.recover++;
      });
      statsEl.innerHTML = ''
        + '<span class="stat">Showing ' + counts.all + ' of ' + state.all.length + '</span>'
        + '<span class="stat">YES-Ship: ' + counts.ship + '</span>'
        + '<span class="stat">YES-Steady: ' + counts.steady + '</span>'
        + '<span class="stat">YES-Recover: ' + counts.recover + '</span>';
    }
  }

  if (searchEl) searchEl.addEventListener('input', function (e) {
    state.filters.q = (e.target.value || '').trim().toLowerCase();
    render();
  });
  if (actEl) actEl.addEventListener('change', function (e) {
    state.filters.act = e.target.value;
    render();
  });
  if (fwEl) fwEl.addEventListener('change', function (e) {
    state.filters.framework = e.target.value;
    render();
  });
  if (harmEl) harmEl.addEventListener('change', function (e) {
    state.filters.harm = e.target.value;
    render();
  });
  if (sectorEl) sectorEl.addEventListener('change', function (e) {
    state.filters.sector = e.target.value;
    render();
  });

  fetch('./data/ai_failures_top100.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('failures dataset HTTP ' + r.status);
      return r.json();
    })
    .then(function (rows) {
      state.all = Array.isArray(rows) ? rows : [];
      populateFilters(state.all);
      render();
    })
    .catch(function (err) {
      listEl.innerHTML = '<p style="color:var(--fail); text-align:center; padding:var(--space-8);">Could not load failures dataset: ' + escapeHtml(String(err.message || err)) + '</p>';
    });
})();
