/**
 * Koda Sheets - Grid Renderer (Step 4)
 *
 * Renders the slot grid for front or back view.
 * Subscribes to state changes so settings edits (paper/card/ppi/margin/
 * gutter/cutMarks/backsideMode) recompute the grid live.
 *
 * Front/back slot mapping
 * ───────────────────────
 * Front view : display index i  →  state.slots.front[i]
 *
 * Back view  : display index i  →  state.slots.back[ mirrorIndex(i, cols) ]
 *
 *   Because the sheet is flipped on its long (left/right) edge for duplex
 *   printing, the slot at grid column C on the front aligns with column
 *   (cols-1-C) on the back.  By storing the back image at the mirrored index
 *   we ensure the engine can read state.slots.back[j] and print it at physical
 *   back position j, where it naturally aligns with front card mirrorIndex(j).
 *
 *   The back view shows the sheet as the user would conceptually arrange it:
 *   "which image goes behind front card N?" — display position i pairs with
 *   front card i (label shows i+1), and the data lives at the mirror address.
 *
 * Identical Back mode
 * ───────────────────
 * A single shared drop target is displayed.  Assigning any image fills every
 * index of state.slots.back with the same handle (handled in dnd.js).
 */

import {
  getState,
  subscribe,
  resolvePaperDims,
  resolveCardDims,
} from '../state.js';
import { computeLayout, mirrorIndex } from '../engine/layout.js';
import { attachSlotInteractions } from './dnd.js';
import { log } from '../logger.js';

// ─── Module State ─────────────────────────────────────────────────────────────

/** Currently active tab view. */
let _activeView = 'front';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Switch the active view and re-render immediately.
 * @param {'front'|'back'} view
 */
export function setView(view) {
  _activeView = view;
  renderGrid();
}

/**
 * Return the currently active view.
 * @returns {'front'|'back'}
 */
export function getView() {
  return _activeView;
}

/**
 * Render (or re-render) the full slot grid from current state.
 * Safe to call idempotently; rebuilds DOM from scratch each call.
 */
export function renderGrid() {
  const state = getState();
  const gridEl = document.getElementById('grid');
  if (!gridEl) return;

  // Always clear any back-view caption from the previous render
  _removeBackCaption();

  // Wipe the grid contents
  gridEl.innerHTML = '';

  // Expose the view on the element for CSS targeting
  gridEl.dataset.view = _activeView;

  // Compute layout
  const cfg = _buildConfig(state);
  const layout = computeLayout(cfg);
  log('renderGrid:', 'view=' + _activeView, 'cols=' + layout.cols, 'rows=' + layout.rows, 'count=' + layout.count, 'cfg=' + JSON.stringify(cfg));

  if (layout.count === 0) {
    gridEl.style.gridTemplateColumns = '1fr';
    const msg = document.createElement('p');
    msg.className = 'grid-empty-msg';
    msg.textContent = 'No cards fit with the current settings.';
    gridEl.appendChild(msg);
    return;
  }

  if (_activeView === 'back' && state.backside.mode === 'Identical Back') {
    _renderIdenticalBack(gridEl, layout, state);
  } else if (_activeView === 'back') {
    _renderUniqueBack(gridEl, layout, state);
  } else {
    _renderFront(gridEl, layout, state);
  }
}

// Subscribe so any settings change triggers a live re-render
subscribe(renderGrid);

// ─── Layout Config ────────────────────────────────────────────────────────────

function _buildConfig(state) {
  const paper = resolvePaperDims();
  const card = resolveCardDims();
  return {
    paperW: paper.wMm,
    paperH: paper.hMm,
    cardW: card.wMm,
    cardH: card.hMm,
    margin: state.margin,
    gutter: state.gutter,
    ppi: state.ppi,
    reserveGutterForMarks: state.cutMarks.on,
  };
}

// ─── View Renderers ───────────────────────────────────────────────────────────

/**
 * Front view: display index i → state.slots.front[i], label = "i+1".
 */
function _renderFront(gridEl, layout, state) {
  gridEl.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;

  layout.slots.forEach((_, i) => {
    const handle = state.slots.front[i] || null;
    const slotEl = _makeSlot({
      label: String(i + 1),
      handle,
      view: 'front',
      displayIndex: i,
      storeIndex: i,
      count: layout.count,
    });
    gridEl.appendChild(slotEl);
  });
}

/**
 * Back view — Unique Backs:
 * display index i → state.slots.back[ mirrorIndex(i, cols) ]
 * Label shows the paired front card number (i+1).
 */
function _renderUniqueBack(gridEl, layout, state) {
  _insertBackCaption(gridEl);
  gridEl.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;

  const { cols, count } = layout;

  layout.slots.forEach((_, i) => {
    const sIdx = mirrorIndex(i, cols);
    const handle = state.slots.back[sIdx] || null;
    const slotEl = _makeSlot({
      label: String(i + 1),   // front card number this back pairs with
      handle,
      view: 'back',
      displayIndex: i,
      storeIndex: sIdx,
      count,
    });
    gridEl.appendChild(slotEl);
  });
}

/**
 * Back view — Identical Back:
 * Show a single shared drop target; assigning fills all state.slots.back.
 */
function _renderIdenticalBack(gridEl, layout, state) {
  _insertBackCaption(gridEl);

  // Override grid to a centred single-item layout
  gridEl.style.gridTemplateColumns = '1fr';

  // All slots share the same handle — read slot 0 as the representative
  const handle = state.slots.back[0] || null;

  const wrapper = document.createElement('div');
  wrapper.className = 'identical-back-wrapper';

  const slotEl = _makeSlot({
    label: 'Back',
    handle,
    view: 'back',
    displayIndex: 0,
    storeIndex: 0,
    count: layout.count,
    extraClass: 'grid-slot--identical',
  });

  if (!handle) {
    // Add a hint below the + explaining scope
    const hint = document.createElement('span');
    hint.className = 'slot-identical-hint';
    hint.textContent = `Applies to all ${layout.count} card backs`;
    slotEl.appendChild(hint);
  }

  wrapper.appendChild(slotEl);
  gridEl.appendChild(wrapper);
}

// ─── Slot Builder ─────────────────────────────────────────────────────────────

/**
 * Create a single slot element, populate it, and attach interactions.
 *
 * @param {object} opts
 * @param {string}      opts.label        Text for the corner badge
 * @param {object|null} opts.handle       { file, thumbUrl, name } or null
 * @param {string}      opts.view         'front' | 'back'
 * @param {number}      opts.displayIndex 0-based grid display position
 * @param {number}      opts.storeIndex   state.slots[view] array index
 * @param {number}      opts.count        total slot count
 * @param {string}      [opts.extraClass] additional CSS class
 * @returns {HTMLElement}
 */
function _makeSlot({ label, handle, view, displayIndex, storeIndex, count, extraClass }) {
  const slot = document.createElement('div');
  const classes = ['grid-slot'];
  if (handle) classes.push('grid-slot--assigned');
  if (extraClass) classes.push(extraClass);
  slot.className = classes.join(' ');
  slot.dataset.displayIndex = String(displayIndex);
  slot.dataset.storeIndex = String(storeIndex);

  // Corner badge with 1-based card number / "Back" label
  const badge = document.createElement('span');
  badge.className = 'slot-badge';
  badge.textContent = label;
  slot.appendChild(badge);

  if (handle && handle.thumbUrl) {
    // Thumbnail covering the slot
    const img = document.createElement('img');
    img.className = 'slot-thumb';
    img.src = handle.thumbUrl;
    img.alt = handle.name || 'card image';
    slot.appendChild(img);

    // Remove (×) button — visible on hover via CSS
    const remove = document.createElement('button');
    remove.className = 'slot-remove';
    remove.title = 'Remove image';
    remove.setAttribute('aria-label', 'Remove image');
    remove.textContent = '×';
    slot.appendChild(remove);
  } else {
    // Empty placeholder
    const plus = document.createElement('span');
    plus.className = 'slot-plus';
    plus.textContent = '+';
    slot.appendChild(plus);
  }

  // Wire all click / drag-drop / remove interactions
  attachSlotInteractions(slot, { view, displayIndex, storeIndex, count });

  return slot;
}

// ─── Back-View Caption ────────────────────────────────────────────────────────

/**
 * Insert the back-view helper caption before the grid element.
 * Uses the grid's parent so it appears between the tab bar and the grid.
 *
 * @param {HTMLElement} gridEl
 */
function _insertBackCaption(gridEl) {
  if (!gridEl.parentElement) return;
  const cap = document.createElement('p');
  cap.className = 'back-view-caption';
  cap.textContent = 'Backs are mirrored to align with fronts when flipped.';
  gridEl.parentElement.insertBefore(cap, gridEl);
}

/** Remove any lingering back-view captions (cleanup before each render). */
function _removeBackCaption() {
  document.querySelectorAll('.back-view-caption').forEach((el) => el.remove());
}
