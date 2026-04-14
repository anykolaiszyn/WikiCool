# Seed Content

This folder contains starter markdown files for the **VCC Wiki content repo** — the separate private GitHub repository that the app reads and writes at runtime.

**These files do NOT belong in this app repo.** Copy them into the content repo at the path configured by `VITE_CONTENT_PATH` (default: `content`).

---

## How to use

```bash
# Clone your content repo
git clone https://github.com/<your-org>/vcc-wiki-content.git
cd vcc-wiki-content

# Copy the seed files
cp -r path/to/vcc-wiki/seed-content/* content/

# Review, then commit
git add content/
git commit -m "Seed initial wiki content"
git push
```

After pushing, reload the wiki app — it will fetch all pages on startup and index them for search.

---

## What's included

| File | Type | Purpose |
|---|---|---|
| `vendors/el-galeon-tobacco.md` | vendor | Full vendor profile with realistic placeholder data; demonstrates infobox, wikilinks, and table columns |
| `sops/booth-open-checklist.md` | sop | Step-by-step booth SOP; demonstrates intentionally unresolved wikilinks (`[[Vehicle Inventory SOP]]`, `[[Age Verification Script]]`) that trigger the missing-link dotted underline |
| `index.md` | note | Home page with organised wikilink index across Vendors, SOPs, and Events |

---

## Intentionally unresolved wikilinks

The SOP file references `[[Vehicle Inventory SOP]]` and `[[Age Verification Script]]`, and the index references several pages that don't have files yet (e.g. `[[Padrón Cigars]]`, `[[PCA 2026 Debrief]]`). This is by design: those links render with a dotted underline and `cursor: help` to demonstrate the missing-link style. Create the corresponding markdown files to resolve them.

---

## File naming convention

Slugs are lowercase, hyphen-separated, no special characters. The file path becomes the URL:

```
content/vendors/el-galeon-tobacco.md  →  /wiki/vendors/el-galeon-tobacco
content/sops/booth-open-checklist.md  →  /wiki/sops/booth-open-checklist
content/index.md                       →  /wiki/index  (the home page)
```

The `VITE_CONTENT_PATH` env var sets the root folder name (`content` by default). Do not nest the content root — all collections must be direct children of it.
