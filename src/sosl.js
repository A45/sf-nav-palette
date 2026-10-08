/**
 * SOSL search for unbounded categories.
 *
 * Most sources here are org *configuration* — objects, Apex classes, permission
 * sets — which top out at a few thousand rows and can simply be downloaded.
 * Users are org *data*: an org can hold a hundred thousand of them, so they are
 * searched on the server and never cached.
 *
 * SOSL rather than SOQL `LIKE '%term%'`: a leading wildcard cannot use an
 * index, so on a large org that query goes slow or times out. SOSL is the
 * indexed text search Salesforce's own lookup fields use.
 */

/** Below this, a search is too broad to be useful and too expensive to run. */
export const MIN_SEARCH_CHARS = 2;

/**
 * Characters SOSL treats as operators. Left unescaped, a user typing "o'brien"
 * or "a+b" produces a malformed query — which the org rejects outright.
 */
const RESERVED = /([?&|!{}[\]()^~*:\\"'+-])/g;

export function escapeTerm(term) {
  return term.replace(RESERVED, '\\$1');
}

/**
 * Build the SOSL for one category's search.
 *
 * A trailing `*` makes it a prefix match, which is what type-ahead should do:
 * "joh" finds Johnson while you are still typing. No leading wildcard — that
 * is the part that would kill performance.
 *
 * @param {object} category catalog entry carrying a `sosl` config
 * @param {string} term     raw user input
 * @param {number} limit    max rows to return
 */
export function buildSearch(category, term, limit = 50) {
  const { object, fields, where, orderBy } = category.sosl;

  const clauses = [fields];
  if (where) clauses.push(`WHERE ${where}`);
  if (orderBy) clauses.push(`ORDER BY ${orderBy}`);
  clauses.push(`LIMIT ${limit}`);

  return `FIND {${escapeTerm(term.trim())}*} IN NAME FIELDS RETURNING ${object}(${clauses.join(' ')})`;
}

/** Whether a query is long enough to bother the org with. */
export function isSearchable(term) {
  return term.trim().length >= MIN_SEARCH_CHARS;
}
