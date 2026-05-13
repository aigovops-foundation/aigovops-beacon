# i18n — translating the framework registry

The 23 frameworks in `frameworks/*.yaml` are authored in English (the
language of the underlying regulatory texts). Operators in non-English
jurisdictions need the **human-readable** parts of each framework in
their working language; the **identifiers** (framework_id, control id,
severity, weights) stay English so receipts remain wire-compatible
across deployments.

## What gets translated

| Field | Translated? |
|---|---|
| `full_name` | ✅ |
| `scope_summary` | ✅ |
| `applies_to` | ✅ |
| `penalties` | ✅ |
| `control.statement` (each control) | ✅ |
| `framework_id`, `short_name` | ❌ — these are stable identifiers |
| `control.id`, `control.severity`, `control.weight` | ❌ |
| URLs in `sources` | ❌ |

Output goes to:

```
frameworks/translations/<iso-639-1 lang code>/<framework_id>.yaml
```

Every translation file carries a `translation_status` field:

- `machine` — produced by the LLM, not yet reviewed
- `human_verified` — reviewed by a competent translator
- `stub` — structural copy of the English text (no real translation)

## Quick start

```bash
# Set credentials
export OPENAI_API_KEY=sk-...
# Optional: point at any OpenAI-compatible endpoint (Azure, vLLM, etc.)
export OPENAI_BASE_URL=https://api.openai.com/v1

# Machine-translate one framework
python i18n/translate.py --framework nist-ai-rmf --lang es

# Dry-run (no API call; emits a stub)
python i18n/translate.py --framework eu-ai-act --lang ja --dry-run

# Different model
python i18n/translate.py --framework nist-ai-rmf --lang fr --model gpt-4o
```

If `OPENAI_API_KEY` is not set the script does **not** fail. It writes a
structural stub copying the English text and prints a clear warning;
downstream code (Studio, scoring engine) continues to work.

## Proof-of-concept files

We have shipped four human-verified translations as a proof of concept:

- `frameworks/translations/es/nist-ai-rmf.yaml`
- `frameworks/translations/ar/nist-ai-rmf.yaml`
- `frameworks/translations/es/eu-ai-act.yaml`
- `frameworks/translations/ar/eu-ai-act.yaml`

All are marked `translation_status: human_verified`. They demonstrate
the shape an audit-grade localisation looks like; the same shape is
what `translate.py` emits for other languages with the `machine` tag.

## Review workflow

1. Run `translate.py` with an API key to produce a `machine` file.
2. Open a PR adding the new file; reviewers diff it against the English
   source and the previously-published machine output.
3. Once a domain expert signs off, flip `translation_status: machine`
   to `translation_status: human_verified` in the YAML.
4. The Studio chooses `human_verified` over `machine` whenever both
   exist; missing keys fall back to English.
