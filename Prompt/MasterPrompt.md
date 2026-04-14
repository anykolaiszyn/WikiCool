# VCC Wiki — Vibecode Build Guide

Self-hosted Wikipedia-style wiki backed by a private GitHub repo. No database. Repo is the source of truth.

**Architecture**: Vite + React + TypeScript SPA → Octokit → private GitHub repo (markdown + YAML frontmatter). Deployed to homelab via Docker + Caddy, exposed via Cloudflare Tunnel, gated by Cloudflare Access.

Work through prompts in order. Each is self-contained enough to paste into Claude Code or Copilot Chat. Don't skip — later prompts assume earlier state. If a prompt references a file that doesn't exist yet, it's a prior prompt's deliverable.

---

## MASTER PROMPT (paste this first, then reference it per prompt)

> You are helping build **VCC Wiki**, a self-hosted Wikipedia-style wiki where a private GitHub repo is the single source of truth for all content. No database. No Postgres. Every page read is a GitHub API call; every edit is a commit.
>
> **Stack**: Vite 5 + React 18 + TypeScript 5 (strict). React Router v6. Octokit REST client. `gray-matter` for frontmatter. `react-markdown` + `remark-gfm` + `rehype-highlight` for rendering. `@uiw/react-codemirror` for editing. `minisearch` for client-side search. No CSS framework — hand-written CSS with CSS variables in `src/styles/global.css`.
>
> **Aesthetic**: letterpress / old-world maritime archive. Cream paper background (#f4ede0 range), deep burgundy and tobacco accents, IM Fell English for display headings, Cormorant Garamond for body, JetBrains Mono for code. Refined, not ornamental. Think "Lloyd's register" not "pirate emoji."
>
> **Content model**: markdown files with YAML frontmatter under `content/<collection>/<slug>.md`. Collections are just folders: `vendors/`, `products/`, `sops/`, `events/`, `people/`, `notes/`. Frontmatter drives typed infoboxes.
>
> **Non-negotiables**:
> - Strict TypeScript. No `any` except at interop boundaries with explicit justification.
> - Every GitHub API call goes through `src/lib/github.ts`. Components never import Octokit directly.
> - Wikilinks use `[[Target]]` and `[[Target|Display]]` Obsidian syntax.
> - Auth is a Personal Access Token stored in localStorage. OAuth is a stub for later.
> - The repo the wiki reads/writes is configured via Vite env vars: `VITE_GITHUB_OWNER`, `VITE_GITHUB_REPO`, `VITE_GITHUB_BRANCH`, `VITE_CONTENT_PATH`.
> - All styling via CSS variables defined once in `global.css`. No inline color values in components.
>
> Produce exactly what each prompt asks for. Ask before inventing new dependencies.

---

## Phase 1 — Foundation

### VW-01 · Project skeleton

**Goal**: initialize the Vite project and install dependencies.

**Prompt**:
> Create a new Vite + React + TypeScript project in the current directory. Set up `package.json`, `tsconfig.json`, `vite.config.ts`, and `index.html` for an app named `vcc-wiki`.
>
> Install these runtime deps: `@octokit/rest`, `gray-matter`, `minisearch`, `react`, `react-dom`, `react-router-dom`, `react-markdown`, `remark-gfm`, `rehype-highlight`, `@codemirror/lang-markdown`, `@uiw/react-codemirror`.
>
> Install these dev deps: `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `typescript`, `vite`.
>
> `tsconfig.json`: strict, ES2022 target, `jsx: "react-jsx"`, `moduleResolution: "bundler"`.
>
> `index.html` should preload Google Fonts: IM Fell English, Cormorant Garamond, JetBrains Mono.
>
> `vite.config.ts`: bind dev server to `0.0.0.0:5173`, build to `dist`.
>
> Add scripts: `dev`, `build` (tsc + vite build), `preview` (bound to `0.0.0.0:8080`), `typecheck`.

**Acceptance**: `npm install` and `npm run dev` both succeed.

---

### VW-02 · Environment config and wiki repo prep

**Goal**: define env surface and document repo prerequisites.

**Prompt**:
> Create `.env.example` with these keys:
> - `VITE_GITHUB_OWNER` — GitHub username or org
> - `VITE_GITHUB_REPO` — private repo name holding the wiki content
> - `VITE_GITHUB_BRANCH` — default `main`
> - `VITE_CONTENT_PATH` — default `content`, root folder inside the repo for wiki markdown
> - `VITE_GITHUB_TOKEN` — optional, single-user homelab shortcut
>
> Create `.gitignore` excluding `node_modules`, `dist`, `.env`, `.env.local`, `.DS_Store`, `*.log`.
>
> Create `docs/WIKI_REPO_SETUP.md` explaining how to set up the content repo:
> 1. Create a private repo (e.g. `vcc-wiki-content`) separate from the app repo
> 2. Create `content/` folder with a stub `index.md`
> 3. Folder conventions: `content/vendors/`, `content/products/`, `content/sops/`, `content/events/`, `content/people/`, `content/notes/`
> 4. How to generate a fine-grained PAT with only `Contents: Read+Write` and `Metadata: Read` on that repo
> 5. Token expiration and rotation guidance

**Acceptance**: `.env.example` exists; `docs/WIKI_REPO_SETUP.md` is copy-pasteable for someone setting up a fresh content repo.

---

## Phase 2 — Core libraries

### VW-03 · Type definitions

**Prompt**:
> Create `src/types.ts` with these types:
>
> - `WikiConfig` — owner, repo, branch, contentPath
> - `PageType` — string union: `'vendor' | 'sop' | 'product' | 'event' | 'person' | 'note'`
> - `PageFrontmatter` — `{ title?, type?: PageType, tags?: string[], [key: string]: unknown }`
> - `WikiPage` — slug, path, frontmatter, body (markdown without frontmatter), raw (full file), optional sha
> - `FileEntry` — path, slug, sha
> - `CommitInfo` — sha, message, author, date, url
> - `BacklinkIndex` — `{ incoming: Record<string, string[]>, outgoing: Record<string, string[]> }` where keys are slugs
>
> Export all. Document each with a one-line JSDoc comment.

**Acceptance**: `npm run typecheck` passes with this file.

---

### VW-04 · Auth module

**Prompt**:
> Create `src/lib/auth.ts`. Export:
> - `getToken(): string | null` — prefer `import.meta.env.VITE_GITHUB_TOKEN` if set and non-empty, else read from `localStorage['vcc-wiki:gh-token']`
> - `setToken(token: string): void` — write to localStorage
> - `clearToken(): void`
> - `hasToken(): boolean`
> - `loginWithGitHub(): Promise<void>` — stub that throws "OAuth not implemented"
>
> Include a JSDoc block at the top explaining the current PAT-based strategy and a multi-line comment near `loginWithGitHub` sketching how to upgrade to OAuth later (register GitHub OAuth app, stand up a Cloudflare Worker to exchange code for token, `setToken()` on callback).

---

### VW-05 · GitHub API client

**Prompt**:
> Create `src/lib/github.ts`. Read env vars into a `config: WikiConfig` constant. Export:
>
> - `config` — populated from env
> - `pathToSlug(path)` / `slugToPath(slug)` — deterministic conversion using `config.contentPath` prefix and `.md` suffix
> - `listAllPages(): Promise<FileEntry[]>` — use the git tree API (`gh.git.getRef` + `gh.git.getTree` with `recursive: 'true'`). Filter to blobs under `contentPath/` ending in `.md`. One API call total.
> - `readPage(slug): Promise<{raw, sha} | null>` — returns `null` on 404, throws otherwise. Decode base64 content as UTF-8.
> - `writePage({ slug, content, message, sha? })` — calls `createOrUpdateFileContents`. If `sha` present it's an update, otherwise create. Returns the new blob sha. Encode content as UTF-8 → base64.
> - `pageHistory(slug, limit = 30): Promise<CommitInfo[]>` — listCommits filtered by path
> - `readPageAtCommit(slug, sha): Promise<string | null>` — read a specific revision
> - `ping(): Promise<boolean>` — true if `repos.get()` succeeds with current token
>
> Internal helpers: `client()` constructs an Octokit instance from `getToken()`, throws if no token. `decodeContent(b64)` and `encodeContent(text)` use `TextDecoder`/`TextEncoder` and `atob`/`btoa`.
>
> Components MUST NOT import Octokit directly — only this module.

**Acceptance**: typecheck passes; `ping()` returns true when a valid PAT and real repo are configured.

---

### VW-06 · Markdown + frontmatter + wikilinks

**Prompt**:
> Create `src/lib/markdown.ts`. Export:
>
> - `parsePage(slug, path, raw, sha?): WikiPage` — uses `gray-matter` to split frontmatter and body
> - `serializePage(frontmatter, body): string` — `matter.stringify(body, frontmatter)`
> - `titleToSlug(title): string` — lowercase, strip diacritics (NFD normalize + remove combining marks), keep unicode letters/numbers, spaces → hyphens
> - `resolveWikilink(target, knownSlugs): string | null` — resolution order:
>   1. Exact slug match
>   2. Last-segment match across slugs (so `[[El Galeón]]` finds `vendors/el-galeon-tobacco` if that's the only matching tail)
>   3. Slugified match on last segment
> - `rewriteWikilinks(markdown, knownSlugs): string` — transform `[[Target]]` and `[[Target|Display]]` into `[Display](/wiki/<slug>)` for resolved links, or `<span class="wikilink-missing" title="...">Display</span>` for unresolved
> - `extractWikilinks(markdown): string[]` — return all raw `[[targets]]` from a markdown body
>
> Use a single regex for `[[X]]` and `[[X|Y]]` forms: `/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g`.

---

### VW-07 · Backlink index

**Prompt**:
> Create `src/lib/backlinks.ts`. Export `buildBacklinkIndex(pages: WikiPage[]): BacklinkIndex`.
>
> For each page, extract wikilinks via `extractWikilinks`, resolve each via `resolveWikilink` against the set of all slugs. Build both:
> - `outgoing[slug]` — list of resolved target slugs
> - `incoming[targetSlug]` — list of slugs that link to it (deduped)
>
> Skip self-links. Handle unresolved links silently (they just don't appear in either map). Pure function, no side effects.

---

### VW-08 · Client-side search

**Prompt**:
> Create `src/lib/search.ts`. Export:
>
> - `SearchResult` type — `{ slug, title, score, snippet }`
> - `buildSearchIndex(pages): MiniSearch` — fields: title, body, tags, type. Stored fields: slug, title, body. Boost title 3x and tags 2x. Enable fuzzy 0.2 and prefix matching.
> - `search(idx, query, limit = 10): SearchResult[]` — run the search, produce a ~170-char snippet centered on the first query term's occurrence in the body (with ellipses).
>
> Document IDs are array index; store slug as a field so results carry it.

---

## Phase 3 — App shell

### VW-09 · Main entry + routing

**Prompt**:
> Create `src/main.tsx` — standard React 18 root render, `<BrowserRouter>` wrapper, `<App />` inside `<StrictMode>`. Import `./styles/global.css`.
>
> Create `src/App.tsx` with routes:
> - `/` — redirect to `/wiki/index`
> - `/wiki/*` — page view (capture slug from splat)
> - `/edit/*` — editor
> - `/new` — new page form
> - `/history/*` — commit history for a page
> - `/tag/:tag` — tag listing
> - `/category/*` — folder listing
> - `/search` — search results page
> - `*` — 404
>
> Wrap everything in `<AuthGate>` which wraps `<WikiStoreProvider>` which wraps `<Layout>`. Layout renders `<Sidebar>` on the left, `<SearchBar>` at the top, and `<Outlet>` in the main region.

---

### VW-10 · WikiStore context

**Prompt**:
> Create `src/components/WikiStore.tsx` exporting `WikiStoreProvider` and `useWikiStore()`.
>
> Context value:
> ```ts
> { pages, slugs, backlinks, searchIndex, loading, error, ready, reload, updatePageInCache }
> ```
>
> On mount (if `hasToken()`), call `reload()` which:
> 1. Calls `listAllPages()`
> 2. Fetches each page's content via `readPage()` with concurrency cap of 8
> 3. Parses each via `parsePage()`
> 4. Stores the array in state
>
> Memoize `backlinks`, `searchIndex`, and `slugs` off the pages array. Expose `updatePageInCache(page)` so the editor can patch cache post-save without a full reload.
>
> `useWikiStore()` throws if used outside provider.

---

### VW-11 · AuthGate component

**Prompt**:
> Create `src/components/AuthGate.tsx`.
>
> If `hasToken()` is true on render, show children plus a small "sign out" button pinned to the bottom-right (fixed position, unobtrusive). Sign out = `clearToken()` + force re-render.
>
> If no token, render an auth card with:
> - Title "The Archive"
> - Subtitle showing `${config.owner}/${config.repo}`
> - Password-masked input for the PAT
> - Submit button that: `setToken(input)` → `await ping()` → if fail, `clearToken()` and show error; if succeed, advance state to authed
> - `<details>` with step-by-step instructions for generating a fine-grained PAT (resource owner = user; repo access = only the wiki repo; permissions = Contents RW + Metadata R; note expiration)
>
> Style hooks: classes `auth-gate`, `auth-card`, `auth-title`, `auth-sub`, `auth-prose`, `auth-input`, `auth-btn`, `auth-err`, `auth-help`, `signout-btn`. No inline styles.

---

## Phase 4 — Rendering

### VW-12 · Infobox with templates

**Prompt**:
> Create `src/components/Infobox.tsx`.
>
> Define a `TEMPLATES: Record<PageType, Array<{key, label}>>` registry with ordered field lists for each type:
> - **vendor**: category, contact, rep, map_policy, moq_usd, payment_terms, lead_time_days, last_contact
> - **sop**: owner, applies_to, status, last_reviewed, version
> - **product**: sku, category, supplier, case_cost, landed_cost, otp_adjusted_cost, msrp, active
> - **event**: venue, location, dates, permit_type, status
> - **person**: role, affiliation, contact, first_met
> - **note**: []
>
> Component takes `frontmatter: PageFrontmatter`. If type has no template or no template fields are present in frontmatter, render nothing.
>
> Otherwise render `<aside class="infobox">` with:
> - Header: small-caps type label + title
> - `<dl>` of label/value pairs for fields that are defined in frontmatter
> - Tags row at bottom (if tags present), each linking to `/tag/<tag>`
>
> `formatValue()` helper: arrays → comma-joined; booleans → "yes"/"no"; numbers → `.toLocaleString()`; null/undefined → em dash.

---

### VW-13 · PageView with wikilinks + backlinks

**Prompt**:
> Create `src/components/PageView.tsx`. Props: `{ page: WikiPage }`.
>
> Use `useWikiStore()` to get slugs, backlinks, and pages.
>
> Memoize `rewriteWikilinks(page.body, slugs)`.
>
> Layout:
> - Header row: breadcrumb (each path segment links to `/category/<path-prefix>`), page title from `frontmatter.title` falling back to slug tail, action buttons (`edit`, `history`)
> - Body: `<Infobox>` on the right (float or grid), markdown body on the left
> - Markdown via `<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>`. Override the `a` component: internal `/wiki/` links use React Router `<Link>`, external links get `target="_blank" rel="noreferrer noopener"`.
> - Backlinks section at bottom: "What links here" heading + list, each backlink shows page title + small monospace slug
>
> Use classes: `page`, `page-header`, `page-breadcrumb`, `page-title`, `page-actions`, `page-body-wrap`, `page-body`, `backlinks`, `backlink-path`.

---

### VW-14 · Sidebar navigation tree

**Prompt**:
> Create `src/components/Sidebar.tsx`.
>
> Use `useWikiStore()`. Build a nested tree from `pages` grouped by the slug's folder segments. Render as collapsible `<details>` elements, one per folder, with leaf `<Link>` items inside.
>
> Sort folders alphabetically; show folder name in small-caps. Inside each folder, sort pages by `frontmatter.title` or slug tail. Show a count next to each folder.
>
> At the top: a "+ New page" button linking to `/new`, and an "All categories" summary link.
>
> Loading state: show a subtle skeleton or "binding the archive…" text while `loading` is true.

---

### VW-15 · SearchBar with live results

**Prompt**:
> Create `src/components/SearchBar.tsx`.
>
> Global keyboard shortcut: Ctrl/Cmd-K focuses the input. Escape clears and blurs.
>
> On input change (debounced 120ms), call `search(searchIndex, query, 8)` from `useWikiStore()`. Render results in a floating dropdown below the input:
> - Each result: title in display font, snippet in smaller body font, slug as monospace suffix
> - Arrow keys navigate, Enter opens
> - Clicking outside closes
>
> If query is non-empty and user presses Enter with no selection, navigate to `/search?q=<query>` for a full-page results view.

---

### VW-16 · Category and tag pages

**Prompt**:
> Create `src/components/CategoryPage.tsx` and `src/components/TagPage.tsx`.
>
> `CategoryPage` reads the `*` splat param as a folder prefix (e.g. `vendors` or `vendors/pipe-tobacco`), filters `pages` where slug starts with `<prefix>/`, and renders them as a table:
> - Columns adapt by the dominant type in the filter: for vendors show category/contact/map_policy/lead_time_days; for products show sku/category/case_cost/msrp; generic fallback shows title/type/tags.
> - Each row links to the page.
>
> `TagPage` reads `:tag` param, filters pages where `frontmatter.tags` includes it, renders as a simple list with titles + types.
>
> Also create a top-level `/categories` index page listing all folders with page counts.

---

## Phase 5 — Editing

### VW-17 · PageEditor with CodeMirror

**Prompt**:
> Create `src/components/PageEditor.tsx`.
>
> Route: `/edit/*`. Read slug from splat. Find the matching page in `useWikiStore().pages` (or load ad hoc if missing from cache).
>
> Layout: two-column split.
> - **Left**: CodeMirror via `@uiw/react-codemirror` with markdown mode. Content is the raw file (frontmatter + body). Height = full viewport minus chrome.
> - **Right**: live preview — parse frontmatter + body with `gray-matter`, render via the same `PageView` pipeline (but read-only, no edit button).
>
> Top bar:
> - Commit message input (default `"Update <slug>"`)
> - `Save` button — calls `writePage({ slug, content: editorValue, message, sha: page.sha })`. On success: `updatePageInCache(reparsedPage)`, navigate to `/wiki/<slug>`.
> - `Cancel` button — navigate back without saving
> - Show dirty indicator if editor differs from original
>
> Trap Ctrl/Cmd-S to trigger save. Confirm on navigate-away if dirty.
>
> Handle sha conflicts: if save returns 409, show "This page changed since you opened it. Reload and reapply your changes."

---

### VW-18 · New page flow

**Prompt**:
> Create `src/components/NewPage.tsx` at route `/new`.
>
> Form fields:
> - Title (required)
> - Type (select from PageType values)
> - Collection / folder (dropdown: vendors, products, sops, events, people, notes)
> - Tags (comma-separated input)
>
> On submit:
> 1. Slug = `<collection>/<titleToSlug(title)>`
> 2. If that slug already exists in cache, show error and block
> 3. Generate starter content: `matter.stringify('', { title, type, tags })` + a template body appropriate to the type (e.g. vendor gets "## Overview\n\n## History\n\n## Notes\n")
> 4. Call `writePage({ slug, content, message: "Create <slug>" })`
> 5. Update cache, navigate to `/edit/<slug>`

---

### VW-19 · History view

**Prompt**:
> Create `src/components/HistoryView.tsx` at route `/history/*`.
>
> Call `pageHistory(slug)` on mount. Render a timeline:
> - Commit message (first line bold, rest muted)
> - Author + relative date ("3 days ago")
> - SHA (first 7 chars, monospace, linked to `c.url` on GitHub)
> - "View at this revision" button → route to `/history/<slug>/<sha>`
>
> At the nested `/history/:slug/:sha` route, show the file content at that commit via `readPageAtCommit()`, rendered through the read-only PageView pipeline. Include a "Restore this version" button that copies the old content into a new save (preserving history — never force-push).

---

## Phase 6 — Polish

### VW-20 · Global styles (letterpress/maritime aesthetic)

**Prompt**:
> Create `src/styles/global.css`.
>
> Define these CSS variables on `:root`:
> - `--paper`: `#f4ede0` — dominant cream background
> - `--paper-dim`: `#ebe2d2`
> - `--ink`: `#2a2419` — primary text
> - `--ink-soft`: `#544a3a`
> - `--rule`: `#c9b99a` — horizontal rules and borders
> - `--accent`: `#6b1a1a` — deep burgundy for links and active states
> - `--accent-soft`: `#8a3838`
> - `--tobacco`: `#7a5a2e` — secondary accent, tags, meta
> - `--missing`: `#a13a3a` — broken wikilinks
> - `--mono`: `'JetBrains Mono', monospace`
> - `--display`: `'IM Fell English', 'Cormorant Garamond', serif`
> - `--body`: `'Cormorant Garamond', Georgia, serif`
> - `--sidebar-w`: `260px`
>
> Global rules:
> - Body: `var(--paper)` bg, `var(--ink)` text, `var(--body)` font, `1.125rem` base size, line-height 1.55
> - Headings: `var(--display)`, tighter leading
> - `h1`: 2.5rem with a hairline bottom border in `var(--rule)` and a small ornamental glyph (e.g. `·` or `❦`) centered below
> - Links: `var(--accent)`, underline on hover only, no color change on visited
> - `code, pre`: `var(--mono)`, `var(--paper-dim)` bg, no rounded corners (keep letterpress feel)
> - `.wikilink-missing`: `var(--missing)`, dotted underline, cursor help
> - Infobox: ~320px wide, floated right on desktop, `var(--paper-dim)` bg, double-rule top/bottom borders in `var(--rule)`, header in display font small-caps
> - Sidebar: `var(--sidebar-w)` fixed left, subtle right border, folder names small-caps
> - Page title in display font, page body max-width 70ch
> - Subtle paper texture via a `background-image` of layered radial gradients or a tiny noise SVG data URI — don't overdo it
>
> No CSS framework. No `@apply`. Hand-written. Include a print stylesheet that strips chrome and prints the page body cleanly.

**Acceptance**: app visibly reads like an archive document, not like a generic admin panel.

---

### VW-21 · Loading states + error boundaries

**Prompt**:
> Add a top-level error boundary component `src/components/ErrorBoundary.tsx` that catches render errors and shows a card with the error message + a "reload" button.
>
> Add skeleton loaders:
> - Sidebar: 6 shimmer rows while `store.loading` is true
> - PageView: centered "fetching the page…" in display font while a single-page load is in flight
> - Editor: same treatment
>
> Rate-limit handling in `github.ts`: if an API call returns 403 with `x-ratelimit-remaining: 0`, throw a custom `RateLimitError` with `resetAt`. Surface this cleanly in the UI: "GitHub API rate limit hit. Resets at <time>."

---

### VW-22 · Keyboard shortcuts

**Prompt**:
> Create `src/lib/shortcuts.ts` with a `useShortcuts(bindings: Record<string, () => void>)` hook that listens for keydown on window, matches against the bindings map (e.g. `"mod+k"`, `"mod+e"`, `"mod+s"`, `"esc"`), prevents default, invokes the handler. `mod` is Cmd on Mac, Ctrl elsewhere.
>
> Wire these app-wide:
> - `mod+k` → focus search
> - `mod+e` on a page → navigate to `/edit/<current-slug>`
> - `mod+s` in editor → save
> - `g h` (two-key) → go home
> - `esc` → close any open dropdown/modal
>
> Add a `?` keypress that shows a shortcuts overlay listing all of the above.

---

## Phase 7 — Deployment

### VW-23 · Multi-stage Dockerfile

**Prompt**:
> Create `Dockerfile`:
> - **Stage 1 (build)**: `node:20-alpine`, copy `package*.json`, `npm ci`, copy rest, `npm run build`. Accept build args for all `VITE_*` env vars so they're baked in.
> - **Stage 2 (serve)**: `caddy:2-alpine`, copy `dist/` from stage 1 to `/srv`, copy `Caddyfile` to `/etc/caddy/Caddyfile`, expose 8080.
>
> Add a `.dockerignore`: `node_modules`, `dist`, `.git`, `.env*`, `*.md` (except `README.md`).

---

### VW-24 · Caddyfile + Cloudflare Tunnel guide

**Prompt**:
> Create `Caddyfile`:
> - Listen on `:8080`
> - Serve `/srv` as root
> - SPA fallback: `try_files {path} /index.html`
> - Immutable caching headers for `/assets/*`, no-cache for `index.html`
> - gzip + zstd encoding
>
> Create `docs/DEPLOY_HOMELAB.md` covering:
> 1. Build the Docker image with `--build-arg VITE_GITHUB_OWNER=...` etc.
> 2. `docker run -d -p 8080:8080 --restart unless-stopped --name vcc-wiki vcc-wiki:latest` (or a `docker-compose.yml`)
> 3. Cloudflare Tunnel config: install `cloudflared`, create tunnel, route `wiki.example.com` to `http://homelab-ip:8080`
> 4. Cloudflare Access: create an Access application for the hostname, policy = email matches your address, session duration 30 days
> 5. How to update: rebuild image, recreate container. Content edits do NOT require a rebuild — they hit the GitHub API live.

Include a sample `docker-compose.yml`.

---

### VW-25 · README

**Prompt**:
> Create `README.md` at the project root covering:
> - What this is (one paragraph)
> - Architecture diagram (ASCII) showing browser → GitHub API → private repo, and a second box for the Docker + Caddy + Cloudflare Tunnel + Access deployment path
> - Quick start (clone, `npm install`, copy `.env.example` to `.env`, fill in, `npm run dev`)
> - Content model: folder conventions, frontmatter schema per type, wikilink syntax
> - How to add a new page type: extend `PageType` in `types.ts`, add template to `Infobox.tsx`, optionally add column logic to `CategoryPage.tsx`
> - Links to `docs/WIKI_REPO_SETUP.md` and `docs/DEPLOY_HOMELAB.md`
> - License (your call — Apache 2.0 if you want it shareable)

---

## Phase 8 — Seed content

### VW-26 · Sample vendor + SOP + index

**Prompt**:
> In a separate folder `seed-content/` (intended to be copied into the content repo, not shipped in the app), create three markdown files:
>
> **`seed-content/vendors/el-galeon-tobacco.md`** — frontmatter with type: vendor, category: pipe_tobacco, realistic placeholder contact/rep/map_policy/moq/terms/lead_time. Body: Overview, History (mention first contact at `[[PCA 2026 Debrief]]`), Product lines, Ordering notes, Compliance notes.
>
> **`seed-content/sops/booth-open-checklist.md`** — frontmatter type: sop, owner: Alexander, applies_to: both, status: active, last_reviewed: 2026-04-01, version: 1.2. Body: step-by-step booth setup checklist in numbered list form, with subsections for pre-arrival, setup, opening, mid-shift, close. Reference `[[Vehicle Inventory SOP]]` and `[[Age Verification Script]]` as wikilinks (they're intentionally unresolved to demo the missing-link styling).
>
> **`seed-content/index.md`** — frontmatter type: note. Body: one-paragraph intro, then three sections of wikilinks organized by domain (Vendors, SOPs, Events).
>
> Also create `seed-content/README.md` explaining that these files go into the *content repo*, not the app repo, at the path configured by `VITE_CONTENT_PATH`.

---

### VW-27 · Content model documentation

**Prompt**:
> Create `docs/CONTENT_MODEL.md` — the canonical reference for authors.
>
> For each page type, list:
> - Required frontmatter fields
> - Optional fields
> - Which folder it belongs in by convention
> - A minimal example block
>
> Also document:
> - Wikilink syntax: `[[Target]]`, `[[Target|Display]]`, resolution rules (exact slug, then last-segment, then slugified last-segment)
> - Tag conventions: lowercase, kebab-case, no spaces
> - When to create a new page vs. add a section to an existing one

---

## Phase 9 — Optional / later

### VW-28 · Graph view

**Prompt**:
> Add D3 as a dep: `d3@7`. Create `src/components/GraphView.tsx` at route `/graph`.
>
> Use `backlinks.outgoing` from the store to build nodes (one per page) and edges (slug → target). Render as a force-directed graph:
> - Node color by page type (map PageType to accent colors)
> - Node radius by in-degree
> - Click node = navigate to that page
> - Hover = highlight neighbors
> - Search box that dims non-matching nodes
>
> Keep the SVG clean — no labels unless hovered or zoomed past a threshold.

---

### VW-29 · OAuth backend (Cloudflare Worker)

**Prompt**:
> Create `oauth-worker/` folder with a minimal Cloudflare Worker:
> - `POST /exchange` — accepts `{ code }`, POSTs to `https://github.com/login/oauth/access_token` with `client_id`, `client_secret` (from Worker secrets), `code`. Returns `{ access_token }`.
> - `GET /authorize` — redirects to `github.com/login/oauth/authorize?client_id=...&scope=repo&state=...`
> - `GET /callback` — receives code, POSTs to `/exchange`, redirects back to app with token in URL fragment (not query, so it's not logged)
>
> In the app, replace `loginWithGitHub()` stub in `auth.ts` to redirect to `${VITE_OAUTH_BASE}/authorize` and parse the fragment on callback.
>
> Include `oauth-worker/README.md` with `wrangler` setup steps and instructions for registering the GitHub OAuth App.

---

### VW-30 · Webhook-driven cache refresh

**Prompt**:
> Add a secondary Cloudflare Worker endpoint `POST /webhook` that verifies a GitHub webhook signature (from the content repo's `push` events) and broadcasts a "refresh" event via Cloudflare Durable Objects or a simple SSE stream.
>
> In the app, open an EventSource to the webhook broadcast on mount. On "refresh" event, call `store.reload()` in the background.
>
> Net effect: edits made directly in the repo (via CLI, mobile, or Claude Code) show up in the wiki within seconds without a manual refresh.

---

### VW-31 · Production hardening checklist

**Prompt**:
> Create `docs/PROD_HARDENING.md` covering:
> - Cloudflare Access configuration (email policy, session duration, service token for automation)
> - PAT rotation workflow (what to do on expiration)
> - Backup strategy: the GitHub repo IS the backup, but also set up `github-backup` or a scheduled `git clone --mirror` to your homelab NAS
> - Monitoring: Uptime Kuma ping on `/`, log tail via `docker logs`
> - Upgrade path: rebuild image on dependency updates, test in a staging tunnel before swapping
> - Access audit: periodically review PATs at `github.com/settings/tokens` and Cloudflare Access logs
> - Data classification: what is and is not appropriate to put in this wiki (reminder: if it's in the repo, anyone with repo access can read it — compartmentalize sensitive vendor pricing if needed)

---

## Build order summary

Linear execution: VW-01 → VW-02 → ... → VW-26 is the minimum viable wiki. VW-27 onward is polish and optional features. Don't start VW-17 (editor) until VW-13 (PageView) is working — you'll need the preview pipeline.

After VW-26 you should have: a running wiki at `http://localhost:5173` that lists, renders, edits, searches, and commits to your private content repo. Everything else is nice-to-have.

---

## If something breaks

- **Token issues**: clear localStorage, re-enter PAT. Check scopes in GitHub settings.
- **CORS errors**: the GitHub API allows browser-origin calls with a PAT. If blocked, it's usually because the token is malformed.
- **Rate limits**: 5,000/hr authenticated. The app makes one list-all + N reads on load, then one write per save. You won't hit it solo.
- **Merge conflicts on save**: always refresh before editing from a second device. A future VW prompt could add conflict detection with a 3-way merge UI.

---

*Built from the VCC Wiki architecture decision, April 2026.*