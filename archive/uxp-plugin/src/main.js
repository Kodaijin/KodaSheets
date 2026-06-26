/**
 * Koda Sheets - UXP Panel Entry Point
 *
 * Initializes state management, settings persistence, UI binding, the slot
 * grid, and the generation button handlers. Includes file-based debug logging.
 */

import { loadSettings } from './storage.js';
import { initSettingsPanel } from './ui/settings-panel.js';
import { initTabs } from './ui/tabs.js';
import { renderGrid } from './ui/grid.js';
import { generateSheet } from './ps/generate.js';
import { generateTestSheet } from './ps/testsheet.js';
import { initLogger, log, err, getLogPath, flushNow } from './logger.js';

/**
 * Write a message to the in-panel status bar.
 * @param {string} msg
 * @param {'busy'|'error'|'ok'|''} [kind]
 */
function setStatus(msg, kind = '') {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status-bar' + (kind ? ` status-${kind}` : '');
}

/**
 * Surface an error in the status bar, the debug log, and (best-effort) a
 * Photoshop alert.
 * @param {Error|any} e
 */
async function reportError(e) {
  const msg = e && e.message ? e.message : String(e);
  err('reportError:', e);
  setStatus(`Error: ${msg}`, 'error');
  try {
    const ps = require('photoshop');
    if (ps.app && typeof ps.app.showAlert === 'function') {
      await ps.app.showAlert(String(msg));
    } else if (ps.core && typeof ps.core.showAlert === 'function') {
      await ps.core.showAlert({ message: String(msg) });
    }
  } catch (_) {
    // Status bar + log already captured it.
  }
  await flushNow();
}

/**
 * Run a generation function with button-locking and status/log reporting.
 * @param {() => Promise<void>} fn
 * @param {string} label
 */
async function runGeneration(fn, label) {
  const btnGenerate = document.getElementById('btnGenerate');
  const btnTestSheet = document.getElementById('btnTestSheet');
  if (btnGenerate) btnGenerate.disabled = true;
  if (btnTestSheet) btnTestSheet.disabled = true;
  setStatus(`${label}…`, 'busy');
  log(`=== ${label}: start ===`);
  try {
    await fn();
    log(`=== ${label}: done ===`);
    setStatus(`${label}: done.`, 'ok');
  } catch (e) {
    await reportError(e);
  } finally {
    if (btnGenerate) btnGenerate.disabled = false;
    if (btnTestSheet) btnTestSheet.disabled = false;
    await flushNow();
  }
}

/** Install global handlers so uncaught errors land in the log file. */
function installGlobalErrorCapture() {
  const targets = [];
  try { if (typeof window !== 'undefined') targets.push(window); } catch (_) { /* noop */ }
  try { if (typeof self !== 'undefined' && self !== (typeof window !== 'undefined' ? window : null)) targets.push(self); } catch (_) { /* noop */ }
  for (const t of targets) {
    try {
      t.addEventListener('error', (e) => {
        err('window.error:', e && e.message, e && e.filename, e && (e.lineno + ':' + e.colno), e && e.error);
      });
      t.addEventListener('unhandledrejection', (e) => {
        err('unhandledrejection:', e && (e.reason && e.reason.stack ? e.reason.stack : e.reason));
      });
    } catch (_) { /* addEventListener for these may be unsupported; ignore */ }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Run the async boot sequence; never let it throw out of the listener.
  (async () => {
    installGlobalErrorCapture();

    let logPath = '';
    try {
      logPath = await initLogger();
    } catch (_) { /* logging is best-effort */ }

    log('Panel initializing. UXP available:', _hasUXP());

    // ── Settings + persistence (Step 2) ─────────────────────────────────────
    try {
      loadSettings();
      log('loadSettings ok');
      initSettingsPanel();
      log('initSettingsPanel ok');
    } catch (e) {
      err('Settings init failed:', e);
      setStatus(`Settings init failed: ${e && e.message ? e.message : e}`, 'error');
    }

    // ── Generation buttons (Step 5) — wire BEFORE grid render ───────────────
    const btnGenerate = document.getElementById('btnGenerate');
    const btnTestSheet = document.getElementById('btnTestSheet');
    log('Buttons found:', 'generate=' + !!btnGenerate, 'test=' + !!btnTestSheet);

    if (btnGenerate) {
      btnGenerate.addEventListener('click', () => {
        log('btnGenerate clicked');
        runGeneration(generateSheet, 'Generating sheet');
      });
    }
    if (btnTestSheet) {
      btnTestSheet.addEventListener('click', () => {
        log('btnTestSheet clicked');
        runGeneration(generateTestSheet, 'Generating test sheet');
      });
    }

    // ── Tabs + grid (Step 4) ────────────────────────────────────────────────
    try {
      initTabs();
      log('initTabs ok');
      renderGrid();
      log('renderGrid ok');
    } catch (e) {
      err('Grid init failed:', e);
      setStatus(`Grid init failed: ${e && e.message ? e.message : e}`, 'error');
    }

    setStatus(`Ready. Debug log written to:\n${logPath || '(file logging unavailable — console only)'}`, '');
    log('Panel ready. Log path:', logPath);
    await flushNow();
  })().catch((e) => {
    try { err('Boot sequence threw:', e); } catch (_) { /* noop */ }
    setStatus(`Boot error: ${e && e.message ? e.message : e}`, 'error');
  });
});

/** True if the UXP runtime is present. */
function _hasUXP() {
  try {
    require('uxp');
    return true;
  } catch (_) {
    return false;
  }
}
