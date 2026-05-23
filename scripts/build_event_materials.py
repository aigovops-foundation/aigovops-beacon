"""
Build event-day materials for the AIGovOps Foundation Framework Lab.

Outputs (committed under docs/downloads/ and event-materials/):
  docs/downloads/framework-lab-qr.png            — QR code for the canonical lab URL
  docs/downloads/framework-lab-instructor.pdf    — 90-minute virtual delivery playbook
  docs/downloads/framework-lab-attendee.pdf      — 1-page handout for students

Brand match: Hydra Teal #01696f, Signal Green #2ecc71, Inter + DM Mono,
matching site.css from bobrapp/aigovops-beacon.

Run from repo root:
  python3 scripts/build_event_materials.py
"""

from __future__ import annotations
from pathlib import Path
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DL = DOCS / "downloads"
DL.mkdir(parents=True, exist_ok=True)

# Brand
HYDRA_TEAL = (1, 105, 111)
SIGNAL_GREEN = (46, 204, 113)
INK = (14, 27, 28)
INK_SOFT = (58, 74, 75)
INK_FAINT = (122, 136, 137)
PAPER = (251, 250, 246)
PAPER_SOFT = (241, 239, 231)
BORDER = (216, 212, 196)

LAB_URL = "https://bobrapp.github.io/aigovops-beacon/lab.html"
HUB_URL = "https://bobrapp.github.io/aigovops-beacon/"


# ---------------------------------------------------------------------------
# QR Code
# ---------------------------------------------------------------------------


def build_qr() -> Path:
    """High error-correction QR for the lab URL — survives projector glare."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=14,
        border=4,
    )
    qr.add_data(LAB_URL)
    qr.make(fit=True)
    img = qr.make_image(fill_color=f"#{HYDRA_TEAL[0]:02x}{HYDRA_TEAL[1]:02x}{HYDRA_TEAL[2]:02x}",
                        back_color="white")
    out = DL / "framework-lab-qr.png"
    img.save(out)
    return out


# ---------------------------------------------------------------------------
# PDF base
# ---------------------------------------------------------------------------


class EventPDF(FPDF):
    document_title = ""
    document_subtitle = ""

    def header(self) -> None:
        # Brand bar at top
        self.set_fill_color(*HYDRA_TEAL)
        self.rect(0, 0, self.w, 14, "F")
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 11)
        self.set_xy(15, 4)
        self.cell(0, 6, "AIGovOps Foundation  |  Beacon Framework Lab")
        self.set_xy(self.w - 70, 4)
        self.set_font("Helvetica", "", 9)
        self.cell(55, 6, "aigovopsfoundation.org", align="R")
        self.set_text_color(*INK)
        self.set_y(20)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*INK_FAINT)
        self.cell(
            0, 5,
            f"Page {self.page_no()}  |  YES-Ship  -  YES-Steady  -  YES-Recover  |  Apache-2.0",
            align="C",
        )

    def page_title(self, title: str, subtitle: str = "") -> None:
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(*INK)
        self.cell(0, 9, title, ln=True)
        if subtitle:
            self.set_font("Helvetica", "", 11)
            self.set_text_color(*INK_SOFT)
            self.cell(0, 6, subtitle, ln=True)
        self.set_text_color(*INK)
        self.ln(3)

    def section_h(self, text: str) -> None:
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*HYDRA_TEAL)
        self.cell(0, 7, text, ln=True)
        self.set_text_color(*INK)
        self.ln(1)

    def label(self, text: str) -> None:
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*INK_FAINT)
        self.cell(0, 4, text.upper(), ln=True)
        self.set_text_color(*INK)

    def body(self, text: str, size: int = 10) -> None:
        self.set_font("Helvetica", "", size)
        self.set_text_color(*INK)
        self.multi_cell(0, size * 0.5 + 0.5, text)
        self.ln(1)

    def bullet(self, text: str) -> None:
        # Single multi_cell with leading dash — avoids cursor-state pitfalls
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 10)
        self.multi_cell(self.w - self.l_margin - self.r_margin, 5, "-  " + text)

    def timecode_row(self, time: str, label: str, detail: str) -> None:
        y0 = self.get_y()
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*HYDRA_TEAL)
        self.cell(20, 5, time, ln=False)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*INK)
        self.cell(45, 5, label, ln=False)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*INK_SOFT)
        x = self.get_x()
        y = self.get_y()
        self.multi_cell(0, 5, detail)
        # Visual separator
        self.set_draw_color(*BORDER)
        self.set_line_width(0.15)
        y2 = self.get_y()
        self.line(15, y2 + 1, self.w - 15, y2 + 1)
        self.ln(2)
        self.set_text_color(*INK)


# ---------------------------------------------------------------------------
# Instructor playbook
# ---------------------------------------------------------------------------


def build_instructor_playbook() -> Path:
    pdf = EventPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.page_title("Instructor Playbook",
                   "Framework Lab - 90-minute virtual delivery for ~100 attendees")

    pdf.body(
        "This is the run-of-show for delivering the Framework Lab to a 100-person "
        "AIGovOps Foundation virtual meeting. The lab itself is self-paced; this "
        "playbook adds the live structure: opening, checkpoints, common "
        "questions, and the closing call to action."
    )

    pdf.section_h("Pre-event checklist")

    pdf.label("T - 7 days")
    pdf.bullet("Email the attendee handout to all registrants. Include the diagnostic page link.")
    pdf.bullet("Post the lab URL on the Foundation site and any social channels.")
    pdf.bullet("Confirm both hosts (Bob, Ken) can open the lab and run the sandbox end-to-end.")
    pdf.ln(2)

    pdf.label("T - 1 day")
    pdf.bullet("Send reminder email: tomorrow's lab, bring your laptop, run the diagnostic.")
    pdf.bullet("Have an emergency backup plan: if wifi at home dies, switch to mobile hotspot.")
    pdf.bullet("Open the lab now and walk through it from a clean browser session as a final dry-run.")
    pdf.ln(2)

    pdf.label("T - 30 minutes")
    pdf.bullet("Open the lab in your browser. Open the slide deck on a second monitor.")
    pdf.bullet("Test screen-share. Confirm the audience can see the lab clearly at 100% zoom.")
    pdf.bullet("Confirm the meeting chat is monitored by a co-host so questions can flow during silence.")
    pdf.bullet("Open the QR code image full-screen on a phone for any attendees who joined late.")
    pdf.ln(3)

    pdf.section_h("Run of show (90 minutes)")

    pdf.timecode_row("0:00 - 0:05", "Welcome",
        "One sentence: 'In the next 30 minutes you will discover AI, sign a "
        "receipt, hand auditor an evidence bundle, and map one real failure.' "
        "Show the QR code and lab URL. Skip introductions if attendees know each other.")

    pdf.timecode_row("0:05 - 0:10", "Open the lab",
        "Drop the lab URL into the meeting chat. Wait 60 seconds for everyone to load it. "
        "Walk through the splash modal so the room moves together. Confirm at least "
        "80% of the room has the lab open before continuing.")

    pdf.timecode_row("0:10 - 0:18", "The 5-step Studio",
        "Screen-share the lab. Walk through Section 3 accordion (Studio steps). "
        "Read each step out loud. Pose the dual-audience prompts and let 2-3 people "
        "respond in chat. Time-box to 8 minutes; keep moving.")

    pdf.timecode_row("0:18 - 0:25", "The Sandbox",
        "EVERYONE runs the in-browser sandbox in Section 4. Walk them through it: "
        "Generate Ed25519 key - Sign a receipt - Bundle and download. Pause briefly "
        "to let people experience the green 'verified in-browser' line themselves.")

    pdf.timecode_row("0:25 - 0:35", "Failure mapping",
        "Bring up Section 5. Pick ONE case as a group (suggest Robodebt OR Boeing "
        "depending on audience). Walk through who was harmed - which framework - "
        "which Beacon artifact. Have 2-3 attendees share their answers in chat.")

    pdf.timecode_row("0:35 - 0:40", "Quiz",
        "Five-question quiz at Section 6. Tell everyone they have 4 minutes. Watch "
        "the chat for questions. Most score 4 of 5 on the first pass.")

    pdf.timecode_row("0:40 - 0:50", "Completion certificate",
        "Section 7 - have everyone check all four attestation boxes, type their name, "
        "click 'Issue certificate'. They download a JSON receipt and an HTML diploma. "
        "Have 2-3 attendees share their certificate fingerprint in chat for a moment of group win.")

    pdf.timecode_row("0:50 - 1:10", "Level 200 preview",
        "Most attendees will stop here. For those staying: spend 20 minutes on Level "
        "200 highlights - the Suitcase Lab one-liner, the Policy-as-Code emission, "
        "the 100-failure deep-dive table. Encourage them to explore on their own.")

    pdf.timecode_row("1:10 - 1:25", "Q & A",
        "Open the floor. Lead with the most common questions (see next section). "
        "Capture interesting cases attendees mention - they may become additions "
        "to the 100-failure dataset.")

    pdf.timecode_row("1:25 - 1:30", "Close",
        "Email Bob and Ken with subject LAB if you want your certificate counter-signed. "
        "Visit How I Built This to see how this lab was constructed with the same "
        "evidence model it teaches. Recording will be shared within 48 hours.")
    pdf.ln(3)

    pdf.section_h("Common student questions and answers")

    pdf.add_page()

    questions = [
        ("\"Is my private key actually staying in my browser?\"",
         "Yes. The Ed25519 key is generated via WebCrypto, signs locally, and never "
         "transits any network. You can verify by opening DevTools - Network tab and "
         "watching: zero requests fire during Generate/Sign/Bundle."),
        ("\"How do I verify someone else's bundle?\"",
         "Open the receipts.ndjson file. Take their public key from public-key.b64. "
         "For each entry, strip the signature_ed25519 and key_fingerprint fields, "
         "re-serialize with sorted keys, and verify with stock openssl. VERIFY.md "
         "in the bundle walks you through it."),
        ("\"What if Beacon goes away tomorrow?\"",
         "The evidence model survives. Your receipts.ndjson, your public key, your "
         "VERIFY.md - all portable. Anyone with openssl can re-verify. That is the "
         "whole point: evidence should not depend on a vendor."),
        ("\"What's the difference between this and our current GRC tool?\"",
         "Your GRC tool collects assertions. Beacon collects cryptographic receipts. "
         "Assertions need a system that's trusted to be honest. Receipts can be "
         "verified by someone who doesn't trust you."),
        ("\"Can we run this on our internal models?\"",
         "Yes - the Receipt API in Level 200 shows how. POST to /api/v1/receipts "
         "after each model invocation. Fire and forget. No blocking on the user path."),
        ("\"How do checklists become Policy as Code?\"",
         "Walk Level 200 Section 3. The Make it Policy as Code button emits gate "
         "YAML, OPA Rego, a Governance Decision Record, and a signed bundle. The "
         "YAML is what your governance team reviews; the Rego is what your CI runs."),
        ("\"Why is the dataset 100 cases? Who picked them?\"",
         "Failures that were public, well-documented, and span the failure modes "
         "(YES-Ship, YES-Steady, YES-Recover). Sources are primary where possible. "
         "You can propose additions via LAB email."),
    ]
    for q, a in questions:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*HYDRA_TEAL)
        pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin, 5, q)
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*INK_SOFT)
        pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin, 4.5, a)
        pdf.ln(2)
    pdf.set_text_color(*INK)

    pdf.ln(3)
    pdf.section_h("If the sandbox breaks")
    pdf.bullet("'I don't see any buttons.' Confirm the browser is modern (Chrome / Edge / Safari / "
               "Firefox latest). If on a corporate-locked browser, instruct to use personal device.")
    pdf.bullet("'Generate Ed25519 key does nothing.' tweetnacl CDN didn't load. Confirm corp firewall "
               "isn't blocking cdn.jsdelivr.net. Backup: students can use the offline-mode lab variant "
               "(URL ending in ?offline=1) which inlines all dependencies.")
    pdf.bullet("'I get a CORS error in the failures dataset.' bobrapp.github.io/aigovops-beacon was "
               "made private. Switch to the offline-mode URL.")
    pdf.bullet("If the lab is down entirely, fall back to the printable worksheet PDFs and walk the "
               "lab manually from the slide deck. Receipts and bundles can be discussed conceptually.")

    pdf.ln(3)
    pdf.section_h("Post-event (within 7 days)")
    pdf.bullet("Send follow-up email: 'Here's your certificate - here's the recording - "
               "here's the next event.'")
    pdf.bullet("Counter-sign any LAB-subject emails with student certificates (script: scripts/counter_sign.py).")
    pdf.bullet("Capture new cases attendees mentioned for the 100-failure dataset.")
    pdf.bullet("Append a signed audit-log entry to the Beacon repo recording the event "
               "(attendee count, completion rate, key takeaways).")
    pdf.bullet("Publish a 1-page event report - same brand as the build attestation - for LinkedIn.")

    out = DL / "framework-lab-instructor.pdf"
    pdf.output(str(out))
    return out


# ---------------------------------------------------------------------------
# Attendee handout (single page)
# ---------------------------------------------------------------------------


def build_attendee_handout() -> Path:
    pdf = EventPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*INK)
    pdf.cell(0, 11, "What to expect at the lab.", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*INK_SOFT)
    pdf.cell(0, 6, "AIGovOps Foundation - Framework Lab for AIGovOps Auditors - virtual", ln=True)
    pdf.ln(3)

    # Two columns
    col_y_start = pdf.get_y()

    # Left column
    pdf.set_xy(15, col_y_start)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*HYDRA_TEAL)
    pdf.cell(95, 6, "What you'll do", ln=True)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*INK_SOFT)
    pdf.set_x(15)
    pdf.multi_cell(95, 4.5,
        "Find every AI. Sign what matters. Hand the auditor a bundle. "
        "30 minutes total, in your browser, with about 100 of us doing it together.")
    pdf.ln(2)

    pdf.set_x(15)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*HYDRA_TEAL)
    pdf.cell(95, 6, "What to bring", ln=True)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*INK_SOFT)
    pdf.set_x(15)
    pdf.multi_cell(95, 4.5,
        "A laptop. A modern browser (Chrome, Edge, Safari, or Firefox). "
        "Nothing to install. Your private keys never leave your tab.")
    pdf.ln(2)

    pdf.set_x(15)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*HYDRA_TEAL)
    pdf.cell(95, 6, "How to prepare", ln=True)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*INK_SOFT)
    pdf.set_x(15)
    pdf.multi_cell(95, 4.5,
        "Run the 30-second pre-event diagnostic the day before. "
        "It confirms your browser is ready: WebCrypto, localStorage, CDN access. "
        "We'll send the link in the reminder email.")
    pdf.ln(2)

    pdf.set_x(15)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*HYDRA_TEAL)
    pdf.cell(95, 6, "Today's timeline", ln=True)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*INK_SOFT)
    timeline = [
        ("0:00 - 0:05", "Welcome and overview"),
        ("0:05 - 0:18", "Walk the 5-step Studio together"),
        ("0:18 - 0:25", "Sandbox: sign your first receipt"),
        ("0:25 - 0:35", "Map a real failure to controls"),
        ("0:35 - 0:50", "Quiz and signed completion certificate"),
        ("0:50 - 1:25", "Level 200 preview and Q & A"),
        ("1:25 - 1:30", "Close")
    ]
    for time, label in timeline:
        pdf.set_x(15)
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(*HYDRA_TEAL)
        pdf.cell(22, 4.5, time, ln=False)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(*INK_SOFT)
        pdf.cell(73, 4.5, label, ln=True)
    pdf.ln(2)

    # Right column — QR + URL
    pdf.set_xy(120, col_y_start)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*HYDRA_TEAL)
    pdf.cell(75, 6, "Scan to open the lab", ln=True)

    qr_path = DL / "framework-lab-qr.png"
    if qr_path.exists():
        pdf.image(str(qr_path), x=120, y=col_y_start + 8, w=60, h=60)

    pdf.set_xy(120, col_y_start + 72)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*INK_FAINT)
    pdf.multi_cell(75, 4, LAB_URL)
    pdf.set_xy(120, col_y_start + 80)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*INK_SOFT)
    pdf.multi_cell(75, 4.5,
        "If the QR fails to scan, type the URL above into any modern browser.")

    pdf.ln(8)

    # Closing pull-quote
    pdf.set_y(180)
    pdf.set_fill_color(*PAPER_SOFT)
    pdf.rect(15, 180, pdf.w - 30, 28, "F")
    pdf.set_y(184)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*HYDRA_TEAL)
    pdf.cell(0, 6, "What you'll leave with", ln=True, align="C")
    pdf.ln(1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*INK_SOFT)
    pdf.set_x(20)
    pdf.multi_cell(pdf.w - 40, 4.5,
        "An Ed25519-signed completion certificate, a downloadable evidence "
        "bundle, and one real-world AI failure mapped to the framework controls "
        "and the Beacon artifact that would have caught it.", align="C")

    # Footer with contact
    pdf.set_y(-22)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*HYDRA_TEAL)
    pdf.cell(0, 4, "Questions? Email LAB to:", ln=True, align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*INK_SOFT)
    pdf.cell(0, 4, "bob.rapp@aigovops.community  -  ken.johnston@aigovops.community", ln=True, align="C")

    out = DL / "framework-lab-attendee.pdf"
    pdf.output(str(out))
    return out


if __name__ == "__main__":
    qr = build_qr()
    print(f"QR    -> {qr}  ({qr.stat().st_size:,} bytes)")
    inst = build_instructor_playbook()
    print(f"INST  -> {inst}  ({inst.stat().st_size:,} bytes)")
    att = build_attendee_handout()
    print(f"ATT   -> {att}  ({att.stat().st_size:,} bytes)")
