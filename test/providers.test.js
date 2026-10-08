import test from 'node:test';
import assert from 'node:assert/strict';

import { LEVEL, TYPE, createPath, advance, levelFor, isTerminal } from '../src/pathModel.js';
import {
  candidatesFor,
  sourcesFor,
  needsFields,
  searchCategoryFor,
  exactObjectMatch,
  expandTopObject,
  matchesCategory,
  SOURCES
} from '../src/providers/index.js';
import {
  toObjectCandidates,
  toApexCandidates,
  toTriggerCandidates,
  toFlowCandidates
} from '../src/providers/remote.js';
import { toFieldCandidates } from '../src/providers/fields.js';
import { objectChildCandidates } from '../src/providers/objectChildren.js';
import { rank } from '../src/fuzzy.js';

const OBJECT_RECORDS = [
  { DurableId: 'Account', QualifiedApiName: 'Account', Label: 'Account' },
  { DurableId: '01Ig5000003ZM8o', QualifiedApiName: 'Ticket__c', Label: 'Ticket' }
];

const ticketSegment = {
  type: TYPE.OBJECT,
  value: 'Ticket__c',
  label: 'Ticket',
  data: { durableId: '01Ig5000003ZM8o' }
};

test('object candidates carry DurableId, which the API name cannot supply', () => {
  const [account, ticket] = toObjectCandidates(OBJECT_RECORDS);

  assert.equal(account.data.durableId, 'Account');
  assert.equal(ticket.data.durableId, '01Ig5000003ZM8o');
  assert.equal(ticket.badge, 'OBJECT');
});

test('apex candidates are terminal and build a detail URL', () => {
  const [apex] = toApexCandidates([{ Id: '01pg500000AmLE5AAN', Name: 'FieldAuditService' }]);

  assert.equal(apex.label, 'FieldAuditService');
  assert.ok(apex.url.includes('01pg500000AmLE5AAN'));
});

test('trigger candidates show the object they run on', () => {
  const [trigger] = toTriggerCandidates([
    { Id: '01q000', Name: 'TicketTrigger', EntityDefinition: { QualifiedApiName: 'Ticket__c' } }
  ]);

  assert.equal(trigger.sublabel, 'Ticket__c');
});

test('trigger without an EntityDefinition still renders', () => {
  const [trigger] = toTriggerCandidates([{ Id: '01q000', Name: 'Orphan' }]);
  assert.equal(trigger.sublabel, 'Apex Trigger');
});

// The flow join is the subtlest part of the whole extension: the id and the
// label come from two different objects and neither one alone is usable.
test('flow join takes the id from FlowDefinition and the label from the view', () => {
  const [flow] = toFlowCandidates(
    [{ Id: '300g500000nZHWwAAO', DeveloperName: 'Send_Welcome_Email' }],
    [{ ApiName: 'Send_Welcome_Email', Label: 'Send Welcome Email' }]
  );

  assert.equal(flow.label, 'Send Welcome Email');
  assert.equal(flow.sublabel, 'Send_Welcome_Email');
  assert.ok(flow.url.includes('300g500000nZHWwAAO'));
});

test('a flow with no matching view row still appears, labelled by DeveloperName', () => {
  const [flow] = toFlowCandidates([{ Id: '300x', DeveloperName: 'Unlabelled_Flow' }], []);
  assert.equal(flow.label, 'Unlabelled_Flow');
});

test('view rows without a definition are dropped — they have no navigable id', () => {
  const flows = toFlowCandidates([], [{ ApiName: 'Managed_Flow', Label: 'Managed Flow' }]);
  assert.equal(flows.length, 0);
});

test('field candidates split DurableId into a working URL', () => {
  const [field] = toFieldCandidates([
    {
      DurableId: '01Ig5000003ZM8o.00Ng500000PtYfV',
      QualifiedApiName: 'Stage__c',
      Label: 'Stage',
      DataType: 'Picklist'
    }
  ]);

  assert.equal(field.label, 'Stage');
  assert.equal(field.sublabel, 'Stage__c · Picklist');
  assert.ok(field.url.endsWith('/FieldsAndRelationships/00Ng500000PtYfV/view'));
});

test('an object leads with its own page, then the six child tabs', () => {
  const children = objectChildCandidates(ticketSegment);

  // The first row mirrors the "Open … setup page" row every category leads with.
  // Without it, selecting an object stranded you among its tabs with no way to
  // reach Object Manager itself.
  assert.equal(children[0].badge, 'SETUP');
  assert.equal(children[0].label, 'Open Ticket in Object Manager');
  assert.equal(children[0].url, '/lightning/setup/ObjectManager/01Ig5000003ZM8o/Details/view');

  assert.deepEqual(
    children.slice(1).map((c) => c.value),
    ['field', 'validation', 'layout', 'recordtype', 'trigger', 'button']
  );
});

test('the object page row is terminal — it navigates, it does not drill', () => {
  const [openObject] = objectChildCandidates(ticketSegment);
  assert.equal(isTerminal(openObject), true);
});

test('the open-object row reuses the same id as the searched pair', () => {
  // Same destination, same id, so recents record one entry rather than two.
  const [fromChildren] = objectChildCandidates(ticketSegment);
  const pair = exactObjectMatch('Ticket__c', NOISY_CACHE);

  assert.equal(fromChildren.id, pair[1].id);
});

// ─── Federated root ──────────────────────────────────────────────────────────

test('root federates every source into one list', () => {
  const cache = {
    objects: OBJECT_RECORDS,
    apex: [{ Id: '01p', Name: 'FieldAuditService' }],
    triggers: [{ Id: '01q', Name: 'TicketTrigger' }],
    flows: { definitions: [{ Id: '300', DeveloperName: 'MyFlow' }], views: [] }
  };

  const badges = new Set(candidatesFor(LEVEL.ROOT, [], cache).map((c) => c.badge));

  for (const badge of ['SETUP', 'BROWSE', 'OBJECT', 'APEX', 'TRIGGER', 'FLOW']) {
    assert.ok(badges.has(badge), `root should include ${badge}`);
  }
});

test('root renders from static routes and categories before org data arrives', () => {
  const candidates = candidatesFor(LEVEL.ROOT, [], {});

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((c) => c.badge === 'SETUP' || c.badge === 'BROWSE'));
});

test('permission sets are reachable directly from the root, without a prefix', () => {
  const cache = { permissionSets: [{ Id: '0PS1', Name: 'Sales_Access', Label: 'Sales Access' }] };
  const ranked = rank('sales access', candidatesFor(LEVEL.ROOT, [], cache));

  assert.equal(ranked[0].label, 'Sales Access');
  assert.equal(ranked[0].badge, 'PERMSET');
});

test('root needs every federated source; a category needs only its own', () => {
  assert.deepEqual(sourcesFor(LEVEL.ROOT), SOURCES);
  assert.deepEqual(sourcesFor(LEVEL.OBJECT_CHILDREN), []);

  const { path } = advance(createPath(), { type: TYPE.SCOPE, value: 'permset', label: 'Permission Sets' });
  assert.deepEqual(sourcesFor(LEVEL.CATEGORY, path.segments), ['permissionSets']);
});

// ─── Categories drill into records ───────────────────────────────────────────

function scopedTo(value) {
  return advance(createPath(), { type: TYPE.SCOPE, value, label: value }).path.segments;
}

test('a category lists its records, not a Setup landing page', () => {
  const cache = {
    permissionSets: [
      { Id: '0PS1', Name: 'Sales_Access', Label: 'Sales Access' },
      { Id: '0PS2', Name: 'Support_Access', Label: 'Support Access' }
    ]
  };

  const rows = candidatesFor(LEVEL.CATEGORY, scopedTo('permset'), cache);

  assert.equal(rows[0].label, 'Open Permission Sets setup page');
  assert.deepEqual(
    rows.slice(1).map((r) => r.label),
    ['Sales Access', 'Support Access']
  );
  assert.ok(rows[1].url.includes('/PermSets/page?address=%2F0PS1'));
});

test('the Setup landing page stays reachable as the first row', () => {
  for (const value of ['permset', 'profile', 'role', 'user', 'permsetgroup']) {
    const rows = candidatesFor(LEVEL.CATEGORY, scopedTo(value), {});
    assert.equal(rows.length, 1, `${value} should still offer its setup page`);
    assert.ok(rows[0].url.endsWith('/home'));
  }
});

test('profiles use Name as their label', () => {
  const profiles = candidatesFor(LEVEL.CATEGORY, scopedTo('profile'), {
    profiles: [{ Id: '00e1', Name: 'System Administrator' }]
  });
  assert.equal(profiles[1].label, 'System Administrator');
});

// ─── Searched categories ─────────────────────────────────────────────────────

test('users come from the current search, not a cached list', () => {
  const rows = candidatesFor(LEVEL.CATEGORY, scopedTo('user'), {
    search: { user: [{ Id: '0051', Name: 'Atik Kazi', Username: 'atik@example.com' }] }
  });

  assert.equal(rows[1].label, 'Atik Kazi');
  assert.equal(rows[1].sublabel, 'atik@example.com');
  assert.ok(rows[1].url.includes('/ManageUsers/page?address=%2F0051'));
});

test('a plain users cache is ignored — that path must not silently work', () => {
  const rows = candidatesFor(LEVEL.CATEGORY, scopedTo('user'), {
    users: [{ Id: '0051', Name: 'Should Not Appear', Username: 'x@example.com' }]
  });

  assert.equal(rows.length, 1, 'only the setup row should remain');
});

test('a searched category has nothing to prefetch', () => {
  // Users must never be downloaded up front — an org can hold 100,000 of them.
  assert.deepEqual(sourcesFor(LEVEL.CATEGORY, scopedTo('user')), []);
  assert.deepEqual(sourcesFor(LEVEL.CATEGORY, scopedTo('permset')), ['permissionSets']);
});

test('searchCategoryFor identifies only the searched categories', () => {
  assert.equal(searchCategoryFor(LEVEL.CATEGORY, scopedTo('user'))?.value, 'user');
  assert.equal(searchCategoryFor(LEVEL.CATEGORY, scopedTo('profile')), null);
  assert.equal(searchCategoryFor(LEVEL.ROOT, []), null);
});

test('users are absent from the root sources entirely', () => {
  assert.ok(!SOURCES.includes('users'));
});

// ─── A fully typed object name collapses the root ────────────────────────────

const NOISY_CACHE = {
  objects: OBJECT_RECORDS,
  apex: [
    { Id: '01p1', Name: 'AccountCloneService' },
    { Id: '01p2', Name: 'AccountSelector' }
  ]
};

test('a full object name gives exactly two rows: browse, then open', () => {
  const rows = exactObjectMatch('Account', NOISY_CACHE);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].badge, 'BROWSE');
  assert.equal(rows[0].type, TYPE.OBJECT);
  assert.equal(rows[1].badge, 'SETUP');
  assert.equal(rows[1].label, 'Open Account in Object Manager');
  assert.equal(rows[1].url, '/lightning/setup/ObjectManager/Account/Details/view');
});

test('the browse row still drills into the object child tabs', () => {
  const [browse] = exactObjectMatch('Account', NOISY_CACHE);
  assert.equal(browse.data.durableId, 'Account');
  assert.equal(levelFor(advance(createPath(), browse).path.segments), LEVEL.OBJECT_CHILDREN);
});

test('matching is case insensitive and ignores surrounding space', () => {
  assert.equal(exactObjectMatch('  account  ', NOISY_CACHE).length, 2);
  assert.equal(exactObjectMatch('ACCOUNT', NOISY_CACHE).length, 2);
});

test('the API name matches too, not just the label', () => {
  const rows = exactObjectMatch('Ticket__c', NOISY_CACHE);
  assert.equal(rows.length, 2);
  assert.ok(rows[1].url.includes('01Ig5000003ZM8o'));

  // Ticket__c's label is "Ticket", so that must work as well.
  assert.equal(exactObjectMatch('Ticket', NOISY_CACHE).length, 2);
});

// The whole point: a partial name must NOT collapse, or Apex classes become
// unreachable while the user is still typing.
test('a partial name does not collapse — related code stays reachable', () => {
  assert.deepEqual(exactObjectMatch('Acc', NOISY_CACHE), []);
  assert.deepEqual(exactObjectMatch('AccountSelector', NOISY_CACHE), []);
});

test('an empty or whitespace query never collapses', () => {
  assert.deepEqual(exactObjectMatch('', NOISY_CACHE), []);
  assert.deepEqual(exactObjectMatch('   ', NOISY_CACHE), []);
});

test('a non-object query falls through to normal results', () => {
  assert.deepEqual(exactObjectMatch('debug logs', NOISY_CACHE), []);
});

test('nothing collapses before the object list has loaded', () => {
  assert.deepEqual(exactObjectMatch('Account', {}), []);
});

// ─── A category always beats an object of the same name ──────────────────────
//
// Salesforce ships objects whose labels collide with our category names:
// FlowRecord is labelled "Flow", and Profile / User / UserRole / PermissionSet
// are real objects. Without a guard those labels hijacked the query and the
// category never appeared — which is exactly what "flow" did.

const COLLIDING_OBJECTS = {
  objects: [
    { DurableId: 'FlowRecord', QualifiedApiName: 'FlowRecord', Label: 'Flow' },
    { DurableId: 'Profile', QualifiedApiName: 'Profile', Label: 'Profile' },
    { DurableId: 'User', QualifiedApiName: 'User', Label: 'User' },
    { DurableId: 'UserRole', QualifiedApiName: 'UserRole', Label: 'Role' },
    { DurableId: 'PermissionSet', QualifiedApiName: 'PermissionSet', Label: 'Permission Set' }
  ]
};

test('a category name never collapses to a like-named object', () => {
  for (const query of ['flow', 'profile', 'user', 'role', 'permission set']) {
    assert.deepEqual(exactObjectMatch(query, COLLIDING_OBJECTS), [], `"${query}" must stay a category`);
  }
});

test('the category row leads for a colliding name', () => {
  const ranked = rank('flow', candidatesFor(LEVEL.ROOT, [], COLLIDING_OBJECTS));

  assert.equal(ranked[0].badge, 'BROWSE');
  assert.equal(ranked[0].value, 'flow');
});

test('matchesCategory is exact, so a longer object name still collapses', () => {
  assert.equal(matchesCategory('flow'), true);
  assert.equal(matchesCategory('Flows'), true); // the category label itself
  assert.equal(matchesCategory('flowrecord'), false);
  assert.equal(matchesCategory('account'), false);
  assert.equal(matchesCategory(''), false);
});

test('objects with no competing category still collapse', () => {
  // The whole point of the guard is that it is narrow — this feature must survive.
  assert.equal(exactObjectMatch('Account', NOISY_CACHE).length, 2);
  assert.equal(exactObjectMatch('Ticket__c', NOISY_CACHE).length, 2);
});

test('FlowRecord is penalised so it does not sit right under its category', () => {
  const [flowRecord] = toObjectCandidates([
    { DurableId: 'FlowRecord', QualifiedApiName: 'FlowRecord', Label: 'Flow' }
  ]);

  assert.ok(flowRecord.penalty > 0, 'the old shadow list named a nonexistent "Flow" object');
});

// ─── Partial query: the top object expands ───────────────────────────────────

test('a top-ranked object becomes browse + open, with the rest kept below', () => {
  const ranked = rank('acc', candidatesFor(LEVEL.ROOT, [], NOISY_CACHE));
  const rows = expandTopObject(ranked);

  assert.equal(rows[0].badge, 'BROWSE');
  assert.equal(rows[0].label, 'Account');
  assert.equal(rows[1].badge, 'SETUP');
  assert.equal(rows[1].label, 'Open Account in Object Manager');

  // The point of expanding rather than collapsing: everything else survives.
  assert.ok(rows.slice(2).some((r) => r.label === 'AccountSelector'));
});

test('expansion leaves the list alone when the top row is not an object', () => {
  const rows = [
    { type: TYPE.SETUP, label: 'Debug Logs' },
    { type: TYPE.OBJECT, label: 'Account', value: 'Account', data: { durableId: 'Account' } }
  ];

  // Typing "debug logs" must not be hijacked by an object further down.
  assert.deepEqual(expandTopObject(rows), rows);
});

test('expansion on an empty list is a no-op', () => {
  assert.deepEqual(expandTopObject([]), []);
});

test('the expanded browse row still drills into child tabs', () => {
  const [browse] = expandTopObject([
    { type: TYPE.OBJECT, label: 'Account', value: 'Account', badge: 'OBJECT', data: { durableId: 'Account' } }
  ]);

  assert.equal(levelFor(advance(createPath(), browse).path.segments), LEVEL.OBJECT_CHILDREN);
});

// ─── System-derived objects ──────────────────────────────────────────────────

test('Feed, Share, History and friends are penalised', () => {
  const [feed, share, history, changeEvent, real] = toObjectCandidates([
    { DurableId: '1', QualifiedApiName: 'AccountFeed', Label: 'Account Feed' },
    { DurableId: '2', QualifiedApiName: 'AccountShare', Label: 'Account Share' },
    { DurableId: '3', QualifiedApiName: 'AccountHistory', Label: 'Account History' },
    { DurableId: '4', QualifiedApiName: 'AccountChangeEvent', Label: 'Account Change Event' },
    { DurableId: '5', QualifiedApiName: 'AccountPartner', Label: 'Account Partner' }
  ]);

  for (const candidate of [feed, share, history, changeEvent]) {
    assert.ok(candidate.penalty > 0, `${candidate.value} should be demoted`);
  }
  assert.equal(real.penalty, 0, 'AccountPartner is a real object');
});

test('system objects rank below real matches but stay reachable', () => {
  const cache = {
    objects: [
      { DurableId: '1', QualifiedApiName: 'AccountFeed', Label: 'Account Feed' },
      { DurableId: '5', QualifiedApiName: 'AccountPartner', Label: 'Account Partner' }
    ]
  };

  const ranked = rank('acc', candidatesFor(LEVEL.ROOT, [], cache));
  const partnerAt = ranked.findIndex((c) => c.value === 'AccountPartner');
  const feedAt = ranked.findIndex((c) => c.value === 'AccountFeed');

  assert.ok(partnerAt < feedAt, 'a real object should outrank a generated one');
  assert.ok(feedAt !== -1, 'but the generated one is still reachable');
});

test('two objects sharing a label each contribute their own pair', () => {
  const cache = {
    objects: [
      { DurableId: 'Ticket', QualifiedApiName: 'Ticket', Label: 'Ticket' },
      { DurableId: '01Ig5', QualifiedApiName: 'Ticket__c', Label: 'Ticket' }
    ]
  };

  assert.equal(exactObjectMatch('Ticket', cache).length, 4);
});

test('objects still drill into child tabs from inside the category', () => {
  const rows = candidatesFor(LEVEL.CATEGORY, scopedTo('object'), { objects: OBJECT_RECORDS });
  const ticket = rows.find((r) => r.value === 'Ticket__c');

  assert.equal(ticket.type, TYPE.OBJECT);
  assert.equal(ticket.data.durableId, '01Ig5000003ZM8o');
});

// ─── No more duplicate rows ──────────────────────────────────────────────────

test('categories own their Setup node, so the static list does not repeat it', () => {
  const staticLabels = candidatesFor(LEVEL.ROOT, [], {})
    .filter((c) => c.badge === 'SETUP')
    .map((c) => c.label);

  // These were the duplicates: a "Permission Sets" category row plus a
  // near-identical "Permission Sets" Setup row.
  for (const label of ['Permission Sets', 'Profiles', 'Flows', 'Users', 'Roles', 'Object Manager']) {
    assert.ok(!staticLabels.includes(label), `${label} should not appear twice at the root`);
  }
});

test('users are not federated into the root — too many of them', () => {
  assert.ok(SOURCES.includes('permissionSets'));
  assert.ok(!SOURCES.includes('users'));
});

test('a shadowed object ranks below the category that supersedes it', () => {
  const cache = { objects: [{ DurableId: 'Profile', QualifiedApiName: 'Profile', Label: 'Profile' }] };
  const ranked = rank('profile', candidatesFor(LEVEL.ROOT, [], cache));

  const categoryAt = ranked.findIndex((c) => c.badge === 'BROWSE' && c.value === 'profile');
  const objectAt = ranked.findIndex((c) => c.badge === 'OBJECT');

  assert.ok(categoryAt !== -1 && objectAt !== -1, 'both rows should still be present');
  assert.ok(categoryAt < objectAt, 'the Profiles category must come first');
});

test('an unshadowed object keeps its natural rank', () => {
  const [account] = toObjectCandidates([
    { DurableId: 'Account', QualifiedApiName: 'Account', Label: 'Account' }
  ]);
  assert.equal(account.penalty, 0);
});

test('field level is recognised only once an object is in the path', () => {
  let { path } = advance(createPath(), ticketSegment);
  ({ path } = advance(path, { type: TYPE.CHILD_TYPE, value: 'field', label: 'Fields' }));

  assert.equal(needsFields(LEVEL.FIELDS, path.segments), true);
  assert.equal(needsFields(LEVEL.FIELDS, []), false);
});

test('fields come from the per-object cache', () => {
  const { path } = advance(createPath(), ticketSegment);
  const cache = {
    fields: {
      '01Ig5000003ZM8o': [{ DurableId: '01Ig5000003ZM8o.00N', QualifiedApiName: 'Stage__c', Label: 'Stage' }]
    }
  };

  const candidates = candidatesFor(LEVEL.FIELDS, path.segments, cache);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].value, 'Stage__c');
});

test('an object with no cached fields yet renders empty rather than throwing', () => {
  const { path } = advance(createPath(), ticketSegment);
  assert.deepEqual(candidatesFor(LEVEL.FIELDS, path.segments, { fields: {} }), []);
});
