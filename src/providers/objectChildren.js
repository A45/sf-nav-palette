/**
 * The six Object Manager tabs the palette drills into.
 *
 * Only Fields continues to a further level; the other five are places you land.
 * Their item-level URLs each follow a different pattern, and reaching the list
 * page is the bulk of the value — so they stop here rather than half-working.
 */

import { TYPE } from '../pathModel.js';
import { objectTabUrl, objectUrl } from '../urls.js';

const CHILDREN = [
  ['field', 'Fields & Relationships', ['field', 'fld', 'column', 'picklist']],
  ['validation', 'Validation Rules', ['validation', 'vr', 'rule']],
  ['layout', 'Page Layouts', ['layout', 'pl', 'page layout']],
  ['recordtype', 'Record Types', ['recordtype', 'rt', 'record type']],
  ['trigger', 'Triggers', ['trigger', 'trg', 'apex']],
  ['button', 'Buttons, Links, and Actions', ['button', 'action', 'link', 'quick action']]
];

/**
 * @param {object} objectSegment the committed object segment, whose
 *   `data.durableId` every child URL is built from
 */
export function objectChildCandidates(objectSegment) {
  const durableId = objectSegment.data.durableId;

  // The object's own detail page, first — mirroring the "Open … setup page" row
  // every category leads with.
  //
  // Without it, selecting an object stranded you among its six tabs with no way
  // to reach Object Manager itself. The pair is offered when you *search* for an
  // object, so losing it the moment you step inside was plainly inconsistent.
  const openObject = {
    id: `objectsetup:${objectSegment.value}`,
    type: TYPE.SETUP,
    value: objectSegment.value,
    label: `Open ${objectSegment.label} in Object Manager`,
    sublabel: objectSegment.value,
    badge: 'SETUP',
    keywords: ['setup', 'detail', 'object manager', 'open'],
    url: objectUrl(durableId)
  };

  const tabs = CHILDREN.map(([value, label, keywords]) => ({
    id: `child:${objectSegment.value}:${value}`,
    type: TYPE.CHILD_TYPE,
    value,
    label,
    sublabel: objectSegment.label,
    badge: 'TAB',
    keywords,
    // Fields drills deeper, so its URL is only a fallback for Enter on the
    // list page; the other five navigate straight here.
    url: objectTabUrl(durableId, value)
  }));

  return [openObject, ...tabs];
}
