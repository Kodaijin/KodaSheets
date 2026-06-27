# Koda Sheets

A card-sheet layout script for Adobe Photoshop. It tiles individual card
images from a folder onto print-ready sheets, pairs fronts with backs by
filename, and lays out duplex (double-sided) sheets that mirror correctly for
flip alignment.

Built for tabletop card printing (custom decks, prototypes, proxies) where you
want many cards laid out on a single sheet with proper margins, gutters, bleed,
and cut marks.

Please open issues if there are bugs or feature requests!

## Features

- **Automatic front/back pairing** by filename (case-insensitive).
- **Duplex back sheets** that mirror for either long-edge or short-edge flip.
- **Backside registration calibration**: nudge backs by an X/Y offset in mm to
  correct printer misalignment.
- **Cut marks** with several styles and controls:
  - Corner crop marks, corner crosses, or full gutter gridlines.
  - Corner marks can sit at the card (trim) edge or the bleed edge.
  - Optional center fold/registration ticks on each sheet edge.
  - Optional dashed gutter gridlines.
  - Adjustable mark length (mm) and line weight (pt).
  - Drawn as either a masked Invert adjustment layer (subtle, stays visible over
    both light and dark artwork) or solid black lines, at a configurable opacity.
- **Bleed support**: arranges cards at a bleed-inclusive size so images are
  never cropped, with marks drawn at the trim line.
- **Backside alignment test** as a ready-to-print PDF
  (`BacksideAlignmentTest.pdf`): print it double-sided at 100%, hold to a light,
  and read the back crosshair against the front mm ruler to find the X/Y offset
  to enter.
- **Single-document output**: every front and back sheet is a top-level group in
  one document, so you can toggle and print them individually.
- **Global adjustment layers**: Vibrance and Brightness/Contrast layers, grouped
  with the cut marks in a "Cut Marks & Adjustments" folder at the top of the
  stack, for quick tweaks across all sheets.
- **Multi-sheet pagination** for decks larger than one sheet.
- **Smart Object or rasterized** placement.
- Paper presets (US Letter, A4, Custom) and card presets (Poker, Bridge, Tarot,
  Standard TCG, Custom).
- Layout presets (Auto fit, 3×3, 2×4, 2×3) at configurable margin, gutter,
  and PPI.

## Requirements

- Adobe Photoshop (tested through Photoshop 2025).
- No installation needed. The script is plain ExtendScript (ES3) that uses the
  classic Photoshop DOM.

## Usage

1. In Photoshop, go to **File → Scripts → Browse…**
2. Select `KodaSheets.jsx`.
3. Choose your image folder and adjust the settings in the dialog.
4. Generate the sheets.

<img width="497" height="662" alt="Screenshot 2026-06-26 162209" src="https://github.com/user-attachments/assets/2e3e12b5-e5af-438f-aa9f-b2ec84a17f9b" />

Settings are remembered between runs.

If you push scan, it will check the folder with and how the expected input. 

<img width="339" height="217" alt="Screenshot 2026-06-26 141246" src="https://github.com/user-attachments/assets/027b3781-ead6-41ce-8a2f-74729c661052" />

Addtionally it outputs a log file incase there is a problem.


### Backside alignment (duplex)

To calibrate the back offset, print `BacksideAlignmentTest.pdf` double-sided at
**100% / Actual Size** (do not "scale to fit"), flipping on the edge your printer
uses. Hold the sheet to a light and read where the back crosshair lands on the
front ruler; enter those millimetre values as **Back calibration X / Y** in the
dialog. The PDF is regenerated with `python tools/make_alignment_pdf.py`.

## Naming convention for backs

Pairing is case-insensitive; the separator is a space, underscore, or hyphen.

| Filename            | Result                          |
| ------------------- | ------------------------------- |
| `1 sample.png`      | Front 1                         |
| `1 sample back.png` | Back of Front 1                 |
| `2 hero_back.png`   | Back of Front 2                 |
| `quarterback.png`   | Front (no separator before "back") |

A front with no matching back uses the shared back image if one is set,
otherwise a blank white back.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the history of changes.

## Project layout

```
KodaSheets.jsx              The script. Run this in Photoshop.
BacksideAlignmentTest.pdf   Printable duplex offset calibration sheet.
tools/make_alignment_pdf.py Regenerates the alignment PDF (needs reportlab).
src/engine/                 Reference layout/units math (the JSX has its own ES3 port).
test/                       Layout unit tests.
archive/uxp-plugin/         Earlier UXP plugin prototype (not used).
```

## License

[GNU General Public License v3.0](LICENSE)
