/* AIGovOps Beacon — 100-case failures browser
   Loads ./data/ai_failures_top100.json and renders a filterable, searchable list.
   Each row links the incident to its YES-act, mapped frameworks, and the receipt
   that would have produced the evidence.
*/
(function () {
  'use strict';

  var listEl = document.getElementById('failuresList');
  var searchEl = document.getElementById('failureSearch');
  var filtersEl = document.getElementById('failureFilters');
  if (!listEl) return;

  var state = { all: [], filter: 'all', q: '' };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function actClass(act) {
    if (act === 'YES-Ship AI') return 'act-ship';
    if (act === 'YES-Steady AI') return 'act-steady';
    if (act === 'YES-Recover AI') return 'act-recover';
    return '';
  }

  function actShort(act) {
    return (act || '').replace('YES-', '').replace(' AI', '');
  }

  function renderRow(c, i) {
    var src = c.source || {};
    var srcHtml = src.url
      ? '<a href="' + escapeHtml(src.url) + '" target="_blank" rel="noopener">'
        + escapeHtml(src.text || 'Source') + ' &#8599;</a>'
      : '';
    var frameworks = (c.frameworks || [])
      .slice(0, 4)
      .map(function (f) { return '<span class="fw-chip">' + escapeHtml(f) + '</span>'; })
      .join('');
    return ''
      + '<article class="failure-card ' + actClass(c.act) + '" data-act="' + escapeHtml(c.act) + '">'
      +   '<div class="failure-head">'
      +     '<div class="failure-title">'
      +       '<span class="failure-idx">' + String(i + 1).padStart(3, '0') + '</span>'
      +       '<h3>' + escapeHtml(c.incident) + '</h3>'
      +       '<span class="failure-year">' + escapeHtml(c.year) + '</span>'
      +     '</div>'
      +     '<div class="failure-meta">'
      +       '<span class="failure-sector">' + escapeHtml(c.sector) + '</span>'
      +       '<span class="failure-damage">' + escapeHtml(c.damage) + '</span>'
      +       '<span class="failure-act ' + actClass(c.act) + '">'
      +         actShort(c.act) + '</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="failure-body">'
      +     '<p class="failure-cause"><strong>Root cause —</strong> ' + escapeHtml(c.root_cause) + '</p>'
      +     '<p class="failure-reg"><strong>Action —</strong> ' + escapeHtml(c.regulator) + '</p>'
      +     '<p class="failure-control"><strong>The receipt that would have caught it —</strong> ' + escapeHtml(c.control) + '</p>'
      +     '<div class="failure-frameworks">' + frameworks + '</div>'
      +     (srcHtml ? '<p class="failure-source">' + srcHtml + '</p>' : '')
      +   '</div>'
      + '</article>';
  }

  function render() {
    var q = state.q.trim().toLowerCase();
    var f = state.filter;
    var rows = state.all.filter(function (c) {
      if (f !== 'all' && c.act !== f) return false;
      if (!q) return true;
      var hay = (c.incident + ' ' + c.sector + ' ' + c.regulator + ' '
        + c.root_cause + ' ' + (c.frameworks || []).join(' ')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    listEl.innerHTML = rows.length
      ? rows.map(renderRow).join('')
      : '<p class="empty">No cases match those filters.</p>';
    var hits = document.querySelector('[data-stat="total"]');
    if (hits) hits.textContent = rows.length === state.all.length
      ? state.all.length
      : (rows.length + ' / ' + state.all.length);
  }

  function setStats() {
    var counts = { ship: 0, steady: 0, recover: 0 };
    state.all.forEach(function (c) {
      if (c.act === 'YES-Ship AI') counts.ship++;
      else if (c.act === 'YES-Steady AI') counts.steady++;
      else if (c.act === 'YES-Recover AI') counts.recover++;
    });
    var s = document.querySelector('[data-stat="ship"]'); if (s) s.textContent = counts.ship;
    s = document.querySelector('[data-stat="steady"]'); if (s) s.textContent = counts.steady;
    s = document.querySelector('[data-stat="recover"]'); if (s) s.textContent = counts.recover;
  }

  if (searchEl) {
    searchEl.addEventListener('input', function (e) {
      state.q = e.target.value || '';
      render();
    });
  }

  if (filtersEl) {
    filtersEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      filtersEl.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.filter = btn.getAttribute('data-filter') || 'all';
      render();
    });
  }

  fetch('./data/ai_failures_top100.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      state.all = Array.isArray(rows) ? rows : [];
      setStats();
      render();
    })
    .catch(function (err) {
      listEl.innerHTML = '<p class="empty">Could not load failures dataset. '
        + escapeHtml(String(err)) + '</p>';
    });
})();
