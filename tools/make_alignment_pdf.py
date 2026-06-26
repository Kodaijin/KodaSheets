#!/usr/bin/env python3
"""Generate BacksideAlignmentTest.pdf for Koda Sheets.

A two-page, print-at-100% calibration sheet for dialing in the duplex back
offset. Page 1 (front) carries a centered crosshair with a numbered millimetre
ruler plus instructions; page 2 (back) carries a bold crosshair at true center.
Printed double-sided and held to a light, the reading where the back crosshair
lands on the front ruler is the offset to enter in Koda Sheets.

Run:  python tools/make_alignment_pdf.py
Needs: reportlab  (pip install reportlab)
"""

import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "BacksideAlignmentTest.pdf")

PAGE_W, PAGE_H = letter           # 612 x 792 pt
CX, CY = PAGE_W / 2.0, PAGE_H / 2.0
RANGE_MM = 20                     # ruler spans +/- 20 mm
R = RANGE_MM * mm

FINE = 0.5                        # ruler line / tick weight (pt)
BOLD = 1.4                        # back crosshair weight (pt)
MINOR, MEDIUM, MAJOR = 1.2 * mm, 2.4 * mm, 4.0 * mm   # 1 / 5 / 10 mm ticks
LEFT = 0.9 * 72                   # text left margin (pt)


def draw_ruler(c):
    c.setLineWidth(FINE)
    # Axis lines.
    c.line(CX - R, CY, CX + R, CY)
    c.line(CX, CY - R, CX, CY + R)
    # Ticks: 1 mm minor, 5 mm medium, 10 mm major.
    for i in range(-RANGE_MM, RANGE_MM + 1):
        p = i * mm
        ln = MAJOR if i % 10 == 0 else (MEDIUM if i % 5 == 0 else MINOR)
        c.line(CX + p, CY - ln, CX + p, CY + ln)   # along horizontal axis
        c.line(CX - ln, CY + p, CX + ln, CY + p)   # along vertical axis
    # Numbers every 10 mm. +Y points DOWN (screen y decreases), matching the
    # offset convention. X numbers sit below the horizontal axis, Y numbers to
    # the left of the vertical axis, each set well clear of the center.
    # A small perpendicular gap keeps each number in the clear band next to the
    # axis, between the center and the first cross-axis label (a larger gap would
    # push them onto each other near the origin).
    c.setFont("Helvetica", 9)
    gap = 2 * mm
    for i in range(-RANGE_MM, RANGE_MM + 1, 10):
        if i == 0:
            continue
        c.drawCentredString(CX + i * mm, CY - MAJOR - gap - 7, str(i))  # X axis
        c.drawRightString(CX - MAJOR - gap, CY - i * mm - 3.2, str(i))  # Y axis (down = +)
    # Axis end labels.
    c.setFont("Helvetica-Bold", 10)
    c.drawString(CX + R + 5, CY - 4, "+X")
    c.drawRightString(CX - R - 5, CY - 4, "-X")
    c.drawCentredString(CX, CY - R - 14, "+Y")
    c.drawCentredString(CX, CY + R + 6, "-Y")


def draw_text_block(c, x, y, lines, size, leading, font="Helvetica"):
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_scale_check(c):
    """A 50 mm reference bar so the user can confirm 100% print scale."""
    y = 1.0 * 72
    x0 = CX - 25 * mm
    x1 = CX + 25 * mm
    c.setLineWidth(FINE)
    c.line(x0, y, x1, y)
    for x in (x0, x1):
        c.line(x, y - 2 * mm, x, y + 2 * mm)
    c.setFont("Helvetica", 9)
    c.drawCentredString(CX, y - 5 * mm,
                        "50 mm reference - measure this line; if it is not 50 mm, "
                        "reprint at 100% (Actual Size).")


def front_page(c):
    title_y = PAGE_H - 0.9 * 72
    c.setFont("Helvetica-Bold", 14)
    c.drawString(LEFT, title_y, "BACKSIDE ALIGNMENT TEST")
    lines = [
        "Print BOTH pages double-sided at 100% (Actual Size) - do NOT 'scale to fit'.",
        "Flip on the edge your printer uses for duplex (long or short).",
        "",
        "1. Hold the printed sheet up to a bright light, this side toward you;",
        "   the back crosshair shows through.",
        "2. Read where the back crosshair's center dot sits on the rulers:",
        "   horizontal scale = X, vertical scale = Y (millimetres). 0 = aligned.",
        "3. Enter those readings in Koda Sheets as Back calibration X and Y.",
        "   Axes:  +X = right,  -X = left,  +Y = down,  -Y = up.",
        "4. Print your real cards. If the back shifts the wrong way,",
        "   negate that value and reprint.",
    ]
    draw_text_block(c, LEFT, title_y - 26, lines, 11, 15)
    draw_ruler(c)
    draw_scale_check(c)
    c.showPage()


def back_page(c):
    title_y = PAGE_H - 0.9 * 72
    c.setFont("Helvetica-Bold", 12)
    c.drawString(LEFT, title_y, "BACKSIDE ALIGNMENT TEST - BACK")
    c.setFont("Helvetica", 11)
    c.drawString(LEFT, title_y - 18,
                 "Crosshair is at true center (no offset). Print on the back of page 1.")
    # Bold crosshair + solid center dot.
    c.setLineWidth(BOLD)
    c.line(CX - R, CY, CX + R, CY)
    c.line(CX, CY - R, CX, CY + R)
    c.setFillColorRGB(0, 0, 0)
    c.circle(CX, CY, 1.2 * mm, stroke=0, fill=1)
    c.showPage()


def main():
    c = canvas.Canvas(OUT, pagesize=letter)
    c.setTitle("Koda Sheets - Backside Alignment Test")
    front_page(c)
    back_page(c)
    c.save()
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
