# Framework Lab for AIGovOps Auditors — final build bundle

This tarball contains the complete Framework Lab build for `aigovops-foundation/aigovops-beacon` — three new lab pages (hub, Level 100, Level 200), a signed Ed25519 audit log, the HIBT page that renders it, printable worksheets in HTML and PDF, and surgical edits to all four existing Beacon pages adding a Framework Lab nav link.

GitHub OAuth in the build session was blocked, so all work was staged locally and packaged here. Apply with the included `apply.sh` script for a clean 4-commit history matching the original atomic-group plan, or pick the parts you want.

## Bundle contents

```
src/__init__.py
src/audit_log.py                       AIGovOps cryptokey-receipted audit logger (~13 KB)

audit/keys/public-key.pem              Ed25519 public key (fp TrUguILJje1UUyeQie1g6w)
audit/keys/private-key.pem             SESSION PRIVATE KEY — gitignored, kept per your decision
audit/audit-log.jsonl                  5 signed entries (genesis + 4 group commits)
audit/audit-log-after-a.jsonl          ↳ snapshot after Group A (2 entries)
audit/audit-log-after-b.jsonl          ↳ snapshot after Group B (3 entries)
audit/audit-log-after-c.jsonl          ↳ snapshot after Group C (4 entries)
audit/audit-log-after-d.jsonl          ↳ snapshot after Group D (5 entries) == full log

docs/howibuilt.html                    HIBT page rendering the signed chain in-browser
docs/lab.html                          Lab hub
docs/lab-100.html                      Level 100 — the 30-minute flow (7 sections)
docs/lab-200.html                      Level 200 — Suitcase + 9 variants + 100-failure deep-dive (8 sections)
docs/css/lab.css                       Component styles + print rules
docs/js/lab.js                         Progress tracking, quiz scoring, attestation reveal
docs/js/lab-sandbox.js                 Client-side Ed25519 receipt sandbox
docs/js/lab-failures.js                Cleans malformed frameworks field, filters, expand
docs/lab/worksheet-100.html            Printable worksheet (5 curated cases + blank)
docs/lab/worksheet-200.html            Printable worksheet (5 tech + 5 policy + deep-dive)
docs/downloads/lab-worksheet-100.pdf   PDF version (fpdf2-generated)
docs/downloads/lab-worksheet-200.pdf   PDF version

docs/index.html                        PATCHED — Framework Lab in nav + new footer section
docs/quiz.html                         PATCHED — Framework Lab next to "← Beacon" back link
docs/walkthrough/index.html            PATCHED — Framework Lab in meta line
docs/video/index.html                  PATCHED — Framework Lab in nav

scripts/build_worksheet_pdfs.py        Reproducible PDF builder
scripts/patch_existing_navs.py         Idempotent re-runnable nav patcher

.gitignore-additions                   single line: audit/keys/private-key.pem

apply.sh                               4-commit apply script
APPLY.md                               this file
```

## How to apply

```bash
cd ~/path/to/aigovops-beacon
# 1. Make sure your working tree is clean (or stash anything else)
git status

# 2. Extract this bundle on top of the repo
tar -xzf /path/to/aigovops-beacon-framework-lab.tar.gz

# 3. Run the script — does 4 atomic commits matching the original plan
bash apply.sh

# 4. Verify the signed chain
pip install cryptography
python -m src.audit_log verify
# {"ok": true, "count": 5, "fingerprint": "TrUguILJje1UUyeQie1g6w"}

# 5. Push
git push
```

GitHub Pages will rebuild from `/docs/`. New URLs once it lands:

- https://aigovops-foundation.github.io/aigovops-beacon/lab.html
- https://aigovops-foundation.github.io/aigovops-beacon/lab-100.html
- https://aigovops-foundation.github.io/aigovops-beacon/lab-200.html
- https://aigovops-foundation.github.io/aigovops-beacon/howibuilt.html
- https://aigovops-foundation.github.io/aigovops-beacon/lab/worksheet-100.html
- https://aigovops-foundation.github.io/aigovops-beacon/lab/worksheet-200.html

## About the signing key

You chose to keep the session-generated keypair (fingerprint `TrUguILJje1UUyeQie1g6w`). The private key is in this bundle at `audit/keys/private-key.pem` and is gitignored. After extracting:

```bash
chmod 600 audit/keys/private-key.pem
```

To rotate later: `python -m src.audit_log init-keys --force` (this will break the existing chain — archive the old log first).

## Verifying every entry was actually signed by THIS key

```bash
python -m src.audit_log fingerprint
# TrUguILJje1UUyeQie1g6w     <-- should match every entry's key_fingerprint
python -m src.audit_log verify
# walks the chain, re-hashes every entry, verifies the Ed25519 signature
```

## What's NOT in this bundle

- No changes to `docs/data/ai_failures_top100.json` (the dataset is read-only — the lab cleans the malformed `frameworks` field at runtime in `lab-failures.js`).
- No changes to `docs/js/failures.js` (the existing home-page failures browser is untouched).
- No changes to any `server/`, `studio/`, `mcp/`, `beacons/`, `frameworks/`, or `checklist/` content (the lab is purely additive in those terms).
- No CI changes — existing `.github/workflows/ci.yml` is not touched. Pages will rebuild via the existing GitHub Pages workflow.
