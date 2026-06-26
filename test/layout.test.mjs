/**
 * layout.test.mjs — Self-contained unit tests for units.js and layout.js.
 * No external test framework.  Run with:
 *   node "test/layout.test.mjs"
 * Exits with code 0 on success, 1 on any failure.
 */

import assert from 'node:assert';
import { mmToPx, mmToPxRound, pxToMm, ptToPx, MM_PER_INCH } from '../src/engine/units.js';
import { computeLayout, mirrorIndex } from '../src/engine/layout.js';

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Assert that no two slots overlap.
 * Two axis-aligned rectangles overlap when they overlap on BOTH axes
 * (strictly—cards that merely share an edge are not overlapping).
 */
function assertNoOverlap(slots) {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      const overlapX = a.xPx + a.wPx > b.xPx && b.xPx + b.wPx > a.xPx;
      const overlapY = a.yPx + a.hPx > b.yPx && b.yPx + b.hPx > a.yPx;
      if (overlapX && overlapY) {
        throw new Error(
          `Slots ${a.index} and ${b.index} overlap: ` +
          `[${a.xPx.toFixed(2)},${a.yPx.toFixed(2)} ${a.wPx.toFixed(2)}×${a.hPx.toFixed(2)}] ` +
          `vs [${b.xPx.toFixed(2)},${b.yPx.toFixed(2)} ${b.wPx.toFixed(2)}×${b.hPx.toFixed(2)}]`
        );
      }
    }
  }
}

/**
 * Assert that every slot fits entirely within the paper bounds.
 * Uses a tiny epsilon to tolerate floating-point rounding at the boundary.
 */
function assertInBounds(slots, paperWpx, paperHpx) {
  const EPS = 1e-6;
  for (const s of slots) {
    if (s.xPx < -EPS)
      throw new Error(`Slot ${s.index}: xPx ${s.xPx.toFixed(6)} < 0`);
    if (s.yPx < -EPS)
      throw new Error(`Slot ${s.index}: yPx ${s.yPx.toFixed(6)} < 0`);
    if (s.xPx + s.wPx > paperWpx + EPS)
      throw new Error(
        `Slot ${s.index}: right edge ${(s.xPx + s.wPx).toFixed(6)} > paperW ${paperWpx.toFixed(6)}`
      );
    if (s.yPx + s.hPx > paperHpx + EPS)
      throw new Error(
        `Slot ${s.index}: bottom edge ${(s.yPx + s.hPx).toFixed(6)} > paperH ${paperHpx.toFixed(6)}`
      );
  }
}

// ---------------------------------------------------------------------------
// Tests: units.js
// ---------------------------------------------------------------------------

test('MM_PER_INCH equals 25.4', () => {
  assert.strictEqual(MM_PER_INCH, 25.4);
});

test('mmToPx basic', () => {
  // 25.4 mm = 1 inch → ppi pixels
  assert.strictEqual(mmToPx(25.4, 300), 300);
  assert.strictEqual(mmToPx(25.4, 1200), 1200);
  assert.strictEqual(mmToPx(0, 1200), 0);
});

test('mmToPxRound rounds correctly', () => {
  // 1 mm at 300 dpi = 300/25.4 ≈ 11.811…  → rounds to 12
  assert.strictEqual(mmToPxRound(1, 300), 12);
  assert.strictEqual(mmToPxRound(25.4, 1200), 1200);
});

test('pxToMm is inverse of mmToPx', () => {
  const EPS = 1e-9;
  for (const mm of [0, 1, 6, 25.4, 63, 88, 210, 297]) {
    const px = mmToPx(mm, 1200);
    const back = pxToMm(px, 1200);
    assert(
      Math.abs(back - mm) < EPS,
      `Round-trip failed for ${mm} mm: got ${back}`
    );
  }
});

test('ptToPx: 72 pt = 1 inch = ppi px', () => {
  const ppi = 1200;
  const EPS = 1e-9;
  assert(Math.abs(ptToPx(72, ppi) - ppi) < EPS, `72 pt should be ${ppi} px`);
  // 0.25 pt cut-mark stroke at 1200 ppi
  const expected025 = (0.25 / 72) * 1200;
  assert(
    Math.abs(ptToPx(0.25, ppi) - expected025) < EPS,
    `0.25 pt at 1200 ppi should be ${expected025} px`
  );
});

// ---------------------------------------------------------------------------
// Tests: computeLayout
// ---------------------------------------------------------------------------

test('Poker 63×88 on US Letter 216×279 — cols=3, rows=3, count=9', () => {
  /*
   * usableW = 216 - 2×6 = 204 mm
   * usableH = 279 - 2×6 = 267 mm
   *
   * Upright (63×88):
   *   cols = floor(204/63) = floor(3.238…) = 3
   *   rows = floor(267/88) = floor(3.034…) = 3  → count = 9
   *
   * Rotated (88×63):
   *   cols = floor(204/88) = floor(2.318…) = 2
   *   rows = floor(267/63) = floor(4.238…) = 4  → count = 8
   *
   * Upright wins.  Block: 189×264 mm centred in 204×267 mm usable area.
   * offset X = (204-189)/2 = 7.5 mm,  offset Y = (267-264)/2 = 1.5 mm
   * startX = 6+7.5 = 13.5 mm,  startY = 6+1.5 = 7.5 mm
   */
  const ppi = 1200;
  const layout = computeLayout({
    paperW: 216, paperH: 279,
    cardW: 63, cardH: 88,
    margin: 6, gutter: 0,
    ppi,
  });

  assert.strictEqual(layout.cols, 3,   `cols: expected 3, got ${layout.cols}`);
  assert.strictEqual(layout.rows, 3,   `rows: expected 3, got ${layout.rows}`);
  assert.strictEqual(layout.count, 9,  `count: expected 9, got ${layout.count}`);
  assert.strictEqual(layout.rotated, false, 'Expected upright (rotated=false)');
  assert.strictEqual(layout.slots.length, 9, 'Should have 9 slots');

  // Spot-check first and last slot positions (mm).
  const EPS = 1e-9;
  const s0 = layout.slots[0];
  assert(Math.abs(s0.xMm - 13.5) < EPS, `slot[0].xMm expected 13.5, got ${s0.xMm}`);
  assert(Math.abs(s0.yMm - 7.5)  < EPS, `slot[0].yMm expected 7.5,  got ${s0.yMm}`);

  const s8 = layout.slots[8];
  // col=2, row=2 → x=13.5+2×63=139.5, y=7.5+2×88=183.5
  assert(Math.abs(s8.xMm - 139.5) < EPS, `slot[8].xMm expected 139.5, got ${s8.xMm}`);
  assert(Math.abs(s8.yMm - 183.5) < EPS, `slot[8].yMm expected 183.5, got ${s8.yMm}`);

  // Geometry invariants.
  assertInBounds(layout.slots, mmToPx(216, ppi), mmToPx(279, ppi));
  assertNoOverlap(layout.slots);

  // Row-major index sanity.
  for (let i = 0; i < layout.slots.length; i++) {
    assert.strictEqual(layout.slots[i].index, i, `Slot ${i} has wrong index`);
  }

  console.log(`      → cols=${layout.cols}, rows=${layout.rows}, count=${layout.count}`);
});

test('A4 210×297 with Tarot 70×120 — cols=3, rows=2, count=6', () => {
  /*
   * usableW = 210, usableH = 297  (margin=0)
   *
   * Upright (70×120):
   *   cols = floor(210/70) = 3
   *   rows = floor(297/120) = floor(2.475) = 2  → count = 6
   *
   * Rotated (120×70):
   *   cols = floor(210/120) = floor(1.75) = 1
   *   rows = floor(297/70)  = floor(4.24) = 4  → count = 4
   *
   * Upright wins.
   */
  const ppi = 300;
  const layout = computeLayout({
    paperW: 210, paperH: 297,
    cardW: 70, cardH: 120,
    margin: 0, gutter: 0,
    ppi,
  });

  assert.strictEqual(layout.cols,  3, `cols: expected 3, got ${layout.cols}`);
  assert.strictEqual(layout.rows,  2, `rows: expected 2, got ${layout.rows}`);
  assert.strictEqual(layout.count, 6, `count: expected 6, got ${layout.count}`);
  assert.strictEqual(layout.rotated, false, 'Expected upright');

  assertInBounds(layout.slots, mmToPx(210, ppi), mmToPx(297, ppi));
  assertNoOverlap(layout.slots);
});

test('Rotation yields more cards than upright', () => {
  /*
   * Paper 100×150 mm, card 60×40 mm.
   *
   * Upright (60×40):
   *   cols = floor(100/60) = 1
   *   rows = floor(150/40) = 3  → count = 3
   *
   * Rotated (40×60):
   *   cols = floor(100/40) = 2
   *   rows = floor(150/60) = 2  → count = 4  ← wins
   */
  const ppi = 300;
  const layout = computeLayout({
    paperW: 100, paperH: 150,
    cardW: 60, cardH: 40,
    margin: 0, gutter: 0,
    ppi,
    allowRotate: true,
  });

  assert.strictEqual(layout.rotated, true,  'Expected rotated=true');
  assert.strictEqual(layout.cols,  2, `cols: expected 2, got ${layout.cols}`);
  assert.strictEqual(layout.rows,  2, `rows: expected 2, got ${layout.rows}`);
  assert.strictEqual(layout.count, 4, `count: expected 4, got ${layout.count}`);
  // After rotation the card footprint is 40×60 mm.
  assert.strictEqual(layout.cardWmm, 40, `cardWmm expected 40, got ${layout.cardWmm}`);
  assert.strictEqual(layout.cardHmm, 60, `cardHmm expected 60, got ${layout.cardHmm}`);

  assertInBounds(layout.slots, mmToPx(100, ppi), mmToPx(150, ppi));
  assertNoOverlap(layout.slots);
});

test('allowRotate=false always uses upright even when rotation would win', () => {
  const layout = computeLayout({
    paperW: 100, paperH: 150,
    cardW: 60, cardH: 40,
    margin: 0, gutter: 0,
    ppi: 300,
    allowRotate: false,
  });
  assert.strictEqual(layout.rotated, false, 'Expected rotated=false when allowRotate=false');
  assert.strictEqual(layout.count, 3, `count: expected 3 (upright), got ${layout.count}`);
});

test('reserveGutterForMarks lifts gutter=0 to 2 mm', () => {
  /*
   * With reserveGutterForMarks=true and gutter=0 the effective gutter
   * becomes MIN_GUTTER_FOR_MARKS_MM = 2 mm, so the count should be
   * what you'd compute with gutter=2.
   *
   * Paper 200×200, card 50×50, margin=0, effectiveGutter=2
   *   cols = floor((200+2)/(50+2)) = floor(202/52) = floor(3.884) = 3
   *   rows = same = 3  → count = 9
   *
   * Compare with gutter=0:
   *   cols = floor(200/50) = 4  → count=16  (more, but marks=false)
   */
  const ppi = 300;
  const layout = computeLayout({
    paperW: 200, paperH: 200,
    cardW: 50, cardH: 50,
    margin: 0, gutter: 0,
    ppi,
    reserveGutterForMarks: true,
  });
  assert.strictEqual(layout.cols,  3, `cols: expected 3, got ${layout.cols}`);
  assert.strictEqual(layout.rows,  3, `rows: expected 3, got ${layout.rows}`);
  assert.strictEqual(layout.count, 9, `count: expected 9, got ${layout.count}`);

  assertInBounds(layout.slots, mmToPx(200, ppi), mmToPx(200, ppi));
  assertNoOverlap(layout.slots);
});

test('Gutter spacing is correct between adjacent slots', () => {
  const gutter = 5;
  const ppi = 300;
  const layout = computeLayout({
    paperW: 200, paperH: 200,
    cardW: 60, cardH: 60,
    margin: 0, gutter,
    ppi,
  });
  // All horizontally adjacent pairs should have the right gap.
  const gutterPx = mmToPx(gutter, ppi);
  const EPS = 1e-6;
  for (const s of layout.slots) {
    if (s.col + 1 < layout.cols) {
      const next = layout.slots[s.index + 1];
      const gap = next.xPx - (s.xPx + s.wPx);
      assert(
        Math.abs(gap - gutterPx) < EPS,
        `Row ${s.row}: gap between col ${s.col} and ${s.col + 1} is ${gap.toFixed(4)} px, expected ${gutterPx.toFixed(4)} px`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Tests: mirrorIndex
// ---------------------------------------------------------------------------

test('mirrorIndex — 3-column grid', () => {
  // Row 0: indices 0 1 2  →  mirrors 2 1 0
  // Row 1: indices 3 4 5  →  mirrors 5 4 3
  assert.strictEqual(mirrorIndex(0, 3), 2, 'index 0 → 2');
  assert.strictEqual(mirrorIndex(1, 3), 1, 'index 1 → 1 (centre)');
  assert.strictEqual(mirrorIndex(2, 3), 0, 'index 2 → 0');
  assert.strictEqual(mirrorIndex(3, 3), 5, 'index 3 → 5');
  assert.strictEqual(mirrorIndex(4, 3), 4, 'index 4 → 4 (centre)');
  assert.strictEqual(mirrorIndex(5, 3), 3, 'index 5 → 3');
});

test('mirrorIndex — 2-column grid', () => {
  assert.strictEqual(mirrorIndex(0, 2), 1, 'index 0 → 1');
  assert.strictEqual(mirrorIndex(1, 2), 0, 'index 1 → 0');
  assert.strictEqual(mirrorIndex(2, 2), 3, 'index 2 → 3');
  assert.strictEqual(mirrorIndex(3, 2), 2, 'index 3 → 2');
});

test('mirrorIndex is its own inverse', () => {
  for (let cols = 1; cols <= 5; cols++) {
    for (let index = 0; index < cols * 3; index++) {
      const m = mirrorIndex(mirrorIndex(index, cols), cols);
      assert.strictEqual(m, index, `mirrorIndex(mirrorIndex(${index}, ${cols})) should be ${index}, got ${m}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
