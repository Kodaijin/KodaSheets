"""units.py - Pure unit-conversion utilities.

No GIMP dependency; safe to import and unit-test with plain python3.
Ported from src/engine/units.js and KodaSheets.jsx (lines 102-104).
"""

import math

# Millimetres per inch (exact, by SI definition).
MM_PER_INCH = 25.4


def js_round(x):
    """Round half-up, matching JavaScript Math.round (not Python banker's
    rounding). Keeps pixel geometry identical to the Photoshop script."""
    return math.floor(x + 0.5)


def mm_to_px(mm, ppi):
    """Convert millimetres to pixels at the given PPI (may be fractional)."""
    return mm / MM_PER_INCH * ppi


def mm_to_px_round(mm, ppi):
    """Convert millimetres to pixels, rounded to the nearest integer."""
    return js_round(mm_to_px(mm, ppi))


def px_to_mm(px, ppi):
    """Convert pixels to millimetres at the given PPI."""
    return px / ppi * MM_PER_INCH


def pt_to_px(pt, ppi):
    """Convert typographic points to pixels (1 pt = 1/72 inch)."""
    return pt / 72.0 * ppi
