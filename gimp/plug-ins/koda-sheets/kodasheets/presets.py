"""presets.py - Paper/card/layout presets, default settings, and the
bleed-aware layout builder. Pure logic; no GIMP dependency.

Ported from KodaSheets.jsx lines 33-96, 404-413, 987-1007.
"""

from .layout import compute_layout
from .units import js_round, mm_to_px, mm_to_px_round, pt_to_px

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
        # Crop the finished canvas down to the card block (plus any cut marks)
        # so printers don't shrink-to-fit the empty paper margin and print the
        # cards undersized. On by default; turn off to keep the full paper sheet.
        "crop_to_cards": True,
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


def compute_crop_box(L, s):
    """Bounding box (x, y, w, h) in px to crop the finished canvas down to the
    actual card block, so printers reproduce the cards at true 1:1 size instead
    of shrink-to-fitting the whole paper sheet inside their unprintable margin.

    The box is the union of all card slots (bleed-inclusive when bleed is on),
    expanded outward by the corner cut-mark overhang when cut marks are enabled,
    and clamped to the document bounds. Note: page-edge marks that live out in
    the paper margin (center/registration marks, full-canvas gutter gridlines)
    are trimmed away by this crop - crop-to-cards trades them for true sizing.
    """
    layout = L["layout"]
    slots = layout["slots"]
    if not slots:
        return 0, 0, L["w_px"], L["h_px"]

    left = min(sl["x_px"] for sl in slots)
    top = min(sl["y_px"] for sl in slots)
    right = max(sl["x_px"] + sl["w_px"] for sl in slots)
    bottom = max(sl["y_px"] + sl["h_px"] for sl in slots)

    if s["cut_marks_on"]:
        ppi = s["ppi"]
        sw = max(1, js_round(pt_to_px(s["cut_marks_weight_pt"], ppi)))
        mark_len = max(1, mm_to_px_round(s["cut_marks_len_mm"], ppi))
        # Corner crop marks / crosses start at a point inset from the slot edge
        # and reach mark_len outward; keep whatever pokes past the block edge.
        inset = 0 if s["cut_marks_edge"] == 1 else L["bleed_px"]
        overhang = max(0, mark_len - inset) + sw
        left -= overhang
        top -= overhang
        right += overhang
        bottom += overhang

    x = max(0, js_round(left))
    y = max(0, js_round(top))
    right = min(L["w_px"], js_round(right))
    bottom = min(L["h_px"], js_round(bottom))
    return x, y, max(1, right - x), max(1, bottom - y)
