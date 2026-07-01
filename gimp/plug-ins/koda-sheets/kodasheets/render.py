"""render.py - GIMP 3.0 rendering for Koda Sheets.

Reimplements the Photoshop generation engine (KodaSheets.jsx 691-1082) against
the GIMP 3.0 GObject-Introspection API. Only this module imports Gimp; the
layout/scan/units math lives in the pure modules.

Differences from the Photoshop build (documented in the README):
  * No Smart Objects - cards are placed as plain (rasterized) layers.
  * No non-destructive adjustment layers - the "Invert (subtle)" cut-mark mode
    is reproduced with a white-filled Difference-mode layer; the global
    Vibrance / Brightness-Contrast adjustment layers are omitted.
"""

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("Gegl", "0.4")
from gi.repository import Gimp, Gegl, Gio  # noqa: E402

from .units import js_round, mm_to_px, mm_to_px_round, pt_to_px  # noqa: E402
from .layout import mirror_index, mirror_index_v  # noqa: E402
from .presets import (CUTMARK_STYLES, DUPLEX_FLIPS, compute_crop_box,  # noqa: E402
                      make_layout)


# ---------------------------------------------------------------------------
# Small logger so the caller can surface a summary / errors.
# ---------------------------------------------------------------------------

class _Log(object):
    def __init__(self):
        self.lines = []

    def __call__(self, msg):
        self.lines.append(str(msg))

    def text(self):
        return "\n".join(self.lines)


# ---------------------------------------------------------------------------
# GIMP helpers
# ---------------------------------------------------------------------------

def _new_group(image, name):
    """Create a layer group, tolerating both GIMP 3.0 GroupLayer.new signatures."""
    try:
        group = Gimp.GroupLayer.new(image, name)
    except TypeError:
        group = Gimp.GroupLayer.new(image)
        group.set_name(name)
    return group


def _color(css):
    return Gegl.Color.new(css)


def _select_rect(image, l, t, r, b, sel):
    """Add a rectangle (l,t,r,b) to the running selection; REPLACE on the first
    shape and ADD thereafter so all shapes accumulate (mirrors JSX selectRect)."""
    l = js_round(l); t = js_round(t); r = js_round(r); b = js_round(b)
    if r <= l or b <= t:
        return
    if l < 0:
        l = 0
    if t < 0:
        t = 0
    op = Gimp.ChannelOps.ADD if sel["active"] else Gimp.ChannelOps.REPLACE
    image.select_rectangle(op, l, t, r - l, b - t)
    sel["active"] = True


def _cross_at(image, x, y, sw, hs, mark_len, sel):
    _select_rect(image, x - mark_len, y - hs, x + mark_len, y - hs + sw, sel)
    _select_rect(image, x - hs, y - mark_len, x - hs + sw, y + mark_len, sel)


def _select_corner_marks(image, layout, sw, mark_len, sel, inset, cross):
    hs = sw // 2
    for s in layout["slots"]:
        cx = js_round(s["x_px"] + inset)
        cy = js_round(s["y_px"] + inset)
        cr = js_round(s["x_px"] + s["w_px"] - inset)
        cb = js_round(s["y_px"] + s["h_px"] - inset)
        if cross:
            _cross_at(image, cx, cy, sw, hs, mark_len, sel)
            _cross_at(image, cr, cy, sw, hs, mark_len, sel)
            _cross_at(image, cx, cb, sw, hs, mark_len, sel)
            _cross_at(image, cr, cb, sw, hs, mark_len, sel)
        else:
            # Top-left
            _select_rect(image, cx - mark_len, cy - hs, cx, cy - hs + sw, sel)
            _select_rect(image, cx - hs, cy - mark_len, cx - hs + sw, cy, sel)
            # Top-right
            _select_rect(image, cr, cy - hs, cr + mark_len, cy - hs + sw, sel)
            _select_rect(image, cr - hs, cy - mark_len, cr - hs + sw, cy, sel)
            # Bottom-left
            _select_rect(image, cx - mark_len, cb - hs, cx, cb - hs + sw, sel)
            _select_rect(image, cx - hs, cb, cx - hs + sw, cb + mark_len, sel)
            # Bottom-right
            _select_rect(image, cr, cb - hs, cr + mark_len, cb - hs + sw, sel)
            _select_rect(image, cr - hs, cb, cr - hs + sw, cb + mark_len, sel)


def _select_center_marks(image, sw, mark_len, w_px, h_px, sel):
    hs = sw // 2
    mx = js_round(w_px / 2)
    my = js_round(h_px / 2)
    _select_rect(image, mx - hs, 0, mx - hs + sw, mark_len, sel)
    _select_rect(image, mx - hs, h_px - mark_len, mx - hs + sw, h_px, sel)
    _select_rect(image, 0, my - hs, mark_len, my - hs + sw, sel)
    _select_rect(image, w_px - mark_len, my - hs, w_px, my - hs + sw, sel)


def _select_vline(image, x, sw, top, bottom, sel, dashed, mark_len):
    if not dashed:
        _select_rect(image, x, top, x + sw, bottom, sel)
        return
    dash = max(2, mark_len)
    gap = max(2, js_round(mark_len * 0.66))
    y = top
    while y < bottom:
        _select_rect(image, x, y, x + sw, min(bottom, y + dash), sel)
        y += dash + gap


def _select_hline(image, y, sw, left, right, sel, dashed, mark_len):
    if not dashed:
        _select_rect(image, left, y, right, y + sw, sel)
        return
    dash = max(2, mark_len)
    gap = max(2, js_round(mark_len * 0.66))
    x = left
    while x < right:
        _select_rect(image, x, y, min(right, x + dash), y + sw, sel)
        x += dash + gap


def _select_gutter_gridlines(image, layout, sw, w_px, h_px, sel, bleed_px, dashed, mark_len):
    cols, rows, slots = layout["cols"], layout["rows"], layout["slots"]
    for c in range(cols - 1):
        left_card = slots[c]
        right_card = slots[c + 1]
        gl = js_round(left_card["x_px"] + left_card["w_px"] - bleed_px)
        gr = js_round(right_card["x_px"] + bleed_px)
        _select_vline(image, gl, sw, 0, h_px, sel, dashed, mark_len)
        _select_vline(image, gr - sw, sw, 0, h_px, sel, dashed, mark_len)
    for r in range(rows - 1):
        top_card = slots[r * cols]
        bot_card = slots[(r + 1) * cols]
        gt = js_round(top_card["y_px"] + top_card["h_px"] - bleed_px)
        gb = js_round(bot_card["y_px"] + bleed_px)
        _select_hline(image, gt, sw, 0, w_px, sel, dashed, mark_len)
        _select_hline(image, gb - sw, sw, 0, w_px, sel, dashed, mark_len)


def _draw_cut_marks(image, layout, s, w_px, h_px, bleed_px, log):
    """Build the accumulated mark selection and realise it as a cut-marks layer.

    Mode 0 (Invert subtle): white fill on a Difference-mode layer, so the marks
    invert whatever is below and stay visible over light and dark art.
    Mode 1 (Solid black lines): black fill on a normal layer.
    Returns the created layer, or None if nothing was selected.
    """
    ppi = s["ppi"]
    sw = max(1, js_round(pt_to_px(s["cut_marks_weight_pt"], ppi)))
    mark_len = max(1, mm_to_px_round(s["cut_marks_len_mm"], ppi))
    style = CUTMARK_STYLES[s["cut_marks_style"]]
    inset = 0 if s["cut_marks_edge"] == 1 else bleed_px

    Gimp.Selection.none(image)
    sel = {"active": False}
    if style == "Corner crop marks":
        _select_corner_marks(image, layout, sw, mark_len, sel, inset, False)
    elif style == "Corner crosses":
        _select_corner_marks(image, layout, sw, mark_len, sel, inset, True)
    else:
        _select_gutter_gridlines(image, layout, sw, w_px, h_px, sel, bleed_px,
                                 s["cut_marks_dashed"], mark_len)
    if s["cut_marks_center"]:
        _select_center_marks(image, sw, mark_len, w_px, h_px, sel)
    if not sel["active"]:
        Gimp.Selection.none(image)
        return None

    layer = Gimp.Layer.new(image, "Cut Marks", w_px, h_px,
                           Gimp.ImageType.RGBA_IMAGE, 100.0, Gimp.LayerMode.NORMAL)
    image.insert_layer(layer, None, 0)
    layer.fill(Gimp.FillType.TRANSPARENT)

    if s["cut_marks_mode"] == 1:
        Gimp.context_set_foreground(_color("black"))
        layer.edit_fill(Gimp.FillType.FOREGROUND)
    else:
        Gimp.context_set_foreground(_color("white"))
        layer.edit_fill(Gimp.FillType.FOREGROUND)
        layer.set_mode(Gimp.LayerMode.DIFFERENCE)

    layer.set_opacity(float(max(1, min(100, s["cut_marks_opacity"]))))
    Gimp.Selection.none(image)
    return layer


def _place_card(image, group, path, slot, off_x, off_y, extra_deg, log):
    """Load an image as a layer inside `group`, match the slot orientation,
    scale uniformly to fit (no stretch), and centre it with calibration offset.
    Mirrors KodaSheets.jsx placeCard (725-763)."""
    gfile = Gio.File.new_for_path(path)
    layer = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, image, gfile)
    image.insert_layer(layer, group, 0)

    cur_w = layer.get_width()
    cur_h = layer.get_height()
    if cur_w <= 0 or cur_h <= 0:
        return layer

    target_w = js_round(slot["w_px"])
    target_h = js_round(slot["h_px"])

    # Match orientation: rotate art 90 deg if slot/image orientations differ.
    if (target_w > target_h) != (cur_w > cur_h):
        layer = layer.transform_rotate_simple(Gimp.RotationType.DEGREES90, True, 0, 0)
        cur_w, cur_h = layer.get_width(), layer.get_height()

    # Extra rotation for duplex backs (e.g. 180 deg on a short-edge flip).
    if extra_deg == 180:
        layer = layer.transform_rotate_simple(Gimp.RotationType.DEGREES180, True, 0, 0)
        cur_w, cur_h = layer.get_width(), layer.get_height()

    # Uniform scale to fit (preserve aspect ratio).
    scale = min(target_w / float(cur_w), target_h / float(cur_h))
    new_w = max(1, js_round(cur_w * scale))
    new_h = max(1, js_round(cur_h * scale))
    layer.scale(new_w, new_h, False)

    # Centre the (possibly letterboxed) art in the slot, plus calibration.
    target_cx = js_round(slot["x_px"]) + target_w / 2.0 + off_x
    target_cy = js_round(slot["y_px"]) + target_h / 2.0 + off_y
    layer.set_offsets(js_round(target_cx - new_w / 2.0),
                      js_round(target_cy - new_h / 2.0))
    return layer


def generate_sheets(s, scan, log=None):
    """Build the full multi-sheet document. Returns a dict:
    {image, sheets, per_sheet, total, layout}. Raises ValueError on bad layout."""
    if log is None:
        log = _Log()

    L = make_layout(s)
    layout = L["layout"]
    if layout["count"] == 0:
        raise ValueError("No cards fit with the current settings.")
    if not layout["fits"]:
        log("WARNING: forced layout exceeds the printable area; cards may run off the page.")

    w_px, h_px, bleed_px = L["w_px"], L["h_px"], L["bleed_px"]
    per_sheet = layout["count"]
    total = scan["total"]
    sheets = -(-total // per_sheet)  # ceil division
    off_x = js_round(mm_to_px(s["off_x"], s["ppi"]))
    off_y = js_round(mm_to_px(s["off_y"], s["ppi"]))
    short_edge = (DUPLEX_FLIPS[s["duplex_flip"]] == "Short edge (top-bottom)")
    back_deg = 180 if short_edge else 0

    log("Layout: %dx%d = %d per sheet; total cards %d; sheets %d; doc %dx%d px @ %s ppi"
        % (layout["cols"], layout["rows"], per_sheet, total, sheets, w_px, h_px, s["ppi"]))

    Gimp.context_push()
    try:
        Gimp.context_set_transform_resize(Gimp.TransformResize.ADJUST)
        Gimp.context_set_interpolation(Gimp.InterpolationType.CUBIC)

        image = Gimp.Image.new(w_px, h_px, Gimp.ImageBaseType.RGB)
        image.set_resolution(float(s["ppi"]), float(s["ppi"]))
        image.undo_disable()

        # White background so blank backs read white and fronts composite on white.
        bg = Gimp.Layer.new(image, "Background", w_px, h_px,
                            Gimp.ImageType.RGB_IMAGE, 100.0, Gimp.LayerMode.NORMAL)
        image.insert_layer(bg, None, 0)
        bg.fill(Gimp.FillType.WHITE)

        for sheet in range(sheets):
            base = sheet * per_sheet

            # ---- FRONT ----
            log("Front sheet %d/%d" % (sheet + 1, sheets))
            front_group = _new_group(image, "Front %d" % (sheet + 1))
            image.insert_layer(front_group, None, 0)
            for slot_i in range(per_sheet):
                g = base + slot_i
                if g >= total:
                    break
                _place_card(image, front_group, scan["fronts"][g]["file"],
                            layout["slots"][slot_i], 0, 0, 0, log)

            # ---- BACK ----
            if s["duplex"]:
                log("Back sheet %d/%d" % (sheet + 1, sheets))
                back_group = _new_group(image, "Back %d" % (sheet + 1))
                image.insert_layer(back_group, None, 0)
                for p in range(per_sheet):
                    front_slot = (mirror_index_v(p, layout["cols"], layout["rows"])
                                  if short_edge else mirror_index(p, layout["cols"]))
                    gf = base + front_slot
                    if gf >= total:
                        continue
                    back_file = scan["fronts"][gf]["back"]
                    if not back_file:
                        continue  # blank white back
                    _place_card(image, back_group, back_file,
                                layout["slots"][p], off_x, off_y, back_deg, log)

        # One shared set of cut marks (identical geometry for every sheet) on top.
        if s["cut_marks_on"]:
            _draw_cut_marks(image, layout, s, w_px, h_px, bleed_px, log)

        # Crop the canvas down to the card block so the sheet prints at true
        # 1:1 size instead of being shrunk to fit the printer's margin.
        if s.get("crop_to_cards", True):
            cx, cy, cw, ch = compute_crop_box(L, s)
            if cw > 0 and ch > 0 and (cw < w_px or ch < h_px):
                image.crop(cw, ch, cx, cy)
                log("Cropped canvas to card block: %dx%d px at (%d,%d)"
                    % (cw, ch, cx, cy))

        image.undo_enable()
        # Show the finished document. Display.new returns NULL with no GUI
        # (e.g. console/batch mode); the image is still built and returned.
        try:
            if Gimp.Display.new(image):
                Gimp.displays_flush()
        except Exception:
            pass
    finally:
        Gimp.context_pop()

    return {"image": image, "sheets": sheets, "per_sheet": per_sheet,
            "total": total, "layout": layout}
