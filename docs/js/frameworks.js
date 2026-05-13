/* Framework grid — populated from /data/frameworks_index.json */
(function () {
  'use strict';

  const STATUS_LABEL = {
    in_force: 'In force',
    voluntary: 'Voluntary',
    draft: 'Draft',
    proposed: 'Proposed',
  };
  const STATUS_PILL = {
    in_force: 'teal',
    voluntary: 'warn',
    draft: 'fail',
    proposed: 'fail',
  };

  const REPO = 'https://github.com/bobrapp/aigovops-beacon';
  const grid = document.getElementById('frameworkGrid');
  if (!grid) return;

  const counts = { all: 0, in_force: 0, voluntary: 0, draft: 0, proposed: 0 };
  let frameworks = [];

  function escape(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function cardHTML(f) {
    const status = f.status || 'voluntary';
    const pill = STATUS_PILL[status] || 'warn';
    const label = STATUS_LABEL[status] || status;
    const issuer = f.issuing_body ? escape(f.issuing_body).split(';')[0].split(',')[0].trim() : '';
    const juris = escape(f.jurisdiction || '').split(';')[0].trim();
    const scope = escape(f.scope_summary || '').slice(0, 220);
    return `
      <article class="framework-card" data-status="${status}">
        <div class="fc-head">
          <span class="auth">${juris}${issuer ? ' · ' + issuer : ''}</span>
          <span class="pill ${pill}">${label}</span>
        </div>
        <h3>${escape(f.short_name || f.full_name)}</h3>
        <p class="fc-scope">${scope}${scope.length === 220 ? '…' : ''}</p>
        <p class="fc-meta"><span class="kicker">${f.control_count} controls</span>${f.effective_date ? ' · <span class="kicker">' + escape(f.effective_date) + '</span>' : ''}</p>
        <div class="actions">
          <a href="${REPO}/blob/main/frameworks/${encodeURIComponent(f.framework_id)}.yaml" class="btn-ghost btn-sm" target="_blank" rel="noopener">YAML ↗</a>
          <a href="${REPO}/blob/main/frameworks/${encodeURIComponent(f.framework_id)}.xml" class="btn-ghost btn-sm" target="_blank" rel="noopener">XML ↗</a>
          ${f.primary_url ? `<a href="${escape(f.primary_url)}" class="btn-ghost btn-sm" target="_blank" rel="noopener">Source ↗</a>` : ''}
        </div>
      </article>
    `;
  }

  function render(filter) {
    const visible = filter === 'all' ? frameworks : frameworks.filter(f => f.status === filter);
    grid.innerHTML = visible.map(cardHTML).join('');
  }

  function updateCounts() {
    counts.all = frameworks.length;
    counts.in_force = frameworks.filter(f => f.status === 'in_force').length;
    counts.voluntary = frameworks.filter(f => f.status === 'voluntary').length;
    counts.draft = frameworks.filter(f => f.status === 'draft').length;
    counts.proposed = frameworks.filter(f => f.status === 'proposed').length;
    const map = {
      countAll: counts.all,
      countInForce: counts.in_force,
      countVoluntary: counts.voluntary,
      countDraft: counts.draft,
      countProposed: counts.proposed,
    };
    Object.entries(map).forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    });
  }

  function wireFilters() {
    const buttons = document.querySelectorAll('.framework-filters .filter-pill');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        render(btn.dataset.filter || 'all');
      });
    });
  }

  fetch('./data/frameworks_index.json', { cache: 'no-cache' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      // Sort: in_force first, then voluntary, draft, proposed; alpha within
      const order = { in_force: 0, voluntary: 1, draft: 2, proposed: 3 };
      frameworks = data.slice().sort((a, b) => {
        const so = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (so !== 0) return so;
        return (a.short_name || '').localeCompare(b.short_name || '');
      });
      updateCounts();
      render('all');
      wireFilters();
    })
    .catch(err => {
      console.error('framework index load failed', err);
      grid.innerHTML = '<p class="framework-loading kicker">Framework registry unavailable. <a href="' + REPO + '/tree/main/frameworks" target="_blank" rel="noopener">Browse on GitHub ↗</a></p>';
    });
})();
