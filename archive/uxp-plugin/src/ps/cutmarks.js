/**
 * cutmarks.js — Cut-mark and gutter-gridline drawing for Koda Sheets.
 *
 * All require('photoshop') calls are LAZY so this file passes `node --check`
 * without a live UXP/Photoshop runtime.
 *
 * Public API
 * ──────────
 *   fillRectPx(doc, rect, color?)      – select + fill a pixel-rectangle
 *   drawCutMarks(doc, layout, style, ppi, paperWpx, paperHpx)
 *
 * Drawing technique: rectangular selection → fill with solid color.
 * This works on any normal or pixel layer and does not require vector shapes.
 */

import { mmToPxRound, ptToPx } from '../engine/units.js';

// Length of each L-mark arm for "Corner crop marks" style (mm → px at render time).
const CORNER_MARK_LEN_MM = 3;

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Select a rectangular region and fill it with a solid color on the active layer.
 *
 * Must be called from inside an `executeAsModal` context.
 *
 * @param {Document}  doc   The UXP Document (not used directly but reserved for context)
 * @param {{ top:number, left:number, bottom:number, right:number }} rect  Pixel coords
 * @param {'black'|'white'} [color='black']
 */
export async function fillRectPx(doc, rect, color = 'black') {
  const { action } = require('photoshop');
  const batchPlay = action.batchPlay;

  // NOTE [UNCERTAIN]: fillContents enum values 'black' and 'white' are documented
  // in PS batchPlay.  If 'white' fails, substitute foreground-color by setting the
  // foreground swatch to white first.
  await batchPlay([
    {
      _obj: 'set',
      _target: [{ _ref: 'channel', _property: 'selection' }],
      to: {
        _obj: 'rectangle',
        top:    { _unit: 'pixelsUnit', _value: rect.top    },
        left:   { _unit: 'pixelsUnit', _value: rect.left   },
        bottom: { _unit: 'pixelsUnit', _value: rect.bottom },
        right:  { _unit: 'pixelsUnit', _value: rect.right  },
      },
    },
    {
      _obj: 'fill',
      using:   { _enum: 'fillContents', _value: color },
      opacity: { _unit: 'percentUnit', _value: 100 },
      mode:    { _enum: 'blendMode',   _value: 'normal' },
    },
  ], {});
}

/**
 * Deselect all on the active document.
 * @private
 */
async function deselect() {
  const { action } = require('photoshop');
  const batchPlay = action.batchPlay;
  await batchPlay([{
    _obj: 'set',
    _target: [{ _ref: 'channel', _property: 'selection' }],
    to: { _enum: 'ordinal', _value: 'none' },
  }], {});
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Draw cut marks or gutter gridlines onto a dedicated "Cut Marks" pixel layer
 * on the given document.
 *
 * Must be called from inside an `executeAsModal` context.
 *
 * DESIGN DECISION: Cut marks are drawn at NOMINAL slot positions (no back-page
 * calibration offset).  The offset applies only to card image placements so the
 * cut guides stay aligned with the sheet's physical trim edge.  See generate.js.
 *
 * @param {Document} doc         UXP Document to draw on (should be the active doc)
 * @param {object}   layout      Return value of computeLayout()
 * @param {string}   style       'Corner crop marks' | 'Full gutter gridlines'
 * @param {number}   ppi         Document resolution (pixels per inch)
 * @param {number}   paperWpx    Paper width  in pixels (integer)
 * @param {number}   paperHpx    Paper height in pixels (integer)
 */
export async function drawCutMarks(doc, layout, style, ppi, paperWpx, paperHpx) {
  const { action, app } = require('photoshop');
  const batchPlay = action.batchPlay;

  // Stroke width: 0.25 pt, minimum 1 px.
  const sw = Math.max(1, Math.round(ptToPx(0.25, ppi)));

  // ── Create the "Cut Marks" pixel layer ────────────────────────────────────
  // NOTE [UNCERTAIN]: 'make layer' descriptor may require 'using: { _obj: "layer" }'
  // to create a normal (pixel) layer.  If the active layer ends up being something
  // other than a pixel layer, add 'kind: { _enum: "layerKind", _value: "pixel" }'.
  await batchPlay([{
    _obj: 'make',
    _target: [{ _ref: 'layer' }],
    using: { _obj: 'layer', name: 'Cut Marks' },
  }], {});

  if (style === 'Corner crop marks') {
    await _drawCornerMarks(doc, layout, ppi, sw);
  } else {
    // 'Full gutter gridlines'
    await _drawGutterGridlines(doc, layout, sw, paperWpx, paperHpx);
  }

  // Deselect when finished.
  await deselect();
}

// ─── Style implementations ───────────────────────────────────────────────────

/**
 * Draw L-shaped corner marks (two arms) at all four corners of every slot.
 * Each arm is a thin rectangle extending AWAY from the card into the gutter.
 * Marks do NOT overlap the card area.
 *
 * @private
 */
async function _drawCornerMarks(doc, layout, ppi, sw) {
  const markLen = mmToPxRound(CORNER_MARK_LEN_MM, ppi);
  // Half-stroke for centering the mark on the card edge.
  const hs = Math.floor(sw / 2);

  for (const s of layout.slots) {
    const cx = Math.round(s.xPx);          // card left   (px)
    const cy = Math.round(s.yPx);          // card top    (px)
    const cr = Math.round(s.xPx + s.wPx); // card right  (px)
    const cb = Math.round(s.yPx + s.hPx); // card bottom (px)

    // ── Top-Left corner ───────────────────────────────────────────────────
    // Horizontal arm: runs LEFT from card left edge along top edge
    await fillRectPx(doc, { top: cy - hs, left: cx - markLen, bottom: cy - hs + sw, right: cx });
    // Vertical arm:   runs UP from card top edge along left edge
    await fillRectPx(doc, { top: cy - markLen, left: cx - hs, bottom: cy, right: cx - hs + sw });

    // ── Top-Right corner ──────────────────────────────────────────────────
    // Horizontal arm: runs RIGHT from card right edge along top edge
    await fillRectPx(doc, { top: cy - hs, left: cr, bottom: cy - hs + sw, right: cr + markLen });
    // Vertical arm:   runs UP from card top edge along right edge
    await fillRectPx(doc, { top: cy - markLen, left: cr - hs, bottom: cy, right: cr - hs + sw });

    // ── Bottom-Left corner ────────────────────────────────────────────────
    // Horizontal arm: runs LEFT from card left edge along bottom edge
    await fillRectPx(doc, { top: cb - hs, left: cx - markLen, bottom: cb - hs + sw, right: cx });
    // Vertical arm:   runs DOWN from card bottom edge along left edge
    await fillRectPx(doc, { top: cb, left: cx - hs, bottom: cb + markLen, right: cx - hs + sw });

    // ── Bottom-Right corner ───────────────────────────────────────────────
    // Horizontal arm: runs RIGHT from card right edge along bottom edge
    await fillRectPx(doc, { top: cb - hs, left: cr, bottom: cb - hs + sw, right: cr + markLen });
    // Vertical arm:   runs DOWN from card bottom edge along right edge
    await fillRectPx(doc, { top: cb, left: cr - hs, bottom: cb + markLen, right: cr - hs + sw });
  }
}

/**
 * Draw thin vertical lines at both edges of every column gutter and thin
 * horizontal lines at both edges of every row gutter, spanning the full sheet.
 *
 * "Full gutter gridlines" gives a precise grid showing every cut boundary.
 *
 * @private
 */
async function _drawGutterGridlines(doc, layout, sw, paperWpx, paperHpx) {
  const { cols, rows, slots } = layout;

  // ── Column gutters: between column c and column c+1 ──────────────────────
  for (let c = 0; c < cols - 1; c++) {
    // Slots in the same column share the same xPx — use row 0.
    const leftCard  = slots[c];       // card at (row=0, col=c)
    const rightCard = slots[c + 1];   // card at (row=0, col=c+1)

    const gutterLeft  = Math.round(leftCard.xPx  + leftCard.wPx); // right edge of col c
    const gutterRight = Math.round(rightCard.xPx);                 // left  edge of col c+1

    // Left boundary of gutter (thin vertical strip)
    await fillRectPx(doc, {
      top: 0, left: gutterLeft, bottom: paperHpx, right: gutterLeft + sw,
    });
    // Right boundary of gutter
    await fillRectPx(doc, {
      top: 0, left: gutterRight - sw, bottom: paperHpx, right: gutterRight,
    });
  }

  // ── Row gutters: between row r and row r+1 ────────────────────────────────
  for (let r = 0; r < rows - 1; r++) {
    // Slots in the same row share the same yPx — use col 0.
    const topCard    = slots[r * cols];           // card at (row=r,   col=0)
    const bottomCard = slots[(r + 1) * cols];     // card at (row=r+1, col=0)

    const gutterTop    = Math.round(topCard.yPx    + topCard.hPx); // bottom edge of row r
    const gutterBottom = Math.round(bottomCard.yPx);               // top    edge of row r+1

    // Top boundary of gutter (thin horizontal strip)
    await fillRectPx(doc, {
      top: gutterTop, left: 0, bottom: gutterTop + sw, right: paperWpx,
    });
    // Bottom boundary of gutter
    await fillRectPx(doc, {
      top: gutterBottom - sw, left: 0, bottom: gutterBottom, right: paperWpx,
    });
  }
}
