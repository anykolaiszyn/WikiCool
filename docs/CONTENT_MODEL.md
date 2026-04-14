# Content Model

This document is the canonical reference for anyone creating or editing pages in the VCC Wiki. It covers frontmatter schemas by type, wikilink syntax and resolution, tagging conventions, and guidance on when to create a new page versus extending an existing one.

---

## How pages work

Every wiki page is a Markdown file stored in the content repo under `content/<collection>/<slug>.md`. The YAML block at the top of the file is the **frontmatter**; everything below it is the **body**.

```
content/
  vendors/          ← vendor pages
  products/         ← product pages
  sops/             ← standard operating procedures
  events/           ← event records
  people/           ← staff and contact profiles
  notes/            ← free-form notes, memos, scratch pads
  index.md          ← wiki home page
```

The file path becomes the page URL:

```
content/vendors/padron.md       →  /wiki/vendors/padron
content/sops/humidor-cal.md     →  /wiki/sops/humidor-cal
content/index.md                →  /wiki/index  (home page)
```

Slugs must be lowercase and hyphen-separated. The New Page form generates slugs automatically from the title you enter.

---

## Page types

### `vendor`

A supplier or distribution partner. One page per vendor relationship.

**Folder**: `content/vendors/`

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | Company name |
| `type` | yes | `vendor` | |
| `tags` | no | list | See tag conventions |
| `category` | no | string | e.g. `Premium`, `Pipe Tobacco` |
| `contact` | no | string | Primary email or phone |
| `rep` | no | string | Named sales rep |
| `map_policy` | no | string | `strict`, `flexible`, or `none` |
| `moq_usd` | no | number | Minimum order value in USD |
| `payment_terms` | no | string | e.g. `Net 30`, `Prepay` |
| `lead_time_days` | no | number | Days from PO to expected delivery |
| `last_contact` | no | date (YYYY-MM-DD) | Most recent meaningful interaction |

**Minimal example**:
```yaml
---
title: Padrón Cigars
type: vendor
tags: [nicaragua, premium]
contact: sales@padron.com
rep: Maria Lopez
map_policy: strict
moq_usd: 500
payment_terms: Net 30
lead_time_days: 14
last_contact: 2026-03-01
---

## Overview

...
```

---

### `product`

An individual cigar, accessory, or SKU-level item.

**Folder**: `content/products/`

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | Full product name including vitola |
| `type` | yes | `product` | |
| `tags` | no | list | Wrapper origin, shape, strength, etc. |
| `sku` | no | string | Internal SKU |
| `category` | no | string | e.g. `Premium`, `Accessory` |
| `supplier` | no | slug | Wikilink to the vendor page, e.g. `vendors/padron` |
| `case_cost` | no | number | Cost per box/case from distributor |
| `landed_cost` | no | number | After freight and duty |
| `otp_adjusted_cost` | no | number | After Florida OTP tax adjustment |
| `msrp` | no | number | Manufacturer suggested retail price |
| `active` | no | boolean | `true` if currently stocked |

**Minimal example**:
```yaml
---
title: Padrón 1926 No. 35 Natural
type: product
tags: [nicaragua, box-pressed, full]
sku: PAD-1926-35-N
category: Premium
supplier: vendors/padron
case_cost: 360.00
landed_cost: 378.00
otp_adjusted_cost: 393.00
msrp: 28.00
active: true
---

## Description

...
```

---

### `sop`

A standard operating procedure, policy, or repeatable process.

**Folder**: `content/sops/`

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | |
| `type` | yes | `sop` | |
| `owner` | no | string | Person responsible for keeping it current |
| `applies_to` | no | string | Free text — `all staff`, `managers`, `both`, etc. |
| `status` | no | string | `active`, `draft`, or `archived` |
| `last_reviewed` | no | date (YYYY-MM-DD) | |
| `version` | no | string | Semantic version string, e.g. `"1.2"` (quote it — YAML treats `1.2` as a float) |
| `tags` | no | list | |

**Minimal example**:
```yaml
---
title: Humidor Calibration
type: sop
owner: Store Manager
applies_to: all staff
status: active
last_reviewed: 2026-01-15
version: "2.0"
---

## Purpose

...

## Procedure

1. ...
```

---

### `event`

A tasting, private venue night, trade show, or pop-up.

**Folder**: `content/events/`

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | |
| `type` | yes | `event` | |
| `venue` | no | string | Venue name |
| `location` | no | string | City / address |
| `dates` | no | date or string | Single date or range |
| `permit_type` | no | string | e.g. `Special Sales`, `Tasting Permit` |
| `status` | no | string | `confirmed`, `tentative`, `completed`, `cancelled` |
| `tags` | no | list | |

**Minimal example**:
```yaml
---
title: PCA 2026 Debrief
type: event
tags: [trade-show, pca]
venue: Las Vegas Convention Center
location: Las Vegas, NV
dates: 2026-07-11
status: completed
---

## Highlights

...
```

---

### `person`

A staff member, vendor rep, or external contact.

**Folder**: `content/people/`

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | Full name |
| `type` | yes | `person` | |
| `role` | no | string | Job title or relationship |
| `affiliation` | no | slug | Wikilink to vendor or employer page |
| `contact` | no | string | Email or phone |
| `first_met` | no | date (YYYY-MM-DD) | |
| `tags` | no | list | e.g. `vendor-rep`, `staff`, `supplier` |

**Minimal example**:
```yaml
---
title: Maria Lopez
type: person
tags: [vendor-rep]
role: Regional Sales Rep
affiliation: vendors/padron
contact: maria@padron.com
first_met: 2025-08-10
---

## Notes

...
```

---

### `note`

A free-form page: meeting notes, memos, scratch pads, one-off research. No fixed schema.

**Folder**: `content/notes/`

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | |
| `type` | yes | `note` | |
| `tags` | no | list | |

The `note` type intentionally has no infobox fields. Use the body freely.

**Minimal example**:
```yaml
---
title: Q4 2025 Inventory Review
type: note
tags: [inventory, q4-2025]
---

Notes from the November count...
```

---

## Wikilinks

Wikilinks are written using Obsidian syntax anywhere in the body of a page.

### Syntax

```markdown
[[vendors/padron]]                     link using the full slug
[[vendors/padron|Padrón Cigars]]       link with custom display text
[[Padrón Cigars]]                      fuzzy match (see resolution order below)
```

### Resolution order

When the wiki encounters `[[Target]]`, it resolves it in three steps:

1. **Exact slug match** — looks for a page whose slug is exactly `Target`. Case-sensitive.
   - `[[vendors/padron]]` matches `content/vendors/padron.md`.

2. **Last-segment match** — looks for pages whose slug ends with `/Target` (exact, after the final `/`).
   - `[[padron]]` matches `vendors/padron` if that is the only page whose last segment is `padron`.
   - If two pages have the same last segment, this step fails and the link is marked missing.

3. **Slugified last-segment match** — normalises `Target` through the slug function (lowercase, strip diacritics, spaces → hyphens) and tries the last-segment match again.
   - `[[Padrón Cigars]]` slugifies to `padron-cigars`, then matches `vendors/padron-cigars` if unique.

If none of the three steps finds a unique match, the link renders as a **missing link**: the display text is shown with a dotted underline and `cursor: help`. This is intentional — it signals that the target page needs to be created.

### Tips

- Use the full slug (`[[vendors/padron]]`) when you know it. It is unambiguous and never breaks if other pages happen to share a similar last segment.
- Use a display alias (`[[vendors/padron|Padrón]]`) when the slug is ugly in running prose.
- Check the "What links here" section at the bottom of any page to see all incoming backlinks.

---

## Tag conventions

Tags are set in the frontmatter as a YAML list:

```yaml
tags: [nicaragua, box-pressed, full-strength]
```

Rules:
- **Lowercase only.** `Nicaragua` is wrong; `nicaragua` is correct.
- **Kebab-case for multi-word tags.** `box-pressed`, not `boxpressed` or `box pressed`.
- **No special characters** except hyphens. No slashes, underscores, or dots.
- **Be consistent.** Before adding a tag, check whether a similar tag already exists by searching or browsing `/tag/<name>`.
- Tags are surfaced on the infobox and linked to `/tag/<name>` listing pages. They should be meaningful enough that someone would browse by them.

**Good tags**: `nicaragua`, `connecticut-wrapper`, `box-pressed`, `full-strength`, `vendor-rep`, `trade-show`, `daily-ops`

**Avoid**: `misc`, `todo`, `temp`, `2026`, `new` — these add noise without helping navigation.

---

## New page vs. new section

**Create a new page when:**
- The subject has enough distinct properties to benefit from a structured infobox (vendors, products, people, events).
- Other pages will link to it with wikilinks.
- You expect to track its history separately (e.g. a product page whose cost or status changes over time).
- The content would make an existing page significantly longer or harder to navigate.

**Add a section to an existing page when:**
- The information only makes sense in the context of that page (e.g. ordering notes specific to one vendor go on the vendor page, not a separate note).
- The content is short (under ~200 words) and unlikely to be linked to directly.
- You are annotating a record rather than creating a new one (e.g. adding a "2026 Follow-up" section to an existing event page).

**Use a `note` page when:**
- You need to capture something quickly and it doesn't fit an existing collection.
- You're not sure yet whether it warrants a structured page.
- It's a meeting summary, brainstorm, or scratch pad.

Notes are easy to promote to a proper typed page later — just change `type: note` to `type: vendor` (or whichever), add the infobox fields, and move the file to the appropriate collection folder.

---

## Field types reference

| YAML type | Example | Notes |
|---|---|---|
| String | `title: Padrón 1926` | No quotes needed unless the value contains `:` or starts with a special char |
| Number | `moq_usd: 500` | Do not quote. Decimals are fine: `case_cost: 360.00` |
| Boolean | `active: true` | Lowercase `true`/`false` only |
| Date | `last_contact: 2026-03-01` | ISO 8601 (`YYYY-MM-DD`). No quotes needed |
| List | `tags: [nicaragua, premium]` | Inline list syntax. Or multi-line: `tags:\n  - nicaragua\n  - premium` |
| Version string | `version: "1.2"` | **Must be quoted** — unquoted `1.2` is parsed as a float |
