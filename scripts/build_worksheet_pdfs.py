"""
Build printable PDF worksheets for the Framework Lab.

Generates:
  docs/downloads/lab-worksheet-100.pdf  (5 curated cases + 1 blank template)
  docs/downloads/lab-worksheet-200.pdf  (1 deep-dive template + 10 curated cases)

Run from repo root:
  python3 scripts/build_worksheet_pdfs.py

Uses fpdf2 (pure Python, no system deps).
"""

from __future__ import annotations

from pathlib import Path
from fpdf import FPDF

OUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "downloads"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Brand colors (Hydra Teal / Signal Green from site.css)
HYDRA_TEAL = (1, 105, 111)
SIGNAL_GREEN = (46, 204, 113)
INK = (14, 27, 28)
INK_SOFT = (58, 74, 75)
INK_FAINT = (122, 136, 137)
BORDER = (216, 212, 196)


# ---------------------------------------------------------------------------
# PDF base class
# ---------------------------------------------------------------------------


class WorksheetPDF(FPDF):
    title_text = ""
    subtitle_text = ""

    def header(self) -> None:
        # Brand bar
        self.set_fill_color(*HYDRA_TEAL)
        self.rect(0, 0, self.w, 12, "F")
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 10)
        self.set_xy(15, 3)
        self.cell(0, 6, "AiGovOps Beacon  |  Framework Lab Worksheet", ln=False)
        self.set_xy(self.w - 60, 3)
        self.set_font("Helvetica", "", 9)
        self.cell(45, 6, "aigovopsfoundation.org", align="R")
        self.set_text_color(*INK)
        self.set_y(18)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*INK_FAINT)
        self.cell(
            0, 5,
            f"Page {self.page_no()}  |  AiGovOps Foundation - Apache-2.0  |  YES-Ship - YES-Steady - YES-Recover",
            align="C",
        )

    def section_title(self, text: str) -> None:
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*HYDRA_TEAL)
        self.cell(0, 8, text, ln=True)
        self.set_text_color(*INK)
        self.set_font("Helvetica", "", 9)

    def description(self, text: str) -> None:
        self.set_text_color(*INK_SOFT)
        self.set_font("Helvetica", "", 9)
        self.multi_cell(0, 4.5, text)
        self.ln(2)
        self.set_text_color(*INK)

    def field_row(self, label: str, hint: str = "") -> None:
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*INK_FAINT)
        self.cell(60, 5, label.upper(), ln=False)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*INK)
        if hint:
            self.set_text_color(*INK_FAINT)
            self.set_font("Helvetica", "I", 8)
            self.cell(0, 5, hint, ln=True)
        else:
            self.cell(0, 5, "", ln=True)
        # Single underline for write-in
        y = self.get_y()
        self.set_draw_color(*BORDER)
        self.set_line_width(0.2)
        self.line(15, y + 4, self.w - 15, y + 4)
        self.ln(8)
        self.set_text_color(*INK)

    def case_block(
        self,
        title: str,
        synopsis: str,
        yes_acts: list[str] | None = None,
        is_template: bool = False,
    ) -> None:
        # Border box
        start_y = self.get_y()
        # Title
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*INK)
        self.cell(0, 6, title, ln=True)
        self.ln(1)
        # Synopsis
        if synopsis:
            self.set_text_color(*INK_SOFT)
            self.set_font("Helvetica", "", 9)
            self.multi_cell(0, 4.5, synopsis)
            self.ln(2)
        # Fields
        self.set_text_color(*INK)
        if is_template:
            self.field_row("Incident / system")
            self.field_row("Year / date range")
        self.field_row("Who was harmed")
        self.field_row("What failed")
        self.field_row("Which framework(s) apply")
        self.field_row("Which Beacon artifact would have mattered most")
        # YES-act
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*INK_FAINT)
        self.cell(60, 5, "YES-ACT", ln=False)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*INK)
        self.cell(0, 5, "(  ) Ship    (  ) Steady    (  ) Recover", ln=True)
        # Box
        end_y = self.get_y()
        self.set_draw_color(*BORDER)
        self.set_line_width(0.3)
        if is_template:
            # dashed
            self.set_dash_pattern(dash=2, gap=2)
        self.rect(13, start_y - 2, self.w - 26, end_y - start_y + 5)
        self.set_dash_pattern()
        self.ln(8)


# ---------------------------------------------------------------------------
# Level 100 PDF
# ---------------------------------------------------------------------------


def build_level_100() -> Path:
    pdf = WorksheetPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()

    # Cover heading
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*INK)
    pdf.cell(0, 10, "Level 100 Worksheet", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*INK_SOFT)
    pdf.cell(0, 6, "AiGovOps Beacon Framework Lab - the 30-minute auditor flow", ln=True)
    pdf.ln(2)

    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0, 4.5,
        "For each case below, fill in: who was harmed, what failed, which framework applies, "
        "which Beacon artifact would have caught the gap, and which YES-act (Ship / Steady / Recover) "
        "it falls under. Bring your completed worksheet to the review session.",
    )
    pdf.ln(4)

    cases = [
        (
            "Case 1 -- Boeing 737 MAX MCAS software fatal crashes (2018-2019)",
            "Boeing concealed a safety-critical MCAS design change from regulators and pilots; "
            "the certification process failed to catch that the system could repeatedly command "
            "nose-down trim from erroneous sensor data.",
        ),
        (
            "Case 2 -- Knight Capital deployment failure (2012)",
            "A deployment failed to push updated code to one of eight servers. The stale code "
            "interpreted new order-routing flags as legacy commands, generating runaway orders "
            "that bankrupted the firm in less than an hour.",
        ),
        (
            "Case 3 -- Detroit wrongful arrest via facial recognition (2020)",
            "A face-recognition match produced a single candidate; police arrested Robert Williams "
            "based on that match alone. No human review, no documented thresholding, no audit trail "
            "of the model version or training data.",
        ),
        (
            "Case 4 -- Apple Card credit limit bias allegations (2019)",
            "Couples with similar finances saw very different credit limits, including in the same "
            "household. Goldman/Apple could not explain the decisions or demonstrate disparate-impact testing.",
        ),
        (
            "Case 5 -- Robodebt automated welfare debt scheme (Australia, 2016-2020)",
            "An automated income-averaging algorithm was deployed against welfare recipients without "
            "legal authority, generating false debts at scale. Operational decisions were made by "
            "automation without documented review or recourse.",
        ),
    ]

    for title, synopsis in cases:
        pdf.case_block(title, synopsis)

    # Blank template
    pdf.add_page()
    pdf.section_title("Your own case")
    pdf.description(
        "Fill in a real failure or near-miss from your organization. Use it in the review "
        "session as a starting point for which Beacon artifact you should ship first."
    )
    pdf.case_block(
        "",
        "",
        is_template=True,
    )

    out = OUT_DIR / "lab-worksheet-100.pdf"
    pdf.output(str(out))
    return out


# ---------------------------------------------------------------------------
# Level 200 PDF
# ---------------------------------------------------------------------------


def build_level_200() -> Path:
    pdf = WorksheetPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*INK)
    pdf.cell(0, 10, "Level 200 Worksheet", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*INK_SOFT)
    pdf.cell(0, 6, "AiGovOps Beacon Framework Lab - Suitcase + deep-dive", ln=True)
    pdf.ln(2)

    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        0, 4.5,
        "Use this worksheet alongside the 100-failure deep-dive in Level 200. "
        "Pick 5 technical cases and 5 policy-facing cases. For each, document the missing "
        "Beacon artifact and the framework controls that apply. The Suitcase Lab gives you "
        "the receipts to verify your analysis offline.",
    )
    pdf.ln(4)

    # Technical case headings
    pdf.section_title("Technical track -- pick 5")
    technical = [
        "Boeing 737 MAX MCAS software fatal crashes (2018-2019)",
        "Knight Capital deployment failure (2012)",
        "Tesla Autopilot fatal crashes / recall (2016 onward)",
        "Cruise robotaxi pedestrian drag (2023)",
        "Zillow $304M algorithmic home-buying write-down (2021)",
        "Microsoft Tay racist outputs (2016)",
        "Anthropic Claude prompt injection vulnerabilities (2024)",
        "ChatGPT plugin SSRF / data exfiltration (2023)",
    ]
    for t in technical:
        pdf.case_block(t, "", is_template=False)

    # Policy track
    pdf.add_page()
    pdf.section_title("Policy track -- pick 5")
    policy = [
        "Robodebt automated welfare debt scheme (Australia 2016-2020)",
        "UK A-level algorithm grading scandal (2020)",
        "Apple Card credit limit bias allegations (2019)",
        "Detroit wrongful arrest via facial recognition (2020)",
        "iTutorGroup hiring discrimination (EEOC, 2023)",
        "Dutch SyRI welfare fraud surveillance (2020)",
        "Hong Kong $25M deepfake CFO wire fraud (2024)",
        "OPM background-check breach extended via AI (2015 onward)",
    ]
    for t in policy:
        pdf.case_block(t, "", is_template=False)

    # Deep-dive template
    pdf.add_page()
    pdf.section_title("Your deep-dive case")
    pdf.description(
        "Fill in one in-depth case from your sector. Cross-reference it against the "
        "Beacon checklists, the 100-case dataset, and at least one framework control "
        "from the registry."
    )
    pdf.case_block("", "", is_template=True)

    out = OUT_DIR / "lab-worksheet-200.pdf"
    pdf.output(str(out))
    return out


if __name__ == "__main__":
    p100 = build_level_100()
    p200 = build_level_200()
    print(f"Wrote {p100}")
    print(f"Wrote {p200}")
