/**
 * Fields of one object.
 *
 * This is the only source that stays lazy. FieldDefinition cannot be queried
 * without an EntityDefinitionId filter (the org rejects it outright), so there
 * is no way to prefetch "all fields" even if we wanted to — and prefetching
 * per object would mean hundreds of queries for data almost none of which gets
 * looked at.
 */

import { TYPE } from '../pathModel.js';
import { fieldUrl } from '../urls.js';

export function toFieldCandidates(records) {
  return records.map((record) => ({
    id: `field:${record.DurableId}`,
    type: TYPE.FIELD,
    value: record.QualifiedApiName,
    label: record.Label || record.QualifiedApiName,
    // The API name is what an admin usually remembers, and the data type is
    // what distinguishes two similarly named fields.
    sublabel: [record.QualifiedApiName, record.DataType].filter(Boolean).join(' · '),
    badge: 'FIELD',
    url: fieldUrl(record.DurableId)
  }));
}
