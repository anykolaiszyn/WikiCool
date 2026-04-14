/**
 * Client-side full-text search — VCC Wiki
 *
 * Uses MiniSearch for in-memory indexing. The index is built once from all
 * loaded pages and can be queried synchronously thereafter.
 */

import MiniSearch from 'minisearch'
import type { WikiPage } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single search hit returned to the caller. */
export interface SearchResult {
  slug: string
  title: string
  score: number
  /** ~170-char excerpt centered on the first query-term match in the body. */
  snippet: string
}

// ---------------------------------------------------------------------------
// Internal document shape stored in the index
// ---------------------------------------------------------------------------

interface IndexDoc {
  id: number
  slug: string
  title: string
  body: string
  tags: string
  type: string
}

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------

/**
 * Build a MiniSearch index from a set of parsed wiki pages.
 *
 * Field weights: title ×3, tags ×2, body and type ×1 (default).
 * Fuzzy tolerance: 0.2 (edit-distance proportion of term length).
 * Prefix matching: enabled (partial word matches as user types).
 */
export function buildSearchIndex(pages: WikiPage[]): MiniSearch<IndexDoc> {
  const idx = new MiniSearch<IndexDoc>({
    fields: ['title', 'body', 'tags', 'type'],
    storeFields: ['slug', 'title', 'body'],
    searchOptions: {
      boost: { title: 3, tags: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  })

  const docs: IndexDoc[] = pages.map((page, i) => ({
    id: i,
    slug: page.slug,
    title: page.frontmatter.title ?? page.slug,
    body: page.body,
    tags: (page.frontmatter.tags ?? []).join(' '),
    type: page.frontmatter.type ?? '',
  }))

  idx.addAll(docs)
  return idx
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Query the index and return the top `limit` results with snippets.
 */
export function search(
  idx: MiniSearch<IndexDoc>,
  query: string,
  limit = 10,
): SearchResult[] {
  if (query.trim() === '') return []

  const hits = idx.search(query).slice(0, limit)

  return hits.map((hit) => {
    const body = (hit.body as string) ?? ''
    const title = (hit.title as string) ?? (hit.slug as string) ?? ''
    const slug = hit.slug as string
    return {
      slug,
      title,
      score: hit.score,
      snippet: makeSnippet(body, query),
    }
  })
}

// ---------------------------------------------------------------------------
// Snippet helper
// ---------------------------------------------------------------------------

const SNIPPET_LENGTH = 170
const SNIPPET_HALF = Math.floor(SNIPPET_LENGTH / 2)

/**
 * Produce a ~170-char excerpt centered on the first occurrence of any query
 * term in the text. Falls back to the start of the text if no match is found.
 */
function makeSnippet(text: string, query: string): string {
  const plain = text.replace(/[#*_`[\]]/g, '').replace(/\s+/g, ' ').trim()

  // Find the position of the first query term (case-insensitive).
  const terms = query.trim().split(/\s+/)
  let matchPos = -1
  for (const term of terms) {
    const pos = plain.toLowerCase().indexOf(term.toLowerCase())
    if (pos !== -1) {
      matchPos = pos
      break
    }
  }

  const center = matchPos === -1 ? 0 : matchPos
  const start = Math.max(0, center - SNIPPET_HALF)
  const end = Math.min(plain.length, start + SNIPPET_LENGTH)
  let snippet = plain.slice(start, end)

  if (start > 0) snippet = '\u2026' + snippet
  if (end < plain.length) snippet = snippet + '\u2026'

  return snippet
}
