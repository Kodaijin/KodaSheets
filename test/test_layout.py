"""test_layout.py - Self-contained unit tests for the GIMP port's pure logic
(units, layout, scan). No GIMP and no external test framework required.

Run with:
    python3 test/test_layout.py
Exits 0 on success, 1 on any failure. This mirrors test/layout.test.mjs, which
covers the same engine for the Photoshop (JSX) build.
"""

import os
import sys
import tempfile

# Make the plug-in package importable without installing into GIMP.
sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "gimp", "plug-ins", "koda-sheets"))

from kodasheets.units import (MM_PER_INCH, mm_to_px, mm_to_px_round, px_to_mm,
                              pt_to_px)
from kodasheets.layout import compute_layout, mirror_index, mirror_index_v
from kodasheets.scan import natural_compare, scan_folder
from kodasheets.presets import make_layout, default_settings, compute_crop_box

passed = 0
failed = 0


def test(name, fn):
    global passed, failed
    try:
        fn()
        print("PASS  %s" % name)
        passed += 1
    except Exception as err:  # noqa: BLE001 - test harness
        print("FAIL  %s" % name)
        print("      %s" % err)
        failed += 1


def assert_eq(actual, expected, msg=""):
    if actual != expected:
        raise AssertionError("%s expected %r, got %r" % (msg, expected, actual))


def assert_close(actual, expected, eps=1e-9, msg=""):
    if abs(actual - expected) >= eps:
        raise AssertionError("%s expected ~%r, got %r" % (msg, expected, actual))


def assert_no_overlap(slots):
    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            a, b = slots[i], slots[j]
            overlap_x = a["x_px"] + a["w_px"] > b["x_px"] and b["x_px"] + b["w_px"] > a["x_px"]
            overlap_y = a["y_px"] + a["h_px"] > b["y_px"] and b["y_px"] + b["h_px"] > a["y_px"]
            if overlap_x and overlap_y:
                raise AssertionError("Slots %d and %d overlap" % (a["index"], b["index"]))


def assert_in_bounds(slots, paper_w_px, paper_h_px):
    eps = 1e-6
    for s in slots:
        if s["x_px"] < -eps or s["y_px"] < -eps:
            raise AssertionError("Slot %d outside top/left" % s["index"])
        if s["x_px"] + s["w_px"] > paper_w_px + eps:
            raise AssertionError("Slot %d right edge past paper" % s["index"])
        if s["y_px"] + s["h_px"] > paper_h_px + eps:
            raise AssertionError("Slot %d bottom edge past paper" % s["index"])


# --- units ---------------------------------------------------------------

def t_mm_per_inch():
    assert_eq(MM_PER_INCH, 25.4, "MM_PER_INCH")


def t_mm_to_px():
    assert_eq(mm_to_px(25.4, 300), 300)
    assert_eq(mm_to_px(25.4, 1200), 1200)
    assert_eq(mm_to_px(0, 1200), 0)


def t_mm_to_px_round():
    # 1 mm at 300 dpi = 11.811... -> 12 (JS-style round half up)
    assert_eq(mm_to_px_round(1, 300), 12)
    assert_eq(mm_to_px_round(25.4, 1200), 1200)


def t_px_to_mm_inverse():
    for mm in [0, 1, 6, 25.4, 63, 88, 210, 297]:
        assert_close(px_to_mm(mm_to_px(mm, 1200), 1200), mm, 1e-9, "round-trip %s" % mm)


def t_pt_to_px():
    assert_close(pt_to_px(72, 1200), 1200)
    assert_close(pt_to_px(0.25, 1200), (0.25 / 72) * 1200)


# --- compute_layout ------------------------------------------------------

def t_poker_letter():
    ppi = 1200
    layout = compute_layout({
        "paper_w": 216, "paper_h": 279, "card_w": 63, "card_h": 88,
        "margin": 6, "gutter": 0, "ppi": ppi})
    assert_eq(layout["cols"], 3, "cols")
    assert_eq(layout["rows"], 3, "rows")
    assert_eq(layout["count"], 9, "count")
    assert_eq(layout["rotated"], False, "rotated")
    assert_eq(len(layout["slots"]), 9, "slot count")
    assert_close(layout["slots"][0]["x_mm"], 13.5, 1e-9, "slot0.x")
    assert_close(layout["slots"][0]["y_mm"], 7.5, 1e-9, "slot0.y")
    assert_close(layout["slots"][8]["x_mm"], 139.5, 1e-9, "slot8.x")
    assert_close(layout["slots"][8]["y_mm"], 183.5, 1e-9, "slot8.y")
    assert_in_bounds(layout["slots"], mm_to_px(216, ppi), mm_to_px(279, ppi))
    assert_no_overlap(layout["slots"])
    for i, s in enumerate(layout["slots"]):
        assert_eq(s["index"], i, "index")


def t_a4_tarot():
    ppi = 300
    layout = compute_layout({
        "paper_w": 210, "paper_h": 297, "card_w": 70, "card_h": 120,
        "margin": 0, "gutter": 0, "ppi": ppi})
    assert_eq(layout["cols"], 3, "cols")
    assert_eq(layout["rows"], 2, "rows")
    assert_eq(layout["count"], 6, "count")
    assert_eq(layout["rotated"], False, "rotated")
    assert_in_bounds(layout["slots"], mm_to_px(210, ppi), mm_to_px(297, ppi))
    assert_no_overlap(layout["slots"])


def t_rotation_wins():
    ppi = 300
    layout = compute_layout({
        "paper_w": 100, "paper_h": 150, "card_w": 60, "card_h": 40,
        "margin": 0, "gutter": 0, "ppi": ppi, "allow_rotate": True})
    assert_eq(layout["rotated"], True, "rotated")
    assert_eq(layout["cols"], 2, "cols")
    assert_eq(layout["rows"], 2, "rows")
    assert_eq(layout["count"], 4, "count")
    assert_eq(layout["card_w_mm"], 40, "card_w_mm")
    assert_eq(layout["card_h_mm"], 60, "card_h_mm")
    assert_in_bounds(layout["slots"], mm_to_px(100, ppi), mm_to_px(150, ppi))
    assert_no_overlap(layout["slots"])


def t_no_rotate():
    layout = compute_layout({
        "paper_w": 100, "paper_h": 150, "card_w": 60, "card_h": 40,
        "margin": 0, "gutter": 0, "ppi": 300, "allow_rotate": False})
    assert_eq(layout["rotated"], False, "rotated")
    assert_eq(layout["count"], 3, "count")


def t_reserve_gutter():
    ppi = 300
    layout = compute_layout({
        "paper_w": 200, "paper_h": 200, "card_w": 50, "card_h": 50,
        "margin": 0, "gutter": 0, "ppi": ppi, "reserve_gutter_for_marks": True})
    assert_eq(layout["cols"], 3, "cols")
    assert_eq(layout["rows"], 3, "rows")
    assert_eq(layout["count"], 9, "count")
    assert_in_bounds(layout["slots"], mm_to_px(200, ppi), mm_to_px(200, ppi))
    assert_no_overlap(layout["slots"])


def t_gutter_spacing():
    gutter = 5
    ppi = 300
    layout = compute_layout({
        "paper_w": 200, "paper_h": 200, "card_w": 60, "card_h": 60,
        "margin": 0, "gutter": gutter, "ppi": ppi})
    gutter_px = mm_to_px(gutter, ppi)
    for s in layout["slots"]:
        if s["col"] + 1 < layout["cols"]:
            nxt = layout["slots"][s["index"] + 1]
            gap = nxt["x_px"] - (s["x_px"] + s["w_px"])
            assert_close(gap, gutter_px, 1e-6, "gutter gap")


def t_force_grid():
    # Forced 3x3 of Poker on US Letter fits; forced 2x4 also fits.
    s = default_settings()
    s["layout_style"] = 1  # 3 x 3
    L = make_layout(s)
    assert_eq(L["layout"]["cols"], 3, "forced cols")
    assert_eq(L["layout"]["rows"], 3, "forced rows")
    assert_eq(L["layout"]["fits"], True, "forced fits")


# --- crop-to-cards box ---------------------------------------------------

def t_crop_box_tight_to_block():
    # No cut marks: crop box is exactly the card block bounding box, and it is
    # strictly smaller than the full paper so the crop actually fires.
    s = default_settings()
    s["cut_marks_on"] = False
    L = make_layout(s)
    slots = L["layout"]["slots"]
    x, y, w, h = compute_crop_box(L, s)
    left = min(sl["x_px"] for sl in slots)
    top = min(sl["y_px"] for sl in slots)
    right = max(sl["x_px"] + sl["w_px"] for sl in slots)
    bottom = max(sl["y_px"] + sl["h_px"] for sl in slots)
    assert_eq(x, max(0, __import__("math").floor(left + 0.5)), "crop x")
    assert_eq(y, max(0, __import__("math").floor(top + 0.5)), "crop y")
    assert_eq(w, __import__("math").floor(right + 0.5) - x, "crop w")
    assert_eq(h, __import__("math").floor(bottom + 0.5) - y, "crop h")
    assert_eq(w < L["w_px"] and h < L["h_px"], True, "crop smaller than paper")


def t_crop_box_bleed_includes_bleed():
    # With the grid held fixed, turning bleed on makes each card - and thus the
    # cropped block - bigger. (Under auto-fit, bleed can instead reduce the card
    # count, so pin the grid to isolate the per-card growth.)
    base = default_settings()
    base["cut_marks_on"] = False
    base["card_preset"] = 4       # Custom
    base["card_w"] = 40
    base["card_h"] = 40
    base["layout_style"] = 3      # 2 x 3 (fits with and without bleed)
    no_bleed = compute_crop_box(make_layout(base), base)
    bleedy = dict(base); bleedy["bleed_on"] = True
    with_bleed = compute_crop_box(make_layout(bleedy), bleedy)
    assert_eq(with_bleed[2] > no_bleed[2], True, "bleed widens crop")
    assert_eq(with_bleed[3] > no_bleed[3], True, "bleed heightens crop")


def t_crop_box_marks_expand_and_clamp():
    # Corner marks at the bleed edge push the box outward but never past 0 / the
    # paper edge.
    s = default_settings()
    s["cut_marks_on"] = True
    s["cut_marks_style"] = 0      # Corner crop marks
    s["cut_marks_edge"] = 1       # Bleed edge (inset 0 -> full overhang)
    s["cut_marks_len_mm"] = 3
    L = make_layout(s)
    x, y, w, h = compute_crop_box(L, s)
    assert_eq(x >= 0 and y >= 0, True, "crop origin non-negative")
    assert_eq(x + w <= L["w_px"], True, "crop right within paper")
    assert_eq(y + h <= L["h_px"], True, "crop bottom within paper")
    no_marks = dict(s); no_marks["cut_marks_on"] = False
    nx, ny, nw, nh = compute_crop_box(make_layout(no_marks), no_marks)
    assert_eq(w >= nw and h >= nh, True, "marks expand (or clamp) the box")


# --- mirror indices ------------------------------------------------------

def t_mirror_index():
    for index, expected in [(0, 2), (1, 1), (2, 0), (3, 5), (4, 4), (5, 3)]:
        assert_eq(mirror_index(index, 3), expected, "mirror_index(%d,3)" % index)


def t_mirror_index_2col():
    for index, expected in [(0, 1), (1, 0), (2, 3), (3, 2)]:
        assert_eq(mirror_index(index, 2), expected, "mirror_index(%d,2)" % index)


def t_mirror_index_involution():
    for cols in range(1, 6):
        for index in range(cols * 3):
            assert_eq(mirror_index(mirror_index(index, cols), cols), index,
                      "mirror_index involution")


def t_mirror_index_v():
    # 3 cols x 2 rows: row 0 (0,1,2) mirrors to row 1 (3,4,5).
    for index, expected in [(0, 3), (1, 4), (2, 5), (3, 0), (4, 1), (5, 2)]:
        assert_eq(mirror_index_v(index, 3, 2), expected, "mirror_index_v(%d)" % index)


# --- scan / pairing ------------------------------------------------------

def t_natural_compare():
    names = ["10 card", "2 card", "20 card", "1 card"]
    names.sort(key=__import__("functools").cmp_to_key(natural_compare))
    assert_eq(names, ["1 card", "2 card", "10 card", "20 card"], "natural sort")


def t_scan_folder_pairing():
    with tempfile.TemporaryDirectory() as d:
        for n in ["1 sample.png", "1 sample back.png", "2 hero_back.png",
                  "2 hero.png", "quarterback.png", "10 late.png", "notes.txt"]:
            open(os.path.join(d, n), "w").close()
        scan = scan_folder(d)
        bases = [f["base"] for f in scan["fronts"]]
        # Fronts: "1 sample", "2 hero", "10 late", "quarterback" - natural sorted.
        assert_eq(scan["total"], 4, "front total")
        assert_eq(bases, ["1 sample", "2 hero", "10 late", "quarterback"], "front order")
        by_base = {f["base"]: f for f in scan["fronts"]}
        assert_eq(by_base["1 sample"]["has_own_back"], True, "1 sample has back")
        assert_eq(by_base["2 hero"]["has_own_back"], True, "2 hero has back")
        assert_eq(by_base["quarterback"]["has_own_back"], False, "quarterback no back")
        assert_eq(by_base["quarterback"]["back"], None, "quarterback back None")


def t_scan_shared_back():
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "1 a.png"), "w").close()
        shared = os.path.join(d, "shared.png")
        open(shared, "w").close()
        # "shared" has no separator-back suffix so it is treated as a front too;
        # use a path outside the listing for the fallback to isolate the test.
        scan = scan_folder(d, shared_back_file="/some/shared-back.png")
        front = [f for f in scan["fronts"] if f["base"] == "1 a"][0]
        assert_eq(front["has_own_back"], False, "no own back")
        assert_eq(front["back"], "/some/shared-back.png", "uses shared back")


TESTS = [
    ("MM_PER_INCH equals 25.4", t_mm_per_inch),
    ("mm_to_px basic", t_mm_to_px),
    ("mm_to_px_round rounds half up", t_mm_to_px_round),
    ("px_to_mm is inverse of mm_to_px", t_px_to_mm_inverse),
    ("pt_to_px: 72 pt = 1 inch", t_pt_to_px),
    ("Poker 63x88 on US Letter -> 3x3=9", t_poker_letter),
    ("A4 with Tarot 70x120 -> 3x2=6", t_a4_tarot),
    ("Rotation yields more cards", t_rotation_wins),
    ("allow_rotate=False stays upright", t_no_rotate),
    ("reserve_gutter_for_marks lifts gutter to 2mm", t_reserve_gutter),
    ("Gutter spacing between adjacent slots", t_gutter_spacing),
    ("Forced grid (make_layout) fits", t_force_grid),
    ("crop-to-cards box is tight to the block", t_crop_box_tight_to_block),
    ("crop-to-cards box grows with bleed", t_crop_box_bleed_includes_bleed),
    ("crop-to-cards box expands for marks and clamps", t_crop_box_marks_expand_and_clamp),
    ("mirror_index - 3-column grid", t_mirror_index),
    ("mirror_index - 2-column grid", t_mirror_index_2col),
    ("mirror_index is its own inverse", t_mirror_index_involution),
    ("mirror_index_v - vertical mirror", t_mirror_index_v),
    ("natural_compare numeric-aware sort", t_natural_compare),
    ("scan_folder pairs fronts and backs", t_scan_folder_pairing),
    ("scan_folder uses shared back fallback", t_scan_shared_back),
]

for _name, _fn in TESTS:
    test(_name, _fn)

print("\n%d passed, %d failed" % (passed, failed))
if failed > 0:
    sys.exit(1)
