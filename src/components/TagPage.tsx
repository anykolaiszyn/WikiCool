import { Link } from 'react-router-dom'
import { useWikiStore } from './WikiStore'

interface TagPageProps {
  tag: string
}

export function TagPage({ tag }: TagPageProps) {
  const { pages, ready } = useWikiStore()

  if (!ready) return <div className="page-loading">Binding the archive…</div>

  const filtered = pages
    .filter((p) => p.frontmatter.tags?.includes(tag))
    .sort((a, b) => {
      const at = a.frontmatter.title ?? a.slug
      const bt = b.frontmatter.title ?? b.slug
      return at.localeCompare(bt)
    })

  return (
    <div className="tag-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="tag-page__label">Tag:</span> {tag}
        </h1>
        <p className="cat-page__count">{filtered.length} page{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="cat-page__empty">No pages tagged <strong>{tag}</strong> yet.</p>
      ) : (
        <ul className="tag-page__list">
          {filtered.map((page) => {
            const tail = page.slug.includes('/') ? page.slug.split('/').pop()! : page.slug
            const title = page.frontmatter.title ?? tail
            const type = page.frontmatter.type
            return (
              <li key={page.slug} className="tag-page__item">
                <Link to={`/wiki/${page.slug}`} className="tag-page__title">{title}</Link>
                {type && <span className="tag-page__type">{type}</span>}
                <span className="backlink-path">{page.slug}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
