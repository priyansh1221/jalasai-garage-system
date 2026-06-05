#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


OUT = Path(__file__).resolve().parents[1] / "docs" / "Plan" / "JalaSai_Low_Overwhelm_Task_Plan.pdf"


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


class PdfBuilder:
    def __init__(self) -> None:
        self.objects: list[bytes] = []

    def add(self, body: str | bytes) -> int:
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.objects.append(body)
        return len(self.objects)

    def stream(self, dict_text: str, data: str) -> int:
        raw = data.encode("utf-8")
        return self.add(f"<< {dict_text} /Length {len(raw)} >>\nstream\n".encode("utf-8") + raw + b"\nendstream")

    def write(self, path: Path, root_ref: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for i, body in enumerate(self.objects, start=1):
            offsets.append(len(out))
            out += f"{i} 0 obj\n".encode("ascii")
            out += body
            out += b"\nendobj\n"
        xref = len(out)
        out += f"xref\n0 {len(self.objects) + 1}\n".encode("ascii")
        out += b"0000000000 65535 f \n"
        for off in offsets[1:]:
            out += f"{off:010d} 00000 n \n".encode("ascii")
        out += (
            f"trailer\n<< /Size {len(self.objects) + 1} /Root {root_ref} 0 R >>\n"
            f"startxref\n{xref}\n%%EOF\n"
        ).encode("ascii")
        path.write_bytes(out)


def text(x: int, y: int, size: int, value: str, font: str = "F1") -> str:
    return f"BT /{font} {size} Tf {x} {y} Td ({pdf_escape(value)}) Tj ET\n"


def line(x1: int, y1: int, x2: int, y2: int, width: float = 0.8) -> str:
    return f"{width} w {x1} {y1} m {x2} {y2} l S\n"


def rect(x: int, y: int, w: int, h: int, width: float = 0.8) -> str:
    return f"{width} w {x} {y} {w} {h} re S\n"


def fill_rect(x: int, y: int, w: int, h: int, gray: float) -> str:
    return f"{gray} g {x} {y} {w} {h} re f 0 g\n"


def checkbox_appearance(pdf: PdfBuilder) -> tuple[int, int]:
    off = pdf.stream("/BBox [0 0 13 13] /Resources << >>", "1 w 0 0 13 13 re S\n")
    yes = pdf.stream(
        "/BBox [0 0 13 13] /Resources << >>",
        "1 w 0 0 13 13 re S\n2 w 3 7 m 5 4 l 10 10 l S\n",
    )
    return off, yes


def make_checkbox(pdf: PdfBuilder, name: str, x: int, y: int, off_ref: int, yes_ref: int) -> int:
    return pdf.add(
        f"<< /FT /Btn /T ({pdf_escape(name)}) /Ff 0 /V /Off /AS /Off "
        f"/Rect [{x} {y} {x + 13} {y + 13}] /Subtype /Widget /F 4 /Type /Annot "
        f"/AP << /N << /Off {off_ref} 0 R /Yes {yes_ref} 0 R >> >> >>"
    )


def make_text_field(pdf: PdfBuilder, name: str, x: int, y: int, w: int, h: int, multiline: bool = False) -> int:
    flags = 4096 if multiline else 0
    return pdf.add(
        f"<< /FT /Tx /T ({pdf_escape(name)}) /Ff {flags} /V () /DV () "
        f"/Rect [{x} {y} {x + w} {y + h}] /Subtype /Widget /F 4 /Type /Annot "
        f"/DA (/F1 10 Tf 0 g) /MK << /BC [0.45 0.45 0.45] /BG [1 1 1] >> /BS << /W 0.8 /S /S >> >>"
    )


def page_one_content() -> str:
    c = ""
    c += text(40, 800, 20, "JalaSai 90-Day Simple Task Plan", "F2")
    c += text(40, 778, 10, "Use this daily. Keep only two growth experiments active. Protect service quality first.")
    c += fill_rect(40, 744, 515, 24, 0.92)
    c += text(52, 752, 13, "TODAY'S TOP 3", "F2")
    c += text(40, 716, 11, "1. Revenue action")
    c += text(40, 682, 11, "2. Trust/review action")
    c += text(40, 648, 11, "3. Operations clarity action")
    c += fill_rect(40, 598, 515, 24, 0.92)
    c += text(52, 606, 13, "DAILY CHECKLIST", "F2")
    items = [
        "EV job photos + voice note done",
        "Quote explained before work",
        "Lead/customer follow-up done",
        "Review requested after successful job",
        "Revenue, expense, and collection noted",
        "Buffer used? If yes, write why",
    ]
    y = 566
    for item in items:
        c += text(62, y, 11, item)
        y -= 28
    c += fill_rect(40, 356, 515, 24, 0.92)
    c += text(52, 364, 13, "DAILY NUMBERS", "F2")
    labels = ["Total revenue", "New EV jobs", "New leads/source", "Plans sold", "Energy A/B"]
    y = 322
    for label in labels:
        c += text(40, y, 10, label)
        y -= 34
    c += fill_rect(40, 126, 515, 24, 0.92)
    c += text(52, 134, 13, "OVERWHELM RULE", "F2")
    c += text(40, 102, 10, "If buffer is used 3 days in a row: pause new outreach for 2 working days.")
    c += text(40, 84, 10, "If both people feel overloaded: cut marketing first, not service quality.")
    return c


def page_two_content() -> str:
    c = ""
    c += text(40, 800, 18, "Weekly Review + Decision Gates", "F2")
    c += text(40, 778, 10, "Review every Sunday. Keep it honest and short.")
    c += fill_rect(40, 738, 515, 24, 0.92)
    c += text(52, 746, 13, "FIVE WEEKLY NUMBERS", "F2")
    labels = [
        "Total weekly revenue",
        "New EV jobs",
        "New leads by source",
        "Plans sold",
        "Energy score for both managers",
    ]
    y = 704
    for label in labels:
        c += text(40, y, 10, label)
        y -= 34
    c += fill_rect(40, 492, 515, 24, 0.92)
    c += text(52, 500, 13, "30 / 60 / 90 DAY GATES", "F2")
    gates = [
        ("Day 30 - 25 May", "10 reviews, 5 WhatsApp visits, 5 plans, spend <= Rs 5,000, energy >= 7/10"),
        ("Day 60 - 24 June", "Rs 75k-1L new revenue, 8-10 plan holders, conversion > 20%, energy >= 7/10"),
        ("Day 90 - 24 July", "Rs 5-6L run rate, 15+ plan holders, 20 reviews, 15 new customers/month"),
    ]
    y = 456
    for title, desc in gates:
        c += text(62, y, 11, title, "F2")
        c += text(62, y - 16, 9, desc)
        y -= 56
    c += fill_rect(40, 266, 515, 24, 0.92)
    c += text(52, 274, 13, "DO NOT DO YET", "F2")
    donts = [
        "No software changes",
        "No customer app",
        "No second branch",
        "No hiring",
        "No daily fleet chasing",
        "No discount before 20 real objections",
    ]
    y = 236
    for item in donts:
        c += text(62, y, 10, item)
        y -= 24
    c += text(40, 54, 9, "Simple rule: revenue, trust, reviews, repeat customers, or operational clarity. Everything else waits.")
    return c


def build() -> None:
    pdf = PdfBuilder()
    font_regular = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    resources = f"<< /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >>"
    off_ref, yes_ref = checkbox_appearance(pdf)

    annots_p1: list[int] = []
    annots_p2: list[int] = []

    for i, y in enumerate([564, 536, 508, 480, 452, 424], start=1):
        annots_p1.append(make_checkbox(pdf, f"daily_check_{i}", 40, y - 2, off_ref, yes_ref))
    for name, y in [
        ("today_revenue_action", 704),
        ("today_trust_action", 670),
        ("today_ops_action", 636),
        ("daily_total_revenue", 314),
        ("daily_new_ev_jobs", 280),
        ("daily_new_leads_source", 246),
        ("daily_plans_sold", 212),
        ("daily_energy_ab", 178),
        ("buffer_reason", 82),
    ]:
        annots_p1.append(make_text_field(pdf, name, 170 if "daily_" in name else 150, y - 5, 360 if "daily_" in name else 385, 20))

    for name, y in [
        ("weekly_total_revenue", 696),
        ("weekly_new_ev_jobs", 662),
        ("weekly_new_leads", 628),
        ("weekly_plans_sold", 594),
        ("weekly_energy", 560),
        ("next_week_focus", 86),
    ]:
        annots_p2.append(make_text_field(pdf, name, 210 if name.startswith("weekly") else 150, y - 5, 325 if name.startswith("weekly") else 385, 20))
    for i, y in enumerate([234, 210, 186, 162, 138, 114], start=1):
        annots_p2.append(make_checkbox(pdf, f"not_yet_{i}", 40, y - 2, off_ref, yes_ref))

    content1 = pdf.stream("", page_one_content())
    content2 = pdf.stream("", page_two_content())
    page1 = pdf.add(f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources {resources} /Contents {content1} 0 R /Annots [{' '.join(f'{a} 0 R' for a in annots_p1)}] >>")
    page2 = pdf.add(f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources {resources} /Contents {content2} 0 R /Annots [{' '.join(f'{a} 0 R' for a in annots_p2)}] >>")
    pages = pdf.add(f"<< /Type /Pages /Kids [{page1} 0 R {page2} 0 R] /Count 2 >>")

    # Patch parent references after the /Pages object exists.
    pdf.objects[page1 - 1] = pdf.objects[page1 - 1].replace(b"/Parent 0 0 R", f"/Parent {pages} 0 R".encode("ascii"))
    pdf.objects[page2 - 1] = pdf.objects[page2 - 1].replace(b"/Parent 0 0 R", f"/Parent {pages} 0 R".encode("ascii"))

    fields = " ".join(f"{a} 0 R" for a in annots_p1 + annots_p2)
    catalog = pdf.add(f"<< /Type /Catalog /Pages {pages} 0 R /AcroForm << /Fields [{fields}] /NeedAppearances true /DA (/F1 10 Tf 0 g) >> >>")
    pdf.write(OUT, catalog)
    print(OUT)


if __name__ == "__main__":
    build()
