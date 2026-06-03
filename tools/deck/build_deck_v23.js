// Beacon v2.3 Pitch Deck — Hydra Teal accent on light surface
// pptxgenjs, system fonts only (Trebuchet MS Bold + Calibri)

const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pptx.title = "Beacon v2.3 — Verifiable AI Governance";

// Palette
const TEAL      = "01696F";
const TEAL_DARK = "0C4E54";
const BG        = "F7F6F2";
const SURFACE   = "FBFBF9";
const BORDER    = "D4D1CA";
const TEXT      = "28251D";
const MUTED     = "7A7974";
const FAINT     = "BAB9B4";

const H_FONT = "Trebuchet MS";
const B_FONT = "Calibri";
const M_FONT = "Courier New"; // universal monospace — Consolas renders broken in LibreOffice

// Helpers
const slideBase = (bg) => {
  const s = pptx.addSlide();
  s.background = { color: bg || BG };
  return s;
};

const footer = (s, label) => {
  s.addText("Beacon \u00b7 v2.3", { x: 0.5, y: 7.15, w: 4, h: 0.25, fontFace: B_FONT, fontSize: 9, color: FAINT });
  s.addText(label, { x: 8.833, y: 7.15, w: 4, h: 0.25, fontFace: B_FONT, fontSize: 9, color: FAINT, align: "right" });
};

// ============================================================
// SLIDE 1 — COVER (dark)
// ============================================================
{
  const s = pptx.addSlide();
  s.background = { color: "0C2A2D" };

  // Bottom teal strip
  s.addShape("rect", { x: 0, y: 7.0, w: 13.333, h: 0.5, fill: { color: TEAL } });

  s.addText("BEACON", { x: 0.7, y: 2.0, w: 12, h: 1.6, fontFace: H_FONT, fontSize: 96, bold: true, color: "FFFFFF", charSpacing: 6 });
  s.addText("Verifiable AI Governance for the Agent Era", { x: 0.7, y: 3.7, w: 12, h: 0.6, fontFace: B_FONT, fontSize: 24, color: "C7E7EA" });
  s.addText("v2.3  \u00b7  Apache 2.0  \u00b7  No SaaS lock-in", { x: 0.7, y: 4.3, w: 12, h: 0.4, fontFace: B_FONT, fontSize: 14, color: "8FB7BB" });

  // Tagline
  s.addText("YES-Ship AI  \u00b7  YES-Steady AI  \u00b7  YES-Recover AI", { x: 0.7, y: 5.4, w: 12, h: 0.45, fontFace: H_FONT, fontSize: 20, bold: true, color: "B8E0E4" });

  // URLs row
  s.addText([
    { text: "github.com/aigovops-foundation/aigovops-beacon", options: { hyperlink: { url: "https://github.com/aigovops-foundation/aigovops-beacon" } } },
    { text: "        " },
    { text: "aigovopsfoundation.org", options: { hyperlink: { url: "https://www.aigovopsfoundation.org/" } } },
  ], { x: 0.7, y: 6.15, w: 12, h: 0.4, fontFace: B_FONT, fontSize: 14, color: "C7E7EA" });
}

// ============================================================
// SLIDE 2 — THE PROBLEM
// ============================================================
{
  const s = slideBase();
  s.addText("Your company runs on AI.", { x: 0.6, y: 0.55, w: 12.1, h: 0.7, fontFace: H_FONT, fontSize: 36, bold: true, color: TEXT });
  s.addText("So does your risk.", { x: 0.6, y: 1.15, w: 12.1, h: 0.7, fontFace: H_FONT, fontSize: 36, bold: true, color: TEAL });

  const rows = [
    ["Shadow models", "Teams ship LLM features your governance team has never seen."],
    ["Unlogged prompts", "Inputs vanish. Outputs go unverified. Receipts do not exist."],
    ["Frameworks proliferate", "NIST AI RMF, EU AI Act, ISO 42001, HIPAA \u2014 23 and counting."],
    ["Auditors arrive", "Questions you cannot answer. Evidence you cannot reproduce."],
  ];

  // Even vertical rhythm — explicit row y positions for consistent gaps
  const rowYs = [2.5, 3.55, 4.6, 5.65];
  rows.forEach(([k, v], i) => {
    const yy = rowYs[i];
    s.addText(k, { x: 0.6, y: yy, w: 4.0, h: 0.9, fontFace: H_FONT, fontSize: 22, bold: true, color: TEAL, valign: "top" });
    s.addText(v, { x: 4.7, y: yy + 0.08, w: 8.1, h: 0.9, fontFace: B_FONT, fontSize: 18, color: TEXT, valign: "top" });
  });

  footer(s, "Problem");
}

// ============================================================
// SLIDE 3 — THE CONVICTION
// ============================================================
{
  const s = slideBase();
  s.addText("Trust is not a feature", { x: 0.6, y: 2.0, w: 12.1, h: 1.1, fontFace: H_FONT, fontSize: 56, bold: true, color: TEXT });
  s.addText("you bolt on.", { x: 0.6, y: 2.85, w: 12.1, h: 1.1, fontFace: H_FONT, fontSize: 56, bold: true, color: TEXT });
  s.addText("Trust is the substrate.", { x: 0.6, y: 4.1, w: 12.1, h: 1.1, fontFace: H_FONT, fontSize: 56, bold: true, color: TEAL });

  s.addText("Every decision an agent makes should be signed, replayable, and verifiable \u2014 by anyone, forever.", { x: 0.6, y: 5.85, w: 12.1, h: 0.6, fontFace: B_FONT, fontSize: 18, color: MUTED });

  footer(s, "Conviction");
}

// ============================================================
// SLIDE 4 — MEET BEACON
// ============================================================
{
  const s = slideBase();
  s.addText("Meet Beacon.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 36, bold: true, color: TEXT });
  s.addText("An open-source MCP server that turns every AI decision into a signed, verifiable receipt.", { x: 0.6, y: 1.4, w: 12.1, h: 0.6, fontFace: B_FONT, fontSize: 18, color: MUTED });

  // Three-pillar grid — tighter cards, content fills box
  const cards = [
    ["SIGNED", "Ed25519", "Every decision sealed cryptographically. Tamper-evident. Replayable forever."],
    ["SCORED", "23 Frameworks", "NIST AI RMF, EU AI Act, ISO 42001, HIPAA \u2014 auto-mapped from receipts."],
    ["SHIPPABLE", "Apache 2.0", "Three deployment shapes. One repo. No SaaS lock-in. No vendor capture."],
  ];
  const cardW = 4.0, cardH = 4.3, gap = 0.25;
  const startX = (13.333 - (cardW * 3 + gap * 2)) / 2;
  // Tighter card — body sits immediately under the headline for consistent vertical density across all three cards
  cards.forEach(([eyebrow, head, body], i) => {
    const x = startX + i * (cardW + gap);
    s.addShape("rect", { x, y: 2.3, w: cardW, h: cardH, fill: { color: SURFACE }, line: { color: BORDER, width: 0.75 } });
    s.addText(eyebrow, { x: x + 0.3, y: 2.55, w: cardW - 0.6, h: 0.35, fontFace: B_FONT, fontSize: 11, bold: true, color: TEAL, charSpacing: 4 });
    s.addText(head, { x: x + 0.3, y: 3.0, w: cardW - 0.6, h: 0.85, fontFace: H_FONT, fontSize: 30, bold: true, color: TEXT });
    s.addText(body, { x: x + 0.3, y: 3.95, w: cardW - 0.6, h: 2.1, fontFace: B_FONT, fontSize: 15, color: TEXT, valign: "top" });
  });

  footer(s, "Meet Beacon");
}

// ============================================================
// SLIDE 5 — SIX MCP TOOLS
// ============================================================
{
  const s = slideBase();
  s.addText("Six tools. One protocol.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 36, bold: true, color: TEXT });
  s.addText("Beacon ships as a Model Context Protocol server. Any MCP-capable agent gets governance for free.", { x: 0.6, y: 1.4, w: 12.1, h: 0.6, fontFace: B_FONT, fontSize: 16, color: MUTED });

  const tools = [
    ["record_decision", "Sign a decision. Returns a receipt."],
    ["verify_receipt", "Re-validate any receipt against its signature."],
    ["query_inventory", "Search every model, decision, and dataset on file."],
    ["score_framework", "Score posture against NIST, EU AI Act, ISO 42001, HIPAA."],
    ["bundle_for_auditor", "Sealed evidence pack. Hand it to anyone. They verify it themselves."],
    ["replay_case", "Reconstruct any decision end to end, with full provenance."],
  ];
  const cw = 6.1, ch = 1.45, gx = 0.15;
  tools.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * (cw + gx);
    const y = 2.3 + row * (ch + 0.18);
    s.addShape("rect", { x, y, w: cw, h: ch, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
    s.addText(t[0], { x: x + 0.3, y: y + 0.18, w: cw - 0.6, h: 0.5, fontFace: M_FONT, fontSize: 18, bold: true, color: TEAL });
    s.addText(t[1], { x: x + 0.3, y: y + 0.75, w: cw - 0.6, h: 0.65, fontFace: B_FONT, fontSize: 13, color: TEXT });
  });

  footer(s, "Six MCP Tools");
}

// ============================================================
// SLIDE 6 — THREE DEPLOYMENT SHAPES
// ============================================================
{
  const s = slideBase();
  s.addText("Three shapes. One repo.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 36, bold: true, color: TEXT });
  s.addText("Pick the deployment that fits your trust model. Switch when it changes.", { x: 0.6, y: 1.4, w: 12.1, h: 0.6, fontFace: B_FONT, fontSize: 16, color: MUTED });

  const shapes = [
    ["1", "Local desktop client", "Runs on a workstation. Owned data, owned keys.", "Trust: Your team only"],
    ["2", "Hosted MCP server", "Render-deployable. Share across an enterprise.", "Trust: Authenticated callers"],
    ["3", "Restricted public agent", "Cloudflare Worker. BYO key. Read-only safe ops.", "Trust: Anyone with a key"],
  ];
  const cw = 4.0, ch = 4.2, gap = 0.25;
  const startX = (13.333 - (cw * 3 + gap * 2)) / 2;
  shapes.forEach(([num, title, body, trust], i) => {
    const x = startX + i * (cw + gap);
    s.addShape("rect", { x, y: 2.3, w: cw, h: ch, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
    s.addText(num, { x: x + 0.3, y: 2.45, w: 1.2, h: 1.0, fontFace: H_FONT, fontSize: 56, bold: true, color: TEAL });
    s.addText(title, { x: x + 0.3, y: 3.55, w: cw - 0.6, h: 0.8, fontFace: H_FONT, fontSize: 20, bold: true, color: TEXT });
    s.addText(body, { x: x + 0.3, y: 4.4, w: cw - 0.6, h: 1.3, fontFace: B_FONT, fontSize: 13, color: TEXT });
    s.addText(trust, { x: x + 0.3, y: 5.95, w: cw - 0.6, h: 0.4, fontFace: B_FONT, fontSize: 12, color: TEAL, bold: true });
  });

  footer(s, "Deployment");
}

// ============================================================
// SLIDE 7 — REAL-WORLD USE CASES
// ============================================================
{
  const s = slideBase();
  s.addText("Use it in the real world.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 36, bold: true, color: TEXT });
  s.addText("Concrete patterns Beacon was built to handle.", { x: 0.6, y: 1.4, w: 12.1, h: 0.5, fontFace: B_FONT, fontSize: 16, color: MUTED });

  const cases = [
    ["Internal copilots", "Sign every prompt and response. Replay any conversation when legal asks for it."],
    ["Customer-facing agents", "Bundle receipts per session. Hand them to regulators on demand, without delay."],
    ["Multi-agent workflows", "Log routing decisions across agents. Detect drift between runs, before users do."],
    ["High-stakes automation", "Lending, healthcare, hiring \u2014 every decision auditable, verifiable, replayable."],
    ["Model inventory", "Track every model in production, with provenance, owners, and a live risk class."],
    ["Audit prep", "Hand the auditor a bundle they can verify themselves. No portal logins required."],
  ];
  const cw = 6.0, ch = 1.4, gx = 0.13;
  cases.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * (cw + gx);
    const yy = 2.2 + row * (ch + 0.15);
    s.addShape("rect", { x, y: yy, w: cw, h: ch, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
    s.addText(c[0], { x: x + 0.25, y: yy + 0.18, w: cw - 0.5, h: 0.42, fontFace: H_FONT, fontSize: 17, bold: true, color: TEAL });
    s.addText(c[1], { x: x + 0.25, y: yy + 0.65, w: cw - 0.5, h: 0.7, fontFace: B_FONT, fontSize: 14, color: TEXT });
  });

  footer(s, "Use Cases");
}

// ============================================================
// SLIDE 8 — THE WALKTHROUGH
// ============================================================
{
  const s = slideBase();
  s.addText("See the whole loop in 70 seconds.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 36, bold: true, color: TEXT });
  s.addText("Twelve animated steps. Decisions in. Receipts out. Auditor bundle, sealed and signed.", { x: 0.6, y: 1.4, w: 12.1, h: 0.5, fontFace: B_FONT, fontSize: 16, color: MUTED });

  // Big stat
  s.addShape("rect", { x: 0.6, y: 2.4, w: 5.8, h: 4.0, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
  s.addText("12", { x: 0.6, y: 2.7, w: 5.8, h: 1.9, fontFace: H_FONT, fontSize: 160, bold: true, color: TEAL, align: "center" });
  s.addText("animated steps", { x: 0.6, y: 4.5, w: 5.8, h: 0.6, fontFace: B_FONT, fontSize: 18, color: TEXT, align: "center" });
  s.addText("offline · self-hosted · 1.6 MB MP4", { x: 0.6, y: 5.1, w: 5.8, h: 0.5, fontFace: B_FONT, fontSize: 13, color: MUTED, align: "center" });

  // Steps list right column
  const steps = [
    "01    Agent emits a decision",
    "02    Beacon receives the payload",
    "03    Ed25519 signature applied",
    "04    Receipt stored, indexed, replayable",
    "05    Framework mapping auto-scored",
    "06    Inventory updated, owners notified",
    "07    Verification on demand by anyone",
    "08    Bundle prepared for the auditor",
    "09    Bundle handed off, sealed",
    "10    Auditor verifies it themselves",
    "11    Case replayable end to end",
    "12    Trust, on the substrate",
  ];
  s.addText(steps.join("\n"), {
    x: 6.7, y: 2.4, w: 6.0, h: 4.0,
    fontFace: B_FONT, fontSize: 13, color: TEXT, valign: "top", paraSpaceAfter: 2,
  });

  s.addText([
    { text: "See it live: " },
    { text: "aigovops-foundation.github.io/aigovops-beacon/walkthrough/", options: { hyperlink: { url: "https://aigovops-foundation.github.io/aigovops-beacon/walkthrough/" } } },
  ], { x: 0.6, y: 6.55, w: 12.1, h: 0.3, fontFace: B_FONT, fontSize: 12, color: TEAL });

  footer(s, "Walkthrough");
}

// ============================================================
// SLIDE 9 — HOSTED MCP + RESTRICTED AGENT
// ============================================================
{
  const s = slideBase();
  s.addText("Hosted MCP + restricted public agent.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 32, bold: true, color: TEXT });
  s.addText("Two new deployment paths shipped in v2.3. Both verified live.", { x: 0.6, y: 1.4, w: 12.1, h: 0.5, fontFace: B_FONT, fontSize: 16, color: MUTED });

  // Left card — hosted MCP
  s.addShape("rect", { x: 0.6, y: 2.2, w: 6.0, h: 4.5, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
  s.addText("HOSTED MCP", { x: 0.85, y: 2.4, w: 5.5, h: 0.4, fontFace: B_FONT, fontSize: 11, bold: true, color: TEAL, charSpacing: 4 });
  s.addText("mcp-public/", { x: 0.85, y: 2.85, w: 5.5, h: 0.55, fontFace: M_FONT, fontSize: 22, bold: true, color: TEXT });
  s.addText("Deploy to Render in one click. Shareable across your enterprise. All six tools, signed receipts, auditor bundles — over HTTPS.", { x: 0.85, y: 3.55, w: 5.5, h: 1.5, fontFace: B_FONT, fontSize: 14, color: TEXT });
  s.addText("• Apache 2.0", { x: 0.85, y: 5.1, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });
  s.addText("• Render-ready manifests", { x: 0.85, y: 5.45, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });
  s.addText("• Auth-gated MCP endpoints", { x: 0.85, y: 5.8, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });
  s.addText("• Same six tools as the local client", { x: 0.85, y: 6.15, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });

  // Right card — restricted agent
  s.addShape("rect", { x: 6.733, y: 2.2, w: 6.0, h: 4.5, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
  s.addText("RESTRICTED PUBLIC AGENT", { x: 6.983, y: 2.4, w: 5.5, h: 0.4, fontFace: B_FONT, fontSize: 11, bold: true, color: TEAL, charSpacing: 4 });
  s.addText("agent/", { x: 6.983, y: 2.85, w: 5.5, h: 0.55, fontFace: M_FONT, fontSize: 22, bold: true, color: TEXT });
  s.addText("Cloudflare Worker. BYO key. Restricted to safe, read-only operations. Run a public-facing Beacon agent at your own edge — no surprises.", { x: 6.983, y: 3.55, w: 5.5, h: 1.5, fontFace: B_FONT, fontSize: 14, color: TEXT });
  s.addText("• Cloudflare Worker template", { x: 6.983, y: 5.1, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });
  s.addText("• Bring-your-own API key", { x: 6.983, y: 5.45, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });
  s.addText("• Allow-listed tool surface", { x: 6.983, y: 5.8, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });
  s.addText("• Verifiable receipts, public traffic", { x: 6.983, y: 6.15, w: 5.5, h: 0.32, fontFace: B_FONT, fontSize: 13, color: TEXT });

  footer(s, "Hosted + Public");
}

// ============================================================
// SLIDE 10 — SUPER-AGENT POSITIONING
// ============================================================
{
  const s = slideBase();
  s.background = { color: "0C2A2D" };
  s.addText("The layer that lets a $1M", { x: 0.6, y: 1.6, w: 12.1, h: 1.1, fontFace: H_FONT, fontSize: 48, bold: true, color: "FFFFFF" });
  s.addText("super-agent actually ship.", { x: 0.6, y: 2.55, w: 12.1, h: 1.1, fontFace: H_FONT, fontSize: 48, bold: true, color: "FFFFFF" });

  s.addText("Big budgets buy capability.", { x: 0.6, y: 4.2, w: 12.1, h: 0.7, fontFace: B_FONT, fontSize: 22, color: "C7E7EA" });
  s.addText("Beacon supplies the trust they cannot ship without.", { x: 0.6, y: 4.85, w: 12.1, h: 0.7, fontFace: B_FONT, fontSize: 22, color: "C7E7EA" });

  // accent quote-like vertical bar at left margin for visual anchor
  s.addShape("rect", { x: 0.4, y: 1.7, w: 0.1, h: 3.95, fill: { color: TEAL }, line: { color: TEAL } });

  // Tagline bottom
  s.addShape("rect", { x: 0, y: 6.95, w: 13.333, h: 0.55, fill: { color: TEAL } });
  s.addText("YES-Ship AI · YES-Steady AI · YES-Recover AI", { x: 0.6, y: 6.97, w: 12.1, h: 0.5, fontFace: H_FONT, fontSize: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
}

// ============================================================
// SLIDE 11 — FRAMEWORKS COVERED
// ============================================================
{
  const s = slideBase();
  s.addText("23 frameworks built in. Yours plugs right in.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 32, bold: true, color: TEXT });
  s.addText("Run score_framework. Get a posture report per framework, with the receipts that backed every claim.", { x: 0.6, y: 1.4, w: 12.1, h: 0.6, fontFace: B_FONT, fontSize: 15, color: MUTED });

  const fws = [
    "NIST AI RMF", "EU AI Act", "ISO/IEC 42001", "ISO/IEC 27001",
    "HIPAA", "GDPR", "SOC 2", "CCPA",
    "OWASP LLM Top 10", "MITRE ATLAS", "PCI DSS", "FedRAMP",
    "NYC LL 144", "Colorado AI Act", "California AB-2013", "Texas TRAIGA",
    "OECD AI Principles", "G7 Hiroshima", "UNESCO Ethics", "Singapore AI",
    "UK AI Safety", "Canada AIDA", "ANSI/UL 4600", "+ your own (YAML)",
  ];
  // 6x4 grid — fills all 24 cells, no empty slots
  const COLS = 6, ROWS = 4;
  const cellW = 1.99, cellH = 0.85, gx = 0.1, gy = 0.15;
  const totalW = COLS * cellW + (COLS - 1) * gx;
  const startX = (13.333 - totalW) / 2;
  const startY = 2.3;
  fws.forEach((name, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = startX + col * (cellW + gx);
    const y = startY + row * (cellH + gy);
    const isLast = i === fws.length - 1;
    s.addShape("rect", { x, y, w: cellW, h: cellH, fill: { color: isLast ? "E8F0F1" : SURFACE }, line: { color: isLast ? TEAL : BORDER, width: isLast ? 1.0 : 0.5 } });
    s.addText(name, { x: x + 0.1, y, w: cellW - 0.2, h: cellH, fontFace: B_FONT, fontSize: 11, color: isLast ? TEAL : TEXT, bold: isLast, valign: "middle", align: "center" });
  });

  footer(s, "Frameworks");
}

// ============================================================
// SLIDE 12 — RUN IT TODAY
// ============================================================
{
  const s = slideBase();
  s.addText("Run it today.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 36, bold: true, color: TEXT });
  s.addText("Three commands. One repo. Apache 2.0.", { x: 0.6, y: 1.4, w: 12.1, h: 0.5, fontFace: B_FONT, fontSize: 16, color: MUTED });

  // Terminal-style block
  s.addShape("rect", { x: 0.6, y: 2.2, w: 12.13, h: 3.4, fill: { color: "0C2A2D" }, line: { color: TEAL_DARK, width: 0.75 } });
  const code = [
    "$  git clone https://github.com/aigovops-foundation/aigovops-beacon",
    "$  cd aigovops-beacon",
    "$  ./demo.sh                              # local desktop, port 8801",
    "",
    "$  cd mcp-public && ./deploy-render.sh    # hosted MCP server",
    "$  cd agent && wrangler deploy            # restricted public agent",
  ];
  s.addText(code.join("\n"), { x: 0.85, y: 2.4, w: 11.6, h: 3.0, fontFace: M_FONT, fontSize: 16, color: "B8E0E4", valign: "top", paraSpaceAfter: 4 });

  // Three quick-start rows below
  const rows = [
    ["DEMOS.md", "Three deployment shapes, end to end, in under five minutes."],
    ["SUPERAGENT.md", "How Beacon lets a $1M super-agent actually ship."],
    ["walkthrough/", "Twelve animated steps. Decisions in. Receipts out."],
  ];
  let y = 5.85;
  rows.forEach(([k, v]) => {
    s.addText(k, { x: 0.6, y, w: 3.2, h: 0.35, fontFace: M_FONT, fontSize: 13, bold: true, color: TEAL });
    s.addText(v, { x: 3.9, y, w: 8.8, h: 0.35, fontFace: B_FONT, fontSize: 13, color: TEXT });
    y += 0.38;
  });

  footer(s, "Run It Today");
}

// ============================================================
// SLIDE 13 — THE FOUNDATION
// ============================================================
{
  const s = slideBase();
  s.addText("Code is on GitHub. Community is at the Foundation.", { x: 0.6, y: 0.55, w: 12.1, h: 0.9, fontFace: H_FONT, fontSize: 30, bold: true, color: TEXT });
  s.addText("Both are open. Both are waiting.", { x: 0.6, y: 1.4, w: 12.1, h: 0.5, fontFace: B_FONT, fontSize: 18, color: MUTED });

  // Two big cards
  s.addShape("rect", { x: 0.6, y: 2.2, w: 6.0, h: 4.5, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
  s.addText("THE CODE", { x: 0.85, y: 2.4, w: 5.5, h: 0.4, fontFace: B_FONT, fontSize: 11, bold: true, color: TEAL, charSpacing: 4 });
  s.addText("aigovops-beacon", { x: 0.85, y: 2.85, w: 5.5, h: 0.6, fontFace: H_FONT, fontSize: 26, bold: true, color: TEXT });
  s.addText("Apache 2.0. Six MCP tools. Three deployment shapes. Walkthrough included.", { x: 0.85, y: 3.6, w: 5.5, h: 1.0, fontFace: B_FONT, fontSize: 14, color: TEXT });
  s.addText([
    { text: "github.com/aigovops-foundation/aigovops-beacon", options: { hyperlink: { url: "https://github.com/aigovops-foundation/aigovops-beacon" } } },
  ], { x: 0.85, y: 5.9, w: 5.5, h: 0.4, fontFace: B_FONT, fontSize: 15, bold: true, color: TEAL });
  s.addText("Star · Fork · Run · Contribute", { x: 0.85, y: 6.25, w: 5.5, h: 0.35, fontFace: B_FONT, fontSize: 12, color: MUTED });

  s.addShape("rect", { x: 6.733, y: 2.2, w: 6.0, h: 4.5, fill: { color: SURFACE }, line: { color: BORDER, width: 0.5 } });
  s.addText("THE COMMUNITY", { x: 6.983, y: 2.4, w: 5.5, h: 0.4, fontFace: B_FONT, fontSize: 11, bold: true, color: TEAL, charSpacing: 4 });
  s.addText("AI GovOps Foundation", { x: 6.983, y: 2.85, w: 5.5, h: 0.6, fontFace: H_FONT, fontSize: 26, bold: true, color: TEXT });
  s.addText("Where practitioners share frameworks, case studies, and reference implementations — open governance, open practice.", { x: 6.983, y: 3.6, w: 5.5, h: 1.5, fontFace: B_FONT, fontSize: 14, color: TEXT });
  s.addText([
    { text: "aigovopsfoundation.org", options: { hyperlink: { url: "https://www.aigovopsfoundation.org/" } } },
  ], { x: 6.983, y: 5.9, w: 5.5, h: 0.4, fontFace: B_FONT, fontSize: 15, bold: true, color: TEAL });
  s.addText("Join · Contribute · Lead a working group", { x: 6.983, y: 6.25, w: 5.5, h: 0.35, fontFace: B_FONT, fontSize: 12, color: MUTED });

  footer(s, "Foundation");
}

// ============================================================
// SLIDE 14 — CTA (dark)
// ============================================================
{
  const s = pptx.addSlide();
  s.background = { color: "0C2A2D" };

  s.addText("Hand the auditor a bundle.", { x: 0.6, y: 1.4, w: 12.1, h: 1.0, fontFace: H_FONT, fontSize: 44, bold: true, color: "FFFFFF" });
  s.addText("Let the tokens flow.", { x: 0.6, y: 2.5, w: 12.1, h: 1.0, fontFace: H_FONT, fontSize: 44, bold: true, color: "7BD4DC" });

  s.addText("Beacon. Verifiable AI governance. Available now.", { x: 0.6, y: 4.3, w: 12.1, h: 0.55, fontFace: B_FONT, fontSize: 22, color: "C7E7EA" });

  // Two CTA rows
  s.addText([
    { text: "→  ", options: { color: TEAL } },
    { text: "github.com/aigovops-foundation/aigovops-beacon", options: { hyperlink: { url: "https://github.com/aigovops-foundation/aigovops-beacon" }, color: "FFFFFF", bold: true } },
  ], { x: 0.6, y: 5.2, w: 12.1, h: 0.55, fontFace: B_FONT, fontSize: 22 });
  s.addText([
    { text: "→  ", options: { color: TEAL } },
    { text: "aigovopsfoundation.org", options: { hyperlink: { url: "https://www.aigovopsfoundation.org/" }, color: "FFFFFF", bold: true } },
  ], { x: 0.6, y: 5.85, w: 12.1, h: 0.55, fontFace: B_FONT, fontSize: 22 });

  s.addShape("rect", { x: 0, y: 6.95, w: 13.333, h: 0.55, fill: { color: TEAL } });
  s.addText("YES-Ship AI  \u00b7  YES-Steady AI  \u00b7  YES-Recover AI", { x: 0.6, y: 6.97, w: 12.1, h: 0.5, fontFace: H_FONT, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
}

pptx.writeFile({ fileName: "/home/user/workspace/AIGovOps_Beacon_Pitch.pptx" }).then(() => {
  console.log("Deck written.");
});
