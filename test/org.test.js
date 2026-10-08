import test from 'node:test';
import assert from 'node:assert/strict';

import { apiOriginFor, isSalesforceUrl, queryUrl, API_VERSION } from '../src/org.js';

// This is the real host shape of PracticeOrg. Note the extra ".develop" label:
// a naive split on the first dot would mangle it.
const LIGHTNING = 'https://orgfarm-5f99a22e56-dev-ed.develop.lightning.force.com/lightning/o/Account/list';
const SETUP =
  'https://orgfarm-5f99a22e56-dev-ed.develop.my.salesforce-setup.com/lightning/setup/ApexClasses/home';
const API = 'https://orgfarm-5f99a22e56-dev-ed.develop.my.salesforce.com/services/data';

const EXPECTED = 'https://orgfarm-5f99a22e56-dev-ed.develop.my.salesforce.com';

test('lightning host resolves to the API host', () => {
  assert.equal(apiOriginFor(LIGHTNING), EXPECTED);
});

test('setup host resolves to the same API host', () => {
  assert.equal(apiOriginFor(SETUP), EXPECTED);
});

test('the API host resolves to itself', () => {
  assert.equal(apiOriginFor(API), EXPECTED);
});

test('multi-label domains survive — suffix swap, not a dot split', () => {
  assert.equal(apiOriginFor('https://a.b.c.lightning.force.com/x'), 'https://a.b.c.my.salesforce.com');
});

test('non-Salesforce hosts are rejected', () => {
  assert.equal(apiOriginFor('https://example.com/'), null);
  assert.equal(apiOriginFor('https://notsalesforce.com/lightning/setup'), null);
});

test('garbage input returns null rather than throwing', () => {
  assert.equal(apiOriginFor('not a url'), null);
  assert.equal(apiOriginFor(''), null);
});

test('isSalesforceUrl mirrors apiOriginFor', () => {
  assert.equal(isSalesforceUrl(SETUP), true);
  assert.equal(isSalesforceUrl('https://example.com'), false);
});

test('query URL encodes SOQL and hits the versioned endpoint', () => {
  const url = queryUrl(EXPECTED, 'SELECT Id FROM Account WHERE Name = 1');

  assert.ok(url.startsWith(`${EXPECTED}/services/data/${API_VERSION}/query?q=`));
  assert.ok(url.includes('%20'), 'spaces must be encoded');
  assert.ok(!url.includes(' '));
});

test('tooling queries use the tooling path', () => {
  assert.ok(queryUrl(EXPECTED, 'SELECT Id FROM ApexClass', { tooling: true }).includes('/tooling/query?q='));
});
