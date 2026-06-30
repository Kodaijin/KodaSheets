"""layout.py - Card-sheet imposition engine.

Pure math; no GIMP dependency; safe for plain-python3 unit tests.
Ported from KodaSheets.jsx lines 107-190 (which themselves port src/engine).

All config dimensions are in millimetres; pixel values in returned slots are
computed via units.py at the caller-supplied PPI.
"""

import math

from .units import mm_to_px


def fit_count(available, card_dim, gutter):
    """How many cards fit along one axis: n*card_dim + (n-1)*gutter <= available."""
    if card_dim <= 0:
        return 0
    g = gutter if gutter > 0 else 0
    n = math.floor((available + g) / (card_dim + g))
    return n if n > 0 else 0


def block_dim(n, dim, gutter):
    """Total span of n cards plus the (n-1) gutters between them."""
    return n * dim + (n - 1 if n > 0 else 0) * gutter


def block_fits(cols, rows, cw, ch, gutter, usable_w, usable_h):
    return (block_dim(cols, cw, gutter) <= usable_w
            and block_dim(rows, ch, gutter) <= usable_h)


def compute_layout(config):
    """Compute the full card-sheet imposition layout.

    config keys: paper_w, paper_h, card_w, card_h, margin, gutter, ppi,
    allow_rotate (default True), reserve_gutter_for_marks (default False),
    force_cols, force_rows (>0 pins the grid; orientation auto-chosen to fit).

    Returns a dict: cols, rows, count, rotated, fits, card_w_mm, card_h_mm,
    slots[]. Each slot: index, row, col, x_mm, y_mm, w_mm, h_mm, x_px, y_px,
    w_px, h_px.
    """
    allow_rotate = config.get("allow_rotate", True)
    reserve = bool(config.get("reserve_gutter_for_marks", False))
    gutter = config["gutter"]
    if reserve and gutter == 0:
        gutter = 2

    paper_w = config["paper_w"]
    paper_h = config["paper_h"]
    card_w = config["card_w"]
    card_h = config["card_h"]
    margin = config["margin"]
    ppi = config["ppi"]
    force_cols = config.get("force_cols", 0)
    force_rows = config.get("force_rows", 0)

    usable_w = paper_w - 2 * margin
    usable_h = paper_h - 2 * margin

    rotated = False
    fits = True

    if force_cols > 0 and force_rows > 0:
        cols = force_cols
        rows = force_rows
        fits_normal = block_fits(cols, rows, card_w, card_h, gutter, usable_w, usable_h)
        fits_rot = allow_rotate and block_fits(
            cols, rows, card_h, card_w, gutter, usable_w, usable_h)
        if not fits_normal and fits_rot:
            rotated = True
            fits = True
        else:
            fits = fits_normal
    else:
        up_cols = fit_count(usable_w, card_w, gutter)
        up_rows = fit_count(usable_h, card_h, gutter)
        up_count = up_cols * up_rows
        cols, rows = up_cols, up_rows
        if allow_rotate:
            r_cols = fit_count(usable_w, card_h, gutter)
            r_rows = fit_count(usable_h, card_w, gutter)
            if r_cols * r_rows > up_count:
                cols, rows, rotated = r_cols, r_rows, True

    card_w_mm = card_h if rotated else card_w
    card_h_mm = card_w if rotated else card_h

    block_w = cols * card_w_mm + (cols - 1 if cols > 0 else 0) * gutter
    block_h = rows * card_h_mm + (rows - 1 if rows > 0 else 0) * gutter
    start_x = margin + (usable_w - block_w) / 2.0
    start_y = margin + (usable_h - block_h) / 2.0

    slots = []
    for row in range(rows):
        for col in range(cols):
            x_mm = start_x + col * (card_w_mm + gutter)
            y_mm = start_y + row * (card_h_mm + gutter)
            slots.append({
                "index": row * cols + col, "row": row, "col": col,
                "x_mm": x_mm, "y_mm": y_mm, "w_mm": card_w_mm, "h_mm": card_h_mm,
                "x_px": mm_to_px(x_mm, ppi), "y_px": mm_to_px(y_mm, ppi),
                "w_px": mm_to_px(card_w_mm, ppi), "h_px": mm_to_px(card_h_mm, ppi),
            })

    return {
        "cols": cols, "rows": rows, "count": cols * rows, "rotated": rotated,
        "fits": fits, "card_w_mm": card_w_mm, "card_h_mm": card_h_mm,
        "slots": slots,
    }


def mirror_index(index, cols):
    """Same-row horizontal mirror - duplex back for a LONG-edge (left-right) flip."""
    row = index // cols
    col = index % cols
    return row * cols + (cols - 1 - col)


def mirror_index_v(index, cols, rows):
    """Same-column vertical mirror - duplex back for a SHORT-edge (top-bottom) flip."""
    row = index // cols
    col = index % cols
    return (rows - 1 - row) * cols + col
