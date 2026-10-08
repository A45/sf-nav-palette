# SF Nav Palette

A command palette for Salesforce admins. Press a shortcut on **any** Salesforce
page — including inside Setup — type a name, and land on the page.

```
Ticket › field › Stage__c        the Stage__c field detail page
Account › validation             Account's Validation Rules
FieldAuditService                that Apex class (no "apex" prefix needed)
permission set › Sales Access    that permission set's detail page
debug logs                       /lightning/setup/ApexDebugLogs/home
```

## How matching works

Two ways to match, and deliberately no third:

1. **Contiguous** — the query appears as-is in the text. `acc` → `Account`,
   `AccountSelector`, `Field Accessibility`.
2. **Word initials** — the query spells the first letters of the words.
   `fas` → `FieldAuditService`, `ps` → `Permission Sets`, `owd` →
   `Sharing Settings` (via keyword).

Both separators and camelCase count as word starts, because Salesforce API
names use both.

What is **not** supported is free subsequence matching, where the letters could
be scattered anywhere as long as they appear in order. That rule made `acc`
return `Visualforce Components` (Visu·**a**·lfor·**c**·e Component·**s**) and
`Static Resources` — matches nobody would call matches. In a palette used fifty
times a day, precision beats reach.

A literal hit always outranks an initials guess, and a match at the start of a
word outranks one buried mid-word.

## Objects lead with what to do about them

An object is never just one row. It always resolves to a pair:

```
Account                              BROWSE   → fields, validation rules, layouts…
Open Account in Object Manager       SETUP    → the object's detail page
```

**A complete name collapses the list to that pair.** `Account`, `Ticket`,
`Ticket__c` — nothing else, no `AccountSelector`, no "Field Accessibility". Once
you have typed a whole object name, you mean the object.

> **Except when a category owns that word.** Salesforce ships an object called
> `FlowRecord` whose _label_ is "Flow", plus real `Profile`, `User`, `UserRole`
> and `PermissionSet` objects. Typing `flow` must list flows, not open Object
> Manager — so a query that exactly names a category never collapses to an
> object. The object stays in the list, just below.

**A partial name expands the top match into the pair and keeps the rest.** `acc`
leads with browse/open for Account, then `AccountTrigger`, `AccountSelector` and
the other objects follow — one arrow key away:

```
1. Account                           BROWSE
2. Open Account in Object Manager    SETUP
3. AccountTrigger                    TRIGGER
4. Account Partner                   OBJECT
5. AccountSelector                   APEX
```

Only the top row expands, and only when it _is_ an object — typing `debug logs`
or `AccountSelector` is never hijacked by an object nobody asked for.

**Stepping inside an object keeps the same two choices available.** Selecting the
browse row lists the object's tabs, led by its own page:

```
1. Open Account in Object Manager    SETUP
2. Fields & Relationships            TAB
3. Validation Rules                  TAB
4. Page Layouts                      TAB
5. Record Types                      TAB
6. Triggers                          TAB
7. Buttons, Links, and Actions       TAB
```

That first row mirrors the "Open … setup page" row every category leads with.
Without it, selecting an object stranded you among its tabs with no way back to
Object Manager itself.

### Generated objects rank low

`AccountFeed`, `AccountShare`, `AccountHistory`, `AccountCleanInfo` and their
kin are **477 of this org's 1,346 queryable objects** — 35% of the list, and
nobody navigates to them. Anything ending in `Feed`, `Share`, `History`,
`ChangeEvent`, `CleanInfo` or `Tag` is pushed below real matches.

Demoted, not removed: they are genuine objects and occasionally the target.

## Categories vs Setup pages

Some things are a **category** you drill into, not a page you land on. Selecting
"Permission Sets" lists the org's actual permission sets; selecting one opens it.
The same holds for Objects, Apex Classes, Triggers, Flows, Profiles, Roles,
Permission Set Groups, and Users.

The Setup landing page is never lost — it is the first row inside the category
("Open Permission Sets setup page"), which is also where you go to create a new
one.

Two consequences worth knowing:

- **No duplicate rows.** A category owns its Setup node, so the static list does
  not also carry it. Previously "permission set" returned both a category row
  and a near-identical Setup row.
- **Object Manager rows for `Profile`, `PermissionSet`, `User`, `UserRole` and
  `Flow` rank _below_ their category.** They are demoted, not removed — the
  Object Manager page for those is rarely the target, but silently dropping a
  reachable destination is worse than ranking it low.

## Scale: how many rows can a source have?

Two kinds of source, handled differently — because they fail differently.

**Org configuration** (objects, Apex classes, triggers, flows, permission sets,
profiles, roles, permission set groups) is bounded at a few thousand rows. These
are downloaded once and cached. The queries carry **no `LIMIT`**: pagination
follows `nextRecordsUrl` up to a `MAX_RECORDS` cap of 10,000, and if that cap is
reached the list says so — _"Showing the first 10,000 — refine your search"_.

> A `LIMIT 2000` on the query is exactly the wrong tool here: it caps the whole
> result set, so `done` is always true, the pagination loop never runs, and
> everything past the cutoff disappears with no error. An org with 2,500 Apex
> classes would simply not contain the last 500, and nobody would know.

**Except the object list, which cannot paginate at all.** `EntityDefinition`
rejects `queryMore()` outright:

```
EntityDefinition does not support queryMore(), use LIMIT to restrict the
results to a single batch          [EXCEEDED_ID_LIMIT]
```

So on an org with more than 2,000 objects the _entire_ query fails and the
palette ends up with no objects whatsoever — no browse/open pair, and searches
falling through to whatever trigger happens to share the name. Objects are
therefore paged by cursor (`src/keyset.js`): each batch carries an explicit
`LIMIT` plus `QualifiedApiName > lastSeen`.

That cursor needs **deduplication, and not as a safety net**. `ORDER BY
QualifiedApiName` sorts case-insensitively while `QualifiedApiName > '…'`
compares case-sensitively, so lowercase API names sort early yet still satisfy
the cursor and come back a second time. On a real org: 2,000 + 1,680 rows
fetched, 392 of them duplicates, landing on exactly the 3,288 objects the org
reports.

`FieldDefinition` and `FlowDefinitionView` are reified the same way, so both
carry an explicit `LIMIT`. Neither can realistically exceed one batch — fields
per object are capped well below 2,000 — and the flow-view query only supplies
labels.

**Org data** (users) is unbounded — a large org holds a hundred thousand. Users
are therefore **never cached**. Typing in the `user ›` category runs a debounced
SOSL search on the server:

```
FIND {joh*} IN NAME FIELDS RETURNING User(Id, Name, Username WHERE IsActive = true ORDER BY Name LIMIT 50)
```

SOSL rather than SOQL `LIKE '%joh%'`: a leading wildcard cannot use an index, so
on a large org that query is slow or times out. SOSL is the indexed search
Salesforce's own lookup fields use. The trailing `*` keeps it a prefix match.

The cost, stated plainly: **`user ›` cannot list everyone.** With an empty box it
asks you to type at least two characters. Users are also absent from the root
search — they only exist inside their category.

Ranking is not the constraint, measured rather than assumed: over a real org's
worth of candidates (~5,500 — 3,288 objects, 1,127 Apex classes, 1,041 flows,
605 permission sets) `rank()` takes **2–5 ms** per keystroke against a 16 ms
frame budget.

### The list renders a window, not everything

Rendering 3,288 rows makes every keystroke crawl, so only **50 rows** are in the
DOM at a time. The window grows by a page when you scroll near the bottom or
arrow past the last rendered row, and the footer says how much is held back:

```
Showing 50 of 3,288 — scroll for more
```

Wrapping upward from the first row deliberately stops at the last _rendered_
row rather than the true last row — jumping to row 3,288 would have to render
everything, which is the cost the window exists to avoid.

Nothing is rigid. Type any name straight into the empty box — object, Apex
class, trigger, flow, or Setup page — and it matches. The scope keywords
(`object`, `apex`, `trigger`, `flow`) are an _optional_ way to narrow, never a
required prefix.

## Why this is an extension, not Salesforce metadata

The obvious build is a Lightning Utility Bar component. It cannot work.

A utility bar is always attached to a specific Lightning **app**, and Setup does
not run inside any customizable app. Salesforce exposes no org-wide injection
point. So a utility bar palette would vanish exactly where admins need it most —
in Setup.

There is no Apex, no metadata, and nothing to deploy here. The repo's Salesforce
conventions do not apply to this folder.

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder (`tools/sf-nav-palette/`)
3. Open any Salesforce page and press **Ctrl+Shift+K** (**⌘⇧K** on Mac)

To change the shortcut: `chrome://extensions/shortcuts`.

`Ctrl+K` also works as a fallback, but it is _not_ the primary binding — Ctrl+K
is a browser-level shortcut (address bar) that a page cannot reliably claim.

### If Ctrl+Shift+K does nothing

Chrome assigns an extension's suggested shortcut **only on first install**, and
silently leaves it blank when another extension already owns the keys. So the
palette also listens for `Ctrl+Shift+K` in the page itself, and when Chrome
reports the command as unassigned the palette footer says so and points at
`chrome://extensions/shortcuts`.

Classic Setup pages render inside an **iframe**; with focus in there, the top
frame never sees the keypress. `keys.js` (a tiny listener in every sub-frame,
no data access) relays the keypress to the service worker, which toggles the
palette in the top frame. When both the command and the in-page listener fire
for the same press, `toggle()` ignores the second within 300 ms — otherwise the
palette opened and closed in the same instant.

## Publishing to the Chrome Web Store

```bash
npm run icons     # regenerate icons/ from scripts/make-icons.mjs
npm run build     # stage dist/ with only what ships, and preflight the manifest
```

Then zip the **contents** of `dist/` — `manifest.json` must sit at the archive
root:

```powershell
Compress-Archive -Path dist/* -DestinationPath sf-nav-palette.zip -Force
```

Upload at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
(one-time $5 developer registration). Everything the listing form asks for —
single purpose, per-permission justifications, data declarations, description
copy — is written out in [store/LISTING.md](store/LISTING.md).

**[store/PRIVACY.md](store/PRIVACY.md) must be published at a public URL** and
that URL pasted into the listing; a policy is mandatory because the extension
requests `cookies`. Reviewers cross-check manifest permissions against the
declared data categories against the privacy policy, and any disagreement
between the three is the most common rejection.

Two things to decide before submitting: pick **Unlisted** rather than Public for
an internal tool, and — if your employer manages Chrome — ask IT whether an
enterprise force-install is preferable to the store at all.

## Keys

| Key                       | Action                                       |
| ------------------------- | -------------------------------------------- |
| `Ctrl+Shift+K`            | Open / close                                 |
| `↑` `↓`                   | Move through results                         |
| `Enter` · `Tab` · `>`     | Select — drills in, or navigates if terminal |
| `Backspace` (empty input) | Step back one breadcrumb                     |
| `Esc`                     | Close                                        |

Opening with an empty box shows your top 5 most-used destinations.

## How it fits together

| File               | Role                                                  |
| ------------------ | ----------------------------------------------------- |
| `manifest.json`    | MV3 config, host matches, shortcut                    |
| `content.js`       | Classic bootstrap; dynamically imports the ES modules |
| `keys.js`          | document_start: shields palette keys from page shortcuts (Lightning's "e"), relays Ctrl+K from Setup iframes |
| `background.js`    | The only code that touches cookies or the network     |
| `src/pathModel.js` | Drill-down state machine — the real behaviour         |
| `src/providers/`   | Turn org records into candidates                      |
| `src/fuzzy.js`     | Ranking                                               |
| `src/urls.js`      | Setup URL construction                                |
| `src/org.js`       | Host → API origin                                     |
| `src/recents.js`   | Usage history                                         |
| `src/palette.js`   | Shadow-root UI                                        |

### Three hosts, one org

A single org answers on three hosts, and they are not interchangeable:

| Host                        | Serves                                 |
| --------------------------- | -------------------------------------- |
| `*.lightning.force.com`     | App pages, records, list views         |
| `*.my.salesforce-setup.com` | **Setup**                              |
| `*.my.salesforce.com`       | REST/Tooling API, and the `sid` cookie |

All three are in `manifest.json`. **Dropping `salesforce-setup.com` would make
the palette invisible in Setup**, which defeats the point of the tool. The
domain part can contain dots (`orgfarm-x.develop.my.salesforce.com`), so
`src/org.js` swaps a known suffix instead of splitting on the first dot.

### Security

The `sid` cookie is a live session credential. Content scripts cannot read it
(it is httpOnly), so every query is brokered through the service worker, where
the token stays in memory for the duration of one request. It is never logged,
never persisted, and never sent to a content script. API error bodies are not
included in thrown errors, because Salesforce error payloads can echo the
request.

### Things that were verified against a real org, not assumed

These cost real time to pin down and are easy to get wrong:

- **`EntityDefinition.DurableId` has two shapes.** Standard objects give the API
  name (`Account`); custom objects give a `01I`-prefixed id
  (`01Ig5000003ZM8o`). Object Manager URLs need whichever one applies, which is
  why DurableId is carried around instead of the API name.
- **`FieldDefinition` cannot be queried unfiltered.** Without an
  `EntityDefinitionId` filter the org replies _"a filter on a reified column is
  required"_. That is also why fields are the one source that stays lazy.
- **`FieldDefinition.DurableId` is `<entity>.<field>`** — e.g.
  `01Ig5000003ZM8o.00Ng500000PtYfV`. Split on the **first** dot only.
- **Flows need two queries joined.** Tooling `FlowDefinition` has the only
  navigable id (`300…`) but returns a blank `MasterLabel`.
  `FlowDefinitionView` has the labels but no usable id at all — its `DurableId`
  is an API name and `LatestVersionId` is a string like `MyFlow-1`. The provider
  joins them on `DeveloperName` ↔ `ApiName`.

### Loading behaviour

The root searches every source at once, so it cannot lazy-load: the palette
fires all three org queries on first open and merges results in as they land.
The first open looks like it is filling in; everything after that is instant.

Fields stay lazy and are cached per object — prefetching fields for 1,300
objects would be hundreds of queries for data nobody looks at.

## Tests

```bash
cd tools/sf-nav-palette
npm test
```

Runs `node --test` over the pure modules — no dependencies, no build step, and
the same files the browser loads. `pathModel` and `urls` carry the most weight:
they encode the whole interaction and every URL shape.

## Known limits

- Navigation is a full page load, not a Lightning SPA transition. SPA routing
  needs page-world `$A` injection, which breaks with Salesforce releases.
- Only Fields drills below an object; the other five tabs stop at their list
  page.
- Records are not searchable by name — Salesforce global search already does
  that well.
