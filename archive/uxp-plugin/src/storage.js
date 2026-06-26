/**
 * Koda Sheets - Storage & Persistence Layer
 *
 * Handles localStorage serialization/deserialization.
 * Note: state.slots is never persisted (contains image handles only).
 */

import { getState } from './state.js';

const STORAGE_KEY = 'kodaSheets.settings.v1';
let saveTimeoutId = null;

/**
 * Serialize state (excluding slots) to localStorage
 */
export function saveSettings() {
  const state = getState();

  // Create a copy excluding slots
  const toSave = {
    paper: {
      preset: state.paper.preset,
      wMm: state.paper.wMm,
      hMm: state.paper.hMm,
    },
    card: {
      preset: state.card.preset,
      wMm: state.card.wMm,
      hMm: state.card.hMm,
    },
    ppi: state.ppi,
    margin: state.margin,
    gutter: state.gutter,
    cutMarks: {
      on: state.cutMarks.on,
      style: state.cutMarks.style,
    },
    placement: state.placement,
    backside: {
      mode: state.backside.mode,
    },
    offset: {
      x: state.offset.x,
      y: state.offset.y,
    },
    // slots is intentionally NOT included
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    console.log('Settings saved to localStorage');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

/**
 * Load settings from localStorage and merge into state
 * Tolerates missing/corrupted data with sensible defaults
 */
export function loadSettings() {
  const state = getState();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      console.log('No stored settings found; using defaults');
      return;
    }

    const data = JSON.parse(stored);

    // Merge paper
    if (data.paper) {
      if (data.paper.preset) state.paper.preset = data.paper.preset;
      if (typeof data.paper.wMm === 'number') state.paper.wMm = data.paper.wMm;
      if (typeof data.paper.hMm === 'number') state.paper.hMm = data.paper.hMm;
    }

    // Merge card
    if (data.card) {
      if (data.card.preset) state.card.preset = data.card.preset;
      if (typeof data.card.wMm === 'number') state.card.wMm = data.card.wMm;
      if (typeof data.card.hMm === 'number') state.card.hMm = data.card.hMm;
    }

    // Merge scalars
    if (typeof data.ppi === 'number') state.ppi = data.ppi;
    if (typeof data.margin === 'number') state.margin = data.margin;
    if (typeof data.gutter === 'number') state.gutter = data.gutter;

    // Merge cutMarks
    if (data.cutMarks) {
      if (typeof data.cutMarks.on === 'boolean') state.cutMarks.on = data.cutMarks.on;
      if (data.cutMarks.style) state.cutMarks.style = data.cutMarks.style;
    }

    // Merge placement
    if (data.placement) state.placement = data.placement;

    // Merge backside
    if (data.backside && data.backside.mode) {
      state.backside.mode = data.backside.mode;
    }

    // Merge offset
    if (data.offset) {
      if (typeof data.offset.x === 'number') state.offset.x = data.offset.x;
      if (typeof data.offset.y === 'number') state.offset.y = data.offset.y;
    }

    console.log('Settings loaded from localStorage');
  } catch (err) {
    console.error('Failed to load settings:', err);
    // Continue with defaults
  }
}

/**
 * Debounce save operation ~300ms
 * Call this after each state change; multiple calls within 300ms
 * only trigger one actual save
 */
export function scheduleSave() {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
  }
  saveTimeoutId = setTimeout(() => {
    saveSettings();
    saveTimeoutId = null;
  }, 300);
}
