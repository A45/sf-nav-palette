/**
 * Drill-down state machine.
 *
 * The palette is a list of committed `segments` plus the `query` the user is
 * currently typing. Which provider supplies candidates is derived purely from
 * the segments — no provider ever mutates state, and no UI code decides what
 * comes next.
 *
 * Pure and dependency-free so the entire interaction can be tested with
 * `node --test`. This is where the real behaviour lives; content.js is only
 * rendering.
 */

/** Which provider should supply candidates for the current path. */
export const LEVEL = {
  ROOT: 'root',
  // One level for every drill-down category (objects, apex, permission sets,
  // profiles…). Which category is in play comes from the scope segment, so
  // adding a category is a data change rather than a new level.
  CATEGORY: 'category',
  OBJECT_CHILDREN: 'objectChildren',
  FIELDS: 'fields'
};

/** Candidate `type` values. Also drives the badge shown on each row. */
export const TYPE = {
  SCOPE: 'scope',
  OBJECT: 'object',
  CHILD_TYPE: 'childType',
  FIELD: 'field',
  APEX: 'apex',
  TRIGGER: 'trigger',
  FLOW: 'flow',
  SETUP: 'setup'
};

export function createPath() {
  return { segments: [], query: '' };
}

/**
 * Which provider feeds the current path.
 *
 * Note the root case: it is federated across every source rather than a menu
 * of categories. Requiring "object >" before a name would add keystrokes to
 * every single navigation, which works directly against the point of the tool.
 */
export function levelFor(segments) {
  if (segments.length === 0) return LEVEL.ROOT;

  const last = segments[segments.length - 1];

  if (last.type === TYPE.SCOPE) return LEVEL.CATEGORY;
  if (last.type === TYPE.OBJECT) return LEVEL.OBJECT_CHILDREN;
  if (last.type === TYPE.CHILD_TYPE && last.value === 'field') return LEVEL.FIELDS;

  return LEVEL.ROOT;
}

/**
 * A terminal candidate navigates instead of drilling deeper.
 *
 * Only objects, the four scope keywords, and the `field` child type continue;
 * everything else — Apex classes, triggers, flows, setup pages, and the other
 * five object tabs — is somewhere you land.
 */
export function isTerminal(candidate) {
  if (candidate.type === TYPE.SCOPE) return false;
  if (candidate.type === TYPE.OBJECT) return false;
  if (candidate.type === TYPE.CHILD_TYPE) return candidate.value !== 'field';
  return true;
}

/**
 * Commit the highlighted candidate.
 *
 * Returns a fresh path plus, when the candidate was terminal, the URL to go to.
 * Callers navigate on `navigateTo` and re-render otherwise — the single entry
 * point for Enter, Tab, ">" and click alike, so all four behave identically.
 */
export function advance(path, candidate) {
  if (isTerminal(candidate)) {
    return { path, navigateTo: candidate.url || null, candidate };
  }

  const segment = {
    type: candidate.type,
    value: candidate.value,
    label: candidate.label,
    data: candidate.data || {}
  };

  return {
    path: { segments: [...path.segments, segment], query: '' },
    navigateTo: null,
    candidate
  };
}

/** Drop the last segment. Backspace on an empty query walks the breadcrumb back. */
export function popSegment(path) {
  if (path.segments.length === 0) return path;
  return { segments: path.segments.slice(0, -1), query: '' };
}

export function setQuery(path, query) {
  return { segments: path.segments, query };
}

/**
 * The object the current path is scoped to, if any.
 *
 * The fields provider needs this: FieldDefinition cannot be queried without an
 * EntityDefinitionId filter, so without an object in the path there is nothing
 * to ask for.
 */
export function objectContext(segments) {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].type === TYPE.OBJECT) return segments[i];
  }
  return null;
}

/** The category segment the path is scoped to, if any — e.g. "permset". */
export function categoryContext(segments) {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].type === TYPE.SCOPE) return segments[i];
  }
  return null;
}

/** Breadcrumb chip labels, oldest first. */
export function breadcrumb(segments) {
  return segments.map((segment) => segment.label);
}

/**
 * Stable key for a committed path, used to store and match recents.
 *
 * Recents record the whole path rather than just the destination so that
 * "Ticket > field" comes back as one unit instead of stranding the user at a
 * page with no way to see how they got there.
 */
export function pathKey(segments, candidate) {
  const parts = segments.map((segment) => `${segment.type}:${segment.value}`);
  if (candidate) parts.push(`${candidate.type}:${candidate.value}`);
  return parts.join('>');
}
