#!/usr/bin/env bash
#
# Framework Lab for AIGovOps Auditors — apply script.
#
# Applies the build as 4 atomic commits matching the original plan, with a
# growing signed audit log on each commit. Idempotent: re-runs skip cleanly
# if commits already exist with the matching subject lines.
#
# Usage:
#   tar -xzf aigovops-beacon-framework-lab.tar.gz
#   bash apply.sh
#
# Requires: git, head (POSIX), python3 + `cryptography` for the verify step.
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# -------- Pre-flight --------

if [ ! -d .git ]; then
  echo "ERROR: not in a git repo. cd into your aigovops-beacon clone first." >&2
  exit 1
fi

if [ "$(git rev-parse --show-prefix)" != "" ]; then
  echo "ERROR: please run from the repo root, not a subdirectory." >&2
  exit 1
fi

REMOTE_URL="$(git config --get remote.origin.url 2>/dev/null || echo '')"
if [[ "$REMOTE_URL" != *"aigovops-beacon"* ]]; then
  echo "WARN: this doesn't look like the aigovops-beacon repo (remote=$REMOTE_URL)." >&2
  read -r -p "Continue anyway? (y/N) " ok
  [[ "$ok" == "y" || "$ok" == "Y" ]] || exit 1
fi

if ! git diff-index --quiet HEAD --; then
  echo "ERROR: working tree is not clean. Commit or stash before applying." >&2
  git status --short
  exit 1
fi

echo "Repo:    $(pwd)"
echo "Branch:  $(git branch --show-current)"
echo "Remote:  $REMOTE_URL"
echo ""
echo "About to apply 4 atomic commits for the Framework Lab build."
read -r -p "Proceed? (y/N) " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || exit 1

# -------- .gitignore (idempotent) --------

if ! grep -qxF "audit/keys/private-key.pem" .gitignore 2>/dev/null; then
  printf "\n# AIGovOps Foundation audit logger — private key NEVER committed\naudit/keys/private-key.pem\n" >> .gitignore
  echo "  + extended .gitignore"
fi

# -------- Helper: skip if already committed by subject --------

already_have() {
  local subject="$1"
  git log --format=%s -n 50 HEAD 2>/dev/null | grep -qxF "$subject"
}

# ==========================================================================
# GROUP A — Audit infrastructure (seq 1-2)
# ==========================================================================

GROUP_A_SUBJECT="feat(audit): install AIGovOps cryptokey-receipted audit log + HIBT page"

if already_have "$GROUP_A_SUBJECT"; then
  echo "  ~ Group A already committed — skipping"
else
  # Use the after-A snapshot of the audit log
  cp audit/audit-log-after-a.jsonl audit/audit-log.jsonl

  git add .gitignore
  git add src/__init__.py src/audit_log.py
  git add audit/keys/public-key.pem audit/audit-log.jsonl
  git add docs/howibuilt.html

  git commit -m "$GROUP_A_SUBJECT" -m "\
- src/audit_log.py: Ed25519 + SHA-256 hash-chain audit logger (init-keys / append / verify / fingerprint)
- audit/keys/public-key.pem: committed public key (fp TrUguILJje1UUyeQie1g6w)
- audit/keys/private-key.pem: gitignored
- audit/audit-log.jsonl: 2 signed entries (genesis + group A)
- docs/howibuilt.html: HIBT page renders the chain in-browser

Verify:
  pip install cryptography
  python -m src.audit_log verify"
  echo "  + Group A committed"
fi

# ==========================================================================
# GROUP B — Hub + Level 100 + shared assets (seq 3)
# ==========================================================================

GROUP_B_SUBJECT="feat(lab): Framework Lab hub + Level 100 + shared assets"

if already_have "$GROUP_B_SUBJECT"; then
  echo "  ~ Group B already committed — skipping"
else
  cp audit/audit-log-after-b.jsonl audit/audit-log.jsonl

  git add audit/audit-log.jsonl
  git add docs/lab.html docs/lab-100.html
  git add docs/css/lab.css
  git add docs/js/lab.js docs/js/lab-sandbox.js
  git add docs/lab/worksheet-100.html
  git add docs/downloads/lab-worksheet-100.pdf docs/downloads/lab-worksheet-200.pdf
  git add scripts/build_worksheet_pdfs.py

  git commit -m "$GROUP_B_SUBJECT" -m "\
- docs/lab.html: hub with two tier cards + localStorage completion readouts
- docs/lab-100.html: 7-section guided 30-minute Beacon flow with sticky progress bar
- docs/js/lab-sandbox.js: client-side Ed25519 receipt sandbox (reuses tweetnacl + jszip)
- docs/lab/worksheet-100.html + docs/downloads/lab-worksheet-{100,200}.pdf: printable worksheets
- docs/css/lab.css + docs/js/lab.js: shared styles and controller (progress, quiz, attestation)
- scripts/build_worksheet_pdfs.py: reproducible fpdf2 PDF builder"
  echo "  + Group B committed"
fi

# ==========================================================================
# GROUP C — Level 200 + 100-failure deep-dive + worksheet 200 (seq 4)
# ==========================================================================

GROUP_C_SUBJECT="feat(lab): Level 200 + 100-failure deep-dive + worksheet 200"

if already_have "$GROUP_C_SUBJECT"; then
  echo "  ~ Group C already committed — skipping"
else
  cp audit/audit-log-after-c.jsonl audit/audit-log.jsonl

  git add audit/audit-log.jsonl
  git add docs/lab-200.html
  git add docs/js/lab-failures.js
  git add docs/lab/worksheet-200.html

  git commit -m "$GROUP_C_SUBJECT" -m "\
- docs/lab-200.html: 8-section advanced curriculum — Suitcase Lab, 9 lab variants from LAB.md, Policy-as-Code lab (gate YAML + OPA Rego), Receipt API lab, full 100-failure deep-dive table, advanced quiz, completion attestation
- docs/js/lab-failures.js: cleans the malformed frameworks field at runtime, filters by act/framework/harm/sector, click-to-expand panel with cross-links into Level 200 sections
- docs/lab/worksheet-200.html: printable worksheet (5 tech + 5 policy + deep-dive)"
  echo "  + Group C committed"
fi

# ==========================================================================
# GROUP D — Global nav wiring across existing pages (seq 5)
# ==========================================================================

GROUP_D_SUBJECT="chore(lab): wire Framework Lab into existing Beacon pages"

if already_have "$GROUP_D_SUBJECT"; then
  echo "  ~ Group D already committed — skipping"
else
  cp audit/audit-log-after-d.jsonl audit/audit-log.jsonl

  git add audit/audit-log.jsonl
  git add docs/index.html docs/quiz.html
  git add docs/walkthrough/index.html docs/video/index.html
  git add scripts/patch_existing_navs.py

  git commit -m "$GROUP_D_SUBJECT" -m "\
- docs/index.html: Framework Lab link added to main nav, new Framework Lab footer section with 6 links (hub, 100, 200, worksheets, HIBT)
- docs/video/index.html: Framework Lab link in nav between 'Run it' and 'Get the zip'
- docs/quiz.html: Framework Lab button next to '← Beacon' back-link, matching button style
- docs/walkthrough/index.html: Framework Lab link in meta line after YES mantra
- scripts/patch_existing_navs.py: idempotent reproducer for the above"
  echo "  + Group D committed"
fi

# -------- Post-flight --------

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "All 4 commits applied. Verifying the audit log chain offline:"
echo "─────────────────────────────────────────────────────────────"

if python3 -m src.audit_log verify 2>&1; then
  echo ""
  echo "Chain verified."
else
  echo ""
  echo "WARN: verify failed — install 'cryptography' (pip install cryptography) and re-run:"
  echo "  python3 -m src.audit_log verify"
fi

echo ""
echo "Push when ready:"
echo "  git push origin $(git branch --show-current)"
echo ""
echo "After push, Pages will rebuild. New URLs:"
echo "  https://aigovops-foundation.github.io/aigovops-beacon/lab.html"
echo "  https://aigovops-foundation.github.io/aigovops-beacon/lab-100.html"
echo "  https://aigovops-foundation.github.io/aigovops-beacon/lab-200.html"
echo "  https://aigovops-foundation.github.io/aigovops-beacon/howibuilt.html"
