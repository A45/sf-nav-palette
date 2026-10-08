import test from 'node:test';
import assert from 'node:assert/strict';

import { clampIndex, advanceIndex, growWindow, PAGE_SIZE } from '../src/listNav.js';

// ─── Windowed navigation ─────────────────────────────────────────────────────
//
// A real org has 3,288 objects. Only a window of them is ever in the DOM, so
// the highlight and the window have to move together.

test('moving within the rendered window does not grow it', () => {
  assert.deepEqual(advanceIndex({ index: 5, visible: 50, total: 3288, delta: 1 }), {
    index: 6,
    visible: 50
  });
});

test('arrowing past the last rendered row pulls in the next page', () => {
  const result = advanceIndex({ index: 49, visible: 50, total: 3288, delta: 1 });

  assert.equal(result.visible, 100, 'window should grow by one page');
  assert.equal(result.index, 50, 'and land on the newly revealed row');
});

test('the window stops growing at the total', () => {
  const result = advanceIndex({ index: 59, visible: 60, total: 65, delta: 1 });
  assert.equal(result.visible, 65);
  assert.equal(result.index, 60);
});

test('at the true end it wraps to the top', () => {
  assert.deepEqual(advanceIndex({ index: 64, visible: 65, total: 65, delta: 1 }), {
    index: 0,
    visible: 65
  });
});

test('arrowing up from the top wraps only within what is rendered', () => {
  // Wrapping to row 3,287 would mean rendering every row — the exact cost the
  // window exists to avoid.
  const result = advanceIndex({ index: 0, visible: 50, total: 3288, delta: -1 });

  assert.equal(result.index, 49);
  assert.equal(result.visible, 50, 'and must not grow the window');
});

test('an empty result set stays put', () => {
  assert.deepEqual(advanceIndex({ index: 0, visible: 50, total: 0, delta: 1 }), {
    index: 0,
    visible: 50
  });
});

test('visible never exceeds total', () => {
  const result = advanceIndex({ index: 2, visible: 50, total: 3, delta: 1 });
  assert.equal(result.visible, 3);
});

test('growWindow adds a page and stops at the total', () => {
  assert.equal(growWindow(50, 3288), 50 + PAGE_SIZE);
  assert.equal(growWindow(3280, 3288), 3288);
  assert.equal(growWindow(50, 50), 50);
});

test('a fully rendered short list wraps at both ends', () => {
  // Everything fits, so there is no window to grow — plain wrap-around.
  assert.deepEqual(advanceIndex({ index: 4, visible: 5, total: 5, delta: 1 }), { index: 0, visible: 5 });
  assert.deepEqual(advanceIndex({ index: 0, visible: 5, total: 5, delta: -1 }), { index: 4, visible: 5 });
});

test('a single row always stays selected', () => {
  assert.deepEqual(advanceIndex({ index: 0, visible: 1, total: 1, delta: 1 }), { index: 0, visible: 1 });
  assert.deepEqual(advanceIndex({ index: 0, visible: 1, total: 1, delta: -1 }), { index: 0, visible: 1 });
});

test('clampIndex resets when the list shrank past the index', () => {
  // Typing narrows the results; an index left pointing past the end would
  // commit the wrong row.
  assert.equal(clampIndex(9, 3), 0);
});

test('clampIndex leaves a valid index alone', () => {
  assert.equal(clampIndex(2, 5), 2);
});

test('clampIndex handles an emptied list', () => {
  assert.equal(clampIndex(4, 0), 0);
});

test('clampIndex never returns a negative index', () => {
  assert.equal(clampIndex(-3, 5), 0);
});
