# Privacy Policy — SF Nav Palette

_Last updated: 27 July 2026_

> **This file must be published at a public URL** (GitHub Pages, a Gist, your own
> site) and that URL pasted into the Chrome Web Store listing. The Web Store will
> not accept a policy that only exists inside the package.

## Summary

SF Nav Palette does not collect, transmit, sell, or share any data. It has no
backend, no analytics, and makes no network requests to anything except the
Salesforce org you are already signed in to.

## What the extension accesses

**Your Salesforce session cookie (`sid`)**
Read from `*.my.salesforce.com` in order to call the Salesforce API _as you_, so
the palette can list your org's objects, fields, Apex classes, flows, permission
sets, profiles and roles.

- It is read only when you open the palette and only for the duration of a
  request.
- It is held in the extension's service-worker memory. It is never written to
  disk, never logged, never included in error messages, and never sent to a
  content script or to any server other than your own Salesforce org.

**Salesforce configuration metadata**
Names, labels and record ids of objects, fields, Apex classes, triggers, flows,
permission sets, permission set groups, profiles, roles and users. This is
configuration data used to build the search list. It is kept in memory and
discarded when the browser closes.

**Your navigation history within the extension**
Which palette destinations you pick, so frequently used ones appear first. Stored
in `chrome.storage.local` on your own device. Never transmitted. Clearing the
extension's storage or uninstalling it removes this completely.

## What the extension does NOT do

- No data is sent to the developer or any third party
- No analytics, telemetry, tracking, or advertising
- No reading of Salesforce record data beyond what you explicitly search for
- No modification of any Salesforce data — the extension only navigates
- No activity outside Salesforce domains; the extension does not run on any
  other website

## Where the extension runs

Only on these hosts:

- `https://*.lightning.force.com/*`
- `https://*.my.salesforce-setup.com/*`
- `https://*.my.salesforce.com/*`

## Data retention

| Data                 | Stored where                         | Cleared when                   |
| -------------------- | ------------------------------------ | ------------------------------ |
| Session cookie value | Service-worker memory                | Immediately after each request |
| Org metadata         | Service-worker memory                | Browser or worker restart      |
| Recent destinations  | `chrome.storage.local` (your device) | You clear storage or uninstall |

## Contact

<!-- Replace with a real address before submitting; the Web Store requires one. -->

YOUR-EMAIL@example.com
