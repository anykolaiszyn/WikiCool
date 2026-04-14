# Wiki Content Repo Setup

VCC Wiki separates the **app** (this repo) from the **content** (a private GitHub repo you control). The app reads and writes markdown files via the GitHub API. This document walks you through standing up the content repo from scratch.

---

## 1 — Create the content repo

1. Go to [github.com/new](https://github.com/new).
2. Name it something like `vcc-wiki-content`.
3. Set visibility to **Private**.
4. Initialize with a README (so the `main` branch exists immediately).
5. Note the owner and repo name — you will need them for the env vars.

---

## 2 — Create the `content/` folder and stub index

GitHub won't store an empty folder, so create the root landing page at the same time.

Create the file `content/index.md` with this content:

```markdown
---
title: VCC Wiki
description: Vice City Cigars internal knowledge base
---

Welcome to the VCC Wiki. Use the navigation to browse vendors, products, SOPs, events, people, and notes.
```

Commit directly to `main`.

---

## 3 — Folder conventions

All wiki pages live under `content/`. Create the following stub files to establish each collection (GitHub requires at least one file per folder):

| Folder | Purpose | Stub file to create |
|---|---|---|
| `content/vendors/` | Supplier profiles | `content/vendors/.gitkeep` |
| `content/products/` | Cigar and product pages | `content/products/.gitkeep` |
| `content/sops/` | Standard operating procedures | `content/sops/.gitkeep` |
| `content/events/` | Tasting events and private nights | `content/events/.gitkeep` |
| `content/people/` | Staff and contact profiles | `content/people/.gitkeep` |
| `content/notes/` | Free-form notes and memos | `content/notes/.gitkeep` |

You can create each `.gitkeep` as an empty file and commit them all in one go.

Every markdown file follows this naming convention: `<slug>.md` where the slug is lowercase, hyphen-separated, and matches the page URL (e.g. `vendors/padron.md` → `/wiki/vendors/padron`).

---

## 4 — Generate a fine-grained Personal Access Token (PAT)

The app uses a single fine-grained PAT scoped only to the content repo. Do **not** use a classic token — fine-grained tokens limit blast radius to one repo.

### Steps

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Click **Generate new token**.
3. Fill in:
   - **Token name**: `vcc-wiki-content-rw` (or similar)
   - **Expiration**: choose 90 days (see rotation guidance below)
   - **Resource owner**: your account or org
   - **Repository access**: **Only select repositories** → pick `vcc-wiki-content`
4. Under **Permissions → Repository permissions**, set:
   - **Contents**: `Read and write`
   - **Metadata**: `Read-only` (required by GitHub; cannot be deselected)
   - Leave everything else at `No access`
5. Click **Generate token** and copy the value immediately — GitHub shows it only once.

### Store the token

**Local / homelab**: paste the token into `.env.local` (never `.env`, which could be committed):

```
VITE_GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxxxxxx
```

**Shared / production**: leave `VITE_GITHUB_TOKEN` blank. The app will show a login prompt where each user pastes their own PAT. Tokens entered at runtime are stored in `localStorage` under the key `vcc_wiki_token` — they never leave the browser.

---

## 5 — Token expiration and rotation

Fine-grained PATs expire. Letting one expire silently will lock the wiki until a new token is issued. Follow this rotation practice:

### Recommended rotation schedule

| Setting | Value |
|---|---|
| Token lifetime | 90 days |
| Rotation reminder | Set a calendar reminder 1 week before expiry |
| Overlap window | Generate the new token before revoking the old one |

### Rotation steps

1. Generate a new fine-grained PAT following the same steps in section 4.
2. Update `VITE_GITHUB_TOKEN` in `.env.local` (or wherever you store it).
3. Restart the dev/preview server so the new token is picked up.
4. Verify the wiki loads and an edit round-trips successfully.
5. Revoke the old token under **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.

### GitHub expiry notifications

GitHub sends an email 7 days before a fine-grained PAT expires. Make sure the GitHub account that owns the token has a monitored email address.

---

## Quick-start checklist

- [ ] Private repo `vcc-wiki-content` created
- [ ] `content/index.md` committed to `main`
- [ ] Collection folders stubbed with `.gitkeep` files
- [ ] Fine-grained PAT generated with `Contents: Read+Write` + `Metadata: Read`
- [ ] Token stored in `.env.local` (or entered at login prompt)
- [ ] `.env.local` is in `.gitignore` (it is, by default)
- [ ] Calendar reminder set for token rotation
