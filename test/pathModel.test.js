import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVEL,
  TYPE,
  createPath,
  levelFor,
  isTerminal,
  advance,
  popSegment,
  setQuery,
  objectContext,
  categoryContext,
  breadcrumb,
  pathKey
} from '../src/pathModel.js';

const objectCandidate = {
  type: TYPE.OBJECT,
  value: 'Ticket__c',
  label: 'Ticket',
  data: { durableId: '01Ig5000003ZM8o' }
};

const fieldChild = { type: TYPE.CHILD_TYPE, value: 'field', label: 'Fields & Relationships' };
const validationChild = {
  type: TYPE.CHILD_TYPE,
  value: 'validation',
  label: 'Validation Rules',
  url: '/lightning/setup/ObjectManager/01Ig5000003ZM8o/ValidationRules/view'
};

test('an empty path is federated at the root', () => {
  assert.equal(levelFor(createPath().segments), LEVEL.ROOT);
});

test('selecting an object opens its child types', () => {
  const { path } = advance(createPath(), objectCandidate);
  assert.equal(levelFor(path.segments), LEVEL.OBJECT_CHILDREN);
});

test('object then field drills into that object fields', () => {
  let { path } = advance(createPath(), objectCandidate);
  ({ path } = advance(path, fieldChild));
  assert.equal(levelFor(path.segments), LEVEL.FIELDS);
});

test('every scope keyword drills into the category level', () => {
  const scopes = ['object', 'apex', 'trigger', 'flow', 'permset', 'profile', 'role', 'user'];

  for (const value of scopes) {
    const { path } = advance(createPath(), { type: TYPE.SCOPE, value, label: value });
    assert.equal(levelFor(path.segments), LEVEL.CATEGORY, `scope ${value}`);
  }
});

test('categoryContext reports which category the path is scoped to', () => {
  const { path } = advance(createPath(), { type: TYPE.SCOPE, value: 'permset', label: 'Permission Sets' });
  assert.equal(categoryContext(path.segments).value, 'permset');
});

test('categoryContext is null with no scope in the path', () => {
  assert.equal(categoryContext(createPath().segments), null);
});

test('objects and scopes drill deeper instead of navigating', () => {
  assert.equal(isTerminal(objectCandidate), false);
  assert.equal(isTerminal({ type: TYPE.SCOPE, value: 'apex' }), false);
});

test('field is the only object child type that drills deeper', () => {
  assert.equal(isTerminal(fieldChild), false);
  assert.equal(isTerminal(validationChild), true);
});

test('apex, flow and setup candidates are all terminal', () => {
  for (const type of [TYPE.APEX, TYPE.TRIGGER, TYPE.FLOW, TYPE.SETUP, TYPE.FIELD]) {
    assert.equal(isTerminal({ type, value: 'x' }), true, `type ${type}`);
  }
});

test('advancing on a terminal candidate returns its URL and leaves the path alone', () => {
  const path = createPath();
  const result = advance(path, validationChild);

  assert.equal(result.navigateTo, validationChild.url);
  assert.equal(result.path.segments.length, 0);
});

test('advancing clears the query so the next level starts fresh', () => {
  const path = setQuery(createPath(), 'tick');
  const { path: next } = advance(path, objectCandidate);
  assert.equal(next.query, '');
});

test('advance does not mutate the path it was given', () => {
  const path = createPath();
  advance(path, objectCandidate);
  assert.equal(path.segments.length, 0);
});

test('popSegment walks the breadcrumb back one step', () => {
  let { path } = advance(createPath(), objectCandidate);
  ({ path } = advance(path, fieldChild));
  assert.equal(path.segments.length, 2);

  path = popSegment(path);
  assert.equal(path.segments.length, 1);
  assert.equal(levelFor(path.segments), LEVEL.OBJECT_CHILDREN);

  path = popSegment(path);
  assert.equal(levelFor(path.segments), LEVEL.ROOT);
});

test('popSegment on an empty path is a no-op', () => {
  const path = createPath();
  assert.equal(popSegment(path).segments.length, 0);
});

test('objectContext finds the object a field query is scoped to', () => {
  let { path } = advance(createPath(), objectCandidate);
  ({ path } = advance(path, fieldChild));

  assert.equal(objectContext(path.segments).data.durableId, '01Ig5000003ZM8o');
});

test('objectContext is null when no object was selected', () => {
  assert.equal(objectContext(createPath().segments), null);
});

test('breadcrumb reads oldest first', () => {
  let { path } = advance(createPath(), objectCandidate);
  ({ path } = advance(path, fieldChild));

  assert.deepEqual(breadcrumb(path.segments), ['Ticket', 'Fields & Relationships']);
});

test('pathKey records the whole path, not just the destination', () => {
  const { path } = advance(createPath(), objectCandidate);
  const key = pathKey(path.segments, fieldChild);

  assert.equal(key, 'object:Ticket__c>childType:field');
});
