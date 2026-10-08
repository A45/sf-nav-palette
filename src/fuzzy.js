/**
 * Matching and ranking.
 *
 * Pure — no DOM, no chrome APIs — so it runs unchanged in the extension and
 * under `node --test`. Every ranking rule lives here; the UI never sorts.
 *
 * Two ways to match, and deliberately no third:
 *
 *   1. the query appears **contiguously** in the text — "acc" in "Account"
 *   2. the query spells the text's **word initials** — "fas" in FieldAuditService
 *
 * What is gone is free subsequence matching, where characters could be
 * scattered anywhere in order. That is what made "acc" return "Visualforce
 * Components" (Visu·a·lfor·c·e Component·s) and "Static Resources" — matches no
 * one would call matches. Precision matters more than reach in a palette you
 * use fifty times a day.
 */

/** Characters that mark a word start in API names: Ticket_Number, Debug.Logs */
const BOUNDARY = /[\s_\-./]/;

const EXACT = 1000;
const PREFIX = 700;
const SUBSTRING = 400;
/** A substring that begins a word beats one buried mid-word. */
const WORD_START = 120;
/** Initials are a guess at intent, so they rank below any literal hit. */
const INITIALS = 250;

/**
 * @returns {number|null} higher is better; null when the text does not match.
 */
export function score(query, text) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return 0;
  if (!text) return null;

  const t = text.toLowerCase();

  if (t === q) return EXACT;
  if (t.startsWith(q)) return PREFIX + lengthBonus(text);

  const at = t.indexOf(q);
  if (at !== -1) {
    let total = SUBSTRING;
    if (isWordStart(text, at)) total += WORD_START;
    total -= Math.floor(at * 0.5); // earlier in the string is a stronger hit
    return total + lengthBonus(text);
  }

  if (initialsOf(text).includes(q)) return INITIALS + lengthBonus(text);

  return null;
}

/** Shorter text is a tighter match for the same query. */
function lengthBonus(text) {
  return Math.max(0, 100 - text.length);
}

function isWordStart(text, index) {
  if (index === 0) return true;
  if (BOUNDARY.test(text[index - 1])) return true;
  return isCamelStart(text, index);
}

/** `aB` — a lowercase letter followed by the uppercase one at `index`. */
function isCamelStart(text, index) {
  const prev = text[index - 1];
  const cur = text[index];
  return prev >= 'a' && prev <= 'z' && cur >= 'A' && cur <= 'Z';
}

/**
 * The first letter of each word, lowercased.
 *
 * "FieldAuditService" -> "fas", "Field Accessibility" -> "fa",
 * "Visualforce Components" -> "vc".
 *
 * Both separators and camelCase count, because Salesforce API names use both.
 */
function initialsOf(text) {
  let initials = '';
  for (let i = 0; i < text.length; i++) {
    if (isWordStart(text, i) && /[a-z0-9]/i.test(text[i])) initials += text[i].toLowerCase();
  }
  return initials;
}

/**
 * Rank candidates against a query.
 *
 * Each candidate is scored against its label, sublabel, and keywords, keeping
 * the best of them — so "vr" finds Validation Rules via a keyword while
 * "Stage__c" finds the same field via its API-name sublabel.
 *
 * An empty query returns the input untouched, which is what makes the
 * "recents on open" behaviour work without a special case at the call site.
 */
export function rank(query, candidates) {
  if (!query) return candidates.slice();

  const scored = [];
  for (const candidate of candidates) {
    const best = bestScore(query, candidate);
    // `penalty` demotes without hiding: a shadowed Object Manager row still
    // matches, it just sits below the category that supersedes it.
    if (best !== null) scored.push({ candidate, best: best - (candidate.penalty || 0) });
  }

  // Array.prototype.sort is stable, so equal scores keep provider order.
  scored.sort((a, b) => b.best - a.best);
  return scored.map((entry) => entry.candidate);
}

function bestScore(query, candidate) {
  const texts = [candidate.label, candidate.sublabel, ...(candidate.keywords || [])];

  let best = null;
  for (const text of texts) {
    if (!text) continue;
    const value = score(query, text);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best;
}
