/**
 * Koda Sheets - Central State Management
 *
 * Single source of truth for all app settings and layout state.
 * Provides subscription mechanism for reactive updates.
 */

// Preset dimension tables (mm)
const PAPER_PRESETS = {
  'US Letter': { wMm: 216, hMm: 279 },
  'A4': { wMm: 210, hMm: 297 },
};

const CARD_PRESETS = {
  'Poker (63×88)': { wMm: 63, hMm: 88 },
  'Bridge (56×88)': { wMm: 56, hMm: 88 },
  'Tarot (70×120)': { wMm: 70, hMm: 120 },
  'Standard TCG (63×88)': { wMm: 63, hMm: 88 },
};

/**
 * Central state object — the source of truth
 */
const state = {
  paper: {
    preset: 'US Letter',
    wMm: 216,
    hMm: 279,
  },
  card: {
    preset: 'Poker (63×88)',
    wMm: 63,
    hMm: 88,
  },
  ppi: 1200,
  margin: 5,        // mm
  gutter: 2,        // mm
  cutMarks: {
    on: false,
    style: 'Corner crop marks',
  },
  placement: 'Smart Object',
  backside: {
    mode: 'Identical Back',
  },
  offset: {
    x: 0,             // mm
    y: 0,             // mm
  },
  slots: {
    front: [],        // image handles only — never persisted
    back: [],         // image handles only — never persisted
  },
};

/**
 * Subscription mechanism for reactive updates
 */
const listeners = [];

/**
 * Subscribe to state changes
 * @param {Function} fn Callback invoked on notify()
 */
export function subscribe(fn) {
  if (typeof fn === 'function') {
    listeners.push(fn);
  }
}

/**
 * Notify all listeners of state changes
 */
export function notify() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (err) {
      console.error('Listener error:', err);
    }
  });
}

/**
 * Get the current state (shallow reference)
 */
export function getState() {
  return state;
}

/**
 * Resolve paper dimensions based on preset or custom values
 * @returns {Object} { wMm, hMm }
 */
export function resolvePaperDims() {
  if (state.paper.preset === 'Custom') {
    return {
      wMm: state.paper.wMm,
      hMm: state.paper.hMm,
    };
  }
  const preset = PAPER_PRESETS[state.paper.preset];
  if (preset) {
    return { wMm: preset.wMm, hMm: preset.hMm };
  }
  // Fallback to US Letter
  return { wMm: 216, hMm: 279 };
}

/**
 * Resolve card dimensions based on preset or custom values
 * @returns {Object} { wMm, hMm }
 */
export function resolveCardDims() {
  if (state.card.preset === 'Custom') {
    return {
      wMm: state.card.wMm,
      hMm: state.card.hMm,
    };
  }
  const preset = CARD_PRESETS[state.card.preset];
  if (preset) {
    return { wMm: preset.wMm, hMm: preset.hMm };
  }
  // Fallback to Poker
  return { wMm: 63, hMm: 88 };
}

export default state;
