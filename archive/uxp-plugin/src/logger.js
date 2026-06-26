/**
 * logger.js — File-based debug logger for Koda Sheets.
 *
 * Writes a plain-text log to the plugin's data folder so issues can be
 * diagnosed outside the UXP devtools console. The whole accumulated log is
 * rewritten on each flush (the log is small), which avoids relying on the
 * append option of File.write.
 *
 * Usage:
 *   import { initLogger, log, err, getLogPath } from './logger.js';
 *   await initLogger();           // creates the file, returns its native path
 *   log('something happened', value);
 *   err('it broke', error);
 *
 * All require('uxp') calls are lazy so this file passes `node --check`.
 */

let _fileEntry = null;
let _nativePath = '';
let _allText = '';
let _initPromise = null;
let _flushTimer = null;

function _ts() {
  try {
    return new Date().toISOString();
  } catch (_) {
    return '' + Date.now();
  }
}

function _stringify(a) {
  if (a instanceof Error) return (a.stack || a.message || String(a));
  if (a && typeof a === 'object') {
    try { return JSON.stringify(a); } catch (_) { return String(a); }
  }
  return String(a);
}

function _format(level, args) {
  return `[${_ts()}] ${level}: ${args.map(_stringify).join(' ')}`;
}

async function _ensureFile() {
  if (_fileEntry) return _fileEntry;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const uxp = require('uxp');
    const fs = uxp.storage.localFileSystem;
    const folder = await fs.getDataFolder();
    _fileEntry = await folder.createFile('koda-debug.log', { overwrite: true });
    _nativePath = _fileEntry.nativePath || '';
    return _fileEntry;
  })();
  return _initPromise;
}

function _scheduleFlush() {
  if (_flushTimer) return;
  try {
    _flushTimer = setTimeout(() => { _flushTimer = null; _flush(); }, 150);
  } catch (_) {
    // setTimeout unavailable (non-UXP) — flush opportunistically.
    _flush();
  }
}

async function _flush() {
  try {
    const entry = await _ensureFile();
    await entry.write(_allText);
  } catch (e) {
    try { console.error('Koda log flush failed:', e); } catch (_) { /* noop */ }
  }
}

/**
 * Create the log file and write a header. Returns the native OS path (or '').
 */
export async function initLogger() {
  try {
    await _ensureFile();
    _allText += `=== Koda Sheets debug log ===\n`;
    _allText += `Path: ${_nativePath}\n`;
    _allText += `Started: ${_ts()}\n\n`;
    await _flush();
    return _nativePath;
  } catch (e) {
    try { console.error('initLogger failed:', e); } catch (_) { /* noop */ }
    return '';
  }
}

/** Native OS path of the log file (empty until initLogger resolves). */
export function getLogPath() {
  return _nativePath;
}

/** Log an informational line. */
export function log(...args) {
  const line = _format('LOG', args);
  _allText += line + '\n';
  try { console.log(line); } catch (_) { /* noop */ }
  _scheduleFlush();
}

/** Log an error line. */
export function err(...args) {
  const line = _format('ERR', args);
  _allText += line + '\n';
  try { console.error(line); } catch (_) { /* noop */ }
  _scheduleFlush();
}

/** Force an immediate flush (e.g. before showing the path to the user). */
export async function flushNow() {
  await _flush();
}
