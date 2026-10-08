import test from 'node:test';
import assert from 'node:assert/strict';

import { buildKeysetSoql, soqlEscape, mergeUnique, shouldContinue, BATCH_SIZE } from '../src/keyset.js';

const OBJECTS = {
  select: 'SELECT DurableId, QualifiedApiName, Label FROM EntityDefinition',
  where: 'IsQueryable = true',
  cursorField: 'QualifiedApiName'
};

test('the first page carries only the base filter', () => {
  assert.equal(
    buildKeysetSoql(OBJECTS),
    'SELECT DurableId, QualifiedApiName, Label FROM EntityDefinition WHERE IsQueryable = true ' +
      'ORDER BY QualifiedApiName LIMIT 2000'
  );
});

test('later pages add a cursor filter', () => {
  const soql = buildKeysetSoql(OBJECTS, 'ProfileSkillEndorsement');

  assert.ok(soql.includes("QualifiedApiName > 'ProfileSkillEndorsement'"));
  assert.ok(soql.includes('IsQueryable = true AND'));
});

test('every page carries an explicit LIMIT', () => {
  // Without it EntityDefinition fails outright: "does not support queryMore(),
  // use LIMIT to restrict the results to a single batch".
  assert.ok(buildKeysetSoql(OBJECTS).endsWith(`LIMIT ${BATCH_SIZE}`));
  assert.ok(buildKeysetSoql(OBJECTS, 'Account').endsWith(`LIMIT ${BATCH_SIZE}`));
});

test('batch size is configurable', () => {
  assert.ok(buildKeysetSoql({ ...OBJECTS, batchSize: 500 }).endsWith('LIMIT 500'));
});

test('a config without a where clause still builds', () => {
  const soql = buildKeysetSoql({ select: 'SELECT Id FROM Thing', cursorField: 'Name' });
  assert.equal(soql, 'SELECT Id FROM Thing ORDER BY Name LIMIT 2000');
});

test('a cursor with a quote is escaped', () => {
  assert.equal(soqlEscape("O'Brien"), "O\\'Brien");
  assert.equal(soqlEscape('back\\slash'), 'back\\\\slash');
  assert.ok(buildKeysetSoql(OBJECTS, "O'Brien").includes("> 'O\\'Brien'"));
});

// ─── Deduplication ───────────────────────────────────────────────────────────

test('overlapping batches are deduplicated', () => {
  // The real overlap: ORDER BY is case-insensitive but ">" is case-sensitive,
  // so lowercase API names sort early yet still satisfy the cursor.
  const seen = new Map();

  const added1 = mergeUnique(
    seen,
    [{ QualifiedApiName: 'Account' }, { QualifiedApiName: 'Contact' }],
    'QualifiedApiName'
  );
  const added2 = mergeUnique(
    seen,
    [{ QualifiedApiName: 'Contact' }, { QualifiedApiName: 'banner_setting_c__c' }],
    'QualifiedApiName'
  );

  assert.equal(added1, 2);
  assert.equal(added2, 1, 'Contact was already seen');
  assert.equal(seen.size, 3);
});

test('records missing the key field are skipped rather than stored as undefined', () => {
  const seen = new Map();
  assert.equal(mergeUnique(seen, [{ Other: 'x' }], 'QualifiedApiName'), 0);
  assert.equal(seen.size, 0);
});

test('the first insert wins, so page order is preserved', () => {
  const seen = new Map();
  mergeUnique(seen, [{ QualifiedApiName: 'A', Label: 'first' }], 'QualifiedApiName');
  mergeUnique(seen, [{ QualifiedApiName: 'A', Label: 'second' }], 'QualifiedApiName');

  assert.equal(seen.get('A').Label, 'first');
});

// ─── Loop control ────────────────────────────────────────────────────────────

test('a full batch with new records keeps paging', () => {
  assert.equal(shouldContinue({ batchLength: 2000, added: 1500, total: 2000, max: 10000 }), true);
});

test('a short batch ends paging', () => {
  assert.equal(shouldContinue({ batchLength: 1680, added: 1680, total: 3680, max: 10000 }), false);
});

test('a full batch of nothing new ends paging instead of looping forever', () => {
  // Guards against a stuck cursor — every row already seen means no progress.
  assert.equal(shouldContinue({ batchLength: 2000, added: 0, total: 2000, max: 10000 }), false);
});

test('the overall cap ends paging', () => {
  assert.equal(shouldContinue({ batchLength: 2000, added: 2000, total: 10000, max: 10000 }), false);
});
