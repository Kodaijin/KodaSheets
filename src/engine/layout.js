/**
 * layout.js — Card-sheet imposition engine.
 * Pure math; no Photoshop/UXP dependencies; safe for Node unit tests.
 *
 * All config dimensions are in millimetres; pixel values in returned slots
 * are computed via units.js at the caller-supplied PPI.
 */

import { mmToPx } from './units.js';

/**
 * Minimum effective gutter (mm) applied when reserveGutterForMarks is true
 * and the caller passed gutter = 0.  Corner cut marks need at least this much
 * inter-card space to be visible.
 */
const MIN_GUTTER_FOR_MARKS_MM = 2;

/**
 * How many cards fit along one axis given the available span, card size, and
 * gutter between cards.
 *
 * n cards consume: n * cardDim + (n-1) * gutter
 *   ⟺  n ≤ (available + gutter) / (cardDim + gutter)
 *
 * @param {number} available  usable span in mm
 * @param {number} cardDim    card dimension along this axis (mm)
 * @param {number} gutter     space between cards (mm)
 * @returns {number}  ≥ 0
 */
function fitCount(available, cardDim, gutter) {
  if (cardDim <= 0) return 0;
  const g = gutter > 0 ? gutter : 0;
  return Math.max(0, Math.floor((available + g) / (cardDim + g)));
}

/**
 * Compute slot layout for a single card orientation.
 *
 * @param {number} usableW
 * @param {number} usableH
 * @param {number} cardW
 * @param {number} cardH
 * @param {number} gutter
 * @returns {{ cols: number, rows: number, count: number }}
 */
function evalOrientation(usableW, usableH, cardW, cardH, gutter) {
  const cols = fitCount(usableW, cardW, gutter);
  const rows = fitCount(usableH, cardH, gutter);
  return { cols, rows, count: cols * rows };
}

/**
 * Compute the full card-sheet imposition layout.
 *
 * @param {object} config
 * @param {number} config.paperW            Paper width  (mm)
 * @param {number} config.paperH            Paper height (mm)
 * @param {number} config.cardW             Card width   (mm)
 * @param {number} config.cardH             Card height  (mm)
 * @param {number} config.margin            Margin on every side (mm)
 * @param {number} config.gutter            Space between cards  (mm)
 * @param {number} config.ppi               Target resolution (pixels per inch)
 * @param {boolean} [config.allowRotate=true]
 *   When true, both upright and 90°-rotated orientations are evaluated and
 *   the one yielding more cards is chosen.  Ties favour upright.
 * @param {boolean} [config.reserveGutterForMarks=false]
 *   When true and gutter === 0, the effective gutter is raised to
 *   MIN_GUTTER_FOR_MARKS_MM (2 mm) so corner cut-mark artwork has room.
 *   Has no effect when gutter > 0.
 *
 * @returns {{
 *   cols: number,
 *   rows: number,
 *   count: number,
 *   rotated: boolean,
 *   cardWmm: number,
 *   cardHmm: number,
 *   slots: Array<{
 *     index: number, row: number, col: number,
 *     xMm: number,  yMm: number,  wMm: number,  hMm: number,
 *     xPx: number,  yPx: number,  wPx: number,  hPx: number
 *   }>
 * }}
 */
export function computeLayout(config) {
  const {
    paperW,
    paperH,
    cardW,
    cardH,
    margin,
    gutter,
    ppi,
    allowRotate = true,
    reserveGutterForMarks = false,
  } = config;

  // Effective gutter: bump to minimum when cut marks need breathing room.
  const effectiveGutter =
    reserveGutterForMarks && gutter === 0 ? MIN_GUTTER_FOR_MARKS_MM : gutter;

  // Usable rectangle (paper minus uniform margin).
  const usableW = paperW - 2 * margin;
  const usableH = paperH - 2 * margin;

  // Evaluate upright orientation (cardW along X, cardH along Y).
  const uprightResult = evalOrientation(usableW, usableH, cardW, cardH, effectiveGutter);

  // Decide orientation.
  let chosen = uprightResult;
  let rotated = false;

  if (allowRotate) {
    // Rotated: card is turned 90°, so cardH runs along X, cardW along Y.
    const rotResult = evalOrientation(usableW, usableH, cardH, cardW, effectiveGutter);
    if (rotResult.count > uprightResult.count) {
      chosen = rotResult;
      rotated = true;
    }
    // Tie → prefer upright (rotated stays false).
  }

  const { cols, rows } = chosen;

  // Effective card dimensions after orientation choice.
  const cardWmm = rotated ? cardH : cardW;
  const cardHmm = rotated ? cardW : cardH;

  // Centre the card block inside the usable area, then offset by margin to
  // get coordinates relative to the paper origin (top-left = 0,0).
  const blockW = cols * cardWmm + (cols > 0 ? cols - 1 : 0) * effectiveGutter;
  const blockH = rows * cardHmm + (rows > 0 ? rows - 1 : 0) * effectiveGutter;
  const startX = margin + (usableW - blockW) / 2;
  const startY = margin + (usableH - blockH) / 2;

  // Build slot list in row-major order (row × cols + col).
  const slots = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const xMm = startX + col * (cardWmm + effectiveGutter);
      const yMm = startY + row * (cardHmm + effectiveGutter);
      slots.push({
        index: row * cols + col,
        row,
        col,
        xMm,
        yMm,
        wMm: cardWmm,
        hMm: cardHmm,
        // Pixel values are kept fractional to preserve accuracy; callers that
        // need integer px should Math.round() at render time.
        xPx: mmToPx(xMm, ppi),
        yPx: mmToPx(yMm, ppi),
        wPx: mmToPx(cardWmm, ppi),
        hPx: mmToPx(cardHmm, ppi),
      });
    }
  }

  return { cols, rows, count: cols * rows, rotated, cardWmm, cardHmm, slots };
}

/**
 * Return the index of the horizontally-mirrored slot in the same row.
 *
 * For a grid of `cols` columns, the slot at (row, col) mirrors to
 * (row, cols-1-col).  Used for duplex backside alignment when printing
 * double-sided sheets with a flip on the left/right (long) edge.
 *
 * @param {number} index  0-based row-major slot index
 * @param {number} cols   number of columns in the grid
 * @returns {number}      0-based index of the mirrored slot
 */
export function mirrorIndex(index, cols) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const mirroredCol = cols - 1 - col;
  return row * cols + mirroredCol;
}
