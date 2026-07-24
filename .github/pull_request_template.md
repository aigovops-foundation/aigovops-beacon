# Beacon Change Declaration

## Summary
<!-- What does this PR change and why? -->

## Scope of Change
- [ ] Adds or modifies a beacon (`beacons/`)
- [ ] Adds or modifies a checklist (`checklists/` or `checklist/`)
- [ ] Adds or modifies a crosswalk (`crosswalks/`)
- [ ] Agent capability (`agent/`)
- [ ] Audit log / signing change (`audit/`)
- [ ] Deploy / systemd / packaging (`deploy/`, `beacons/systemd/`)
- [ ] Docs / lab site (`docs/`)
- [ ] CI workflow change (`.github/workflows/`)
- [ ] Tagline: YES-Ship · YES-Steady · YES-Recover impact noted below
- [ ] Documentation only

## OVERT / framework impact
<!-- Which OVERT 1.0 sections, NIST AI RMF subcategories, or EU AI Act articles does this touch? -->
- OVERT 1.0:
- NIST AI RMF:
- EU AI Act:
- ISO 42001 (if applicable):

## Risk
- [ ] Increases coverage
- [ ] Maintains coverage
- [ ] Decreases coverage (justify below)
- [ ] Changes signing identity, key material, or audit-log format (requires extra review)

## Evidence
- [ ] CI is green on this branch (`ci.yml`)
- [ ] Signed audit-log entries (if applicable) attached or linked
- [ ] New / changed beacons include a working example invocation

## Reviewer checklist
- [ ] Apache-2.0 license headers / attributions intact
- [ ] No regression in existing beacon profiles
- [ ] Public APIs and beacon schemas are still backward compatible (or the bump is documented)
- [ ] Docs and `README.md` updated if user-visible behavior changed
