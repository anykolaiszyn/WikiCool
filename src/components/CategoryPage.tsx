import { Link } from 'react-router-dom'
import { useWikiStore } from './WikiStore'
import { formatValue } from './Infobox'
import type { PageFrontmatter, PageType, WikiPage } from '../types'

// ---------------------------------------------------------------------------
// Adaptive column definitions
// ---------------------------------------------------------------------------

interface ColDef {
  key: string
  label: string
}

const TYPE_COLUMNS: Partial<Record<PageType, ColDef[]>> = {
  vendor: [
    { key: 'category',       label: 'Category' },
    { key: 'contact',        label: 'Contact' },
    { key: 'map_policy',     label: 'MAP Policy' },
    { key: 'lead_time_days', label: 'Lead Time' },
  ],
  product: [
    { key: 'sku',       label: 'SKU' },
    { key: 'category',  label: 'Category' },
    { key: 'case_cost', label: 'Case Cost' },
    { key: 'msrp',      label: 'MSRP' },
  ],
}

const GENERIC_COLUMNS: ColDef[] = [
  { key: 'title', label: 'Title' },
  { key: 'type',  label: 'Type' },
  { key: 'tags',  label: 'Tags' },
]

/** Return the most common `type` value in a set of pages. */
function dominantType(pages: WikiPage[]): PageType | null {
  const counts = new Map<PageType, number>()
  for (const p of pages) {
    const t = p.frontmatter.type
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  let best: PageType | null = null
  let max = 0
  for (const [t, n] of counts) {
    if (n > max) { best = t; max = n }
  }
  return best
}

/** Read a column value from frontmatter, with a title fallback for 'title' key. */
function cellValue(fm: PageFrontmatter, key: string, slugTail: string): string {
  if (key === 'title') return (fm.title as string | undefined) ?? slugTail
  return formatValue(fm[key])
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CategoryPageProps {
  folder: string
}

export function CategoryPage({ folder }: CategoryPageProps) {
  const { pages, ready } = useWikiStore()

  if (!ready) return <div className="page-loading">Binding the archive…</div>

  const prefix = folder ? folder + '/' : ''
  const filtered = pages
    .filter((p) => p.slug.startsWith(prefix))
    .sort((a, b) => {
      const at = a.frontmatter.title ?? a.slug
      const bt = b.frontmatter.title ?? b.slug
      return at.localeCompare(bt)
    })

  const dominant = dominantType(filtered)
  const columns: ColDef[] = (dominant && TYPE_COLUMNS[dominant]) ?? GENERIC_COLUMNS

  const folderLabel = folder || 'All pages'

  return (
    <div className="cat-page">
      <div className="page-header">
        <h1 className="page-title">{folderLabel}</h1>
        <p className="cat-page__count">{filtered.length} page{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {filtered.length === 0 ? (
        <p className="cat-page__empty">No pages in this folder yet. <Link to="/new">Create one?</Link></p>
      ) : (
        <div className="cat-page__table-wrap">
          <table className="cat-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="cat-table__th">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((page) => {
                const tail = page.slug.includes('/') ? page.slug.split('/').pop()! : page.slug
                return (
                  <tr key={page.slug} className="cat-table__row">
                    {columns.map((col, i) => (
                      <td key={col.key} className="cat-table__td">
                        {i === 0 ? (
                          <Link to={`/wiki/${page.slug}`} className="cat-table__link">
                            {cellValue(page.frontmatter, col.key, tail)}
                          </Link>
                        ) : (
                          cellValue(page.frontmatter, col.key, tail)
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
