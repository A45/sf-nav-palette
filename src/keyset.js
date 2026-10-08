/**
 * Cursor paging for objects that refuse `queryMore()`.
 *
 * `EntityDefinition` — where the object list comes from — rejects any query
 * whose results span more than one batch:
 *
 *   EntityDefinition does not support queryMore(), use LIMIT to restrict the
 *   results to a single batch   [EXCEEDED_ID_LIMIT]
 *
 * So an org with more than 2,000 objects cannot be read with the normal
 * `nextRecordsUrl` loop at all — the whole query fails and the palette ends up
 * with no objects whatsoever. Instead each batch is fetched with an explicit
 * LIMIT and a `field > lastValue` cursor.
 */

/** Salesforce caps a single batch at 2,000 records. */
export const BATCH_SIZE = 2000;

/** Escape a value for embedding in a SOQL string literal. */
export function soqlEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * One page of a keyset-paged query.
 *
 * @param {object} config  `{ select, where, cursorField, batchSize }`
 * @param {string|null} cursor  last value seen, or null for the first page
 */
export function buildKeysetSoql({ select, where, cursorField, batchSize = BATCH_SIZE }, cursor = null) {
  const clauses = [];
  if (where) clauses.push(where);
  if (cursor !== null && cursor !== undefined) {
    clauses.push(`${cursorField} > '${soqlEscape(cursor)}'`);
  }

  const whereClause = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  return `${select}${whereClause} ORDER BY ${cursorField} LIMIT ${batchSize}`;
}

/**
 * Merge a batch into the accumulator, ignoring records already seen.
 *
 * Deduplication is **required**, not a safety net. `ORDER BY QualifiedApiName`
 * sorts case-insensitively while `QualifiedApiName > 'Profile…'` compares
 * case-sensitively, so lowercase API names sort early but still satisfy the
 * cursor and come back again. On a real org that overlap was 392 of 3,680 rows;
 * deduplicated it landed on exactly the 3,288 the org reports.
 *
 * @returns {number} how many records were new — zero means paging has stalled
 */
export function mergeUnique(seen, records, keyField) {
  let added = 0;
  for (const record of records) {
    const key = record[keyField];
    if (key === undefined || seen.has(key)) continue;
    seen.set(key, record);
    added += 1;
  }
  return added;
}

/**
 * Should paging continue?
 *
 * Stops on a short batch (the end), on no new records (the cursor is stuck and
 * would otherwise loop forever), or on hitting the overall cap.
 */
export function shouldContinue({ batchLength, added, total, batchSize = BATCH_SIZE, max }) {
  if (batchLength < batchSize) return false;
  if (added === 0) return false;
  if (total >= max) return false;
  return true;
}
