# Beacon build tools

Source materials behind the v2.3 pitch deck, hero video, 30-second teaser,
and launch communications. These are not part of the website itself —
they're the inputs that produce the artifacts in `docs/`.

## Contents

### `deck/`
- **`build_deck_v23.js`** — pptxgenjs script that produces
  `docs/downloads/AIGovOps_Beacon_Pitch.pptx`. Run with
  `node build_deck_v23.js` from this directory after `npm install pptxgenjs`.
  Convert to PDF via `libreoffice --headless --convert-to pdf <pptx>`.
- **`hero_narration_v23.txt`** — narration script for the 90-second hero video
  (`docs/assets/beacon-elevator-pitch.mp4`).

### `teaser/`
- **`compose_teaser.sh`** — ffmpeg pipeline that extracts five segments from
  the 90-second hero, splices them, and overlays the teaser narration to
  produce `docs/assets/beacon-teaser-30s.mp4` (1920×1080, 30s, h264/aac).
- **`teaser_narration.txt`** — 19-second narration script used for the teaser.

### `launch/`
- **`launch_posts.md`** — LinkedIn and X copy variants (incl. 4-tweet thread)
  for the v2.3 launch. Recommended picks are flagged inline.

## Voice / contact

- Tagline: **YES-Ship AI · YES-Steady AI · YES-Recover AI**
- Contacts: bob.rapp@aigovops.community · ken.johnston@aigovops.community
- Foundation: https://www.aigovopsfoundation.org/
