/**
 * WikiStore — global app state context
 *
 * Loads all wiki pages on mount, exposes memoized derived data, and provides
 * a lightweight cache-patch so editors don't need a full reload after saving.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type MiniSearch from 'minisearch'
import { hasToken } from '../lib/auth'
import { listAllPages, readPage } from '../lib/github'
import { parsePage } from '../lib/markdown'
import { buildBacklinkIndex } from '../lib/backlinks'
import { buildSearchIndex } from '../lib/search'
import type { WikiPage, BacklinkIndex } from '../types'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface WikiStoreValue {
  /** All parsed wiki pages. */
  pages: WikiPage[]
  /** Flat list of every page slug — derived from pages. */
  slugs: string[]
  /** Bidirectional wikilink graph — derived from pages. */
  backlinks: BacklinkIndex
  /** MiniSearch index — derived from pages. */
  searchIndex: MiniSearch
  /** True while the initial fetch is in progress. */
  loading: boolean
  /** Non-null when the last reload threw. */
  error: Error | null
  /** True once the first successful load has completed. */
  ready: boolean
  /** Re-fetch all pages from GitHub. */
  reload: () => Promise<void>
  /** Patch a single page in the cache without triggering a full reload. */
  updatePageInCache: (page: WikiPage) => void
}

// ---------------------------------------------------------------------------
// Concurrency-capped fetch helper
// ---------------------------------------------------------------------------

/**
 * Run `fn` over every item in `items` with at most `limit` concurrent calls.
 */
async function pMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<void> {
  const queue = [...items]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item !== undefined) await fn(item)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WikiStoreContext = createContext<WikiStoreValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WikiStoreProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<WikiPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [ready, setReady] = useState(false)

  // Prevent concurrent reloads (e.g. StrictMode double-effect).
  const loadingRef = useRef(false)

  const reload = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const entries = await listAllPages()
      const loaded: WikiPage[] = []

      await pMap(
        entries,
        async (entry) => {
          const result = await readPage(entry.slug)
          if (result === null) return // deleted between list and fetch — skip
          const page = parsePage(entry.slug, entry.path, result.raw, result.sha)
          loaded.push(page)
        },
        8,
      )

      // Sort deterministically by slug so the order is stable across reloads.
      loaded.sort((a, b) => a.slug.localeCompare(b.slug))
      setPages(loaded)
      setReady(true)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  // Load on mount if a token is already present.
  useEffect(() => {
    if (hasToken()) {
      void reload()
    }
  }, [reload])

  const updatePageInCache = useCallback((updated: WikiPage) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.slug === updated.slug)
      if (idx === -1) {
        // New page — insert and re-sort.
        const next = [...prev, updated]
        next.sort((a, b) => a.slug.localeCompare(b.slug))
        return next
      }
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [])

  // Memoize derived data so downstream components don't re-render on
  // unrelated state changes.
  const slugs = useMemo(() => pages.map((p) => p.slug), [pages])

  const backlinks = useMemo(() => buildBacklinkIndex(pages), [pages])

  const searchIndex = useMemo(() => buildSearchIndex(pages), [pages])

  const value = useMemo<WikiStoreValue>(
    () => ({ pages, slugs, backlinks, searchIndex, loading, error, ready, reload, updatePageInCache }),
    [pages, slugs, backlinks, searchIndex, loading, error, ready, reload, updatePageInCache],
  )

  return (
    <WikiStoreContext.Provider value={value}>
      {children}
    </WikiStoreContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Access the wiki store. Must be called inside a WikiStoreProvider. */
// eslint-disable-next-line react-refresh/only-export-components
export function useWikiStore(): WikiStoreValue {
  const ctx = useContext(WikiStoreContext)
  if (!ctx) throw new Error('useWikiStore must be used inside <WikiStoreProvider>')
  return ctx
}
