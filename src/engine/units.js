/**
 * units.js — Pure unit-conversion utilities.
 * No Photoshop/UXP dependencies; safe for Node unit tests.
 */

/** Millimetres per inch (exact, by SI definition). */
export const MM_PER_INCH = 25.4;

/**
 * Convert millimetres to pixels at the given PPI.
 * Result may be fractional; round only at the px boundary in callers.
 * @param {number} mm
 * @param {number} ppi  pixels per inch
 * @returns {number}
 */
export function mmToPx(mm, ppi) {
  return (mm / MM_PER_INCH) * ppi;
}

/**
 * Convert millimetres to pixels, rounded to the nearest integer.
 * @param {number} mm
 * @param {number} ppi
 * @returns {number}
 */
export function mmToPxRound(mm, ppi) {
  return Math.round(mmToPx(mm, ppi));
}

/**
 * Convert pixels to millimetres at the given PPI.
 * @param {number} px
 * @param {number} ppi
 * @returns {number}
 */
export function pxToMm(px, ppi) {
  return (px / ppi) * MM_PER_INCH;
}

/**
 * Convert typographic points to pixels at the given PPI.
 * 1 pt = 1/72 inch.  Used for thin cut-mark strokes (e.g. 0.25 pt).
 * @param {number} pt
 * @param {number} ppi
 * @returns {number}
 */
export function ptToPx(pt, ppi) {
  return (pt / 72) * ppi;
}
