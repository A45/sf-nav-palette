/**
 * Service worker: the only place that touches credentials or the network.
 *
 * Content scripts cannot read the `sid` cookie — it is httpOnly — so every org
 * query is brokered here. This is the same approach Salesforce Inspector uses.
 *
 * SECURITY: the session id is a live credential. It stays in this worker's
 * memory for the duration of a request and is never logged, never written to
 * storage, and never sent to a content script.
 */

import { apiOriginFor, queryUrl, searchUrl } from './src/org.js';
import { CATEGORY_BY_VALUE } from './src/catalog.js';
import { buildSearch } from './src/sosl.js';
import { buildKeysetSoql, mergeUnique, shouldContinue, BATCH_SIZE } from './src/keyset.js';

/**
 * Ceiling on how many rows one source may cache.
 *
 * Salesforce returns 2,000 rows per response and we follow nextRecordsUrl, so
 * without a stop a pathological org could pull a very long way. When this bites
 * the caller is told, because the previous behaviour — a bare `LIMIT 2000` in
 * every query — truncated silently, and an admin had no way to know a class or
 * permission set was simply missing from the palette.
 */
const MAX_RECORDS = 10000;

/** Rows returned by a type-ahead search. */
const SEARCH_LIMIT = 50;

/**
 * Per-origin cache of org data.
 *
 * Held in the worker rather than chrome.storage.session because a service
 * worker can be torn down at any time and refetching 1,300 rows is cheaper
 * than reasoning about a stale persisted copy. A torn-down worker simply
 * refetches on the next request.
 */
const cache = new Map();

// No LIMIT clauses: a LIMIT caps the whole result set, which makes the
// pagination below unreachable and silently drops everything past the cutoff.
// Volume is bounded by MAX_RECORDS instead, which reports when it bites.
const QUERIES = {
  objects: {
    // EntityDefinition refuses queryMore() outright — an org with more than
    // 2,000 objects made the whole query fail, which left the palette with no
    // objects at all. Paged with an explicit LIMIT and a cursor instead.
    keyset: {
      select: 'SELECT DurableId, QualifiedApiName, Label FROM EntityDefinition',
      where: 'IsQueryable = true',
      cursorField: 'QualifiedApiName'
    }
  },
  apex: {
    tooling: true,
    soql: 'SELECT Id, Name FROM ApexClass WHERE NamespacePrefix = null ORDER BY Name'
  },
  triggers: {
    tooling: true,
    soql:
      'SELECT Id, Name, EntityDefinition.QualifiedApiName FROM ApexTrigger ' +
      'WHERE NamespacePrefix = null ORDER BY Name'
  },
  permissionSets: {
    // IsOwnedByProfile excludes the hidden permission set that backs every
    // profile — those are not things an admin navigates to.
    soql: 'SELECT Id, Name, Label FROM PermissionSet WHERE IsOwnedByProfile = false ORDER BY Label'
  },
  permissionSetGroups: {
    soql: 'SELECT Id, DeveloperName, MasterLabel FROM PermissionSetGroup ORDER BY MasterLabel'
  },
  profiles: {
    soql: 'SELECT Id, Name FROM Profile ORDER BY Name'
  },
  roles: {
    soql: 'SELECT Id, Name FROM UserRole ORDER BY Name'
  }
  // No `users` entry: users are searched, not listed. See catalog.js.
};

// ─── Shortcut ────────────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;
  await togglePalette();
});

// Clicking the toolbar icon does the same thing. Keyboard is the point of this
// tool, but a visible affordance matters: it is how a first-time user — and a
// Web Store reviewer — discovers that the extension does anything at all.
chrome.action.onClicked.addListener(() => togglePalette());

/** The key Chrome actually bound — '' when the suggested one was not assigned. */
async function currentShortcut() {
  const commands = await chrome.commands.getAll();
  return commands.find((c) => c.name === 'open-palette')?.shortcut || '';
}

async function togglePalette() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // The content script is only injected on Salesforce hosts, so on any other
  // tab this message has no receiver — swallow that rather than surfacing an
  // unhandled rejection.
  chrome.tabs.sendMessage(tab.id, { type: 'toggle-palette' }).catch(() => {});
}

// ─── Message broker ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));

  return true; // keep the channel open for the async reply
});

async function handle(message, sender) {
  const apiOrigin = apiOriginFor(sender.tab?.url || '');
  if (!apiOrigin) throw new Error('Not a Salesforce tab');

  switch (message.type) {
    case 'get-shortcut':
      return currentShortcut();
    case 'toggle-from-frame':
      // A keypress inside a Setup iframe: the palette lives in the top frame,
      // so relay there. Without this, focus inside an iframe made the keys dead.
      if (sender.tab?.id != null) chrome.tabs.sendMessage(sender.tab.id, { type: 'toggle-palette' }, { frameId: 0 }).catch(() => {});
      return true;
    case 'get-source':
      return getSource(apiOrigin, message.source);
    case 'get-fields':
      return getFields(apiOrigin, message.entityId);
    case 'search':
      return searchCategory(apiOrigin, message.category, message.query);    default:
      throw new Error(`Unknown message: ${message.type}`);
  }
}

/**
 * Type-ahead search for a category too large to cache.
 *
 * Never cached: the result depends on the query, and the whole reason this
 * path exists is that the full set does not fit in memory.
 */
async function searchCategory(apiOrigin, categoryValue, query) {
  const category = CATEGORY_BY_VALUE.get(categoryValue);
  if (!category?.sosl) throw new Error(`Category is not searchable: ${categoryValue}`);

  const sessionId = await getSessionId(apiOrigin);
  const sosl = buildSearch(category, query, SEARCH_LIMIT);

  const response = await fetch(searchUrl(apiOrigin, sosl), {
    headers: { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' }
  });

  if (!response.ok) throw new Error(`Salesforce search ${response.status}`);

  const body = await response.json();
  return body.searchRecords || [];
}

// ─── Sources ─────────────────────────────────────────────────────────────────

function bucket(apiOrigin) {
  if (!cache.has(apiOrigin)) cache.set(apiOrigin, { fields: {} });
  return cache.get(apiOrigin);
}

/**
 * @returns {{data: *, truncated: boolean}} `truncated` is passed all the way to
 *   the UI so a capped list says so instead of quietly ending early.
 */
async function getSource(apiOrigin, source) {
  const store = bucket(apiOrigin);
  if (store[source]) return store[source];

  if (source === 'flows') {
    const value = await fetchFlows(apiOrigin);
    store[source] = value;
    return value;
  }

  const query = QUERIES[source];
  if (!query) throw new Error(`Unknown source: ${source}`);

  const { records, truncated } = query.keyset
    ? await fetchKeyset(apiOrigin, query.keyset)
    : await fetchQuery(apiOrigin, query);

  const value = { data: records, truncated };

  store[source] = value;
  return value;
}

/**
 * Flows need two queries joined — neither alone is enough.
 *
 * Tooling FlowDefinition holds the only navigable id; FlowDefinitionView holds
 * the only usable labels. The view query is allowed to fail without taking the
 * whole source down: unlabelled-but-reachable flows beat no flows at all.
 */
async function fetchFlows(apiOrigin) {
  const definitions = await fetchQuery(apiOrigin, {
    tooling: true,
    soql: 'SELECT Id, DeveloperName FROM FlowDefinition ORDER BY DeveloperName'
  });

  let views = [];
  try {
    // Also a view that cannot queryMore. Only used to prettify labels, and the
    // whole call is already allowed to fail, so a LIMIT is the right trade.
    ({ records: views } = await fetchQuery(apiOrigin, {
      soql: `SELECT ApiName, Label FROM FlowDefinitionView LIMIT ${BATCH_SIZE}`
    }));
  } catch {
    views = [];
  }

  return {
    data: { definitions: definitions.records, views },
    truncated: definitions.truncated
  };
}

async function getFields(apiOrigin, entityId) {
  const store = bucket(apiOrigin);
  if (store.fields[entityId]) return store.fields[entityId];

  // EntityDefinitionId is not optional — FieldDefinition rejects any query
  // without a filter on it ("a filter on a reified column is required").
  // LIMIT is deliberate: FieldDefinition is reified like EntityDefinition and
  // rejects queryMore(), so a result spanning two batches would fail outright.
  // Salesforce caps fields per object well below 2,000, so nothing is lost.
  const { records } = await fetchQuery(apiOrigin, {
    soql:
      'SELECT DurableId, QualifiedApiName, Label, DataType FROM FieldDefinition ' +
      `WHERE EntityDefinitionId = '${entityId.replace(/'/g, "\\'")}' ` +
      `ORDER BY QualifiedApiName LIMIT ${BATCH_SIZE}`
  });

  store.fields[entityId] = records;
  return records;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

/**
 * Run a SOQL query, following pagination up to MAX_RECORDS.
 *
 * Salesforce returns 2,000 rows per response and exposes the rest through
 * `nextRecordsUrl`. The queries above carry no LIMIT, precisely so this loop
 * can do its job — a `LIMIT 2000` would cap the whole result set, leave `done`
 * permanently true, and drop the remainder without a word.
 *
 * @returns {{records: Array, truncated: boolean}}
 */
/**
 * Fetch a source that cannot use queryMore(), one LIMITed batch at a time.
 *
 * Deduplication is essential rather than defensive: `ORDER BY QualifiedApiName`
 * sorts case-insensitively while `QualifiedApiName > '…'` compares
 * case-sensitively, so lowercase API names sort early and still satisfy the
 * cursor. On a real org that overlap was 392 of 3,680 rows fetched; deduplicated
 * it landed on exactly the 3,288 objects the org reports.
 *
 * @returns {{records: Array, truncated: boolean}}
 */
async function fetchKeyset(apiOrigin, config) {
  const seen = new Map();
  let cursor = null;
  let truncated = false;

  for (;;) {
    const soql = buildKeysetSoql(config, cursor);
    const { records } = await fetchQuery(apiOrigin, { soql, tooling: config.tooling });

    const added = mergeUnique(seen, records, config.cursorField);

    if (!shouldContinue({ batchLength: records.length, added, total: seen.size, max: MAX_RECORDS })) {
      truncated = records.length >= BATCH_SIZE && seen.size >= MAX_RECORDS;
      break;
    }

    cursor = records[records.length - 1][config.cursorField];
  }

  return { records: [...seen.values()], truncated };
}

async function fetchQuery(apiOrigin, { soql, tooling = false }) {
  const sessionId = await getSessionId(apiOrigin);

  let url = queryUrl(apiOrigin, soql, { tooling });
  const records = [];
  let truncated = false;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' }
    });

    if (!response.ok) {
      // Deliberately does not include the response body — Salesforce error
      // payloads can echo the request, and the request carries the session id.
      throw new Error(`Salesforce API ${response.status}`);
    }

    const body = await response.json();
    records.push(...(body.records || []));

    if (records.length >= MAX_RECORDS) {
      records.length = MAX_RECORDS;
      truncated = true;
      break;
    }

    url = body.done === false && body.nextRecordsUrl ? `${apiOrigin}${body.nextRecordsUrl}` : null;
  }

  return { records, truncated };
}

async function getSessionId(apiOrigin) {
  const cookie = await chrome.cookies.get({ url: apiOrigin, name: 'sid' });

  // The sid on the Lightning host is a different, non-API token; only the one
  // on the my.salesforce.com host authenticates REST calls.
  if (!cookie?.value) throw new Error('Not logged in to this org');
  return cookie.value;
}
