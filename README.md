# Koda Sheets

A card-sheet imposition script for Adobe Photoshop. It tiles individual card
images from a folder onto print-ready sheets, pairs fronts with backs by
filename, and lays out duplex (double-sided) sheets that mirror correctly for
flip alignment.

Built for tabletop card printing (custom decks, prototypes, proxies) where you
want many cards laid out on a single sheet with proper margins, gutters, bleed,
and cut marks.

## Features

- **Automatic front/back pairing** by filename (case-insensitive).
- **Duplex back sheets** that mirror for either long-edge or short-edge flip.
- **Backside registration calibration**: nudge backs by an X/Y offset in mm to
  correct printer misalignment.
- **Cut marks**: corner crop marks or full gutter gridlines, rendered as the
  mask of a 30%-opacity Invert adjustment layer so they stay visible over both
  light and dark artwork.
- **Bleed support**: arranges cards at a bleed-inclusive size so images are
  never cropped, with marks drawn at the trim line.
- **Numbered test reference sheet** to dial in duplex alignment before
  committing a full run.
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

Settings are remembered between runs.

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
KodaSheets.jsx        The script. Run this in Photoshop.
src/engine/           Reference layout/units math (the JSX has its own ES3 port).
test/                 Layout unit tests.
archive/uxp-plugin/   Earlier UXP plugin prototype (not used).
```

## License

[GNU General Public License v3.0](LICENSE)
