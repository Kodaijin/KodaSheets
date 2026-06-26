/**
 * place.js — Shared image-placement helpers for Koda Sheets.
 *
 * All require('photoshop') and require('uxp') calls are LAZY (inside function
 * bodies) so this file passes `node --check` without a live UXP/Photoshop
 * runtime being present.
 *
 * ASSUMPTION: Images are expected to match the card's aspect ratio.
 * Non-uniform scale (different x/y percentages) is applied intentionally so
 * the image exactly fills the target slot bounding box.  If an image has a
 * different aspect ratio the content will be stretched to fit — this is
 * deliberate (proxy/placeholder images may have a slightly different ratio).
 */

/**
 * Place a single image file as a layer on the ACTIVE document so it exactly
 * covers `slotRectPx`, optionally shifted by `offsetPx` (back-page duplex
 * calibration).
 *
 * Must be called from inside an `executeAsModal` context.
 *
 * @param {UXPFile} file
 *   A UXP File object for the source image (from state.slots.front/back[i].file).
 * @param {{ x:number, y:number, w:number, h:number }} slotRectPx
 *   Top-left origin and size of the target slot in INTEGER pixels.
 *   Caller is responsible for rounding (use Math.round on layout.slots[i].xPx etc.).
 * @param {{ asSmartObject:boolean, offsetPx:{ x:number, y:number } }} options
 *   asSmartObject – keep the placed file as a Smart Object (true) or rasterize (false).
 *   offsetPx      – calibration translation added on top of the slot position.
 *                   Pass { x:0, y:0 } for front pages.  For back pages, pass
 *                   mmToPx(state.offset.x/y, ppi) so all back card images shift
 *                   together for duplex registration.
 * @returns {Promise<Layer>} The placed (and optionally rasterized) layer.
 */
export async function placeImageInSlot(file, slotRectPx, { asSmartObject, offsetPx }) {
  // ── Lazy requires ────────────────────────────────────────────────────────────
  const { action, app } = require('photoshop');
  const batchPlay = action.batchPlay;
  const uxp = require('uxp');

  const { x: targetX, y: targetY, w: targetW, h: targetH } = slotRectPx;
  const offsetX = (offsetPx && typeof offsetPx.x === 'number') ? offsetPx.x : 0;
  const offsetY = (offsetPx && typeof offsetPx.y === 'number') ? offsetPx.y : 0;

  // ── Step 1: Session token ─────────────────────────────────────────────────
  // UXP requires a session token to pass local File objects into batchPlay.
  const token = await uxp.storage.localFileSystem.createSessionToken(file);

  // ── Step 2: Place image as Smart Object centered in the document ──────────
  // NOTE [UNCERTAIN]: After placeEvent via batchPlay, PS may auto-commit the
  // free-transform.  If content appears unplaced, add a commitTransform call
  // after this step: await batchPlay([{ _obj: 'commitTransform' }], {});
  await batchPlay([{
    _obj: 'placeEvent',
    null: { _path: token, _kind: 'local' },
    freeTransformCenterState: { _enum: 'quadCenterState', _value: 'QCSAverage' },
  }], {});

  // ── Step 3: Read current layer bounds ────────────────────────────────────
  // NOTE [UNCERTAIN]: boundsNoEffects values are in the document's ruler units.
  // This code assumes the ruler units are set to pixels (which generate.js
  // ensures by setting app.preferences.rulerUnits before calling this function).
  // If bounds appear in different units, set ruler units to pixels upstream.
  let layer = app.activeDocument.activeLayers[0];
  let b = layer.boundsNoEffects;
  let curW = b.right - b.left;
  let curH = b.bottom - b.top;

  // ── Step 4: Non-uniform scale to exactly fill the target slot ─────────────
  // Percentages are relative to the layer's current size.
  // Non-uniform scale is intentional: fills the slot exactly regardless of
  // minor aspect-ratio differences.
  const sx = (targetW / curW) * 100;
  const sy = (targetH / curH) * 100;

  // NOTE [UNCERTAIN]: The transform descriptor key for interpolation is
  // 'interfaceIconFrameDimmed' in some PS versions; omitting it here lets PS
  // use its default (bicubic) which is fine for placement.
  await batchPlay([{
    _obj: 'transform',
    _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
    freeTransformCenterState: { _enum: 'quadCenterState', _value: 'QCSAverage' },
    width: { _unit: 'percentUnit', _value: sx },
    height: { _unit: 'percentUnit', _value: sy },
  }], {});

  // ── Step 5: Translate so the layer's top-left lands at (targetX+offsetX, targetY+offsetY)
  // Re-read bounds after scale (center stayed fixed; corners moved symmetrically).
  layer = app.activeDocument.activeLayers[0];
  b = layer.boundsNoEffects;
  const curLeft = b.left;
  const curTop  = b.top;

  const deltaX = targetX - curLeft + offsetX;
  const deltaY = targetY - curTop  + offsetY;

  await batchPlay([{
    _obj: 'move',
    _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
    to: {
      _obj: 'offset',
      horizontal: { _unit: 'pixelsUnit', _value: deltaX },
      vertical:   { _unit: 'pixelsUnit', _value: deltaY },
    },
  }], {});

  // ── Step 6: Optionally rasterize ──────────────────────────────────────────
  if (!asSmartObject) {
    // NOTE [UNCERTAIN]: 'rasterizeLayer' batchPlay key is confirmed in PS 24+.
    // Fallback: await layer.rasterize() if batchPlay fails.
    await batchPlay([{
      _obj: 'rasterizeLayer',
      _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
    }], {});
  }

  // Return the now-active layer reference.
  return app.activeDocument.activeLayers[0];
}
