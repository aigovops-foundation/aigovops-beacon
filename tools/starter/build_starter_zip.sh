#!/usr/bin/env bash
# tools/starter/build_starter_zip.sh
# Reproducibly (re)pack docs/downloads/aigovops-beacon-starter.zip from the CURRENT repo tree.
#
# The starter was a 2026-05-13 snapshot with no build script, so it silently went stale — it
# still carried pre-move bobrapp/ links after the repo was corrected. This packs the same
# curated file set (tools/starter/manifest.txt) from the live tree, so links stay correct by
# construction and a future change is one command away:
#
#   bash tools/starter/build_starter_zip.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

MANIFEST="tools/starter/manifest.txt"
OUT="docs/downloads/aigovops-beacon-starter.zip"
ROOT="aigovops-beacon"                     # top-level dir inside the zip
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

n=0
while IFS= read -r line; do
  # skip comments / blanks
  [[ -z "$line" || "$line" == \#* ]] && continue
  # 'src -> dest' remap, else src==dest
  if [[ "$line" == *" -> "* ]]; then
    src="${line%% -> *}"; dest="${line##* -> }"
  else
    src="$line"; dest="$line"
  fi
  [[ -f "$src" ]] || { echo "MISSING source: $src" >&2; exit 1; }
  mkdir -p "$STAGE/$ROOT/$(dirname "$dest")"
  cp "$src" "$STAGE/$ROOT/$dest"
  n=$((n+1))
done < "$MANIFEST"

rm -f "$OUT"
( cd "$STAGE" && zip -q -r -X "$OLDPWD/$OUT" "$ROOT" )
echo "packed $n file(s) -> $OUT"
