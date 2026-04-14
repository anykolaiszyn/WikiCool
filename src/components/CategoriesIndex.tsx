import { Link } from 'react-router-dom'
import { useWikiStore } from './WikiStore'

/**
 * Top-level /categories index: every unique top-level folder with a page count
 * and a list of any sub-folders.
 */
export function CategoriesIndex() {
  const { pages, ready } = useWikiStore()

  if (!ready) return <div className="page-loading">Binding the archive…</div>

  // Collect all unique folder prefixes from slugs.
  const folderCounts = new Map<string, number>()
  for (const page of pages) {
    const parts = page.slug.split('/')
    if (parts.length < 2) continue
    // Register every ancestor folder.
    for (let depth = 1; depth < parts.length; depth++) {
      const folder = parts.slice(0, depth).join('/')
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
    }
  }

  // Separate top-level (no '/') from nested.
  const topFolders = Array.from(folderCounts.entries())
    .filter(([f]) => !f.includes('/'))
    .sort(([a], [b]) => a.localeCompare(b))

  // Group nested folders under their parent for display.
  const subFoldersOf = (parent: string) =>
    Array.from(folderCounts.entries())
      .filter(([f]) => f.startsWith(parent + '/') && f.split('/').length === parent.split('/').length + 1)
      .sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="cat-index">
      <div className="page-header">
        <h1 className="page-title">All Categories</h1>
      </div>

      {topFolders.length === 0 ? (
        <p className="cat-page__empty">No pages yet. <Link to="/new">Create the first one?</Link></p>
      ) : (
        <ul className="cat-index__list">
          {topFolders.map(([folder, count]) => {
            const subs = subFoldersOf(folder)
            return (
              <li key={folder} className="cat-index__item">
                <div className="cat-index__row">
                  <Link to={`/category/${folder}`} className="cat-index__folder">
                    {folder}
                  </Link>
                  <span className="cat-index__count">{count} page{count !== 1 ? 's' : ''}</span>
                </div>
                {subs.length > 0 && (
                  <ul className="cat-index__subs">
                    {subs.map(([sub, subCount]) => {
                      const subName = sub.split('/').pop()!
                      return (
                        <li key={sub}>
                          <Link to={`/category/${sub}`} className="cat-index__subfolder">
                            {subName}
                          </Link>
                          <span className="cat-index__count"> ({subCount})</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
