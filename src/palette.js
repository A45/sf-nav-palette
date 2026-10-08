/**
 * The palette itself: shadow-root UI, keyboard handling, progressive loading.
 *
 * All decision logic lives in pathModel/providers/fuzzy; this module renders
 * their output and turns key presses into calls on them. Keeping it that way
 * is what lets the interaction be tested without a browser.
 */

import {
  LEVEL,
  createPath,
  levelFor,
  advance,
  popSegment,
  setQuery,
  breadcrumb,
  objectContext
} from './pathModel.js';
import {
  candidatesFor,
  sourcesFor,
  needsFields,
  searchCategoryFor,
  exactObjectMatch,
  expandTopObject
} from './providers/index.js';
import { rank } from './fuzzy.js';
import { clampIndex, advanceIndex, growWindow, PAGE_SIZE } from './listNav.js';
import { isSearchable, MIN_SEARCH_CHARS } from './sosl.js';
import { recordUse, topRecents } from './recents.js';

/** Long enough to not fire on every keystroke, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 200;

/** Grow the rendered window once the user scrolls within this much of the end. */
const SCROLL_THRESHOLD_PX = 120;

const state = {
  path: createPath(),
  open: false,
  // `search` holds only the current query's results for searched categories;
  // those are never cached as a full list.
  cache: { fields: {}, search: {} },
  // Sources that hit the record cap, so the UI can say so rather than just
  // ending early.
  truncated: new Set(),
  // Every matching candidate, not just the rendered ones.
  rows: [],
  // How many of `rows` are actually in the DOM. A real org has 3,288 objects;
  // rendering them all makes every keystroke crawl, so the list grows a page at
  // a time as the user scrolls or arrows past the bottom.
  visible: PAGE_SIZE,
  index: 0,
  recents: [],
  status: '',
  // Whether the mouse is currently driving the highlight.
  //
  // Without this, keyboard navigation is unusable: moving the highlight puts a
  // different row under a completely stationary cursor, the browser fires
  // mouseenter on it, and the highlight snaps straight back to whatever the
  // mouse happens to be sitting over. Hover only counts after a real mousemove.
  pointerActive: false
};

let ui = null;

export async function init() {
  ui = await buildUi();

  // Capture phase, on window: Salesforce attaches its own document-level key
  // handlers, and we need to win before they run.
  window.addEventListener('keydown', onGlobalKeydown, true);
  window.addEventListener('keypress', shieldPaletteKeys, true);
  window.addEventListener('keyup', shieldPaletteKeys, true);

  // keys.js got to the window first (document_start), so a page listener
  // registered before this module loaded cannot eat the palette's keys. It
  // stops those events before the listener above, and calls this instead.
  globalThis.__sfNavPaletteKeydown = onGlobalKeydown;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'toggle-palette') toggle();
  });

  // Chrome assigns a suggested shortcut only on first install, and silently
  // leaves it blank if another extension already owns the keys. Ask once, so
  // the palette can say so instead of the shortcut just "not working".
  send({ type: 'get-shortcut' })
    .then((shortcut) => { state.shortcut = shortcut || ''; })
    .catch(() => {});
}

// ─── Open / close ────────────────────────────────────────────────────────────

/**
 * The same keypress can arrive twice: once as the chrome.commands shortcut and
 * once as the in-page fallback (or from a frame relay). Without this guard the
 * palette opened and closed again in the same instant — looking like the key
 * did nothing at all.
 */
const TOGGLE_DEBOUNCE_MS = 300;
let lastToggle = 0;

function toggle() {
  const now = Date.now();
  if (now - lastToggle < TOGGLE_DEBOUNCE_MS) return;
  lastToggle = now;
  if (state.open) close();
  else open();
}

async function open() {
  state.open = true;
  state.path = createPath();
  state.index = 0;
  state.status = '';
  // The cursor may already be sitting wherever the list is about to appear;
  // start with the keyboard in charge so the top row stays selected.
  state.pointerActive = false;
  ui.root.style.display = 'block';
  ui.input.value = '';
  ui.input.focus();

  state.recents = await topRecents();
  render();
  loadForLevel();
}

function close() {
  state.open = false;
  ui.root.style.display = 'none';
  ui.input.blur();
}

// ─── Data loading ────────────────────────────────────────────────────────────

/**
 * Fetch whatever the current level needs, then re-render as each source lands.
 *
 * The root federates over every source, so the first open has several requests
 * in flight at once. Rendering per-arrival — rather than waiting for all of
 * them — is what keeps the palette usable from the first keystroke.
 */
function loadForLevel() {
  const level = levelFor(state.path.segments);

  for (const source of sourcesFor(level, state.path.segments)) {
    if (state.cache[source]) continue;

    send({ type: 'get-source', source })
      .then(({ data, truncated }) => {
        state.cache[source] = data;
        if (truncated) state.truncated.add(source);
        render();
      })
      .catch(showError);
  }

  runSearch();

  if (needsFields(level, state.path.segments)) {
    const entityId = objectContext(state.path.segments).data.durableId;
    if (state.cache.fields[entityId]) return;

    state.status = 'Loading fields…';
    render();

    send({ type: 'get-fields', entityId })
      .then((data) => {
        state.cache.fields[entityId] = data;
        state.status = '';
        render();
      })
      .catch(showError);
  }
}

let searchTimer = null;

/**
 * Server-side type-ahead for categories too large to download.
 *
 * Debounced so a fast typist fires one query instead of six, and guarded
 * against out-of-order replies: a slow response for "jo" must not overwrite
 * the results the user is already seeing for "john".
 */
function runSearch() {
  const level = levelFor(state.path.segments);
  const category = searchCategoryFor(level, state.path.segments);
  if (!category) return;

  clearTimeout(searchTimer);
  const query = state.path.query;

  if (!isSearchable(query)) {
    state.cache.search[category.value] = [];
    state.status = `Type at least ${MIN_SEARCH_CHARS} characters to search ${category.label.toLowerCase()}`;
    render();
    return;
  }

  state.status = 'Searching…';
  render();

  searchTimer = setTimeout(() => {
    send({ type: 'search', category: category.value, query })
      .then((records) => {
        if (state.path.query !== query) return; // the user has typed on
        state.cache.search[category.value] = records;
        state.status = '';
        render();
      })
      .catch(showError);
  }, SEARCH_DEBOUNCE_MS);
}

function send(message) {
  return chrome.runtime.sendMessage(message).then((response) => {
    if (!response?.ok) throw new Error(response?.error || 'No response');
    return response.data;
  });
}

function showError(error) {
  state.status = error.message || String(error);
  render();
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

/**
 * Ctrl/⌘+K and Ctrl/⌘+Shift+K, without Alt.
 *
 * Shift+K is also handled in the page, not only through chrome.commands: when
 * Chrome left the command unassigned (a conflict with another extension), the
 * advertised shortcut otherwise did nothing. When the command *is* assigned the
 * two can both fire — toggle() debounces that.
 */
export function isPaletteKey(event) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && typeof event.key === 'string' && event.key.toLowerCase() === 'k';
}

function onGlobalKeydown(event) {
  // Fallback shortcut. The real one is chrome.commands, because Ctrl+K is a
  // browser-level binding (address bar) that a page cannot always take.
  if (isPaletteKey(event)) {
    event.preventDefault();
    event.stopPropagation();
    toggle();
    return;
  }

  if (!state.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }

  if (fromPalette(event)) {
    // Run our own keys here: stopping the event below means it never reaches
    // the input's listeners.
    onInputKeydown(event);
    event.stopImmediatePropagation();
  }
}

/** True when a key event was typed inside the open palette. */
function fromPalette(event) {
  return state.open && event.target === ui.root;
}

/**
 * Keep the page's own keyboard shortcuts away from the palette's input.
 *
 * The input sits in a closed shadow root, so to Salesforce the event's target
 * is our host <div>, not a text field. Lightning then treats a typed letter as
 * a shortcut ("e" = Edit, "n" = New…) and swallows it, so "e" never appeared
 * in the box. Stopped at the window, in the capture phase, before any page
 * listener sees it. The character still lands: inserting text is the
 * event's default action, which stopping propagation does not cancel.
 */
function shieldPaletteKeys(event) {
  if (fromPalette(event)) event.stopImmediatePropagation();
}

function onInputKeydown(event) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      move(1);
      break;

    case 'ArrowUp':
      event.preventDefault();
      move(-1);
      break;

    case 'Enter':
    case 'Tab':
      event.preventDefault();
      commit();
      break;

    case '>':
      // A typed ">" means the same as Enter — it is the separator people
      // already have in their fingers from other palettes.
      event.preventDefault();
      commit();
      break;

    case 'Backspace':
      // Only steps back out of a segment once the query is empty, so
      // backspace still edits text normally the rest of the time.
      if (ui.input.value === '' && state.path.segments.length > 0) {
        event.preventDefault();
        state.path = popSegment(state.path);
        state.index = 0;
        render();
        loadForLevel();
      }
      break;

    default:
      break;
  }
}

function move(delta) {
  if (state.rows.length === 0) return;

  // The keyboard is now in charge; ignore hover until the mouse actually moves.
  state.pointerActive = false;

  const before = state.visible;
  const next = advanceIndex({
    index: state.index,
    visible: state.visible,
    total: state.rows.length,
    delta
  });

  state.index = next.index;
  state.visible = next.visible;

  // Arrowing past the bottom pulled in another page, so the DOM has to catch
  // up. Otherwise only the highlight moved — and rebuilding the list there is
  // what used to make arrow keys look broken.
  if (next.visible !== before) renderRows();
  updateActive();
}

/** Pick a row by index. Used by pointer selection, which must not rely on state.index. */
function selectAt(index) {
  state.index = index;
  updateActive();
  commit();
}

async function commit() {
  const candidate = state.rows[state.index];
  if (!candidate) return;

  const result = advance(state.path, candidate);

  if (result.navigateTo) {
    await recordUse(state.path.segments, candidate);
    close();
    // Same-origin where possible: Setup and Lightning both serve
    // /lightning/setup/..., so staying on the current host avoids a
    // cross-domain round trip.
    location.assign(new URL(result.navigateTo, location.origin).toString());
    return;
  }

  state.path = result.path;
  state.index = 0;
  ui.input.value = '';
  render();
  loadForLevel();
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function currentCandidates() {
  const level = levelFor(state.path.segments);
  const candidates = candidatesFor(level, state.path.segments, state.cache);

  if (searchCategoryFor(level, state.path.segments) && isSearchable(state.path.query)) {
    // Mid-search the Setup page is not the answer, and it must not occupy the
    // highlighted first row where Enter would take you there instead of to the
    // person you searched for.
    return candidates.filter((candidate) => !candidate.id.startsWith('setuphome:'));
  }

  // Recents only make sense as an opening screen: at the root, with nothing
  // typed. Once the user is drilling or filtering, they are noise.
  if (level === LEVEL.ROOT && !state.path.query && state.recents.length > 0) {
    return [...state.recents, ...candidates];
  }
  return candidates;
}

/**
 * Message under the list: how much is rendered, and whether a source was capped.
 *
 * Without the count, a category holding 3,288 objects looks like it only has 50
 * — which is exactly how the windowing read before it said so.
 */
function listNote() {
  const level = levelFor(state.path.segments);
  const capped = sourcesFor(level, state.path.segments).some((source) => state.truncated.has(source));

  const parts = [];
  if (state.rows.length > state.visible) {
    parts.push(`Showing ${state.visible} of ${state.rows.length} — scroll for more`);
  }
  if (capped) {
    parts.push('Source capped at 10,000 records; refine your search.');
  }
  if (state.shortcut === '') {
    parts.push('Ctrl+Shift+K is not assigned in Chrome (another extension may own it) — set it at chrome://extensions/shortcuts. Ctrl+K works meanwhile.');
  }
  return parts.join(' · ');
}

/**
 * The rows to show, in order.
 *
 * Three shaping rules sit on top of plain ranking, each because something
 * other than the fuzzy score already knows the answer.
 */
function computeRows() {
  const level = levelFor(state.path.segments);

  // 1. A fully typed object name means that object — exactly two rows, with
  //    nothing else competing.
  if (level === LEVEL.ROOT) {
    const focused = exactObjectMatch(state.path.query, state.cache);
    if (focused.length > 0) return focused;
  }

  const candidates = currentCandidates();

  // 2. Server-side search results are already filtered and ordered by the org.
  //    Re-ranking them locally could drop rows Salesforce considered matches —
  //    it searches fields the palette never sees.
  if (searchCategoryFor(level, state.path.segments)) return candidates;

  const ranked = rank(state.path.query, candidates);

  // 3. If the best match is an object, lead with what to do about it. With an
  //    empty box there is no "best match" to lead with.
  return state.path.query ? expandTopObject(ranked) : ranked;
}

function render() {
  state.rows = computeRows();
  state.index = clampIndex(state.index, state.rows.length);

  // A new result set starts from one page again — carrying a grown window over
  // would render hundreds of rows for a query that matches three. The window
  // still has to cover the highlight, though: a background source landing
  // while the user is scrolled deep must not drop the selected row out of the
  // DOM and leave the highlight invisible.
  state.visible = Math.max(PAGE_SIZE, state.index + 1);

  renderCrumbs();
  renderRows();
  updateActive();
}

/**
 * Move the highlight without touching the DOM structure.
 *
 * Toggling a class on rows that already exist keeps the node under the cursor
 * alive between mousedown and mouseup — without that, the browser never fires
 * a click at all.
 */
function updateActive() {
  ui.rowEls.forEach((row, i) => {
    row.classList.toggle('row--active', i === state.index);
  });

  // 'nearest' so the list only scrolls when the row is actually out of view.
  ui.rowEls[state.index]?.scrollIntoView({ block: 'nearest' });
}

function renderCrumbs() {
  ui.crumbs.replaceChildren();
  const labels = breadcrumb(state.path.segments);

  ui.crumbs.style.display = labels.length ? 'flex' : 'none';
  for (const label of labels) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = label;
    ui.crumbs.append(chip);
  }
}

function renderRows() {
  ui.list.replaceChildren();
  ui.rowEls = [];

  if (state.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.status || 'No matches';
    ui.list.append(empty);
    return;
  }

  // Only the window is built. `state.rows` may hold thousands.
  state.rows.slice(0, state.visible).forEach((candidate, i) => {
    const row = document.createElement('div');
    // The active class is applied by updateActive(), not here — this function
    // only builds structure.
    row.className = 'row';

    const text = document.createElement('div');
    text.className = 'row__text';

    const label = document.createElement('div');
    label.className = 'row__label';
    // textContent, never innerHTML — these strings come from org metadata.
    label.textContent = candidate.label;

    text.append(label);

    if (candidate.sublabel) {
      const sub = document.createElement('div');
      sub.className = 'row__sub';
      sub.textContent = candidate.sublabel;
      text.append(sub);
    }

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = candidate.badge || '';

    row.append(text, badge);

    // Hover follows the mouse, but only once the mouse has genuinely moved.
    // A stationary cursor must not steal the highlight back from the keyboard.
    row.addEventListener('mouseenter', () => {
      if (!state.pointerActive) return;
      state.index = i;
      updateActive();
    });

    // pointerdown, not click: click requires mousedown and mouseup to land on
    // the same element, and any re-render in between silently swallows it.
    // preventDefault keeps focus in the input.
    row.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      selectAt(i);
    });

    ui.list.append(row);
    ui.rowEls.push(row);
  });

  const note = state.status || listNote();
  if (note) {
    const el = document.createElement('div');
    el.className = 'status';
    el.textContent = note;
    ui.list.append(el);
  }
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

async function buildUi() {
  // Reloading the extension leaves the old instance's host in an open tab
  // ("Extension context invalidated"). Two palettes on one page fight over
  // focus and keys, so the newest one removes the stale one.
  document.querySelectorAll('#sf-nav-palette-host').forEach((stale) => stale.remove());

  const host = document.createElement('div');
  host.id = 'sf-nav-palette-host';
  host.style.display = 'none';

  // Attached to documentElement, not body: Lightning replaces large parts of
  // the DOM as you navigate, and body is not guaranteed to survive.
  document.documentElement.append(host);

  // Shadow root, or SLDS wins every specificity fight on the page.
  const shadow = host.attachShadow({ mode: 'closed' });

  const sheet = new CSSStyleSheet();
  const css = await fetch(chrome.runtime.getURL('src/palette.css')).then((r) => r.text());
  sheet.replaceSync(css);
  shadow.adoptedStyleSheets = [sheet];

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.addEventListener('click', close);

  const panel = document.createElement('div');
  panel.className = 'panel';

  const crumbs = document.createElement('div');
  crumbs.className = 'crumbs';

  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'text';
  input.placeholder = 'Jump to… (object, apex class, flow, setup page)';
  input.autocomplete = 'off';
  input.spellcheck = false;
  // No keydown listener here: onGlobalKeydown runs onInputKeydown for events
  // from the palette, then stops them before the page's shortcuts see them.
  input.addEventListener('input', () => {
    state.path = setQuery(state.path, input.value);
    state.index = 0;
    // Typing is keyboard intent: the top match should stay selected even if
    // the cursor is parked over some other row.
    state.pointerActive = false;
    render();
    // Searched categories query the org as you type; everything else is
    // already in memory and filtered by render().
    runSearch();
  });

  const list = document.createElement('div');
  list.className = 'list';

  // A real mousemove is the only thing that hands control back to the mouse.
  // Rows appearing under a stationary cursor do not count.
  list.addEventListener('mousemove', () => {
    state.pointerActive = true;
  });

  // Scrolling near the bottom pulls in the next page.
  list.addEventListener('scroll', () => {
    if (state.visible >= state.rows.length) return;

    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining > SCROLL_THRESHOLD_PX) return;

    state.visible = growWindow(state.visible, state.rows.length);
    renderRows();
    updateActive();
  });

  panel.append(crumbs, input, list);
  shadow.append(backdrop, panel);

  return { root: host, crumbs, input, list, rowEls: [] };
}
