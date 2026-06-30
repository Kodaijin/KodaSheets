<img width="1496" height="408" alt="00010-2019737198" src="https://github.com/user-attachments/assets/dd60a68b-c09f-4773-8a5c-9131ba938dcc" />


A card-sheet layout script for Adobe Photoshop **and GIMP 3**. It tiles
individual card images from a folder onto print-ready sheets, pairs fronts with
backs by filename, and lays out duplex (double-sided) sheets that mirror
correctly for flip alignment.

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
- Layout presets (Auto fit, 3×3, 2×4, 2×3) at configurable margin and PPI.
- **Card spacing**: cards sit edge-to-edge with no gap by default (adjacent cards
  share a single cut line), or enter a fixed spacing in mm to keep them apart.

## Requirements

Either:

- **Adobe Photoshop** (tested all CC through Photoshop 2025). No installation
  needed — the script is plain ExtendScript (ES3) that uses the classic
  Photoshop DOM. Run `KodaSheets.jsx`.
- **GIMP 3.0 or newer** (tested on 3.2). A Python-Fu plug-in under
  `gimp/plug-ins/koda-sheets/`. See [GIMP usage](#gimp-gimp-3) below.

## Usage (Photoshop)

If you have jsx files associated with your Photoshop install you can just open the scipt file.

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

<img width="263" height="253" alt="Screenshot 2026-06-27 163330" src="https://github.com/user-attachments/assets/79b983dd-c387-46fe-9ecb-7d52be69e6ed" />

To calibrate the back offset, print `BacksideAlignmentTest.pdf` double-sided at
**100% / Actual Size** (do not "scale to fit"), flipping on the edge your printer
uses. Hold the sheet to a light and read where the back crosshair lands on the
front ruler; enter those millimetre values as **Back calibration X / Y** in the
dialog. The PDF is regenerated with `python tools/make_alignment_pdf.py`.

Keep in mind that depending on your printer it can have A LOT of variance from print to print.

## GIMP (GIMP 3)

A Python-Fu port lives in `gimp/plug-ins/koda-sheets/`. It has the same layout
engine, front/back pairing, duplex mirroring, bleed handling, and cut-mark
styles as the Photoshop script.

### Install

1. Find your GIMP plug-ins folder: **Edit → Preferences → Folders → Plug-ins**
   (typically `%APPDATA%\GIMP\<version>\plug-ins\` on Windows or
   `~/.config/GIMP/<version>/plug-ins/` on Linux/macOS, where `<version>` is
   your GIMP series, e.g. `3.0` or `3.2`). Use the path shown in Preferences —
   it's the authoritative one for your install.
2. Copy the whole `koda-sheets` folder (the one containing `koda-sheets.py` and
   the `kodasheets/` package) into that plug-ins folder. Keep the folder name
   `koda-sheets` so it matches `koda-sheets.py`.
3. On Linux/macOS, make sure `koda-sheets.py` is executable
   (`chmod +x koda-sheets.py`).
4. Restart GIMP. The command appears at **Filters → Koda Sheets…**

### Usage

1. Open or create any image first (**File → New**). GIMP only enables the
   command when a document is open — Koda Sheets still builds its own new image
   and leaves yours untouched.
2. Open **Filters → Koda Sheets…**
3. Choose your image folder and adjust the settings. Press **Scan** to preview
   how many cards/sheets you'll get before generating.
4. Press **Generate Sheets**. Every front and back sheet becomes a top-level
   layer group in one new image, over a white background, so you can toggle and
   export them individually.

Settings are remembered between runs (stored as `koda-sheets-settings.json` in
your GIMP user directory). A `koda-sheets-log.txt` is written there too if you
need to troubleshoot.

### Differences from the Photoshop version

GIMP has no Smart Objects or non-destructive adjustment layers, so the port
reproduces the intent rather than the exact mechanism:

- **Cards are always placed rasterized** (no Smart Object option).
- **Cut marks "Invert (subtle)"** are drawn as a white-filled **Difference**-mode
  layer, which inverts whatever is underneath so the marks stay visible over
  both light and dark artwork — the same look as Photoshop's masked Invert
  adjustment layer. **"Solid black lines"** works identically to Photoshop.
- The global **Vibrance / Brightness-Contrast** adjustment layers are **omitted**
  (GIMP has no pass-through adjustment that affects the layers beneath it). Add
  any global tweaks manually in GIMP after generating.

### Tests

The pure layout/scan/units logic is shared in spirit with the Photoshop engine
and has its own framework-free test:

```
python3 test/test_layout.py
```

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
KodaSheets.jsx                    The script. Run this in Photoshop.
gimp/plug-ins/koda-sheets/        GIMP 3 Python-Fu plug-in.
  koda-sheets.py                  Plug-in entry point (registers Filters > Koda Sheets…).
  kodasheets/                     units/layout/scan/presets (pure) + render/dialog/settings (GIMP).
BacksideAlignmentTest.pdf         Printable duplex offset calibration sheet.
tools/make_alignment_pdf.py       Regenerates the alignment PDF (needs reportlab).
src/engine/                       Reference layout/units math (the JSX has its own ES3 port).
test/layout.test.mjs              Layout unit tests for the JS engine (node).
test/test_layout.py               Layout/scan unit tests for the GIMP port (python3).
archive/uxp-plugin/               Earlier UXP plugin prototype (not used).
```

## License

[GNU General Public License v3.0](LICENSE)
