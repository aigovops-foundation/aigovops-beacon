/* AIGovOps Beacon — Framework Lab event splash + time pills.
 *
 * Two responsibilities, both safe to run on every lab page:
 *
 * 1. EVENT SPLASH — shows a one-time welcome banner for the upcoming
 *    AIGovOps Foundation virtual meeting (~100 attendees). Dismissed via
 *    localStorage key `aigovops-beacon-lab-event-splash-dismissed`. Falls
 *    silent if the key is set, so it never bothers returning users.
 *
 * 2. TIME PILLS — every <section class="lesson-section" data-section-time="N min">
 *    gets an "≈ N min" pill injected next to its section number. Helps students
 *    pace themselves during a live event.
 */
(function () {
  'use strict';

  var SPLASH_KEY = 'aigovops-beacon-lab-event-splash-dismissed';

  function dismissed() {
    try { return localStorage.getItem(SPLASH_KEY) === '1'; }
    catch (e) { return false; }
  }
  function dismiss() {
    try { localStorage.setItem(SPLASH_KEY, '1'); } catch (e) {}
  }

  function injectSplash() {
    if (dismissed()) return;
    if (document.querySelector('.lab-splash')) return;

    var el = document.createElement('div');
    el.className = 'lab-splash';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Welcome to the Framework Lab');
    el.innerHTML = ''
      + '<div class="lab-splash-card">'
      +   '<button type="button" class="lab-splash-close" data-lab-splash-dismiss aria-label="Dismiss welcome">×</button>'
      +   '<span class="kicker" style="color:#2ecc71;">AIGovOps Foundation · Live virtual lab</span>'
      +   '<h2>Welcome — we\'re running this together.</h2>'
      +   '<p>About 100 of us are about to discover AI, sign receipts, and hand auditor bundles. The lab is self-paced — Bob and Ken will walk the room virtually and call out checkpoints. Everything you do runs in your browser; nothing leaves your tab.</p>'
      +   '<ul class="lab-splash-points">'
      +     '<li><strong>Start at Level 100.</strong> Around 30 minutes, designed for the full group.</li>'
      +     '<li><strong>Resume any time.</strong> Progress saves to your browser; reload anywhere.</li>'
      +     '<li><strong>Have a question during the lab?</strong> Use the meeting chat. We\'re tracking the room.</li>'
      +     '<li><strong>Want to keep going?</strong> Level 200 is the same lab, deeper — Suitcase Lab, Policy-as-Code, full 100-failure deep-dive.</li>'
      +     '<li><strong>At the end</strong>, you can issue yourself a signed completion certificate.</li>'
      +   '</ul>'
      +   '<div class="lab-splash-actions">'
      +     '<button type="button" class="btn-primary btn-sm" data-lab-splash-dismiss>Start the lab</button>'
      +     '<a class="btn-ghost btn-sm" href="mailto:bob.rapp@aigovops.community,ken.johnston@aigovops.community?subject=LAB%20question">Email Bob &amp; Ken</a>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(el);
    el.addEventListener('click', function (ev) {
      if (ev.target === el) { dismiss(); el.remove(); return; }
      var btn = ev.target.closest('[data-lab-splash-dismiss]');
      if (btn) { dismiss(); el.remove(); }
    });
    // Close on Escape
    document.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Escape' && document.body.contains(el)) {
        dismiss(); el.remove();
        document.removeEventListener('keydown', onKey);
      }
    });
  }

  function injectTimePills() {
    document.querySelectorAll('.lesson-section[data-section-time]').forEach(function (sec) {
      if (sec.querySelector('.section-time-pill')) return;
      var head = sec.querySelector('.section-head');
      if (!head) return;
      var time = sec.getAttribute('data-section-time');
      var pill = document.createElement('span');
      pill.className = 'section-time-pill';
      pill.textContent = '≈ ' + time;
      // Insert right after .section-num
      var num = head.querySelector('.section-num');
      if (num && num.parentNode === head) {
        num.parentNode.insertBefore(pill, num.nextSibling);
      } else {
        head.appendChild(pill);
      }
    });
  }

  function init() {
    injectSplash();
    injectTimePills();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
