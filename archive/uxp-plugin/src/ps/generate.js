/**
 * generate.js — Main sheet-generation engine for Koda Sheets.
 *
 * Exports
 * ───────
 *   generateSheet()   — Generates one front + one back Photoshop document from
 *                       the images assigned in the UI grid.
 *
 * All require('photoshop') calls are LAZY so this file passes `node --check`
 * without a live UXP runtime.
 *
 * ── Duplex mapping (no re-mirroring) ───────────────────────────────────────
 *   state.slots.back[i] is ALREADY stored at the mirrored index by the UI (dnd.js).
 *   Placing back[i] at layout slot[i] on the back document is all that is needed —
 *   the paper flip handles alignment automatically.  DO NOT call mirrorIndex here.
 *
 * ── Back-page calibration offset ───────────────────────────────────────────
 *   The offset (state.offset.x/y in mm) is converted to pixels and passed to
 *   placeImageInSlot as offsetPx so every card image on the back sheet shifts
 *   together.  Cut marks are NOT offset — they stay at nominal sheet positions
 *   so they remain aligned with the paper's physical edge.
 *
 * ── Document creation ──────────────────────────────────────────────────────
 *   Documents are created via batchPlay `make document` with explicit pixelsUnit
 *   dimensions for determinism.  After creation the active document is the new one.
 *   Ruler units are set to pixels immediately so boundsNoEffects reads are reliable.
 */

import { getState, resolvePaperDims, resolveCardDims } from '../state.js';
import { computeLayout } from '../engine/layout.js';
import { mmToPx, mmToPxRound } from '../engine/units.js';
import { placeImageInSlot } from './place.js';
import { drawCutMarks } from './cutmarks.js';
import { log, err } from '../logger.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate the front and (if back images are assigned) back Photoshop documents.
 *
 * Creates two new documents and leaves them open for the user to review/print.
 * Does NOT auto-save or auto-print.
 *
 * Called from main.js via the "Generate Sheet" button click handler.
 */
export async function generateSheet() {
  const { core } = require('photoshop');
  log('generateSheet: entry');

  const state    = getState();
  const paper    = resolvePaperDims();
  const card     = resolveCardDims();
  const { ppi, margin, gutter, cutMarks, placement, backside, offset, slots } = state;

  // ── Guard: abort if no images are assigned at all ────────────────────────
  const hasFront = slots.front.some(s => s != null);
  const hasBack  = backside.mode === 'Identical Back'
    ? slots.back[0] != null
    : slots.back.some(s => s != null);

  if (!hasFront && !hasBack) {
    throw new Error('No images assigned. Click a slot in the grid to add a card image before generating.');
  }

  // ── Shared layout ─────────────────────────────────────────────────────────
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

  if (layout.count === 0) {
    throw new Error('No cards fit with the current settings. Adjust paper size, card size, or margins.');
  }

  const Wpx          = mmToPxRound(paper.wMm, ppi);
  const Hpx          = mmToPxRound(paper.hMm, ppi);
  const asSmartObject = placement === 'Smart Object';

  // ── FRONT SHEET ───────────────────────────────────────────────────────────
  if (hasFront) {
    await core.executeAsModal(async (ctx) => {
      await _createDocument('Koda Front', Wpx, Hpx, ppi);

      const { app } = require('photoshop');
      const frontDoc = app.activeDocument;

      // Ensure bounds reads are in pixels (ruler units → pixels).
      await _setRulerToPixels();

      const cardLayers = [];
      const total = layout.slots.filter((_, i) => slots.front[i] != null).length;
      let placed = 0;

      for (let i = 0; i < layout.slots.length; i++) {
        const handle = slots.front[i];
        if (!handle) continue;

        const s = layout.slots[i];
        const slotRect = {
          x: Math.round(s.xPx),
          y: Math.round(s.yPx),
          w: Math.round(s.wPx),
          h: Math.round(s.hPx),
        };

        ctx.reportProgress({ value: placed / Math.max(total, 1) });

        const layer = await placeImageInSlot(handle.file, slotRect, {
          asSmartObject,
          offsetPx: { x: 0, y: 0 },
        });
        cardLayers.push(layer);
        placed++;
      }

      // Group all placed card layers into a "Front" group via the DOM API.
      if (cardLayers.length > 0) {
        await _groupLayers(frontDoc, cardLayers, 'Front');
      }

      // Cut marks sit at nominal slot positions — no offset on the front.
      if (cutMarks.on) {
        await drawCutMarks(frontDoc, layout, cutMarks.style, ppi, Wpx, Hpx);
      }

    }, { commandName: 'Generate Front Sheet' });
  }

  // ── BACK SHEET ────────────────────────────────────────────────────────────
  if (hasBack) {
    await core.executeAsModal(async (ctx) => {
      await _createDocument('Koda Back', Wpx, Hpx, ppi);

      const { app } = require('photoshop');
      const backDoc = app.activeDocument;

      await _setRulerToPixels();

      // DESIGN DECISION: The calibration offset shifts card images ONLY.
      // Cut marks are drawn at nominal positions so they align with the paper
      // edge / trim guides regardless of the duplex registration offset.
      const offsetPx = {
        x: mmToPx(offset.x, ppi),
        y: mmToPx(offset.y, ppi),
      };

      const cardLayers = [];
      const total = layout.slots.filter((_, i) => slots.back[i] != null).length;
      let placed = 0;

      for (let i = 0; i < layout.slots.length; i++) {
        const handle = slots.back[i];
        if (!handle) continue;

        const s = layout.slots[i];
        const slotRect = {
          x: Math.round(s.xPx),
          y: Math.round(s.yPx),
          w: Math.round(s.wPx),
          h: Math.round(s.hPx),
        };

        ctx.reportProgress({ value: placed / Math.max(total, 1) });

        // DUPLEX MAPPING: back[i] → slot[i], no re-mirror.
        // The UI (dnd.js) already stores back images at the mirrored address.
        const layer = await placeImageInSlot(handle.file, slotRect, {
          asSmartObject,
          offsetPx,
        });
        cardLayers.push(layer);
        placed++;
      }

      if (cardLayers.length > 0) {
        await _groupLayers(backDoc, cardLayers, 'Back');
      }

      // Cut marks at nominal positions (offset NOT applied — see design note above).
      if (cutMarks.on) {
        await drawCutMarks(backDoc, layout, cutMarks.style, ppi, Wpx, Hpx);
      }

    }, { commandName: 'Generate Back Sheet' });
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Create a new RGB/8 document with a white background via batchPlay.
 *
 * Using batchPlay (rather than app.documents.add) for explicit pixelsUnit
 * dimensions and deterministic behavior across PS versions.
 *
 * NOTE [UNCERTAIN]: The `fill` key value 'white' and `mode` key value
 * `{ _class:'RGBColorMode' }` are as documented in PS batchPlay; if the document
 * is created without a white background, add a separate fill step after creation.
 *
 * @param {string} name  Document title
 * @param {number} wPx   Width  in pixels
 * @param {number} hPx   Height in pixels
 * @param {number} ppi   Resolution (pixels per inch)
 */
async function _createDocument(name, wPx, hPx, ppi) {
  const { action } = require('photoshop');
  const batchPlay = action.batchPlay;

  try {
    await batchPlay([{
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
    log('_createDocument ok:', name, wPx + 'x' + hPx);
  } catch (e) {
    err('_createDocument FAILED for', name, ':', e);
    throw new Error(`Document creation failed (${name}): ${e && e.message ? e.message : e}`);
  }
}

/**
 * Set the application ruler units to pixels so that layer.boundsNoEffects
 * returns pixel values reliably.
 *
 * NOTE [UNCERTAIN]: app.preferences.rulerUnits may not be settable in all UXP
 * versions.  The batchPlay fallback below is also provided but commented out.
 * If bounds reads appear wrong (e.g. much too small), uncomment the batchPlay form.
 */
async function _setRulerToPixels() {
  try {
    const { app } = require('photoshop');
    // Units.PIXELS === 'pixel' in UXP PS 24+
    app.preferences.rulerUnits = app.Units.PIXELS;
  } catch (_) {
    // Fallback via batchPlay if the DOM property is not writable.
    // NOTE [UNCERTAIN]: descriptor path may differ between PS versions.
    /*
    const { action } = require('photoshop');
    await action.batchPlay([{
      _obj: 'set',
      _target: [
        { _property: 'rulerUnits' },
        { _ref: 'application', _enum: 'ordinal', _value: 'targetEnum' }
      ],
      to: { _enum: 'rulerUnits', _value: 'pixelsUnit' },
    }], {});
    */
  }
}

/**
 * Group a set of placed layers into a named layer group.
 *
 * Uses the UXP Photoshop DOM API `Document.createLayerGroup({ name, fromLayers })`,
 * which is the supported, version-stable way to group existing layers — avoiding
 * the fragile `make layerSection` batchPlay descriptor (whose `name` placement
 * differs across PS builds).
 *
 * @param {Document} doc      The active document
 * @param {Layer[]}  layers   Layer objects to move into the group
 * @param {string}   name     Group name
 */
async function _groupLayers(doc, layers, name) {
  await doc.createLayerGroup({ name, fromLayers: layers });
}
