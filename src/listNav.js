/**
 * Highlight movement within the result list.
 *
 * Tiny, but pulled out because it is the one part of the selection logic that
 * can be tested without a DOM — and selection is exactly where this palette
 * broke first.
 */

/** How many rows are rendered at a time, and how many more each time we grow. */
export const PAGE_SIZE = 50;

/**
 * Move the highlight, growing the rendered window when it runs off the bottom.
 *
 * Only a window of rows is in the DOM — a real org has 3,288 objects and
 * rendering all of them makes every keystroke crawl. So navigation and the
 * window move together: arrowing past the last rendered row pulls in the next
 * page instead of stopping or wrapping early.
 *
 * Wrapping is deliberately limited to what is already rendered. Wrapping
 * upward from the first row would otherwise have to render all 3,288 rows at
 * once, which is exactly the cost the window exists to avoid.
 *
 * @returns {{index: number, visible: number}}
 */
export function advanceIndex({ index, visible, total, delta, step = PAGE_SIZE }) {
  if (total <= 0) return { index: 0, visible };

  const rendered = Math.min(visible, total);
  const next = index + delta;

  if (next >= rendered) {
    if (rendered < total) {
      const grown = Math.min(total, rendered + step);
      return { index: Math.min(next, grown - 1), visible: grown };
    }
    return { index: 0, visible: rendered }; // wrap to the top
  }

  if (next < 0) return { index: rendered - 1, visible: rendered };

  return { index: next, visible: rendered };
}

/** Grow the window, e.g. when the user scrolls to the bottom of the list. */
export function growWindow(visible, total, step = PAGE_SIZE) {
  return Math.min(total, visible + step);
}

/**
 * Keep an index valid after the candidate list changes underneath it.
 *
 * Typing replaces the whole result set, and an index left pointing past the
 * new end would silently commit the wrong row — or nothing at all.
 */
export function clampIndex(index, length) {
  if (length <= 0) return 0;
  return index >= length ? 0 : Math.max(0, index);
}
