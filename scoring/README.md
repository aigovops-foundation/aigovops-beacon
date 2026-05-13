# Scoring engine — from receipts to a single number

The scoring layer turns a bundle of signed receipts into:

1. A **per-framework score** (0–100) showing how well each of the 23 frameworks
   in the registry is covered.
2. An **org AI risk index** (0–100, lower is better) summarising the org-wide
   posture.

It is intentionally simple. Auditors should be able to recompute every number
on a piece of paper.

---

## Formula

For every framework `F`:

```
framework_score(F) = 100 · Σ_{c ∈ F} (weight(c) · present(c))
                          ─────────────────────────────────────
                                 Σ_{c ∈ F} weight(c)
```

- `weight(c)` is the integer 1–10 declared on each control in the framework
  YAML.
- `present(c) ∈ {0, 1}`. A control is *present* iff at least one signed receipt
  in the bundle declares an `evidence_type` that maps to that control via
  `mapping.yaml`.

Then:

```
org_ai_risk_index = 100 − weighted_mean(framework_scores, by control_count)
```

i.e., the framework-score weighted mean is the org's "AI compliance score";
the risk index is its complement. Lower is better.

---

## Files

| File | Purpose |
|---|---|
| `engine.py` | Reads NDJSON receipts, applies the mapping, emits JSON. `--help` for flags. |
| `mapping.yaml` | `evidence_type → [framework_id.control_id, ...]`. 563 entries, auto-derived from the registry. |
| `build_mapping.py` | Regenerates `mapping.yaml` from `frameworks/*.yaml`. Re-run after editing controls. |
| `_synthetic.py` | Builds a realistic 46-receipt batch (no real PII). |
| `build_sample_report.py` | Runs synthetic → engine → markdown to produce `sample_report.md`. |
| `sample_report.md` | Human-readable example output. |

---

## How to tune weights

Two knobs:

1. **Control weight** (in `frameworks/<id>.yaml`). Edit the YAML, then re-run
   the registry build (`python frameworks/build_registry.py`). This changes
   how much that control contributes to its framework's score.
2. **Mapping** (in `scoring/mapping.yaml`). If your organisation collects an
   evidence type under a different label (`policy_doc` vs `policy_document`),
   add an alias here. Edits to `mapping.yaml` are operator-owned; the
   auto-generated seed can be overwritten by running `build_mapping.py` again.

There are no per-framework weights at the org-index level on purpose — every
framework is treated as equally important, with `control_count` as the
implicit weight (heavier frameworks influence the index more). If you need
weighted framework rollups, fork the `org_ai_risk_index()` function.

---

## Replaying receipts to validate scores

Reproducibility is the whole point. To validate:

```bash
# 1. Re-fetch the bundle (NDJSON of signed receipts)
python engine.py --receipts ./bundle/receipts.ndjson --out /tmp/replay.json

# 2. Diff against the published report
diff /tmp/replay.json published_report.json
```

If the two files differ in anything but `ts_utc` of the report itself, the
bundle has been tampered with or your mapping has drifted. Either is a
finding worth investigating.

Every receipt is independently verifiable: load the public key from
`~/.beacon/keys/ed25519.pub`, RFC-8785-canonicalise the receipt minus its
`signature` block, and verify against `signature.sig_b64`.

---

## Sample run

```text
$ python engine.py --receipts ./sample_receipts.ndjson
Receipts            : 46
Distinct evidence   : 46
Controls present    : 97
org_ai_risk_index   : 55.42
```

See [`sample_report.md`](./sample_report.md) for the full rendered output.
