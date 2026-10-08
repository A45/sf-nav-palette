/**
 * Content-script bootstrap.
 *
 * MV3 content scripts cannot be ES modules, but everything else in this
 * extension is — that is what lets `node --test` import the same files the
 * browser runs, with no build step. So this file stays a classic script whose
 * only job is to dynamically import the real entry point.
 *
 * The imported modules must be listed in web_accessible_resources, or the
 * dynamic import is blocked.
 */

(async () => {
  try {
    const module = await import(chrome.runtime.getURL('src/palette.js'));
    await module.init();
  } catch (error) {
    // A broken palette must never break the Salesforce page underneath it.
    console.error('[sf-nav-palette] failed to start:', error);
  }
})();
