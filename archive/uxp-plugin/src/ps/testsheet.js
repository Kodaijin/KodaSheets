/**
 * testsheet.js — Test reference sheet generator for Koda Sheets.
 *
 * Exports
 * ───────
 *   generateTestSheet()
 *
 * Produces the same two-document duplex structure as generateSheet() but fills
 * every slot with a high-contrast numbered placeholder (black border + large
 * bold label) instead of real card images.  The back sheet applies the
 * calibration offset to the placeholders so that when printed duplex and
 * physically flipped, "F1" aligns with "B1", "F2" with "B2", etc.  Any
 * mis-registration between a front/back pair reveals how much offset to dial in.
 *
 * All require('photoshop') calls are LAZY so this file passes `node --check`.
 *
 * ── Text layer notes ─────────────────────────────────────────────────────────
 * Text is created via batchPlay `make textLayer`.  Photoshop's internal color
 * descriptor uses 'grain' (not 'green') for the green channel.
 * NOTE [UNCERTAIN]: exact batchPlay keys for textStyleRange and paragraphStyleRange
 * may vary between PS versions — verify in the live environment.
 *
 * ── Registration marks ───────────────────────────────────────────────────────
 * Small L-marks are drawn at all four corners of the sheet (in the margin area)
 * to help align the front/back sheets under a light source when checking
 * registration visually.
 */

import { getState, resolvePaperDims, resolveCardDims } from '../state.js';
import { computeLayout } from '../engine/layout.js';
import { mmToPx, mmToPxRound, ptToPx } from '../engine/units.js';
import { fillRectPx, drawCutMarks } from './cutmarks.js';
import { log, err } from '../logger.js';

// Border width for placeholder slot frames (mm → px at render time).
const BORDER_MM = 1.5;
// Size of corner registration tick marks (mm).
const REG_MARK_MM = 8;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate front and back test-reference Photoshop documents with numbered
 * slot placeholders.
 *
 * Does NOT require any images to be assigned in the UI.
 * Leaves both documents open; does NOT auto-save.
 */
export async function generateTestSheet() {
  const { core } = require('photoshop');
  log('generateTestSheet: entry');

  const state  = getState();
  const paper  = resolvePaperDims();
  const card   = resolveCardDims();
  const { ppi, margin, gutter, cutMarks, offset } = state;
  log('generateTestSheet: paper', JSON.stringify(paper), 'card', JSON.stringify(card), 'ppi', ppi, 'margin', margin, 'gutter', gutter, 'cutMarks', JSON.stringify(cutMarks));

  const layout = computeLayout({
    paperW: paper.wMm,
    paperH: paper.hMm,
    cardW:  card.wMm,
    cardH:  card.hMm,
    margin,
    gutter,
    ppi,
    reserveGutterForMarks: cutMarks.on,
  });
  log('generateTestSheet: layout count', layout.count, 'cols', layout.cols, 'rows', layout.rows);

  if (layout.count === 0) {
    throw new Error('No cards fit with the current settings. Adjust paper size, card size, or margins.');
  }

  const Wpx = mmToPxRound(paper.wMm, ppi);
  const Hpx = mmToPxRound(paper.hMm, ppi);
  log('generateTestSheet: document size px', Wpx, 'x', Hpx);

  // ── FRONT TEST SHEET ──────────────────────────────────────────────────────
  log('generateTestSheet: entering executeAsModal (front)');
  await core.executeAsModal(async (ctx) => {
    log('front modal: creating document');
    await _createDocument('Koda Test Front', Wpx, Hpx, ppi);
    log('front modal: document created');
    await _setRulerToPixels();

    const { app } = require('photoshop');
    const frontDoc = app.activeDocument;
    log('front modal: activeDocument', frontDoc ? (frontDoc.title || frontDoc.name || 'doc') : 'null');

    // Placeholder layer
    await _makePixelLayer('Placeholders Front');
    log('front modal: pixel layer made; drawing', layout.slots.length, 'placeholders');

    for (let i = 0; i < layout.slots.length; i++) {
      ctx.reportProgress({ value: i / layout.count });
      const s = layout.slots[i];
      await _drawSlotPlaceholder(
        frontDoc, s, ppi,
        `F${i + 1}`,
        { x: 0, y: 0 },
      );
    }
    log('front modal: placeholders drawn');

    // Registration marks at sheet corners.
    await _drawRegistrationMarks(frontDoc, ppi, Wpx, Hpx, { x: 0, y: 0 });

    if (cutMarks.on) {
      await drawCutMarks(frontDoc, layout, cutMarks.style, ppi, Wpx, Hpx);
    }
    log('front modal: complete');

  }, { commandName: 'Generate Test Front Sheet' });
  log('generateTestSheet: front sheet done');

  // ── BACK TEST SHEET ───────────────────────────────────────────────────────
  await core.executeAsModal(async (ctx) => {
    await _createDocument('Koda Test Back', Wpx, Hpx, ppi);
    await _setRulerToPixels();

    const { app } = require('photoshop');
    const backDoc = app.activeDocument;

    // DESIGN DECISION: The duplex calibration offset is applied to the slot
    // placeholders on the back sheet (same as real card images in generate.js).
    // Registration marks also receive the offset on the back so that ALL back
    // content shifts together — making the offset effect obvious when printed.
    // Cut marks are NOT offset (consistent with generate.js: marks stay at
    // nominal sheet positions to remain aligned with the paper trim edge).
    const offsetPx = {
      x: mmToPx(offset.x, ppi),
      y: mmToPx(offset.y, ppi),
    };

    await _makePixelLayer('Placeholders Back');

    for (let i = 0; i < layout.slots.length; i++) {
      ctx.reportProgress({ value: i / layout.count });
      const s = layout.slots[i];
      // DUPLEX MAPPING: back[i] → slot[i], same as generate.js — no re-mirror.
      await _drawSlotPlaceholder(
        backDoc, s, ppi,
        `B${i + 1}`,
        offsetPx,
      );
    }

    await _drawRegistrationMarks(backDoc, ppi, Wpx, Hpx, offsetPx);

    if (cutMarks.on) {
      await drawCutMarks(backDoc, layout, cutMarks.style, ppi, Wpx, Hpx);
    }

  }, { commandName: 'Generate Test Back Sheet' });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Create a new RGB/8 white document via batchPlay. */
async function _createDocument(name, wPx, hPx, ppi) {
  const { action } = require('photoshop');
  const batchPlay = action.batchPlay;
  try {
    const result = await batchPlay([{
      _obj: 'make',
      _target: [{ _ref: 'document' }],
      using: {
        _obj:       'document',
        width:      { _unit: 'pixelsUnit',  _value: wPx },
        height:     { _unit: 'pixelsUnit',  _value: hPx },
        resolution: { _unit: 'densityUnit', _value: ppi },
        mode:       { _class: 'RGBColorMode' },
        fill:       { _enum: 'fill', _value: 'white' },
        name,
      },
    }], {});
    log('_createDocument ok:', name, JSON.stringify(result));
  } catch (e) {
    err('_createDocument FAILED for', name, ':', e);
    throw new Error(`Document creation failed (${name}): ${e && e.message ? e.message : e}`);
  }
}

/** Create and activate a named normal (pixel) layer. */
async function _makePixelLayer(name) {
  const { action } = require('photoshop');
  const batchPlay = action.batchPlay;
  try {
    await batchPlay([{
      _obj: 'make',
      _target: [{ _ref: 'layer' }],
      using: { _obj: 'layer', name },
    }], {});
  } catch (e) {
    err('_makePixelLayer FAILED for', name, ':', e);
    throw new Error(`Layer creation failed (${name}): ${e && e.message ? e.message : e}`);
  }
}

/** Set ruler units to pixels for reliable boundsNoEffects reads. */
async function _setRulerToPixels() {
  try {
    const { app } = require('photoshop');
    app.preferences.rulerUnits = app.Units.PIXELS;
  } catch (_) { /* ignore — see generate.js _setRulerToPixels */ }
}

/**
 * Draw a numbered placeholder in one slot.
 *
 * Renders: black outer border → white interior → centered text label.
 *
 * @param {Document} doc          Active UXP document
 * @param {object}   slot         Layout slot object
 * @param {number}   ppi
 * @param {string}   label        e.g. 'F1' or 'B3'
 * @param {{ x:number, y:number }} offsetPx  Calibration offset in pixels
 */
async function _drawSlotPlaceholder(doc, slot, ppi, label, offsetPx) {
  const ox = offsetPx ? offsetPx.x : 0;
  const oy = offsetPx ? offsetPx.y : 0;

  const x = Math.round(slot.xPx) + ox;
  const y = Math.round(slot.yPx) + oy;
  const w = Math.round(slot.wPx);
  const h = Math.round(slot.hPx);

  const borderPx = Math.max(1, mmToPxRound(BORDER_MM, ppi));

  // Outer black border: fill the full slot area black.
  await fillRectPx(doc, { top: y, left: x, bottom: y + h, right: x + w });

  // Inner white fill: inset by border width on all sides.
  await fillRectPx(doc, {
    top:    y + borderPx,
    left:   x + borderPx,
    bottom: y + h - borderPx,
    right:  x + w - borderPx,
  }, 'white');

  // Deselect before creating text layer.
  const { action } = require('photoshop');
  const batchPlay = action.batchPlay;
  await batchPlay([{
    _obj: 'set',
    _target: [{ _ref: 'channel', _property: 'selection' }],
    to: { _enum: 'ordinal', _value: 'none' },
  }], {});

  // Text label centered in the slot.
  const fontSize   = Math.round(h * 0.4);  // 40% of slot height in px
  const textCenterX = Math.round(x + w / 2);
  const textCenterY = Math.round(y + h / 2);

  await _createTextLayer(doc, label, textCenterX, textCenterY, fontSize);
}

/**
 * Create a centered point-text layer.
 *
 * NOTE [UNCERTAIN]: Photoshop's internal color descriptor uses 'grain' for
 * the green channel (not 'green').  The paragraph 'align' key is 'center' here
 * but may need to be 'alignmentType' enum depending on PS version.
 * If text does not appear, try using app.activeDocument.createTextLayer() DOM API.
 *
 * @param {Document} doc
 * @param {string}   text
 * @param {number}   cx    Horizontal center in pixels
 * @param {number}   cy    Vertical center (approximate baseline) in pixels
 * @param {number}   size  Font size in pixels
 */
async function _createTextLayer(doc, text, cx, cy, size) {
  const { action } = require('photoshop');
  const batchPlay = action.batchPlay;
  const len = text.length;

  // Prefer the DOM API when available — it is far more robust than hand-rolled
  // text batchPlay descriptors (font/color/paragraph keys vary across builds).
  try {
    if (doc && typeof doc.createTextLayer === 'function') {
      await doc.createTextLayer({
        contents: text,
        fontSize: size,
        position: { x: cx, y: cy },
        textColor: { red: 0, green: 0, blue: 0 },
      });
      return;
    }
  } catch (e) {
    err('_createTextLayer DOM API failed, falling back to batchPlay:', e);
  }

  // Fallback: batchPlay make textLayer.
  // NOTE: Photoshop's RGBColor descriptor uses 'grain' for the green channel.
  try {
    await batchPlay([{
      _obj: 'make',
      _target: [{ _ref: 'textLayer' }],
      using: {
        _obj:    'textLayer',
        textKey: text,
        position: {
          _obj:       'point',
          horizontal: { _unit: 'pixelsUnit', _value: cx },
          vertical:   { _unit: 'pixelsUnit', _value: cy },
        },
        textStyleRange: [{
          _obj:  'textStyleRange',
          from:  0,
          to:    len,
          textStyle: {
            _obj:  'textStyle',
            size:  { _unit: 'pixelsUnit', _value: size },
            color: {
              _obj:  'RGBColor',
              red:   0,
              grain: 0,   // PS uses 'grain' (not 'green') internally
              blue:  0,
            },
          },
        }],
        paragraphStyleRange: [{
          _obj:  'paragraphStyleRange',
          from:  0,
          to:    len,
          paragraphStyle: {
            _obj:  'paragraphStyle',
            align: { _enum: 'alignmentType', _value: 'center' },
          },
        }],
      },
    }], {});
  } catch (e) {
    err('_createTextLayer batchPlay FAILED:', e);
    throw new Error(`Text layer creation failed: ${e && e.message ? e.message : e}`);
  }
}

/**
 * Draw small L-shaped registration marks at all four sheet corners.
 * These help visually align front and back sheets under a light source.
 *
 * @param {Document}           doc
 * @param {number}             ppi
 * @param {number}             paperWpx
 * @param {number}             paperHpx
 * @param {{ x:number, y:number }} offsetPx  Applied to marks on back test sheet
 */
async function _drawRegistrationMarks(doc, ppi, paperWpx, paperHpx, offsetPx) {
  const ox = offsetPx ? offsetPx.x : 0;
  const oy = offsetPx ? offsetPx.y : 0;

  const len = mmToPxRound(REG_MARK_MM, ppi);
  const sw  = Math.max(1, Math.round(ptToPx(0.5, ppi)));

  // Ensure marks stay on the sheet.
  // Corner anchors — the offset shifts the entire back content so marks move too.
  // Marks are drawn INWARD from each corner to stay within the canvas bounds.
  const mX0 = Math.round(ox);
  const mY0 = Math.round(oy);
  const mX1 = Math.round(paperWpx + ox);
  const mY1 = Math.round(paperHpx + oy);

  // ── Top-Left: marks extend RIGHT (→) and DOWN (↓) ────────────────────────
  await fillRectPx(doc, { top: mY0,        left: mX0,        bottom: mY0 + sw,  right: mX0 + len }); // H→
  await fillRectPx(doc, { top: mY0,        left: mX0,        bottom: mY0 + len, right: mX0 + sw  }); // V↓

  // ── Top-Right: marks extend LEFT (←) and DOWN (↓) ─────────────────────────
  await fillRectPx(doc, { top: mY0,        left: mX1 - len,  bottom: mY0 + sw,  right: mX1       }); // H←
  await fillRectPx(doc, { top: mY0,        left: mX1 - sw,   bottom: mY0 + len, right: mX1       }); // V↓

  // ── Bottom-Left: marks extend RIGHT (→) and UP (↑) ────────────────────────
  await fillRectPx(doc, { top: mY1 - sw,   left: mX0,        bottom: mY1,       right: mX0 + len }); // H→
  await fillRectPx(doc, { top: mY1 - len,  left: mX0,        bottom: mY1,       right: mX0 + sw  }); // V↑

  // ── Bottom-Right: marks extend LEFT (←) and UP (↑) ────────────────────────
  await fillRectPx(doc, { top: mY1 - sw,   left: mX1 - len,  bottom: mY1,       right: mX1       }); // H←
  await fillRectPx(doc, { top: mY1 - len,  left: mX1 - sw,   bottom: mY1,       right: mX1       }); // V↑
}
