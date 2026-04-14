/**
 * Backlink index builder — VCC Wiki
 *
 * Pure function; no side effects, no API calls.
 */

import { extractWikilinks, resolveWikilink } from './markdown'
import type { WikiPage, BacklinkIndex } from '../types'

/**
 * Build a bidirectional wikilink graph from a set of parsed wiki pages.
 *
 * - `outgoing[slug]` — resolved slugs this page links to (deduped, no self-links)
 * - `incoming[slug]` — resolved slugs that link to this page (deduped)
 *
 * Unresolved wikilinks are silently dropped from both maps.
 */
export function buildBacklinkIndex(pages: WikiPage[]): BacklinkIndex {
  const allSlugs = pages.map((p) => p.slug)
  const incoming: Record<string, string[]> = {}
  const outgoing: Record<string, string[]> = {}

  for (const page of pages) {
    const rawTargets = extractWikilinks(page.body)
    const resolved = new Set<string>()

    for (const target of rawTargets) {
      const targetSlug = resolveWikilink(target, allSlugs)
      if (targetSlug === null) continue          // unresolved — skip
      if (targetSlug === page.slug) continue     // self-link — skip
      resolved.add(targetSlug)
    }

    if (resolved.size > 0) {
      outgoing[page.slug] = Array.from(resolved)

      for (const targetSlug of resolved) {
        if (!incoming[targetSlug]) incoming[targetSlug] = []
        if (!incoming[targetSlug].includes(page.slug)) {
          incoming[targetSlug].push(page.slug)
        }
      }
    }
  }

  return { incoming, outgoing }
}
