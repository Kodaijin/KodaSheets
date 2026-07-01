"""dialog.py - GTK3 settings dialog for the Koda Sheets GIMP plug-in.

Mirrors the Photoshop ScriptUI dialog (KodaSheets.jsx 420-685): source/shared-
back pickers, paper/card presets with custom sizes, PPI/margin, card spacing,
bleed, layout style, the full cut-marks panel, duplex + flip axis, and back
calibration. Includes the Scan button and the dynamic enable/disable logic.

The Photoshop "Placement: Smart Object / Rasterized" control is intentionally
absent: GIMP has no Smart Objects, so placement is always rasterized.
"""

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk  # noqa: E402

from .presets import (PAPER_PRESETS, CARD_PRESETS, CUTMARK_STYLES,
                      CUTMARK_EDGES, CUTMARK_MODES, DUPLEX_FLIPS, LAYOUT_STYLES,
                      resolve_paper_dims, resolve_card_dims, make_layout)
from .scan import scan_folder, scan_summary

RESPONSE_SCAN = 100
RESPONSE_GENERATE = 200


def _num(text, fallback):
    try:
        return float(text)
    except (TypeError, ValueError):
        return fallback


def _message(parent, text, kind=Gtk.MessageType.INFO):
    md = Gtk.MessageDialog(transient_for=parent, modal=True,
                           message_type=kind, buttons=Gtk.ButtonsType.OK,
                           text=text)
    md.run()
    md.destroy()


def _hbox():
    b = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
    return b


def _label(text):
    lbl = Gtk.Label(label=text)
    lbl.set_xalign(0.0)
    return lbl


def _entry(value, width=6):
    e = Gtk.Entry()
    e.set_text(str(value))
    e.set_width_chars(width)
    return e


def _combo(items, active):
    c = Gtk.ComboBoxText()
    for it in items:
        c.append_text(it)
    c.set_active(active)
    return c


def show_dialog(s):
    """Show the modal dialog. Returns (action, settings) where action is
    "generate" or None (cancelled)."""
    result = {"action": None, "settings": s}

    dlg = Gtk.Dialog(title="Koda Sheets — Imposition")
    dlg.set_default_size(460, -1)
    content = dlg.get_content_area()
    content.set_spacing(8)
    content.set_border_width(10)

    # --- Source folder ---
    src_frame = Gtk.Frame(label="Source folder")
    src_box = _hbox()
    src_box.set_border_width(8)
    folder_btn = Gtk.FileChooserButton(title="Choose the folder of card images",
                                       action=Gtk.FileChooserAction.SELECT_FOLDER)
    if s["folder"]:
        folder_btn.set_filename(s["folder"])
    src_box.pack_start(folder_btn, True, True, 0)
    src_frame.add(src_box)
    content.add(src_frame)

    # --- Sheet & card ---
    sc_frame = Gtk.Frame(label="Sheet & card")
    sc_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
    sc_box.set_border_width(8)
    sc_frame.add(sc_box)
    content.add(sc_frame)

    r1 = _hbox()
    r1.pack_start(_label("Paper:"), False, False, 0)
    paper_dd = _combo([p[0] for p in PAPER_PRESETS], s["paper_preset"])
    r1.pack_start(paper_dd, False, False, 0)
    paper_w = _entry(s["paper_w"], 5)
    paper_h = _entry(s["paper_h"], 5)
    r1.pack_start(paper_w, False, False, 0)
    r1.pack_start(_label("x"), False, False, 0)
    r1.pack_start(paper_h, False, False, 0)
    r1.pack_start(_label("mm"), False, False, 0)
    sc_box.add(r1)

    r2 = _hbox()
    r2.pack_start(_label("Card:"), False, False, 0)
    card_dd = _combo([c[0] for c in CARD_PRESETS], s["card_preset"])
    r2.pack_start(card_dd, False, False, 0)
    card_w = _entry(s["card_w"], 5)
    card_h = _entry(s["card_h"], 5)
    r2.pack_start(card_w, False, False, 0)
    r2.pack_start(_label("x"), False, False, 0)
    r2.pack_start(card_h, False, False, 0)
    r2.pack_start(_label("mm"), False, False, 0)
    sc_box.add(r2)

    r3 = _hbox()
    r3.pack_start(_label("PPI:"), False, False, 0)
    ppi_e = _entry(s["ppi"], 6)
    r3.pack_start(ppi_e, False, False, 0)
    r3.pack_start(_label("Margin:"), False, False, 0)
    margin_e = _entry(s["margin"], 4)
    r3.pack_start(margin_e, False, False, 0)
    r3.pack_start(_label("mm"), False, False, 0)
    sc_box.add(r3)

    r3b = _hbox()
    touch_chk = Gtk.CheckButton(label="Cards touching (no gap)")
    touch_chk.set_active(s["cards_touching"])
    r3b.pack_start(touch_chk, False, False, 0)
    r3b.pack_start(_label("Spacing:"), False, False, 0)
    gutter_e = _entry(s["gutter"], 4)
    r3b.pack_start(gutter_e, False, False, 0)
    r3b.pack_start(_label("mm"), False, False, 0)
    sc_box.add(r3b)

    r4 = _hbox()
    bleed_chk = Gtk.CheckButton(label="Images include bleed:")
    bleed_chk.set_active(s["bleed_on"])
    r4.pack_start(bleed_chk, False, False, 0)
    bleed_e = _entry(s["bleed_mm"], 5)
    r4.pack_start(bleed_e, False, False, 0)
    r4.pack_start(_label("mm per edge (1/8\" = 3.175)"), False, False, 0)
    sc_box.add(r4)

    # --- Output ---
    out_frame = Gtk.Frame(label="Output")
    out_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
    out_box.set_border_width(8)
    out_frame.add(out_box)
    content.add(out_frame)

    o0 = _hbox()
    o0.pack_start(_label("Layout:"), False, False, 0)
    layout_dd = _combo([l[0] for l in LAYOUT_STYLES], s["layout_style"])
    o0.pack_start(layout_dd, False, False, 0)
    out_box.add(o0)

    o0b = _hbox()
    crop_chk = Gtk.CheckButton(label="Crop canvas to cards (print true size)")
    crop_chk.set_active(s["crop_to_cards"])
    crop_chk.set_tooltip_text(
        "Trim the empty paper margin so printers reproduce the cards at true "
        "1:1 size instead of shrinking the whole sheet to fit. Page-edge "
        "center marks and full-canvas gridlines are trimmed when this is on.")
    o0b.pack_start(crop_chk, False, False, 0)
    out_box.add(o0b)

    o2 = _hbox()
    cut_chk = Gtk.CheckButton(label="Cut marks:")
    cut_chk.set_active(s["cut_marks_on"])
    o2.pack_start(cut_chk, False, False, 0)
    cut_dd = _combo(CUTMARK_STYLES, s["cut_marks_style"])
    o2.pack_start(cut_dd, False, False, 0)
    o2.pack_start(_label("Edge:"), False, False, 0)
    edge_dd = _combo(CUTMARK_EDGES, s["cut_marks_edge"])
    o2.pack_start(edge_dd, False, False, 0)
    out_box.add(o2)

    o2b = _hbox()
    o2b.pack_start(_label("Mode:"), False, False, 0)
    mode_dd = _combo(CUTMARK_MODES, s["cut_marks_mode"])
    o2b.pack_start(mode_dd, False, False, 0)
    o2b.pack_start(_label("Opacity:"), False, False, 0)
    opac_e = _entry(s["cut_marks_opacity"], 4)
    o2b.pack_start(opac_e, False, False, 0)
    o2b.pack_start(_label("%"), False, False, 0)
    out_box.add(o2b)

    o2c = _hbox()
    o2c.pack_start(_label("Mark length:"), False, False, 0)
    mlen_e = _entry(s["cut_marks_len_mm"], 4)
    o2c.pack_start(mlen_e, False, False, 0)
    o2c.pack_start(_label("mm  Line weight:"), False, False, 0)
    mwt_e = _entry(s["cut_marks_weight_pt"], 4)
    o2c.pack_start(mwt_e, False, False, 0)
    o2c.pack_start(_label("pt"), False, False, 0)
    out_box.add(o2c)

    o2d = _hbox()
    center_chk = Gtk.CheckButton(label="Center fold/registration marks")
    center_chk.set_active(s["cut_marks_center"])
    o2d.pack_start(center_chk, False, False, 0)
    dashed_chk = Gtk.CheckButton(label="Dashed gutter lines")
    dashed_chk.set_active(s["cut_marks_dashed"])
    o2d.pack_start(dashed_chk, False, False, 0)
    out_box.add(o2d)

    od = _hbox()
    dup_chk = Gtk.CheckButton(label="Duplex back sheet(s). Flip on:")
    dup_chk.set_active(s["duplex"])
    od.pack_start(dup_chk, False, False, 0)
    flip_dd = _combo(DUPLEX_FLIPS, s["duplex_flip"])
    od.pack_start(flip_dd, False, False, 0)
    out_box.add(od)

    o3 = _hbox()
    o3.pack_start(_label("Shared back (fallback):"), False, False, 0)
    back_btn = Gtk.FileChooserButton(title="Choose a shared back image",
                                     action=Gtk.FileChooserAction.OPEN)
    img_filter = Gtk.FileFilter()
    img_filter.set_name("Images")
    for pat in ("*.png", "*.jpg", "*.jpeg", "*.PNG", "*.JPG", "*.JPEG"):
        img_filter.add_pattern(pat)
    back_btn.add_filter(img_filter)
    if s["shared_back"]:
        back_btn.set_filename(s["shared_back"])
    o3.pack_start(back_btn, True, True, 0)
    back_clr = Gtk.Button(label="Clear")
    o3.pack_start(back_clr, False, False, 0)
    back_clr.connect("clicked", lambda _b: back_btn.unselect_all())
    out_box.add(o3)

    o4 = _hbox()
    o4.pack_start(_label("Back calibration  X:"), False, False, 0)
    offx_e = _entry(s["off_x"], 5)
    o4.pack_start(offx_e, False, False, 0)
    o4.pack_start(_label("mm  Y:"), False, False, 0)
    offy_e = _entry(s["off_y"], 5)
    o4.pack_start(offy_e, False, False, 0)
    o4.pack_start(_label("mm"), False, False, 0)
    out_box.add(o4)

    # --- Dynamic enable/disable (mirrors syncCustom / syncCut) ---
    def sync_custom(*_a):
        paper_custom = PAPER_PRESETS[paper_dd.get_active()][0] == "Custom"
        paper_w.set_sensitive(paper_custom)
        paper_h.set_sensitive(paper_custom)
        card_custom = CARD_PRESETS[card_dd.get_active()][0] == "Custom"
        card_w.set_sensitive(card_custom)
        card_h.set_sensitive(card_custom)

    def sync_spacing(*_a):
        gutter_e.set_sensitive(not touch_chk.get_active())

    def sync_bleed(*_a):
        bleed_e.set_sensitive(bleed_chk.get_active())

    def sync_cut(*_a):
        on = cut_chk.get_active()
        is_gutter = CUTMARK_STYLES[cut_dd.get_active()] == "Full gutter gridlines"
        cut_dd.set_sensitive(on)
        edge_dd.set_sensitive(on and not is_gutter)
        mode_dd.set_sensitive(on)
        opac_e.set_sensitive(on)
        mlen_e.set_sensitive(on)
        mwt_e.set_sensitive(on)
        center_chk.set_sensitive(on)
        dashed_chk.set_sensitive(on and is_gutter)

    def sync_duplex(*_a):
        flip_dd.set_sensitive(dup_chk.get_active())

    paper_dd.connect("changed", sync_custom)
    card_dd.connect("changed", sync_custom)
    touch_chk.connect("toggled", sync_spacing)
    bleed_chk.connect("toggled", sync_bleed)
    cut_chk.connect("toggled", sync_cut)
    cut_dd.connect("changed", sync_cut)
    dup_chk.connect("toggled", sync_duplex)
    sync_custom(); sync_spacing(); sync_bleed(); sync_cut(); sync_duplex()

    # --- Buttons ---
    dlg.add_button("Scan", RESPONSE_SCAN)
    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    gen_btn = dlg.add_button("Generate Sheets", RESPONSE_GENERATE)
    gen_btn.get_style_context().add_class("suggested-action")
    dlg.set_default_response(RESPONSE_GENERATE)

    def collect():
        return {
            "folder": folder_btn.get_filename() or "",
            "shared_back": back_btn.get_filename() or "",
            "paper_preset": paper_dd.get_active(),
            "paper_w": _num(paper_w.get_text(), s["paper_w"]),
            "paper_h": _num(paper_h.get_text(), s["paper_h"]),
            "card_preset": card_dd.get_active(),
            "card_w": _num(card_w.get_text(), s["card_w"]),
            "card_h": _num(card_h.get_text(), s["card_h"]),
            "ppi": _num(ppi_e.get_text(), s["ppi"]),
            "margin": _num(margin_e.get_text(), s["margin"]),
            "cards_touching": touch_chk.get_active(),
            "gutter": _num(gutter_e.get_text(), s["gutter"]),
            "cut_marks_on": cut_chk.get_active(),
            "cut_marks_style": cut_dd.get_active(),
            "cut_marks_opacity": max(1, min(100, _num(opac_e.get_text(), s["cut_marks_opacity"]))),
            "cut_marks_edge": edge_dd.get_active(),
            "cut_marks_mode": mode_dd.get_active(),
            "cut_marks_len_mm": _num(mlen_e.get_text(), s["cut_marks_len_mm"]),
            "cut_marks_weight_pt": _num(mwt_e.get_text(), s["cut_marks_weight_pt"]),
            "cut_marks_center": center_chk.get_active(),
            "cut_marks_dashed": dashed_chk.get_active(),
            "duplex": dup_chk.get_active(),
            "duplex_flip": flip_dd.get_active(),
            "off_x": _num(offx_e.get_text(), s["off_x"]),
            "off_y": _num(offy_e.get_text(), s["off_y"]),
            "bleed_on": bleed_chk.get_active(),
            "bleed_mm": _num(bleed_e.get_text(), s["bleed_mm"]),
            "layout_style": layout_dd.get_active(),
            "crop_to_cards": crop_chk.get_active(),
        }

    def validate(ns):
        if not ns["folder"]:
            _message(dlg, "Please choose a source folder.", Gtk.MessageType.WARNING)
            return False
        pd = resolve_paper_dims(ns)
        cd = resolve_card_dims(ns)
        if pd["w_mm"] <= 0 or pd["h_mm"] <= 0:
            _message(dlg, "Paper size must be greater than 0.", Gtk.MessageType.WARNING)
            return False
        if cd["w_mm"] <= 0 or cd["h_mm"] <= 0:
            _message(dlg, "Card size must be greater than 0.", Gtk.MessageType.WARNING)
            return False
        if ns["ppi"] <= 0:
            _message(dlg, "PPI must be greater than 0.", Gtk.MessageType.WARNING)
            return False
        if ns["margin"] < 0:
            _message(dlg, "Margin cannot be negative.", Gtk.MessageType.WARNING)
            return False
        if not ns["cards_touching"] and ns["gutter"] < 0:
            _message(dlg, "Card spacing cannot be negative.", Gtk.MessageType.WARNING)
            return False
        if ns["bleed_on"] and ns["bleed_mm"] < 0:
            _message(dlg, "Bleed cannot be negative.", Gtk.MessageType.WARNING)
            return False
        return True

    def do_scan():
        ns = collect()
        if not ns["folder"]:
            _message(dlg, "Please choose a source folder first.", Gtk.MessageType.WARNING)
            return
        shared = ns["shared_back"] or None
        scan = scan_folder(ns["folder"], shared)
        if scan["total"] == 0:
            _message(dlg, "No front images (.png/.jpg/.jpeg) found in that folder.",
                     Gtk.MessageType.WARNING)
            return
        layout = make_layout(ns)["layout"]
        per_sheet = layout["count"]
        sheets = -(-scan["total"] // per_sheet) if per_sheet > 0 else 0
        msg = (scan_summary(scan, shared) + "\n\n"
               + "Cards per sheet: %d (%d x %d)%s\n"
               % (per_sheet, layout["cols"], layout["rows"],
                  ", cards rotated" if layout["rotated"] else "")
               + "Sheets needed: %d" % sheets)
        if not layout["fits"]:
            msg += ("\n\nWARNING: the chosen layout (%s) does not fit on this paper "
                    "at this card/bleed/margin size. Cards may run off the page. "
                    "Try Auto, a smaller grid, or smaller margins."
                    % LAYOUT_STYLES[ns["layout_style"]][0])
        _message(dlg, msg)

    dlg.show_all()
    try:
        while True:
            resp = dlg.run()
            if resp == RESPONSE_SCAN:
                do_scan()
                continue
            if resp == RESPONSE_GENERATE:
                ns = collect()
                if not validate(ns):
                    continue
                result["action"] = "generate"
                result["settings"] = ns
                break
            # Cancel, window close, or Escape.
            result["action"] = None
            break
    finally:
        dlg.destroy()

    return result["action"], result["settings"]
