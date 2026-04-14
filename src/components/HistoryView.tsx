/**
 * HistoryView — commit timeline for a wiki page
 * RevisionView — read-only render of a page at a specific commit
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWikiStore } from './WikiStore'
import { PageView } from './PageView'
import { pageHistory, readPageAtCommit, readPage, writePage, slugToPath } from '../lib/github'
import { parsePage } from '../lib/markdown'
import type { CommitInfo, WikiPage } from '../types'

// ---------------------------------------------------------------------------
// Relative-date helper
// ---------------------------------------------------------------------------

function relativeDate(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} day${d !== 1 ? 's' : ''} ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} month${mo !== 1 ? 's' : ''} ago`
  const y = Math.floor(mo / 12)
  return `${y} year${y !== 1 ? 's' : ''} ago`
}

// ---------------------------------------------------------------------------
// Commit timeline
// ---------------------------------------------------------------------------

interface HistoryViewProps {
  slug: string
}

export function HistoryView({ slug }: HistoryViewProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    pageHistory(slug)
      .then((cs) => { if (!cancelled) { setCommits(cs); setLoading(false) } })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load history.')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [slug])

  if (loading) return <div className="page-loading">Loading history…</div>
  if (error) return <div className="page-missing"><p>{error}</p></div>

  return (
    <div className="history-view">
      <div className="page-header">
        <div className="page-breadcrumb">
          <Link to={`/wiki/${slug}`}>{slug}</Link>
          <span aria-hidden="true"> / </span>
          <span>History</span>
        </div>
        <h1 className="page-title">Page History</h1>
      </div>

      {commits.length === 0 ? (
        <p className="cat-page__empty">No commits found.</p>
      ) : (
        <ol className="history-timeline">
          {commits.map((c) => {
            const [firstLine, ...rest] = c.message.split('\n')
            const restText = rest.join('\n').trim()
            return (
              <li key={c.sha} className="history-commit">
                <div className="history-commit__meta">
                  <a
                    href={c.url}
                    className="history-commit__sha"
                    target="_blank"
                    rel="noreferrer noopener"
                    title={c.sha}
                  >
                    {c.sha.slice(0, 7)}
                  </a>
                  <span className="history-commit__author">{c.author}</span>
                  <span className="history-commit__date" title={c.date}>{relativeDate(c.date)}</span>
                </div>
                <div className="history-commit__message">
                  <span className="history-commit__subject">{firstLine}</span>
                  {restText && <span className="history-commit__body">{restText}</span>}
                </div>
                <Link
                  to={`/history/${slug}/${c.sha}`}
                  className="history-commit__view-btn"
                >
                  View at this revision
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Revision view — read-only page at a specific commit
// ---------------------------------------------------------------------------

interface RevisionViewProps {
  slug: string
  sha: string
}

export function RevisionView({ slug, sha }: RevisionViewProps) {
  const { pages, updatePageInCache } = useWikiStore()
  const navigate = useNavigate()

  const [page, setPage] = useState<WikiPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    readPageAtCommit(slug, sha)
      .then((raw) => {
        if (cancelled) return
        if (raw === null) {
          setError(`File did not exist at commit ${sha.slice(0, 7)}.`)
        } else {
          setPage(parsePage(slug, slugToPath(slug), raw))
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load revision.')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [slug, sha])

  const handleRestore = useCallback(async () => {
    if (!page || restoring) return
    setRestoring(true)
    setRestoreError(null)
    try {
      // Fetch current SHA so the write doesn't conflict.
      const cached = pages.find((p) => p.slug === slug)
      let currentSha = cached?.sha
      if (!currentSha) {
        const result = await readPage(slug)
        currentSha = result?.sha
      }

      const newSha = await writePage({
        slug,
        content: page.raw,
        message: `Restore to ${sha.slice(0, 7)}`,
        sha: currentSha,
      })
      const updated = parsePage(slug, slugToPath(slug), page.raw, newSha)
      updatePageInCache(updated)
      navigate(`/wiki/${slug}`)
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed.')
      setRestoring(false)
    }
  }, [page, restoring, pages, slug, sha, updatePageInCache, navigate])

  if (loading) return <div className="page-loading">Loading revision…</div>
  if (error || !page) return <div className="page-missing"><p>{error ?? 'Revision not found.'}</p></div>

  return (
    <div className="revision-view">
      <div className="revision-view__bar">
        <div className="revision-view__info">
          <Link to={`/history/${slug}`} className="revision-view__back">← History</Link>
          <code className="revision-view__sha">{sha.slice(0, 7)}</code>
        </div>
        <div className="revision-view__actions">
          {restoreError && <span className="revision-view__err">{restoreError}</span>}
          <button
            className="editor__btn editor__btn--save"
            type="button"
            disabled={restoring}
            onClick={() => { void handleRestore() }}
          >
            {restoring ? 'Restoring…' : 'Restore this version'}
          </button>
        </div>
      </div>
      <PageView page={page} readOnly />
    </div>
  )
}
