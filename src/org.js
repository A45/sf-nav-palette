/**
 * Salesforce host juggling.
 *
 * A single org answers on three different hosts and they are not
 * interchangeable:
 *
 *   app pages   https://<domain>.lightning.force.com
 *   Setup       https://<domain>.my.salesforce-setup.com
 *   API + auth  https://<domain>.my.salesforce.com
 *
 * The `sid` session cookie that authenticates API calls only exists on the API
 * host, so a palette opened on a Lightning or Setup page has to derive that
 * host before it can ask the org anything.
 */

export const API_VERSION = 'v67.0';

const SUFFIXES = ['.lightning.force.com', '.my.salesforce-setup.com', '.my.salesforce.com'];
const API_SUFFIX = '.my.salesforce.com';

/**
 * API origin for the page we are on, or null when this is not a Salesforce host.
 *
 * Note the domain part can itself contain dots — "orgfarm-x.develop" is a real
 * example — so this swaps a known suffix rather than splitting on the first dot.
 */
export function apiOriginFor(pageUrl) {
  let host;
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    return null;
  }

  for (const suffix of SUFFIXES) {
    if (host.endsWith(suffix)) {
      return `https://${host.slice(0, -suffix.length)}${API_SUFFIX}`;
    }
  }
  return null;
}

export function isSalesforceUrl(pageUrl) {
  return apiOriginFor(pageUrl) !== null;
}

/** REST query endpoint. `tooling` switches to the Tooling API path. */
export function queryUrl(apiOrigin, soql, { tooling = false } = {}) {
  const path = tooling ? 'tooling/query' : 'query';
  return `${apiOrigin}/services/data/${API_VERSION}/${path}?q=${encodeURIComponent(soql)}`;
}

/** SOSL search endpoint — used for sources too large to download. */
export function searchUrl(apiOrigin, sosl) {
  return `${apiOrigin}/services/data/${API_VERSION}/search?q=${encodeURIComponent(sosl)}`;
}
