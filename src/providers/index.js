/**
 * Candidate dispatch.
 *
 * Turns "where is the user in the path" into "what should the list show",
 * including the federated root. Everything the org supplies arrives through
 * the caller-supplied `cache`, so this module stays testable with a fake.
 */

import { LEVEL, TYPE, objectContext, categoryContext } from '../pathModel.js';
import { SETUP_PAGES, CATEGORIES, CATEGORY_CANDIDATES, CATEGORY_BY_VALUE } from '../catalog.js';
import {
  toObjectCandidates,
  toApexCandidates,
  toTriggerCandidates,
  toFlowCandidates,
  toRecordCandidates
} from './remote.js';
import { objectChildCandidates } from './objectChildren.js';
import { toFieldCandidates } from './fields.js';
import { setupHomeUrl, objectUrl } from '../urls.js';

/** Sources pulled into the root search. */
export const SOURCES = CATEGORIES.filter((category) => category.federate).map((category) => category.source);

/**
 * Candidates for the current path, built only from data already in hand.
 *
 * Synchronous on purpose. The root has to render on the first keystroke even
 * though the org queries are still in flight, so anything not yet cached
 * simply contributes nothing this round; the caller re-renders when the data
 * lands and the list fills in underneath the user.
 */
export function candidatesFor(level, segments, cache) {
  switch (level) {
    case LEVEL.ROOT:
      return [...SETUP_PAGES, ...CATEGORY_CANDIDATES, ...federatedRecords(cache)];

    case LEVEL.CATEGORY: {
      const segment = categoryContext(segments);
      const category = segment && CATEGORY_BY_VALUE.get(segment.value);
      if (!category) return [];

      // The Setup landing page stays one keystroke away. Without this row it
      // would be unreachable, since the category no longer resolves to it —
      // and it is where you go to create a new permission set or profile.
      return [openSetupRow(category), ...recordsFor(category, cache)];
    }

    case LEVEL.OBJECT_CHILDREN: {
      const object = objectContext(segments);
      return object ? objectChildCandidates(object) : [];
    }

    case LEVEL.FIELDS: {
      const object = objectContext(segments);
      if (!object) return [];
      return toFieldCandidates(cache.fields?.[object.data.durableId] || []);
    }

    default:
      return [];
  }
}

function openSetupRow(category) {
  return {
    id: `setuphome:${category.setupNode}`,
    type: TYPE.SETUP,
    value: category.setupNode,
    label: `Open ${category.setupLabel || category.label} setup page`,
    sublabel: 'Setup',
    badge: 'SETUP',
    keywords: ['setup', 'home', 'list', 'new'],
    url: setupHomeUrl(category.setupNode)
  };
}

/**
 * Records for one category, using whichever mapper it declares.
 *
 * Objects, apex, triggers and flows need bespoke handling; everything else is
 * a plain list of records and shares the field-driven mapper.
 */
function recordsFor(category, cache) {
  // Searched categories are never cached as a whole list — only the current
  // query's results exist, keyed by category.
  if (category.search) {
    return toRecordCandidates(cache.search?.[category.value] || [], category);
  }

  const data = cache[category.source];

  switch (category.mapper) {
    case 'objects':
      return toObjectCandidates(data || []);
    case 'apex':
      return toApexCandidates(data || []);
    case 'triggers':
      return toTriggerCandidates(data || []);
    case 'flows':
      return toFlowCandidates(data?.definitions || [], data?.views || []);
    default:
      return toRecordCandidates(data || [], category);
  }
}

/** Every federated category's records, flattened for the root list. */
function federatedRecords(cache) {
  return CATEGORIES.filter((category) => category.federate).flatMap((category) =>
    recordsFor(category, cache)
  );
}

/**
 * Which sources the current level needs.
 *
 * The root needs every federated source — that is the cost of not making the
 * user type a category prefix first.
 */
export function sourcesFor(level, segments = []) {
  if (level === LEVEL.ROOT) return SOURCES;

  if (level === LEVEL.CATEGORY) {
    const category = categoryFor(segments);
    // A searched category has nothing to prefetch — its rows arrive per query.
    return category && !category.search ? [category.source] : [];
  }

  return [];
}

/**
 * When the query is the full name of an object, collapse the root to just that
 * object.
 *
 * Typing "Account" otherwise returns a wall of noise — AccountCloneService,
 * AccountSelector, "Account Settings", every flow with Account in its name.
 * Once someone has typed a complete object name, they mean the object, so the
 * answer is two rows and nothing else:
 *
 *   1. browse it   — fields, validation rules, layouts…
 *   2. open it     — the Object Manager detail page
 *
 * Deliberately requires an *exact* match on the label or API name. A prefix
 * rule would swallow "Acc" and make AccountSelector unreachable while the user
 * is still typing; an exact match only ever fires once the name is complete, so
 * partial queries keep the normal federated behaviour.
 *
 * @returns {Array} empty when nothing matches, so callers fall through
 */
export function exactObjectMatch(query, cache) {
  const wanted = (query || '').trim().toLowerCase();
  if (!wanted) return [];

  // A category always beats an object that merely shares its name.
  //
  // Salesforce has an object called `FlowRecord` whose *label* is "Flow", plus
  // real objects named Profile, User, UserRole and PermissionSet. Without this
  // guard, typing "flow" matched that label, collapsed the list to the object,
  // and the Flows category never appeared — which defeats the entire reason
  // categories exist.
  if (matchesCategory(wanted)) return [];

  const matches = (cache.objects || []).filter(
    (record) =>
      (record.Label || '').toLowerCase() === wanted ||
      (record.QualifiedApiName || '').toLowerCase() === wanted
  );

  return toObjectCandidates(matches).flatMap(objectPair);
}

/**
 * Does the query name a category outright?
 *
 * Exact only — "flow" is the Flows category, but "flowrecord" is not, and
 * should still be able to collapse to that object.
 */
export function matchesCategory(query) {
  const wanted = (query || '').trim().toLowerCase();
  if (!wanted) return false;

  return CATEGORIES.some(
    (category) =>
      category.label.toLowerCase() === wanted ||
      (category.keywords || []).some((keyword) => keyword.toLowerCase() === wanted)
  );
}

/**
 * The two rows an object resolves to: browse it, or open it.
 *
 * Selecting the browse row drills into the object's tabs; the setup row is a
 * direct link to its Object Manager page, which otherwise has no entry point.
 */
function objectPair(candidate) {
  return [
    { ...candidate, badge: 'BROWSE', sublabel: 'Browse fields, rules, layouts…', penalty: 0 },
    {
      id: `objectsetup:${candidate.value}`,
      type: TYPE.SETUP,
      value: candidate.value,
      label: `Open ${candidate.label} in Object Manager`,
      sublabel: candidate.value,
      badge: 'SETUP',
      url: objectUrl(candidate.data.durableId)
    }
  ];
}

/**
 * If the best match is an object, expand it into its browse/open pair.
 *
 * A partial query like "acc" should lead with what to do about Account —
 * browse it or open it — rather than making the user select the object and
 * then work out where to go. Everything else stays below, so AccountTrigger
 * and AccountSelector are still one arrow key away.
 *
 * Only the top row expands, and only when it is an object: typing "debug logs"
 * or "AccountSelector" must not be hijacked by an object nobody asked for.
 */
export function expandTopObject(rows) {
  const [first, ...rest] = rows;
  if (!first || first.type !== TYPE.OBJECT) return rows;
  return [...objectPair(first), ...rest];
}

/** The category the path is currently scoped to, or null. */
export function categoryFor(segments) {
  const segment = categoryContext(segments);
  return (segment && CATEGORY_BY_VALUE.get(segment.value)) || null;
}

/** The category needing a server-side search at this level, or null. */
export function searchCategoryFor(level, segments) {
  if (level !== LEVEL.CATEGORY) return null;
  const category = categoryFor(segments);
  return category?.search ? category : null;
}

/** True when this level's data comes per-object rather than from a shared cache. */
export function needsFields(level, segments) {
  return level === LEVEL.FIELDS && objectContext(segments) !== null;
}

export { TYPE };
