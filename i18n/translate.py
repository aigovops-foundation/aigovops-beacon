#!/usr/bin/env python3
"""
i18n/translate.py — Translate a framework YAML into another language.

Translates only the human-readable fields:

  • full_name
  • scope_summary
  • applies_to
  • penalties
  • control.statement (for every control)

It does **not** touch:

  • framework_id, short_name (preserved as English identifiers)
  • control.id, control.severity, control.weight
  • URLs

Backend: OpenAI-compatible Chat Completions. Set `OPENAI_API_KEY` and
optionally `OPENAI_BASE_URL`. Default model is `gpt-4o-mini`.

If no API key is set, the script gracefully no-ops with a clear message
and writes a stub file that preserves structure but copies English
strings — so downstream tooling never breaks on missing files.

The output is written to:
    frameworks/translations/<lang>/<framework_id>.yaml

with `translation_status: machine` (or `human_verified` if you hand-edit).

Usage:
    python translate.py --framework nist-ai-rmf --lang es
    python translate.py --framework eu-ai-act --lang ar --model gpt-4o
    python translate.py --framework nist-ai-rmf --lang ja --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FRAMEWORKS_DIR = ROOT / "frameworks"
TRANSLATIONS_DIR = FRAMEWORKS_DIR / "translations"


LANG_NAMES = {
    "es": "Spanish",
    "ar": "Arabic",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "zh": "Simplified Chinese",
    "pt": "Portuguese",
    "ru": "Russian",
    "hi": "Hindi",
    "ko": "Korean",
}


def call_openai(prompt: str, model: str, api_key: str, base_url: str) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content":
                "You are a professional legal/technical translator. Translate only the user-provided text. "
                "Preserve formatting and any inline references verbatim. Output only the translated text."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.0,
    }
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body["choices"][0]["message"]["content"].strip()


def translate_field(text: str, target_lang: str, model: str, api_key: str | None, base_url: str) -> str:
    if not text or not api_key:
        return text
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    prompt = f"Translate the following English text to {lang_name}. Do not add any commentary.\n\n{text}"
    try:
        return call_openai(prompt, model, api_key, base_url)
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError) as exc:
        print(f"[translate] API call failed: {exc}; falling back to source text", file=sys.stderr)
        return text


def translate_framework(framework: dict[str, Any], lang: str, model: str, dry_run: bool) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    if not api_key:
        print(
            "[translate] OPENAI_API_KEY not set — writing a structural stub that copies "
            "English strings. Edit the output by hand to provide a real translation.",
            file=sys.stderr,
        )

    if dry_run:
        return _stub_translation(framework, lang)

    out = {
        "framework_id": framework["framework_id"],
        "lang": lang,
        "translation_status": "machine" if api_key else "stub",
        "full_name": translate_field(framework.get("full_name", ""), lang, model, api_key, base_url),
        "short_name": framework.get("short_name", ""),  # keep English identifier
        "scope_summary": translate_field(framework.get("scope_summary", ""), lang, model, api_key, base_url),
        "applies_to": translate_field(framework.get("applies_to", ""), lang, model, api_key, base_url),
        "penalties": translate_field(framework.get("penalties", ""), lang, model, api_key, base_url),
        "controls": [],
    }
    for c in framework.get("controls", []):
        out["controls"].append(
            {
                "id": c["id"],
                "severity": c.get("severity"),
                "weight": c.get("weight"),
                "statement": translate_field(c.get("statement", ""), lang, model, api_key, base_url),
            }
        )
    return out


def _stub_translation(framework: dict[str, Any], lang: str) -> dict[str, Any]:
    return {
        "framework_id": framework["framework_id"],
        "lang": lang,
        "translation_status": "stub",
        "full_name": framework.get("full_name", ""),
        "short_name": framework.get("short_name", ""),
        "scope_summary": framework.get("scope_summary", ""),
        "applies_to": framework.get("applies_to", ""),
        "penalties": framework.get("penalties", ""),
        "controls": [
            {
                "id": c["id"],
                "severity": c.get("severity"),
                "weight": c.get("weight"),
                "statement": c.get("statement", ""),
            }
            for c in framework.get("controls", [])
        ],
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--framework", required=True, help="framework_id, e.g. nist-ai-rmf")
    p.add_argument("--lang", required=True, help="ISO-639-1 target language code")
    p.add_argument("--model", default="gpt-4o-mini")
    p.add_argument("--dry-run", action="store_true",
                   help="Write a stub copy of the English text; do not call the API")
    args = p.parse_args(argv)

    src = FRAMEWORKS_DIR / f"{args.framework}.yaml"
    if not src.exists():
        print(f"No such framework: {src}", file=sys.stderr)
        return 2

    framework = yaml.safe_load(src.read_text(encoding="utf-8"))
    translated = translate_framework(framework, args.lang, args.model, args.dry_run)

    out_dir = TRANSLATIONS_DIR / args.lang
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{args.framework}.yaml"
    out_path.write_text(
        yaml.safe_dump(translated, sort_keys=False, allow_unicode=True, width=120),
        encoding="utf-8",
    )
    print(f"Wrote {out_path}  (status={translated['translation_status']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
