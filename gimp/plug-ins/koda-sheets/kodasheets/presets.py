"""presets.py - Paper/card/layout presets, default settings, and the
bleed-aware layout builder. Pure logic; no GIMP dependency.

Ported from KodaSheets.jsx lines 33-96, 404-413, 987-1007.
"""

from .layout import compute_layout
from .units import js_round, mm_to_px, mm_to_px_round

# [label, width_mm, height_mm]
PAPER_PRESETS = [
    ["US Letter (216x279)", 216, 279],
    ["A4 (210x297)", 210, 297],
    ["Custom", 0, 0],
]
CARD_PRESETS = [
    ["Poker (63x88)", 63, 88],
    ["Bridge (56x88)", 56, 88],
    ["Tarot (70x120)", 70, 120],
    ["Standard TCG (63x88)", 63, 88],
    ["Custom", 0, 0],
]
CUTMARK_STYLES = ["Corner crop marks", "Corner crosses", "Full gutter gridlines"]
CUTMARK_EDGES = ["Card edge (trim)", "Bleed edge"]
CUTMARK_MODES = ["Invert (subtle)", "Solid black lines"]
DUPLEX_FLIPS = ["Long edge (left-right)", "Short edge (top-bottom)"]
# [label, cols, rows] - cols/rows of 0 means Auto (fit as many as possible).
LAYOUT_STYLES = [
    ["Auto (fit max)", 0, 0],
    ["3 x 3", 3, 3],
    ["2 x 4", 2, 4],
    ["2 x 3", 2, 3],
]


def default_settings():
    """Default settings. Note: GIMP placement is always rasterized (no Smart
    Objects), so the Photoshop 'placement' field is intentionally omitted."""
    return {
        "folder": "",
        "shared_back": "",
        "paper_preset": 0,
        "paper_w": 216, "paper_h": 279,
        "card_preset": 0,
        "card_w": 63, "card_h": 88,
        "ppi": 1200,
        "margin": 5,
        "cards_touching": True,   # cards sit edge-to-edge with no gap
        "gutter": 2,              # spacing (mm) used when cards_touching is False
        "cut_marks_on": False,
        "cut_marks_style": 0,
        "cut_marks_opacity": 30,  # percent
        "cut_marks_edge": 0,      # 0 = card/trim edge, 1 = bleed edge
        "cut_marks_mode": 0,      # 0 = invert (Difference) layer, 1 = solid black
        "cut_marks_len_mm": 3,    # arm length of corner/center marks
        "cut_marks_weight_pt": 0.25,
        "cut_marks_center": False,
        "cut_marks_dashed": False,
        "duplex": True,
        "duplex_flip": 1,         # short edge (top-bottom): common home-printer default
        "off_x": 0,
        "off_y": 0,
        "bleed_on": False,
        "bleed_mm": 3.175,        # 1/8 inch per edge
        "layout_style": 0,
    }


def resolve_paper_dims(s):
    p = PAPER_PRESETS[s["paper_preset"]]
    if p and p[0] != "Custom":
        return {"w_mm": p[1], "h_mm": p[2]}
    return {"w_mm": s["paper_w"], "h_mm": s["paper_h"]}


def resolve_card_dims(s):
    c = CARD_PRESETS[s["card_preset"]]
    if c and c[0] != "Custom":
        return {"w_mm": c[1], "h_mm": c[2]}
    return {"w_mm": s["card_w"], "h_mm": s["card_h"]}


def make_layout(s):
    """Build the bleed-aware layout plus document geometry for a settings dict.

    When bleed is on, slots are arranged at the bleed-inclusive size so images
    are never cropped; cut marks are later drawn at the trim line, inset by
    bleed_px. Returns dict: layout, pd, cd, bleed_mm, bleed_px, w_px, h_px.
    """
    pd = resolve_paper_dims(s)
    cd = resolve_card_dims(s)
    bleed_mm = s["bleed_mm"] if s["bleed_on"] else 0
    style = LAYOUT_STYLES[s["layout_style"]] if s["layout_style"] < len(LAYOUT_STYLES) else LAYOUT_STYLES[0]
    # Touching cards sit edge-to-edge (0 mm); otherwise use the supplied spacing.
    eff_gutter = 0 if s["cards_touching"] else s["gutter"]
    layout = compute_layout({
        "paper_w": pd["w_mm"], "paper_h": pd["h_mm"],
        "card_w": cd["w_mm"] + 2 * bleed_mm, "card_h": cd["h_mm"] + 2 * bleed_mm,
        "margin": s["margin"], "gutter": eff_gutter, "ppi": s["ppi"],
        "force_cols": style[1], "force_rows": style[2],
    })
    return {
        "layout": layout, "pd": pd, "cd": cd, "bleed_mm": bleed_mm,
        "bleed_px": js_round(mm_to_px(bleed_mm, s["ppi"])),
        "w_px": mm_to_px_round(pd["w_mm"], s["ppi"]),
        "h_px": mm_to_px_round(pd["h_mm"], s["ppi"]),
    }
