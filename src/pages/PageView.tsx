import { useEffect, useState } from 'react'
import { useWikiStore } from '../components/WikiStore'
import { PageView as PageViewComponent } from '../components/PageView'
import { readPage, slugToPath } from '../lib/github'
import { parsePage } from '../lib/markdown'
import type { WikiPage } from '../types'

interface PageViewProps {
  slug: string
}

/**
 * Route-level shell: resolves a slug to a WikiPage, then delegates to
 * the PageView component for rendering.
 */
export function PageView({ slug }: PageViewProps) {
  const { pages, ready } = useWikiStore()

  // Try the store cache first; fall back to a direct API fetch if not found
  // (e.g. a page created by another user since last reload).
  const cached = pages.find((p) => p.slug === slug) ?? null
  const [page, setPage] = useState<WikiPage | null>(cached)
  const [loading, setLoading] = useState(!cached && ready)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (cached) {
      setPage(cached)
      return
    }
    if (!ready) return

    let cancelled = false
    setLoading(true)
    setMissing(false)

    readPage(slug)
      .then((result) => {
        if (cancelled) return
        if (result === null) {
          setMissing(true)
        } else {
          const path = slugToPath(slug)
          setPage(parsePage(slug, path, result.raw, result.sha))
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [slug, cached, ready])

  if (!ready || loading) {
    return <div className="page-loading page-loading--center">Fetching the page…</div>
  }

  if (missing || !page) {
    return (
      <div className="page-missing">
        <h1>Page not found</h1>
        <p>
          <code>{slug}</code> does not exist yet.{' '}
          <a href={`/edit/${slug}`}>Create it?</a>
        </p>
      </div>
    )
  }

  return <PageViewComponent page={page} />
}

