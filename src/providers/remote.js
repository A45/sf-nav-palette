/**
 * Mappers from raw org records to palette candidates.
 *
 * Kept pure and separate from the fetching so the awkward parts — above all
 * the flow join — can be tested without a browser or an org.
 */

import { TYPE } from '../pathModel.js';
import { apexClassUrl, apexTriggerUrl, flowUrl, setupRecordUrl } from '../urls.js';
import { SHADOWED_OBJECTS } from '../catalog.js';

/**
 * How far below its natural score a shadowed Object Manager row is pushed.
 *
 * Typing "profile" should offer the Profiles category first — the Object
 * Manager page for the Profile object is almost never what an admin wants. But
 * it is not removed: occasionally it genuinely is the target, and silently
 * dropping reachable things is worse than ranking them low.
 */
const SHADOW_PENALTY = 400;

/**
 * Objects Salesforce generates rather than an admin creating them.
 *
 * AccountFeed, AccountShare, AccountHistory, AccountCleanInfo and friends are
 * 477 of this org's 1,346 queryable objects — 35% of the list — and nobody
 * navigates to them. Typing "acc" surfaced four of them above the things that
 * were actually wanted.
 *
 * Demoted, not removed: they are real objects and occasionally the target.
 */
const SYSTEM_OBJECT = /(Feed|Share|History|ChangeEvent|CleanInfo|Tag)$/;
const SYSTEM_PENALTY = 300;

/**
 * Field-driven mapper for categories that are just "a list of records".
 *
 * Permission sets, profiles, users and roles differ only in which fields hold
 * the label — so they share this instead of getting a near-identical module
 * each.
 */
export function toRecordCandidates(records, category) {
  const { label: labelField, sublabel: sublabelField } = category.fields || {};

  return records.map((record) => ({
    id: `${category.value}:${record.Id}`,
    type: TYPE.SETUP,
    value: record[labelField] || record.Id,
    label: record[labelField] || record.Id,
    sublabel: sublabelField ? record[sublabelField] : category.label,
    badge: category.badge || 'SETUP',
    url: setupRecordUrl(category.setupNode, record.Id)
  }));
}

/**
 * EntityDefinition -> object candidates.
 *
 * DurableId is carried in `data` because every downstream URL needs it, and it
 * is not derivable from the API name: standard objects use the name itself
 * ("Account") while custom objects use a 01I id.
 */
export function toObjectCandidates(records) {
  return records.map((record) => ({
    id: `object:${record.QualifiedApiName}`,
    type: TYPE.OBJECT,
    value: record.QualifiedApiName,
    label: record.Label || record.QualifiedApiName,
    sublabel: record.QualifiedApiName,
    badge: 'OBJECT',
    penalty: objectPenalty(record.QualifiedApiName),
    data: { durableId: record.DurableId }
  }));
}

function objectPenalty(apiName) {
  // Profile, PermissionSet, User and friends have a dedicated category that is
  // nearly always the better answer, so their Object Manager row sinks below it.
  if (SHADOWED_OBJECTS.has(apiName)) return SHADOW_PENALTY;
  if (SYSTEM_OBJECT.test(apiName)) return SYSTEM_PENALTY;
  return 0;
}

export function toApexCandidates(records) {
  return records.map((record) => ({
    id: `apex:${record.Id}`,
    type: TYPE.APEX,
    value: record.Name,
    label: record.Name,
    sublabel: 'Apex Class',
    badge: 'APEX',
    url: apexClassUrl(record.Id)
  }));
}

export function toTriggerCandidates(records) {
  return records.map((record) => ({
    id: `trigger:${record.Id}`,
    type: TYPE.TRIGGER,
    value: record.Name,
    label: record.Name,
    sublabel: record.EntityDefinition?.QualifiedApiName || 'Apex Trigger',
    badge: 'TRIGGER',
    url: apexTriggerUrl(record.Id)
  }));
}

/**
 * Flows need two queries joined, which is not obvious and cost real time to
 * work out:
 *
 * - Tooling `FlowDefinition` has the only navigable id (300-prefixed) but its
 *   MasterLabel comes back empty.
 * - `FlowDefinitionView` has the human labels but exposes no usable id at all
 *   — its DurableId is an API name and LatestVersionId is a string like
 *   "MyFlow-1".
 *
 * So: iterate the definitions (they decide what is reachable) and enrich each
 * with a label from the view, matching DeveloperName to ApiName. A flow with
 * no matching view row still appears, labelled by DeveloperName — being able
 * to reach it matters more than showing a pretty name.
 */
export function toFlowCandidates(definitions, views = []) {
  const labelByApiName = new Map();
  for (const view of views) {
    if (view.ApiName && view.Label) labelByApiName.set(view.ApiName, view.Label);
  }

  return definitions.map((definition) => {
    const label = labelByApiName.get(definition.DeveloperName) || definition.DeveloperName;

    return {
      id: `flow:${definition.Id}`,
      type: TYPE.FLOW,
      value: definition.DeveloperName,
      label,
      sublabel: definition.DeveloperName,
      badge: 'FLOW',
      url: flowUrl(definition.Id)
    };
  });
}
