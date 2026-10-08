import test from 'node:test';
import assert from 'node:assert/strict';

import {
  objectUrl,
  objectTabUrl,
  fieldUrl,
  apexClassUrl,
  apexTriggerUrl,
  flowUrl,
  absolute,
  OBJECT_TABS
} from '../src/urls.js';

// The DurableId values below are real, taken from PracticeOrg — the whole
// point of these tests is that the shapes are not guessed.
const TICKET_DURABLE = '01Ig5000003ZM8o';
const STAGE_FIELD_DURABLE = '01Ig5000003ZM8o.00Ng500000PtYfV';
const CREATED_BY_DURABLE = '01Ig5000003ZM8o.CreatedBy';

test('custom object uses its 01I durable id', () => {
  assert.equal(objectUrl(TICKET_DURABLE), '/lightning/setup/ObjectManager/01Ig5000003ZM8o/Details/view');
});

test('standard object uses its API name as durable id', () => {
  assert.equal(objectUrl('Account'), '/lightning/setup/ObjectManager/Account/Details/view');
});

test('every object child type maps to a tab', () => {
  for (const childType of Object.keys(OBJECT_TABS)) {
    assert.ok(objectTabUrl(TICKET_DURABLE, childType).includes(OBJECT_TABS[childType]));
  }
});

test('validation rules tab resolves to the Object Manager path', () => {
  assert.equal(
    objectTabUrl('Account', 'validation'),
    '/lightning/setup/ObjectManager/Account/ValidationRules/view'
  );
});

test('an unknown child type fails loudly rather than building a dead link', () => {
  assert.throws(() => objectTabUrl('Account', 'nope'), /Unknown object child type/);
});

test('custom field splits DurableId into entity and field halves', () => {
  assert.equal(
    fieldUrl(STAGE_FIELD_DURABLE),
    '/lightning/setup/ObjectManager/01Ig5000003ZM8o/FieldsAndRelationships/00Ng500000PtYfV/view'
  );
});

test('standard field DurableId resolves the same way', () => {
  assert.equal(
    fieldUrl(CREATED_BY_DURABLE),
    '/lightning/setup/ObjectManager/01Ig5000003ZM8o/FieldsAndRelationships/CreatedBy/view'
  );
});

test('field DurableId splits on the first dot only', () => {
  assert.ok(fieldUrl('Account.Some.Dotted.Name').endsWith('/Some.Dotted.Name/view'));
});

test('a DurableId without a dot is rejected', () => {
  assert.throws(() => fieldUrl('NoDotHere'), /Malformed/);
});

test('apex, trigger and flow ids are URL-encoded into the address param', () => {
  assert.equal(
    apexClassUrl('01pg500000AmLE5AAN'),
    '/lightning/setup/ApexClasses/page?address=%2F01pg500000AmLE5AAN'
  );
  assert.ok(apexTriggerUrl('01q000000000000').includes('/ApexTriggers/page?address=%2F'));
  assert.ok(flowUrl('300g500000nZHWwAAO').includes('/Flows/page?address=%2F'));
});

test('absolute() keeps the jump on the origin we are already on', () => {
  const setupOrigin = 'https://orgfarm-x.develop.my.salesforce-setup.com';
  assert.equal(
    absolute('/lightning/setup/ApexClasses/home', setupOrigin),
    'https://orgfarm-x.develop.my.salesforce-setup.com/lightning/setup/ApexClasses/home'
  );
});
