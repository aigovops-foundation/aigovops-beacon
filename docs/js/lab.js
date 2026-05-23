/* AIGovOps Beacon — Framework Lab shared controller.
 *
 * Handles:
 *  - localStorage progress tracking (per-section completion + quiz scores)
 *  - Progress bar update across all sections
 *  - Quiz scoring (radio-based, reveals correct/incorrect + explainer)
 *  - Section completion checkboxes
 *  - Completion-attestation reveal when all 4 statements are checked
 *  - Cross-page completion percent (read by hub)
 *
 * Storage keys:
 *   aigovops-beacon-lab-100  — { sections: {id: true}, quizzes: {qid: 'opt-key'}, attest: {n: true} }
 *   aigovops-beacon-lab-200  — same shape
 *
 * Pages opt in by setting <body data-lab-level="100" | "200"> and using the
 * documented class names. See docs/lab-100.html and docs/lab-200.html.
 */
(function () {
  'use strict';

  var body = document.body;
  var level = body && body.getAttribute('data-lab-level');
  if (!level) return; // not a lesson page — exit silently

  var STORAGE_KEY = 'aigovops-beacon-lab-' + level;

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { sections: {}, quizzes: {}, attest: {} };
      var p = JSON.parse(raw);
      return {
        sections: p.sections || {},
        quizzes: p.quizzes || {},
        attest: p.attest || {}
      };
    } catch (e) {
      return { sections: {}, quizzes: {}, attest: {} };
    }
  }

  function saveProgress(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) { /* quota / disabled — silent */ }
  }

  var state = loadProgress();

  // ============ PROGRESS BAR ============
  var progressFill = document.querySelector('.progress-fill');
  var progressPct = document.querySelector('.progress-pct');

  function totalSections() {
    return document.querySelectorAll('.lesson-section[data-section-id]').length;
  }

  function completedSections() {
    var ids = Object.keys(state.sections).filter(function (k) { return state.sections[k]; });
    return ids.length;
  }

  function updateProgress() {
    var total = totalSections();
    var done = completedSections();
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressPct) progressPct.textContent = pct + '% complete · ' + done + ' of ' + total + ' sections';
    // Reflect status pills
    document.querySelectorAll('.lesson-section[data-section-id]').forEach(function (sec) {
      var id = sec.getAttribute('data-section-id');
      var status = sec.querySelector('.section-status');
      if (status) {
        if (state.sections[id]) status.classList.add('complete');
        else status.classList.remove('complete');
        status.textContent = state.sections[id] ? '✓ complete' : '○ mark complete';
      }
    });
  }

  // ============ SECTION COMPLETION ============
  document.querySelectorAll('.lesson-section[data-section-id] .section-status').forEach(function (status) {
    status.addEventListener('click', function () {
      var sec = status.closest('.lesson-section');
      var id = sec.getAttribute('data-section-id');
      state.sections[id] = !state.sections[id];
      saveProgress(state);
      updateProgress();
    });
  });

  // ============ QUIZ ============
  document.querySelectorAll('.quiz-q').forEach(function (q) {
    var qid = q.getAttribute('data-qid');
    var correctOpt = q.getAttribute('data-correct');
    if (!qid || !correctOpt) return;

    var saved = state.quizzes[qid];
    if (saved) {
      q.classList.add('answered');
      q.querySelectorAll('label').forEach(function (lbl) {
        var input = lbl.querySelector('input[type=radio]');
        if (!input) return;
        if (input.value === saved) input.checked = true;
        if (input.value === correctOpt) lbl.classList.add('correct');
        else if (input.value === saved && saved !== correctOpt) lbl.classList.add('incorrect');
      });
    }

    q.querySelectorAll('input[type=radio]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (q.classList.contains('answered')) return; // lock after answer
        state.quizzes[qid] = input.value;
        q.classList.add('answered');
        q.querySelectorAll('label').forEach(function (lbl) {
          var inp = lbl.querySelector('input[type=radio]');
          if (!inp) return;
          if (inp.value === correctOpt) lbl.classList.add('correct');
          else if (inp.value === input.value && input.value !== correctOpt) lbl.classList.add('incorrect');
        });
        saveProgress(state);
        updateQuizSummary();
      });
    });
  });

  // ============ QUIZ SUMMARY ============
  function updateQuizSummary() {
    var summaries = document.querySelectorAll('.quiz-summary');
    summaries.forEach(function (sum) {
      var quiz = sum.closest('.quiz');
      if (!quiz) return;
      var qs = quiz.querySelectorAll('.quiz-q[data-qid]');
      var correct = 0, answered = 0;
      qs.forEach(function (q) {
        var qid = q.getAttribute('data-qid');
        var ans = state.quizzes[qid];
        if (ans) {
          answered++;
          if (ans === q.getAttribute('data-correct')) correct++;
        }
      });
      sum.querySelector('[data-quiz-score]').textContent = correct + ' / ' + qs.length;
      sum.querySelector('[data-quiz-answered]').textContent = answered + ' answered';
    });
  }

  // ============ COMPLETION ATTESTATION ============
  document.querySelectorAll('.attest input[type=checkbox][data-attest-n]').forEach(function (cb) {
    var n = cb.getAttribute('data-attest-n');
    if (state.attest[n]) cb.checked = true;
    cb.addEventListener('change', function () {
      state.attest[n] = cb.checked;
      saveProgress(state);
      updateAttestReveal();
    });
  });

  function updateAttestReveal() {
    var all = document.querySelectorAll('.attest input[type=checkbox][data-attest-n]');
    if (!all.length) return;
    var allChecked = Array.prototype.every.call(all, function (cb) { return cb.checked; });
    var reveal = document.querySelector('.attest-final');
    if (reveal) reveal.classList.toggle('show', allChecked);
    if (allChecked) {
      // Mark a synthetic "completion" section so progress hits 100%
      state.sections['_attest_completion'] = true;
      saveProgress(state);
      updateProgress();
    }
  }

  // ============ RESET ============
  var resetBtn = document.querySelector('[data-action="reset-progress"]');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      if (!confirm('Reset all progress and quiz answers for Level ' + level + '?')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      location.reload();
    });
  }

  // Initial render
  updateProgress();
  updateQuizSummary();
  updateAttestReveal();
})();

/* ============ HUB COMPLETION READOUT ============
 * Hub page (lab.html) calls window.AIGovOpsBeaconLab.hubReadout() to populate
 * completion-percent badges from BOTH level storage keys. Safe to call
 * unconditionally; degrades to "Not started" if no storage entry exists. */
window.AIGovOpsBeaconLab = window.AIGovOpsBeaconLab || {};
window.AIGovOpsBeaconLab.hubReadout = function () {
  function pctFor(level, totalSections) {
    try {
      var raw = localStorage.getItem('aigovops-beacon-lab-' + level);
      if (!raw) return { pct: 0, done: 0, total: totalSections, started: false };
      var p = JSON.parse(raw);
      var done = Object.keys(p.sections || {}).filter(function (k) { return p.sections[k]; }).length;
      return { pct: totalSections ? Math.round((done / totalSections) * 100) : 0,
               done: done, total: totalSections, started: true };
    } catch (e) {
      return { pct: 0, done: 0, total: totalSections, started: false };
    }
  }
  document.querySelectorAll('[data-tier-readout]').forEach(function (el) {
    var level = el.getAttribute('data-tier-readout');
    var total = parseInt(el.getAttribute('data-tier-total'), 10) || 0;
    var info = pctFor(level, total);
    if (!info.started) {
      el.textContent = 'Not started';
      return;
    }
    el.textContent = info.pct + '% · ' + info.done + ' of ' + info.total;
    if (info.pct === 100) el.classList.add('complete');
  });
};
