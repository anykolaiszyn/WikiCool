# VCC Wiki

A self-hosted, Wikipedia-style internal knowledge base for Vice City Cigars. The entire content layer is a private GitHub repository — no database, no CMS, no Postgres. Every page read is a GitHub API call; every save is a commit. The app is a static React SPA served by Caddy inside Docker, reachable privately through a Cloudflare Tunnel with Cloudflare Access gating the door. The result is a searchable, version-controlled, offline-resilient archive that any authorised user can read and edit from a browser.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                        │
│                                                             │
│  ┌──────────┐   Octokit REST   ┌──────────────────────────┐│
│  │ WikiStore│ ───────────────► │  api.github.com          ││
│  │ (cache)  │ ◄─────────────── │  /repos/:owner/:repo     ││
│  └──────────┘  JSON responses  └──────────────────────────┘│
│       │                                  │                  │
│       │ parsed WikiPage[]                │ reads/writes     │
│       ▼                                  ▼                  │
│  Components                   ┌──────────────────────────┐ │
│  (PageView, Editor, Search…)  │  Private GitHub repo     │ │
│                               │  vcc-wiki-content        │ │
│                               │  content/                │ │
│                               │    vendors/*.md          │ │
│                               │    products/*.md         │ │
│                               │    sops/*.md  …          │ │
│                               └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

Homelab deployment path
═══════════════════════

 ┌────────────┐   HTTPS    ┌──────────────────┐   outbound   ┌─────────────┐
 │  Browser   │ ─────────► │ Cloudflare Edge  │ ◄─────────── │ cloudflared │
 │  anywhere  │            │ + Access (authn) │   Tunnel     │  (homelab)  │
 └────────────┘            └──────────────────┘              └──────┬──────┘
                                                                     │
                                                               ┌─────▼──────┐
                                                               │  Docker    │
                                                               │  Caddy     │
                                                               │  :8080     │
                                                               │  /srv/dist │
                                                               └────────────┘
```

---

## Quick start (local dev)

```bash
# 1. Clone the app repo
git clone https://github.com/your-org/vcc-wiki.git
cd vcc-wiki

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local and fill in:
#   VITE_GITHUB_OWNER   your GitHub username or org
#   VITE_GITHUB_REPO    the private content repo name (e.g. vcc-wiki-content)
#   VITE_GITHUB_BRANCH  main
#   VITE_CONTENT_PATH   content
#   VITE_GITHUB_TOKEN   optional — paste a fine-grained PAT or leave blank
#                       to use the runtime login prompt

# 4. Start the dev server
npm run dev
# → http://localhost:5173
```

If you leave `VITE_GITHUB_TOKEN` blank, the app shows a login card on first load. Paste a fine-grained PAT there — it is stored only in `localStorage` and never sent anywhere except `api.github.com`.

See **[docs/WIKI_REPO_SETUP.md](docs/WIKI_REPO_SETUP.md)** for how to create the content repo and generate the right PAT.

---

## Content model

All wiki content lives in a separate private repository. Pages are Markdown files with YAML frontmatter under `content/<collection>/<slug>.md`.

### Folder conventions

| Folder | Page type | Purpose |
|---|---|---|
| `content/vendors/` | `vendor` | Supplier profiles |
| `content/products/` | `product` | Cigar and accessory pages |
| `content/sops/` | `sop` | Standard operating procedures |
| `content/events/` | `event` | Tastings, private venue nights |
| `content/people/` | `person` | Staff and contact profiles |
| `content/notes/` | `note` | Free-form notes and memos |

### Frontmatter schema by type

**vendor**
```yaml
---
title: Padrón Cigars
type: vendor
tags: [nicaragua, family-owned]
category: Premium
contact: sales@padron.com
rep: Maria Lopez
map_policy: strict
moq_usd: 500
payment_terms: Net 30
lead_time_days: 14
last_contact: 2025-11-01
---
```

**product**
```yaml
---
title: Padrón 1926 No. 35 Natural
type: product
tags: [nicaragua, box-pressed]
sku: PAD-1926-35-N
category: Premium
supplier: vendors/padron
case_cost: 360.00
landed_cost: 380.00
otp_adjusted_cost: 395.00
msrp: 28.00
active: true
---
```

**sop**
```yaml
---
title: Humidor Calibration
type: sop
owner: Store Manager
applies_to: All staff
status: active
last_reviewed: 2025-09-15
version: "2.1"
---
```

**event**
```yaml
---
title: Private Venue Night — February 2026
type: event
tags: [private, tasting]
venue: The Cigar Lounge
location: Miami, FL
dates: 2026-02-10
permit_type: Special Sales
status: confirmed
---
```

**person**
```yaml
---
title: Carlos Rivera
type: person
tags: [vendor-rep]
role: Regional Sales Rep
affiliation: vendors/padron
contact: carlos@padron.com
first_met: 2024-03-20
---
```

**note**
```yaml
---
title: Q4 Inventory Notes
type: note
tags: [inventory, q4-2025]
---
```

### Wikilink syntax

VCC Wiki uses Obsidian-style wikilinks anywhere in a page body:

```markdown
[[vendors/padron]]               → links to the Padrón vendor page
[[vendors/padron|Padrón Cigars]] → link with custom display text
[[Padrón Cigars]]                → fuzzy-matched by last segment or title
```

Broken wikilinks render as `<span class="wikilink-missing">` with a dotted underline and are not linked. The "What links here" section at the bottom of each page shows incoming backlinks.

---

## Adding a new page type

1. **Extend `PageType`** in `src/types.ts`:
   ```ts
   export type PageType = 'vendor' | 'sop' | 'product' | 'event' | 'person' | 'note' | 'blend'
   ```

2. **Add an infobox template** in `src/components/Infobox.tsx` — add an entry to `TEMPLATES`:
   ```ts
   blend: [
     { key: 'wrapper',   label: 'Wrapper' },
     { key: 'binder',    label: 'Binder' },
     { key: 'filler',    label: 'Filler' },
     { key: 'strength',  label: 'Strength' },
   ],
   ```
   TypeScript will error if you forget to add the new type here — `TEMPLATES` is typed `Record<PageType, FieldDef[]>`.

3. **Add a body template** in `src/components/NewPage.tsx` — add an entry to `BODY_TEMPLATES`:
   ```ts
   blend: `## Profile\n\n## Tasting Notes\n\n## Pairings\n`,
   ```

4. **Optionally add adaptive table columns** in `src/components/CategoryPage.tsx` — add an entry to `TYPE_COLUMNS`:
   ```ts
   blend: [
     { key: 'wrapper',  label: 'Wrapper' },
     { key: 'strength', label: 'Strength' },
   ],
   ```
   If omitted, the category table falls back to generic title/type/tags columns.

5. Add the new collection folder to the **New Page** form's `COLLECTIONS` array in `src/components/NewPage.tsx` if you want a dedicated folder.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server on `0.0.0.0:5173` |
| `npm run build` | Type-check + Vite bundle to `dist/` |
| `npm run preview` | Serve `dist/` on `0.0.0.0:8080` |
| `npm run typecheck` | TypeScript strict check, no emit |

---

## Deployment

See **[docs/DEPLOY_HOMELAB.md](docs/DEPLOY_HOMELAB.md)** for the full Docker + Cloudflare Tunnel + Access setup.

**TL;DR:**
```bash
docker build \
  --build-arg VITE_GITHUB_OWNER=your-org \
  --build-arg VITE_GITHUB_REPO=vcc-wiki-content \
  -t vcc-wiki:latest .

docker compose --env-file .env.local up -d
```

---

## Further reading

- [docs/WIKI_REPO_SETUP.md](docs/WIKI_REPO_SETUP.md) — create the content repo, generate a fine-grained PAT, token rotation
- [docs/DEPLOY_HOMELAB.md](docs/DEPLOY_HOMELAB.md) — Docker build, Cloudflare Tunnel, Cloudflare Access

---

## License

Apache 2.0 — see below.

```
Copyright 2025 Vice City Cigars

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
