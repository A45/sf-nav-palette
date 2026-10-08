/**
 * Salesforce Setup URL builders.
 *
 * Pure string work, kept out of the providers so every URL shape is testable
 * without a network or a browser.
 *
 * Every pattern here was verified against a real org (PracticeOrg, API 67.0)
 * rather than assumed — the DurableId shapes in particular are not obvious.
 */

/** Object Manager child tabs. Keys double as the `childType` segment value. */
export const OBJECT_TABS = {
  field: 'FieldsAndRelationships',
  validation: 'ValidationRules',
  layout: 'PageLayouts',
  recordtype: 'RecordTypes',
  trigger: 'ApexTriggers',
  button: 'ButtonsLinksActions'
};

/**
 * Object detail page.
 *
 * `entityDurableId` comes straight from EntityDefinition.DurableId, which is
 * the object API name for standard objects ("Account") but a 01I-prefixed id
 * for custom ones ("01Ig5000003ZM8o"). Object Manager accepts both, so this
 * builder does not need to branch — but the difference is why we carry
 * DurableId around instead of the API name.
 */
export function objectUrl(entityDurableId) {
  return `/lightning/setup/ObjectManager/${entityDurableId}/Details/view`;
}

/** Child tab list page, e.g. an object's Validation Rules. */
export function objectTabUrl(entityDurableId, childType) {
  const tab = OBJECT_TABS[childType];
  if (!tab) throw new Error(`Unknown object child type: ${childType}`);
  return `/lightning/setup/ObjectManager/${entityDurableId}/${tab}/view`;
}

/**
 * A single field's detail page.
 *
 * FieldDefinition.DurableId is `<entity>.<field>` — for example
 * `01Ig5000003ZM8o.00Ng500000PtYfV` (custom field) or
 * `01Ig5000003ZM8o.CreatedBy` (standard field). The URL needs those two halves
 * separately, so split on the FIRST dot only: the field half of a standard
 * field can itself contain dots.
 */
export function fieldUrl(fieldDurableId) {
  const dot = fieldDurableId.indexOf('.');
  if (dot === -1) throw new Error(`Malformed FieldDefinition.DurableId: ${fieldDurableId}`);

  const entity = fieldDurableId.slice(0, dot);
  const field = fieldDurableId.slice(dot + 1);
  return `/lightning/setup/ObjectManager/${entity}/${OBJECT_TABS.field}/${field}/view`;
}

/**
 * Detail page for one record under a Setup node.
 *
 * Setup renders these through a single `page?address=/<id>` shim, so every
 * record type — Apex class, permission set, profile, user, role — shares one
 * shape. Keeping it generic is what lets a new category be added as data
 * instead of code.
 */
export function setupRecordUrl(node, id) {
  return `/lightning/setup/${node}/page?address=${encodeURIComponent(`/${id}`)}`;
}

/** Setup landing page for a node, e.g. the Permission Sets list. */
export function setupHomeUrl(node) {
  return `/lightning/setup/${node}/home`;
}

/** Apex class detail page. `id` is the 01p-prefixed ApexClass Id. */
export function apexClassUrl(id) {
  return setupRecordUrl('ApexClasses', id);
}

/** Apex trigger detail page. `id` is the 01q-prefixed ApexTrigger Id. */
export function apexTriggerUrl(id) {
  return setupRecordUrl('ApexTriggers', id);
}

/**
 * Flow detail page. `id` is the 300-prefixed FlowDefinition Id.
 *
 * Note this id can only come from the Tooling API's FlowDefinition object.
 * FlowDefinitionView — which is where the good labels live — exposes no
 * navigable id at all: its DurableId is an API name and its LatestVersionId is
 * a string like "MyFlow-1". That is why the flow provider joins the two.
 */
export function flowUrl(id) {
  return setupRecordUrl('Flows', id);
}

/**
 * Absolute URL for a Setup path, given the tab we are currently on.
 *
 * Setup runs on its own host (`*.my.salesforce-setup.com`) while app pages run
 * on `*.lightning.force.com`. Both serve `/lightning/setup/...`, so staying on
 * the current origin keeps the jump same-origin whenever possible.
 */
export function absolute(path, origin) {
  return new URL(path, origin).toString();
}
