# Changelog

All notable changes to Koda Sheets are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **GIMP 3 support**: a Python-Fu port of the whole tool under
  `gimp/plug-ins/koda-sheets/`, installable as a GIMP 3.0+ plug-in
  (**Filters → Koda Sheets…**, tested on GIMP 3.2). It shares the same layout
  engine, front/back pairing, natural sort, duplex mirroring, bleed handling,
  and cut-mark styles as the Photoshop script. Notable GIMP-specific behaviour:
  cards are always placed rasterized (no Smart Objects); the "Invert (subtle)"
  cut-mark mode is reproduced with a white-filled Difference-mode layer; and the
  global Vibrance / Brightness-Contrast adjustment layers are omitted (GIMP has
  no pass-through adjustment layers). Settings persist as JSON in the GIMP user
  directory. Pure layout/scan/units logic has its own framework-free test suite
  (`test/test_layout.py`).

- **Card spacing control**: a "Cards touching (no gap)" toggle (on by default)
  arranges cards edge-to-edge so adjacent cards share a single cut line; turn it
  off to enter a fixed spacing in mm. Cut marks no longer force a minimum gap, so
  touching cards stay truly touching even with cut marks enabled.

- All generated sheets now live in a single document, with each front/back sheet
  as its own top-level group, instead of one document per sheet.
- Vibrance and Brightness/Contrast adjustment layers, together with the cut
  marks, are grouped in their own "Cut Marks & Adjustments" folder at the very
  top of the layer stack, so the adjustments stay global across all sheets.
- Cut-mark opacity is now a dialog input (percent), replacing the fixed 30%.
- New "Corner crosses" cut-mark style (a `+` centered on each corner).
- Corner marks can be placed at the card (trim) edge or the bleed edge.
- Adjustable mark length (mm) and line weight (pt) for all cut-mark styles.
- "Solid black lines" mode as an alternative to the Invert adjustment layer.
- Optional center fold/registration ticks at the midpoint of each sheet edge.
- Optional dashed gutter gridlines.
- `BacksideAlignmentTest.pdf`, a printable duplex offset calibration sheet
  (crosshair + numbered mm ruler + instructions), with a `tools/` generator.
- `README.md` project documentation.
- `CHANGELOG.md` (this file).
- GNU GPLv3 `LICENSE`.

### Removed

- The in-script "Generate Test Sheet" button. Backside calibration is now the
  printable `BacksideAlignmentTest.pdf` instead of generated Photoshop documents.

### Changed

- Cut marks are rendered as the mask of an Invert adjustment layer (by default)
  instead of a flat black-line layer, so they stay visible over both light and
  dark artwork.
