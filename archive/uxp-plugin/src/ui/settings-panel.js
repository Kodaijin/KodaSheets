/**
 * Koda Sheets - Settings Panel UI Binding
 *
 * Wires HTML controls to state and vice versa.
 * Handles all control change events and updates state accordingly.
 */

import {
  getState,
  resolvePaperDims,
  resolveCardDims,
  notify,
} from '../state.js';
import { scheduleSave } from '../storage.js';

/**
 * Dropdown option arrays (must match HTML order)
 */
const PAPER_PRESET_OPTIONS = ['US Letter', 'A4', 'Custom'];
const CARD_PRESET_OPTIONS = [
  'Poker (63×88)',
  'Bridge (56×88)',
  'Tarot (70×120)',
  'Standard TCG (63×88)',
  'Custom',
];
const CUT_MARKS_STYLE_OPTIONS = ['Corner crop marks', 'Full gutter gridlines'];
const PLACEMENT_OPTIONS = ['Smart Object', 'Rasterized'];
const BACKSIDE_MODE_OPTIONS = ['Identical Back', 'Unique Backs'];

/**
 * Helper: Toggle visibility of a group by ID
 */
function toggleGroup(groupId, show) {
  const group = document.getElementById(groupId);
  if (!group) return;
  if (show) {
    group.classList.remove('hidden');
  } else {
    group.classList.add('hidden');
  }
}

/**
 * Helper: Set dropdown selectedIndex safely
 */
function setDropdownIndex(elementId, index) {
  const el = document.getElementById(elementId);
  if (el && el.hasAttribute('selected-index')) {
    el.setAttribute('selected-index', index);
  }
  // Some UXP versions use selectedIndex
  if (el) {
    el.selectedIndex = index;
  }
}

/**
 * Helper: Get dropdown selectedIndex
 */
function getDropdownIndex(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return 0;
  // Try selectedIndex first
  if (typeof el.selectedIndex === 'number') {
    return el.selectedIndex;
  }
  // Fallback to selected-index attribute
  const attr = el.getAttribute('selected-index');
  return attr ? parseInt(attr, 10) : 0;
}

/**
 * Initialize all controls from current state
 * Call once on app boot
 */
export function initSettingsPanel() {
  const state = getState();

  // --- PAPER PRESET ---
  const paperIdx = PAPER_PRESET_OPTIONS.indexOf(state.paper.preset);
  setDropdownIndex('paperPreset', Math.max(0, paperIdx));
  document.getElementById('paperW').value = state.paper.wMm;
  document.getElementById('paperH').value = state.paper.hMm;
  toggleGroup('customPaperGroup', state.paper.preset === 'Custom');
  toggleGroup('customPaperHeightGroup', state.paper.preset === 'Custom');

  // --- CARD PRESET ---
  const cardIdx = CARD_PRESET_OPTIONS.indexOf(state.card.preset);
  setDropdownIndex('cardPreset', Math.max(0, cardIdx));
  document.getElementById('cardW').value = state.card.wMm;
  document.getElementById('cardH').value = state.card.hMm;
  toggleGroup('customCardGroup', state.card.preset === 'Custom');
  toggleGroup('customCardHeightGroup', state.card.preset === 'Custom');

  // --- NUMERIC INPUTS ---
  document.getElementById('ppi').value = state.ppi;
  document.getElementById('margin').value = state.margin;
  document.getElementById('gutter').value = state.gutter;
  document.getElementById('offsetX').value = state.offset.x;
  document.getElementById('offsetY').value = state.offset.y;

  // --- CHECKBOX ---
  document.getElementById('cutMarksOn').checked = state.cutMarks.on;

  // --- CUT MARKS STYLE ---
  const styleIdx = CUT_MARKS_STYLE_OPTIONS.indexOf(state.cutMarks.style);
  setDropdownIndex('cutMarksStyle', Math.max(0, styleIdx));
  toggleGroup('cutMarksStyleGroup', state.cutMarks.on);

  // --- PLACEMENT ---
  const placementIdx = PLACEMENT_OPTIONS.indexOf(state.placement);
  setDropdownIndex('placement', Math.max(0, placementIdx));

  // --- BACKSIDE MODE ---
  const backsideIdx = BACKSIDE_MODE_OPTIONS.indexOf(state.backside.mode);
  setDropdownIndex('backsideMode', Math.max(0, backsideIdx));

  // Attach all listeners
  attachAllListeners();
}

/**
 * Attach change listeners to all controls
 */
function attachAllListeners() {
  const state = getState();

  // Paper Preset
  document.getElementById('paperPreset')?.addEventListener('change', (e) => {
    const idx = getDropdownIndex('paperPreset');
    const preset = PAPER_PRESET_OPTIONS[idx];
    state.paper.preset = preset;

    // Update custom fields and show/hide groups
    if (preset === 'Custom') {
      // Use current custom values
      toggleGroup('customPaperGroup', true);
      toggleGroup('customPaperHeightGroup', true);
    } else {
      // Apply preset dimensions
      const dims = resolvePaperDims();
      state.paper.wMm = dims.wMm;
      state.paper.hMm = dims.hMm;
      document.getElementById('paperW').value = dims.wMm;
      document.getElementById('paperH').value = dims.hMm;
      toggleGroup('customPaperGroup', false);
      toggleGroup('customPaperHeightGroup', false);
    }

    scheduleSave();
    notify();
  });

  // Custom Paper W
  document.getElementById('paperW')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.paper.wMm = val;
      scheduleSave();
      notify();
    }
  });

  // Custom Paper H
  document.getElementById('paperH')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.paper.hMm = val;
      scheduleSave();
      notify();
    }
  });

  // Card Preset
  document.getElementById('cardPreset')?.addEventListener('change', (e) => {
    const idx = getDropdownIndex('cardPreset');
    const preset = CARD_PRESET_OPTIONS[idx];
    state.card.preset = preset;

    if (preset === 'Custom') {
      toggleGroup('customCardGroup', true);
      toggleGroup('customCardHeightGroup', true);
    } else {
      const dims = resolveCardDims();
      state.card.wMm = dims.wMm;
      state.card.hMm = dims.hMm;
      document.getElementById('cardW').value = dims.wMm;
      document.getElementById('cardH').value = dims.hMm;
      toggleGroup('customCardGroup', false);
      toggleGroup('customCardHeightGroup', false);
    }

    scheduleSave();
    notify();
  });

  // Custom Card W
  document.getElementById('cardW')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.card.wMm = val;
      scheduleSave();
      notify();
    }
  });

  // Custom Card H
  document.getElementById('cardH')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.card.hMm = val;
      scheduleSave();
      notify();
    }
  });

  // PPI
  document.getElementById('ppi')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      state.ppi = val;
      scheduleSave();
      notify();
    }
  });

  // Margin
  document.getElementById('margin')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      state.margin = val;
      scheduleSave();
      notify();
    }
  });

  // Gutter
  document.getElementById('gutter')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      state.gutter = val;
      scheduleSave();
      notify();
    }
  });

  // Cut Marks On/Off
  document.getElementById('cutMarksOn')?.addEventListener('change', (e) => {
    state.cutMarks.on = e.target.checked;
    toggleGroup('cutMarksStyleGroup', e.target.checked);
    scheduleSave();
    notify();
  });

  // Cut Marks Style
  document.getElementById('cutMarksStyle')?.addEventListener('change', (e) => {
    const idx = getDropdownIndex('cutMarksStyle');
    state.cutMarks.style = CUT_MARKS_STYLE_OPTIONS[idx];
    scheduleSave();
    notify();
  });

  // Placement
  document.getElementById('placement')?.addEventListener('change', (e) => {
    const idx = getDropdownIndex('placement');
    state.placement = PLACEMENT_OPTIONS[idx];
    scheduleSave();
    notify();
  });

  // Backside Mode
  document.getElementById('backsideMode')?.addEventListener('change', (e) => {
    const idx = getDropdownIndex('backsideMode');
    state.backside.mode = BACKSIDE_MODE_OPTIONS[idx];
    scheduleSave();
    notify();
  });

  // Offset X
  document.getElementById('offsetX')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.offset.x = val;
      scheduleSave();
      notify();
    }
  });

  // Offset Y
  document.getElementById('offsetY')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.offset.y = val;
      scheduleSave();
      notify();
    }
  });
}
