# Reference Architecture Blueprint

Interactive blueprint that maps governance controls to a modern CI/CD
pipeline, with signed receipts at every stage. Served from
`/docs/blueprint/` on the AIGovOps Beacon GitHub Pages site.

## Local preview

This is a static site — no build step. Open `index.html` directly, or
serve the folder with any static server:

```bash
python3 -m http.server -d docs/blueprint 8000
# then visit http://localhost:8000
```

## Contents

- `index.html` — the blueprint (single page).
- `css/blueprint.css` — styles, inherits the Beacon palette.
- `artifacts/` — downloadable templates (Actions workflow, JSON Schema,
  Rego, gate YAML, crosswalk, full Markdown).

## Authority

Advisory under the AIGovOps Foundation. The
[OVERT 1.0 specification](https://overt.is/) is normative for the
evidence envelope.
