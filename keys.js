/**
 * Early key handling (classic content script, every frame, document_start).
 *
 * Top frame — shield. Runs before any Salesforce script, so its window
 * capture listener is the first one on the page. While focus is in the
 * palette it hands the key to the palette and stops it there. Without this a
 * Salesforce listener registered earlier than the palette ate the plain "e"
 * (its Edit shortcut): "E" typed fine, "e" never appeared. The input sits in a
 * closed shadow root, so to the page the target is our host <div>, not a text
 * field. The character still lands — inserting text is the event's default
 * action, which stopping propagation does not cancel.
 *
 * Sub-frames — relay. Classic Setup pages render inside an iframe. With focus
 * in there, keydown never reaches the top frame's listener, so Ctrl+K /
 * Ctrl+Shift+K did nothing. The frame asks the service worker to toggle the
 * palette in the top frame. It carries no data and reads nothing from the page.
 */

(() => {
  if (window === window.top) {
    const shield = (event) => {
      // By id on the target, not getElementById: after an extension reload a
      // stale host from the old instance can still sit first in the DOM.
      if (event.target?.id !== 'sf-nav-palette-host') return;
      // palette.js (same isolated world) registers its handler here.
      if (event.type === 'keydown') globalThis.__sfNavPaletteKeydown?.(event);
      event.stopImmediatePropagation();
    };
    for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, shield, true);
    return;
  }

  window.addEventListener(
    'keydown',
    (event) => {
      const isPaletteKey =
        (event.ctrlKey || event.metaKey) && !event.altKey && typeof event.key === 'string' && event.key.toLowerCase() === 'k';
      if (!isPaletteKey) return;
      event.preventDefault();
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: 'toggle-from-frame' }).catch(() => {});
    },
    true
  );
})();
