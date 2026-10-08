# Chrome Web Store listing — copy/paste

Everything the Developer Dashboard asks for. The **Privacy practices** tab is
where most submissions get rejected: reviewers cross-check the manifest
permissions against the data declarations against the privacy policy, and any
disagreement between the three is a rejection.

---

## Single purpose

> A keyboard-driven navigation palette for Salesforce administrators. It opens
> on any Salesforce page and jumps directly to a Setup page, object, field, Apex
> class, flow, permission set, profile, role or user.

Keep this one sentence. A single purpose that reads as a list of unrelated
features is itself grounds for rejection.

---

## Permission justifications

Paste one per field. Say what it is used _for_, not what it is.

**`cookies`**

> Reads the Salesforce session cookie (`sid`) on `*.my.salesforce.com` so the
> extension can call the Salesforce REST API as the signed-in user and list that
> org's objects, fields, Apex classes, flows and permission sets. The value is
> used only to authenticate those requests, is held in memory for the duration
> of a request, and is never stored or transmitted anywhere else.

**`storage`**

> Stores the user's recently visited destinations locally so frequently used
> pages rank first. Local to the device; nothing is transmitted.

**`tabs`**

> Identifies the active tab so the keyboard shortcut and toolbar button can open
> the palette on the Salesforce page the user is currently viewing. No browsing
> history is read or retained.

**Host permissions** (`*.lightning.force.com`, `*.my.salesforce-setup.com`, `*.my.salesforce.com`)

> A single Salesforce org is served from three different hosts: app pages, Setup,
> and the API. The palette must appear on the first two and query the third.
> Setup is the most important — it is where administrators navigate most — and it
> runs on its own `my.salesforce-setup.com` host. The extension runs on no other
> sites.

**Remote code**

> None. All code is contained in the package; nothing is fetched or evaluated at
> runtime.

---

## Data-practice declarations

Tick **only** these categories as _accessed_:

- **Authentication information** — the Salesforce session cookie, used solely to
  call the user's own org API.

Leave every other category unticked, and certify all three statements:

- Not being sold or transferred to third parties outside the approved use cases
- Not being used or transferred for purposes unrelated to the item's single purpose
- Not being used or transferred to determine creditworthiness or for lending

⚠️ Do not tick "Personally identifiable information" for the user search. The
extension displays user names from the admin's own org; it does not collect them.

---

## Store listing copy

**Name:** `SF Nav Palette`

**Short description** (132 characters max — the manifest `description`):

> Command palette for Salesforce admins — jump to any object, field, Apex class, flow, or Setup page.

**Detailed description:**

```
Stop clicking through Setup.

Press Ctrl+Shift+K on any Salesforce page — including inside Setup — type what
you want, and go there.

  Ticket › field › Stage__c     the Stage__c field detail page
  Account › validation          Account's Validation Rules
  FieldAuditService             that Apex class, no prefix needed
  permission set › Sales Access that permission set
  debug logs                    straight to the Setup page

WHAT IT FINDS
• Setup pages
• Objects — and their fields, validation rules, page layouts, record types,
  triggers, buttons
• Apex classes and triggers
• Flows
• Permission sets, permission set groups, profiles, roles
• Users (searched live, so it works on orgs with thousands)

HOW IT WORKS
Type any name directly — no category prefix required. Type a full object name
and it collapses to exactly two choices: browse it, or open it in Object
Manager. Your most-used destinations rise to the top.

PRIVACY
No servers, no analytics, no tracking. The extension talks only to the
Salesforce org you are already signed in to. Your session token stays in memory
and is never stored or transmitted.
```

**Category:** Workflow & Planning
**Language:** English

---

## Required images

| Asset            | Size                  | Notes                                            |
| ---------------- | --------------------- | ------------------------------------------------ |
| Icon             | 128×128 PNG           | already in the package (`icons/icon128.png`)     |
| Screenshot       | 1280×800 (or 640×400) | at least one; the palette open over a Setup page |
| Small promo tile | 440×280               | optional but improves placement                  |

Take the screenshot with the palette open and a query typed — an empty box does
not show what the tool does.

---

## Visibility — pick deliberately

| Option       | Use when                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Unlisted** | Team-only. Anyone with the link installs it; it never appears in search. **Recommended for an internal admin tool.** |
| **Private**  | Restricted to specific Google accounts or a Workspace domain.                                                        |
| **Public**   | Only if this is genuinely meant for every Salesforce admin — expect closer review of the `cookies` permission.       |

If your employer manages Chrome, an enterprise force-install through the Google
Admin console avoids the public store entirely — worth asking IT before
submitting.
