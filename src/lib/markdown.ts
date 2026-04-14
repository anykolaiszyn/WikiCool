/**
 * Markdown, frontmatter, and wikilink utilities — VCC Wiki
 */

import matter from 'gray-matter'
import type { WikiPage, PageFrontmatter } from '../types'

// ---------------------------------------------------------------------------
// Wikilink regex — matches [[Target]] and [[Target|Display]]
// ---------------------------------------------------------------------------

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

// ---------------------------------------------------------------------------
// Page parse / serialize
// ---------------------------------------------------------------------------

/**
 * Parse raw file content (frontmatter + markdown body) into a `WikiPage`.
 */
export function parsePage(
  slug: string,
  path: string,
  raw: string,
  sha?: string,
): WikiPage {
  const { data, content } = matter(raw)
  return {
    slug,
    path,
    frontmatter: data as PageFrontmatter,
    body: content,
    raw,
    ...(sha !== undefined ? { sha } : {}),
  }
}

/**
 * Serialize frontmatter and body back to a raw markdown string.
 */
export function serializePage(frontmatter: PageFrontmatter, body: string): string {
  return matter.stringify(body, frontmatter as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

/**
 * Convert a human title to a URL-safe slug.
 * Strips diacritics, collapses spaces to hyphens, removes non-word chars.
 *
 * @example `titleToSlug('El Galeón Tobacco')` → `'el-galeon-tobacco'`
 */
export function titleToSlug(title: string): string {
  return title
    .normalize('NFD')                        // decompose: é → e + combining acute
    .replace(/[\u0300-\u036f]/g, '')         // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')            // keep letters, digits, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-')                    // spaces → hyphens
    .replace(/-{2,}/g, '-')                  // collapse double-hyphens
}

// ---------------------------------------------------------------------------
// Wikilink resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a wikilink target to a known slug using a three-step cascade:
 *  1. Exact slug match
 *  2. Last-segment exact match (e.g. `[[El Galeón]]` vs `vendors/el-galeon`)
 *  3. Slugified last-segment match
 *
 * Returns `null` when no match is found.
 */
export function resolveWikilink(target: string, knownSlugs: string[]): string | null {
  const normalizedTarget = target.trim()

  // 1. Exact match
  if (knownSlugs.includes(normalizedTarget)) return normalizedTarget

  // 2. Last-segment exact match
  const exactTail = knownSlugs.filter((s) => {
    const tail = s.includes('/') ? s.split('/').pop()! : s
    return tail === normalizedTarget
  })
  if (exactTail.length === 1) return exactTail[0]

  // 3. Slugified last-segment match
  const slugifiedTarget = titleToSlug(normalizedTarget)
  const fuzzyTail = knownSlugs.filter((s) => {
    const tail = s.includes('/') ? s.split('/').pop()! : s
    return tail === slugifiedTarget
  })
  if (fuzzyTail.length === 1) return fuzzyTail[0]

  return null
}

// ---------------------------------------------------------------------------
// Wikilink extraction
// ---------------------------------------------------------------------------

/**
 * Return all raw wikilink targets found in a markdown body.
 * Duplicates are included; caller can deduplicate if needed.
 *
 * @example `extractWikilinks('See [[Padron]] and [[Padron|Padrón 1926]]')`
 *          → `['Padron', 'Padron']`
 */
export function extractWikilinks(markdown: string): string[] {
  const targets: string[] = []
  const re = new RegExp(WIKILINK_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    targets.push(match[1].trim())
  }
  return targets
}

// ---------------------------------------------------------------------------
// Wikilink rewrite
// ---------------------------------------------------------------------------

/**
 * Rewrite all `[[Target]]` / `[[Target|Display]]` wikilinks in a markdown
 * string into standard Markdown links or missing-link `<span>` elements.
 *
 * - Resolved:   `[Display](/wiki/<slug>)`
 * - Unresolved: `<span class="wikilink-missing" title="<Target>">Display</span>`
 */
export function rewriteWikilinks(markdown: string, knownSlugs: string[]): string {
  const re = new RegExp(WIKILINK_RE.source, 'g')
  return markdown.replace(re, (_full, target: string, display: string | undefined) => {
    const rawTarget = target.trim()
    const label = display !== undefined ? display.trim() : rawTarget
    const slug = resolveWikilink(rawTarget, knownSlugs)

    if (slug !== null) {
      return `[${label}](/wiki/${slug})`
    }

    return `<span class="wikilink-missing" title="${escapeAttr(rawTarget)}">${escapeHtml(label)}</span>`
  })
}

// ---------------------------------------------------------------------------
// HTML escaping helpers (used only within this module)
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}
