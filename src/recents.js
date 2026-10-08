/**
 * Recently used destinations.
 *
 * Stored in `chrome.storage.local`, deliberately NOT the page's localStorage.
 * Two reasons: that store belongs to Salesforce and polluting it is rude, and
 * it is per-origin — so Setup and Lightning pages would each keep their own
 * half-remembered history, breaking exactly the thing that makes recents
 * useful. Extension storage is shared across all three org hosts.
 */

import { pathKey } from './pathModel.js';

const KEY = 'recents';
const MAX_STORED = 60;
const MAX_SHOWN = 5;

/**
 * Recents record the whole path, not just the final page, so
 * "Ticket › Fields & Relationships" comes back as one unit instead of
 * dropping the user somewhere with no sense of how they arrived.
 */
export async function recordUse(segments, candidate) {
  if (!candidate.url) return;

  const store = await load();
  const key = pathKey(segments, candidate);
  const existing = store[key];

  store[key] = {
    key,
    count: (existing?.count || 0) + 1,
    at: Date.now(),
    crumbs: [...segments.map((segment) => segment.label), candidate.label],
    candidate: {
      id: candidate.id,
      type: candidate.type,
      value: candidate.value,
      label: candidate.label,
      badge: candidate.badge,
      url: candidate.url
    }
  };

  await save(prune(store));
}

/**
 * Top recents as ready-to-render candidates.
 *
 * Ranked by use count first and recency second: the pages you open every day
 * should stay at the top even after one detour into something else.
 */
export async function topRecents(limit = MAX_SHOWN) {
  const store = await load();

  return Object.values(store)
    .sort((a, b) => b.count - a.count || b.at - a.at)
    .slice(0, limit)
    .map((entry) => ({
      ...entry.candidate,
      id: `recent:${entry.key}`,
      sublabel: entry.crumbs.join(' › ')
    }));
}

export async function clearRecents() {
  await chrome.storage.local.remove(KEY);
}

/** Keep the store bounded; drop the least used, oldest first. */
function prune(store) {
  const entries = Object.values(store);
  if (entries.length <= MAX_STORED) return store;

  const kept = entries.sort((a, b) => b.count - a.count || b.at - a.at).slice(0, MAX_STORED);

  return Object.fromEntries(kept.map((entry) => [entry.key, entry]));
}

async function load() {
  const result = await chrome.storage.local.get(KEY);
  return result[KEY] || {};
}

async function save(store) {
  await chrome.storage.local.set({ [KEY]: store });
}
