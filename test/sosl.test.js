import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeTerm, buildSearch, isSearchable, MIN_SEARCH_CHARS } from '../src/sosl.js';

const USERS = {
  sosl: {
    object: 'User',
    fields: 'Id, Name, Username',
    where: 'IsActive = true',
    orderBy: 'Name'
  }
};

test('builds a prefix search, not a leading wildcard', () => {
  const sosl = buildSearch(USERS, 'joh');

  assert.ok(sosl.startsWith('FIND {joh*}'), sosl);
  // A leading wildcard cannot use an index — that is the whole reason for SOSL.
  assert.ok(!sosl.includes('{*'));
});

test('returns the configured object, fields, filter and order', () => {
  assert.equal(
    buildSearch(USERS, 'joh', 50),
    'FIND {joh*} IN NAME FIELDS RETURNING User(Id, Name, Username WHERE IsActive = true ORDER BY Name LIMIT 50)'
  );
});

test('limit is configurable', () => {
  assert.ok(buildSearch(USERS, 'joh', 10).endsWith('LIMIT 10)'));
});

test('optional where and orderBy are omitted cleanly', () => {
  const minimal = { sosl: { object: 'User', fields: 'Id, Name' } };
  assert.equal(buildSearch(minimal, 'ab', 5), 'FIND {ab*} IN NAME FIELDS RETURNING User(Id, Name LIMIT 5)');
});

test('surrounding whitespace is trimmed', () => {
  assert.ok(buildSearch(USERS, '  joh  ').startsWith('FIND {joh*}'));
});

// Without escaping these produce a malformed query that the org rejects.
test('an apostrophe in a name is escaped', () => {
  assert.equal(escapeTerm("o'brien"), "o\\'brien");
});

test('SOSL operators are escaped', () => {
  assert.equal(escapeTerm('a+b'), 'a\\+b');
  assert.equal(escapeTerm('a&b|c'), 'a\\&b\\|c');
  assert.equal(escapeTerm('a*b?c'), 'a\\*b\\?c');
  assert.equal(escapeTerm('{a}[b](c)'), '\\{a\\}\\[b\\]\\(c\\)');
  assert.equal(escapeTerm('a\\b'), 'a\\\\b');
});

test('ordinary text is left alone', () => {
  assert.equal(escapeTerm('John Smith'), 'John Smith');
});

test('an escaped term still lands inside the FIND braces', () => {
  assert.ok(buildSearch(USERS, "o'brien").startsWith("FIND {o\\'brien*}"));
});

test('a query shorter than the minimum is not worth sending', () => {
  assert.equal(isSearchable('a'), false);
  assert.equal(isSearchable(''), false);
  assert.equal(isSearchable('   '), false);
  assert.equal(isSearchable('ab'), true);
  assert.equal(MIN_SEARCH_CHARS, 2);
});
