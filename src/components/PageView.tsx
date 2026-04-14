import { useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useShortcuts } from '../lib/shortcuts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { useWikiStore } from './WikiStore'
import { Infobox } from './Infobox'
import { rewriteWikilinks } from '../lib/markdown'
import type { WikiPage } from '../types'

// ---------------------------------------------------------------------------
// Link override — internal /wiki/ paths use React Router <Link>
// ---------------------------------------------------------------------------

const markdownComponents: Components = {
  a({ href, children, ...rest }) {
    if (href && href.startsWith('/wiki/')) {
      return <Link to={href}>{children}</Link>
    }
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    )
  },
}

// ---------------------------------------------------------------------------
// Breadcrumb helper
// ---------------------------------------------------------------------------

function Breadcrumb({ slug }: { slug: string }) {
  const segments = slug.split('/')
  if (segments.length < 2) return null

  // Everything except the last segment becomes a breadcrumb link.
  const crumbs = segments.slice(0, -1)

  return (
    <nav className="page-breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((seg, i) => {
        const path = crumbs.slice(0, i + 1).join('/')
        return (
          <span key={path}>
            <Link to={`/category/${path}`}>{seg}</Link>
            <span aria-hidden="true"> / </span>
          </span>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PageViewProps {
  page: WikiPage
  /** When true, hides the Edit/History action buttons. Used by the editor preview pane. */
  readOnly?: boolean
}

export function PageView({ page, readOnly = false }: PageViewProps) {
  const { slugs, backlinks, pages } = useWikiStore()
  const navigate = useNavigate()

  const goEdit = useCallback(() => {
    if (!readOnly) navigate(`/edit/${page.slug}`)
  }, [readOnly, navigate, page.slug])

  useShortcuts({ 'mod+e': goEdit })

  const rewritten = useMemo(
    () => rewriteWikilinks(page.body, slugs),
    [page.body, slugs],
  )

  const incomingLinks = backlinks.incoming[page.slug] ?? []

  const slugTail = page.slug.includes('/')
    ? page.slug.split('/').pop()!
    : page.slug

  const title = page.frontmatter.title ?? slugTail

  return (
    <article className="page">
      {/* Header */}
      <div className="page-header">
        <Breadcrumb slug={page.slug} />
        <h1 className="page-title">{title}</h1>
        {!readOnly && (
          <div className="page-actions">
            <Link to={`/edit/${page.slug}`} className="page-action-btn">Edit</Link>
            <Link to={`/history/${page.slug}`} className="page-action-btn">History</Link>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="page-body-wrap">
        <Infobox frontmatter={page.frontmatter} />
        <div className="page-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={markdownComponents}
          >
            {rewritten}
          </ReactMarkdown>
        </div>
      </div>

      {/* Backlinks */}
      {incomingLinks.length > 0 && (
        <section className="backlinks">
          <h2 className="backlinks__heading">What links here</h2>
          <ul className="backlinks__list">
            {incomingLinks.map((fromSlug) => {
              const fromPage = pages.find((p) => p.slug === fromSlug)
              const fromTitle = fromPage?.frontmatter.title ?? fromSlug
              return (
                <li key={fromSlug}>
                  <Link to={`/wiki/${fromSlug}`}>{fromTitle}</Link>
                  <span className="backlink-path">{fromSlug}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </article>
  )
}
