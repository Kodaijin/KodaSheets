"""Koda Sheets - card-sheet imposition for GIMP 3.0.

This package keeps the pure layout/scan/units logic (units, layout, scan,
presets) free of any GIMP dependency so it can be unit-tested with plain
python3. The GIMP-dependent pieces (render, dialog, settings) import the
GObject-Introspection API and are only loaded inside GIMP.
"""
