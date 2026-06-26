/**
 * Koda Sheets - Slot Drag-and-Drop and File Picking (Step 4)
 *
 * Provides thumbnailUrlFromFile(), attachSlotInteractions(), and helpers.
 * All UXP require() calls are lazy/guarded so node --check passes cleanly.
 *
 * Slot assignment semantics:
 *   Front view  — writes to state.slots.front[storeIndex]
 *   Back Unique — writes to state.slots.back[storeIndex]  (storeIndex = mirrorIndex(displayIndex, cols))
 *   Back Identical — writes the same handle to ALL state.slots.back entries
 */

import { getState, notify } from '../state.js';
import { log, err } from '../logger.js';

// ─── UXP Guard ───────────────────────────────────────────────────────────────

/**
 * Lazily obtain the UXP module. Returns null in non-UXP environments (Node
 * syntax-check, unit tests) so all callers degrade gracefully.
 * @returns {object|null}
 */
function getUXP() {
  try {
    // eslint-disable-next-line no-undef
    return require('uxp');
  } catch (_) {
    return null;
  }
}

// ─── Thumbnail Helper ─────────────────────────────────────────────────────────

/**
 * Build a thumbnail object URL from a UXP File entry (picked via localFileSystem).
 * Reads bytes via the UXP binary format, wraps in a Blob, and calls
 * URL.createObjectURL.  Returns null on any failure so callers can fall back.
 *
 * @param {object} file  UXP File entry from localFileSystem.getFileForOpening
 * @returns {Promise<string|null>}
 */
export async function thumbnailUrlFromFile(file) {
  try {
    const uxp = getUXP();
    if (!uxp) return null;

    const bytes = await file.read({ format: uxp.storage.formats.binary });
    const mime = _mimeFromName(file.name || '');
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn('thumbnailUrlFromFile: failed to read file:', err);
    return null;
  }
}

/**
 * Build a thumbnail object URL from a Web File (dataTransfer.files[i]).
 * Uses the File.arrayBuffer() API which UXP also exposes on dropped files.
 * Falls back to thumbnailUrlFromFile if arrayBuffer is unavailable.
 *
 * @param {File|object} file
 * @returns {Promise<string|null>}
 */
async function thumbnailUrlFromWebFile(file) {
  try {
    if (typeof file.arrayBuffer === 'function') {
      const buf = await file.arrayBuffer();
      const mime = _mimeFromName(file.name || '');
      const blob = new Blob([buf], { type: mime });
      return URL.createObjectURL(blob);
    }
    // Fallback: treat as UXP File entry
    return thumbnailUrlFromFile(file);
  } catch (err) {
    console.warn('thumbnailUrlFromWebFile: failed:', err);
    return null;
  }
}

/** Infer MIME type from a filename. */
function _mimeFromName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg'; // safe default
}

// ─── File Picker ──────────────────────────────────────────────────────────────

/**
 * Open a UXP system file picker for a single image.
 * Returns null if cancelled or if UXP is unavailable.
 *
 * @returns {Promise<object|null>}  UXP File entry
 */
async function pickFile() {
  try {
    const uxp = getUXP();
    if (!uxp) {
      log('pickFile: UXP not available');
      return null;
    }
    log('pickFile: opening file picker');
    const file = await uxp.storage.localFileSystem.getFileForOpening({
      types: ['png', 'jpg', 'jpeg'],
      allowMultiple: false,
    });
    log('pickFile: picker returned', file ? (file.name || 'file') : 'null (cancelled)');
    return file || null;
  } catch (e) {
    err('pickFile failed:', e);
    return null;
  }
}

// ─── Slot Assignment ──────────────────────────────────────────────────────────

/**
 * Write a picked UXP File handle to the correct state slot(s) and notify.
 *
 * @param {object} file        UXP File entry
 * @param {string} view        'front' | 'back'
 * @param {number} storeIndex  The state.slots[view] index to write (ignored
 *                             in Identical Back mode — all indices are filled)
 * @param {number} count       Total layout slot count
 */
async function assignUXPFile(file, view, storeIndex, count) {
  if (!file) return;
  const thumbUrl = await thumbnailUrlFromFile(file);
  const handle = { file, thumbUrl, name: file.name || '' };
  _writeHandle(handle, view, storeIndex, count);
  notify();
}

/**
 * Write a Web File (drag-drop) handle to the correct state slot(s) and notify.
 *
 * @param {File|object} file
 * @param {string}      view
 * @param {number}      storeIndex
 * @param {number}      count
 */
async function assignWebFile(file, view, storeIndex, count) {
  if (!file) return;
  const thumbUrl = await thumbnailUrlFromWebFile(file);
  const handle = { file, thumbUrl, name: file.name || '' };
  _writeHandle(handle, view, storeIndex, count);
  notify();
}

/**
 * Clear a slot (or all back slots in Identical Back mode) and notify.
 *
 * @param {string} view
 * @param {number} storeIndex
 * @param {number} count
 */
export function clearSlot(view, storeIndex, count) {
  const state = getState();
  if (view === 'back' && state.backside.mode === 'Identical Back') {
    state.slots.back = Array.from({ length: count }, () => null);
  } else {
    if (storeIndex < state.slots[view].length) {
      state.slots[view][storeIndex] = null;
    }
  }
  notify();
}

/**
 * Internal: write handle into state, respecting Identical Back semantics.
 */
function _writeHandle(handle, view, storeIndex, count) {
  const state = getState();
  if (view === 'back' && state.backside.mode === 'Identical Back') {
    // Overwrite every back slot with the same handle
    state.slots.back = Array.from({ length: count }, () => handle);
  } else {
    // Grow the array if needed, then set the target index
    const arr = state.slots[view];
    while (arr.length <= storeIndex) arr.push(null);
    arr[storeIndex] = handle;
  }
}

// ─── Interaction Wiring ───────────────────────────────────────────────────────

/**
 * Attach click, drag-over/drop, and remove interactions to a slot element.
 *
 * The caller (grid.js) passes:
 *   view         — 'front' | 'back'
 *   displayIndex — 0-based position in the rendered grid (for labelling)
 *   storeIndex   — the state.slots[view] array index to read/write
 *   count        — total layout slot count (needed for Identical Back fill-all)
 *
 * @param {HTMLElement} slotEl
 * @param {{ view: string, displayIndex: number, storeIndex: number, count: number }} opts
 */
export function attachSlotInteractions(slotEl, { view, displayIndex, storeIndex, count }) {
  // ── Click → file picker ───────────────────────────────────────────────────
  slotEl.addEventListener('click', async (e) => {
    // Let remove-button clicks bubble to their own handler
    if (e.target.classList.contains('slot-remove')) return;
    log('slot clicked:', 'view=' + view, 'storeIndex=' + storeIndex);
    try {
      const file = await pickFile();
      if (file) {
        await assignUXPFile(file, view, storeIndex, count);
        log('slot assigned:', 'view=' + view, 'storeIndex=' + storeIndex, 'name=' + (file.name || ''));
      }
    } catch (e2) {
      err('slot click handler failed:', e2);
    }
  });

  // ── Drag over ─────────────────────────────────────────────────────────────
  slotEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (_) { /* ignore */ }
    slotEl.classList.add('drag-over');
  });

  slotEl.addEventListener('dragleave', () => {
    slotEl.classList.remove('drag-over');
  });

  // ── Drop ──────────────────────────────────────────────────────────────────
  slotEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    slotEl.classList.remove('drag-over');

    let file = null;
    try {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        file = files[0];
      }
    } catch (_) {
      // dataTransfer unavailable — degrade silently
    }

    if (file) {
      await assignWebFile(file, view, storeIndex, count);
    }
  });

  // ── Remove button (×) ────────────────────────────────────────────────────
  const removeBtn = slotEl.querySelector('.slot-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSlot(view, storeIndex, count);
    });
  }
}
