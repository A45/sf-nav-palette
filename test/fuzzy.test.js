import test from 'node:test';
import assert from 'node:assert/strict';

import { score, rank } from '../src/fuzzy.js';

test('exact match outranks everything else', () => {
  assert.ok(score('account', 'Account') > score('account', 'AccountCloneService'));
});

test('prefix match outranks a mid-string match', () => {
  assert.ok(score('acc', 'AccountSelector') > score('acc', 'MyAccountThing'));
});

test('returns null when a query character is missing', () => {
  assert.equal(score('xyz', 'FieldAuditService'), null);
});

test('respects character order', () => {
  assert.equal(score('cba', 'abc'), null);
});

// ─── Scattered characters are NOT a match ────────────────────────────────────
//
// These are the exact rows that made "Acc" noisy: the letters appear in order
// but scattered, which no user would call a match.

test('scattered characters do not match', () => {
  assert.equal(score('acc', 'Visualforce Components'), null); // Visu·a·lfor·c·e Component·s
  assert.equal(score('acc', 'Static Resources'), null); // St·a·ti·c· Resour·c·es
});

test('contiguous matches still work', () => {
  assert.ok(score('acc', 'Account') !== null);
  assert.ok(score('acc', 'AccountSelector') !== null);
  assert.ok(score('acc', 'Field Accessibility') !== null);
  assert.ok(score('acc', 'Login Access Policies') !== null);
});

// ─── Word initials ───────────────────────────────────────────────────────────

test('camelCase initials match', () => {
  assert.ok(score('fas', 'FieldAuditService') !== null);
  assert.ok(score('fa', 'FieldAuditService') !== null);
});

test('separator initials match', () => {
  assert.ok(score('fa', 'Field_Audit') !== null);
  assert.ok(score('dl', 'Debug Logs') !== null);
});

test('initials that do not line up are rejected', () => {
  // "Visualforce Components" has initials "vc" — nothing like "acc".
  assert.equal(score('acc', 'Visualforce Components'), null);
});

test('a literal hit outranks an initials guess', () => {
  assert.ok(score('fa', 'Fatal Errors') > score('fa', 'FieldAuditService'));
});

test('empty query scores neutral rather than failing', () => {
  assert.equal(score('', 'anything'), 0);
});

test('scattered letters are rejected outright, not merely ranked low', () => {
  // "xfxa" holds f then a in order but neither is a word start and they are
  // not contiguous — under the old subsequence rule this scored; now it must not.
  assert.equal(score('fa', 'xfxa'), null);
  assert.ok(score('fa', 'Field_Audit') !== null);
});

test('a substring starting a word beats one buried mid-word', () => {
  assert.ok(score('audit', 'Field Audit Log') > score('audit', 'Xaudit'));
});

test('matching is case insensitive', () => {
  assert.ok(score('TICKET', 'ticket') !== null);
});

test('rank filters out non-matches and orders by score', () => {
  const candidates = [{ label: 'AccountCloneService' }, { label: 'Account' }, { label: 'Ticket' }];

  const ranked = rank('account', candidates);

  assert.deepEqual(
    ranked.map((c) => c.label),
    ['Account', 'AccountCloneService']
  );
});

test('rank matches on keywords, not just the label', () => {
  const candidates = [{ label: 'Validation Rules', keywords: ['vr', 'validation'] }];
  assert.equal(rank('vr', candidates).length, 1);
});

test('rank matches on the API-name sublabel', () => {
  const candidates = [{ label: 'Stage', sublabel: 'Stage__c' }];
  assert.equal(rank('stage__c', candidates).length, 1);
});

test('empty query returns every candidate untouched', () => {
  const candidates = [{ label: 'B' }, { label: 'A' }];
  assert.deepEqual(
    rank('', candidates).map((c) => c.label),
    ['B', 'A']
  );
});

test('equal scores keep provider order (stable sort)', () => {
  const candidates = [{ label: 'Same' }, { label: 'Same' }, { label: 'Same' }];
  assert.equal(rank('same', candidates).length, 3);
});
