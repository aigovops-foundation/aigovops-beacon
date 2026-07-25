// tools/pdf/build_architecture_pdf.mjs
// Reproducible generator for docs/downloads/ARCHITECTURE-BETA.pdf.
//
// The original PDF was a one-off produced outside this repo (ReportLab, via an external
// agent) with no committed source — so a corrected link could never be regenerated. This
// renders it from the in-repo source ARCHITECTURE-BETA.md, so it is now reproducible with:
//
//   cd tools/pdf && npm install && node build_architecture_pdf.mjs
//
// Pipeline: markdown-it (GFM tables + fenced code) -> a self-contained styled HTML file
// -> headless Chrome --print-to-pdf. Chrome path is overridable via $CHROME.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SRC = join(REPO, 'ARCHITECTURE-BETA.md');
const OUT = join(REPO, 'docs/downloads/ARCHITECTURE-BETA.pdf');

const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
const body = md.render(readFileSync(SRC, 'utf8'));

// Beacon aesthetic: teal accent on warm paper, IBM-Plex-ish system stack, print margins.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  :root { --teal:#1F5E3A; --teal-dark:#0F4A2C; --ink:#28251d; --muted:#5f5d57; --border:#d4d1ca; --code-bg:#f4f3ef; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color: var(--ink); margin: 0; }
  h1,h2,h3,h4 { font-weight: 700; line-height: 1.2; color: var(--teal-dark); margin: 1.3em 0 .5em; }
  h1 { font-size: 24pt; border-bottom: 3px solid var(--teal); padding-bottom: .25em; }
  h2 { font-size: 16pt; border-bottom: 1px solid var(--border); padding-bottom: .2em; }
  h3 { font-size: 12.5pt; color: var(--teal); }
  h1,h2 { break-after: avoid; }
  p, li { orphans: 2; widows: 2; }
  a { color: var(--teal); text-decoration: none; }
  code { font-family: "SF Mono",Consolas,"Courier New",monospace; font-size: 9pt; background: var(--code-bg); padding: .1em .35em; border-radius: 3px; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: .8em 1em; overflow-x: auto; break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.7pt; line-height: 1.45; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 9pt; break-inside: avoid; }
  th, td { border: 1px solid var(--border); padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: var(--teal); color: #fff; font-weight: 600; }
  tr:nth-child(even) td { background: #faf9f6; }
  blockquote { border-left: 3px solid var(--teal); margin: 1em 0; padding: .3em 1em; color: var(--muted); background: #faf9f6; }
  hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
  img { max-width: 100%; }
</style></head><body>${body}</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'arch-pdf-'));
const htmlPath = join(dir, 'architecture.html');
writeFileSync(htmlPath, html);

execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${OUT}`,
  `file://${htmlPath}`,
], { stdio: 'inherit' });

console.log('Architecture PDF written -> ' + OUT);
