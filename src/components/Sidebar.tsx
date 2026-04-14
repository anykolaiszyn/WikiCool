import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWikiStore } from './WikiStore'
import type { WikiPage } from '../types'

// ---------------------------------------------------------------------------
// Tree builder
// ---------------------------------------------------------------------------

interface LeafNode {
  kind: 'leaf'
  slug: string
  title: string
}

interface FolderNode {
  kind: 'folder'
  name: string
  path: string
  children: TreeNode[]
}

type TreeNode = LeafNode | FolderNode

/**
 * Group pages into a nested folder tree keyed by slug path segments.
 * Top-level pages (no `/`) are placed in a synthetic `''` root folder.
 */
function buildTree(pages: WikiPage[]): FolderNode[] {
  // Map<folderPath, { leaves, subfolders }>
  const folderMap = new Map<string, { leaves: LeafNode[]; subfolders: Set<string> }>()

  function ensureFolder(path: string) {
    if (!folderMap.has(path)) {
      folderMap.set(path, { leaves: [], subfolders: new Set() })
    }
    return folderMap.get(path)!
  }

  for (const page of pages) {
    const parts = page.slug.split('/')
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const leaf: LeafNode = {
      kind: 'leaf',
      slug: page.slug,
      title: page.frontmatter.title ?? parts[parts.length - 1],
    }

    ensureFolder(folderPath).leaves.push(leaf)

    // Register parent ancestry so folders with only sub-folders still appear.
    const segments = parts.slice(0, -1)
    for (let i = 0; i < segments.length; i++) {
      const parent = i === 0 ? '' : segments.slice(0, i).join('/')
      const current = segments.slice(0, i + 1).join('/')
      ensureFolder(parent).subfolders.add(current)
      ensureFolder(current) // ensure it exists
    }
  }

  function buildFolder(path: string): FolderNode {
    const entry = folderMap.get(path) ?? { leaves: [], subfolders: new Set() }
    const name = path.includes('/') ? path.split('/').pop()! : path

    const subFolderNodes: FolderNode[] = Array.from(entry.subfolders)
      .sort()
      .map(buildFolder)

    const leaves = [...entry.leaves].sort((a, b) => a.title.localeCompare(b.title))

    const children: TreeNode[] = [...subFolderNodes, ...leaves]
    return { kind: 'folder', name, path, children }
  }

  const root = folderMap.get('') ?? { leaves: [], subfolders: new Set() }

  // Collect and sort top-level folders.
  const topFolders: FolderNode[] = Array.from(root.subfolders)
    .sort()
    .map(buildFolder)

  // Pages at true root (no folder prefix) go into a synthetic "General" folder
  // only if there are any, so the sidebar doesn't show an empty group.
  const rootLeaves = [...(root.leaves ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title),
  )
  if (rootLeaves.length > 0) {
    topFolders.unshift({
      kind: 'folder',
      name: '',  // rendered specially
      path: '',
      children: rootLeaves,
    })
  }

  return topFolders
}

/** Count all leaf descendants recursively. */
function countLeaves(node: FolderNode): number {
  let n = 0
  for (const child of node.children) {
    if (child.kind === 'leaf') n++
    else n += countLeaves(child)
  }
  return n
}

// ---------------------------------------------------------------------------
// Tree renderer
// ---------------------------------------------------------------------------

function FolderSection({
  folder,
  depth,
  currentPath,
}: {
  folder: FolderNode
  depth: number
  currentPath: string
}) {
  const count = countLeaves(folder)
  const label = folder.name || 'General'
  const isActive = currentPath.startsWith(`/category/${folder.path}`) ||
    folder.children.some(
      (c) => c.kind === 'leaf' && currentPath === `/wiki/${c.slug}`,
    )

  return (
    <details className={`sidebar-folder${depth > 0 ? ' sidebar-folder--nested' : ''}`} open={isActive || depth === 0}>
      <summary className="sidebar-folder__summary">
        <span className="sidebar-folder__name">{label}</span>
        <span className="sidebar-folder__count">{count}</span>
      </summary>
      <ul className="sidebar-folder__list">
        {folder.children.map((child) =>
          child.kind === 'folder' ? (
            <li key={child.path}>
              <FolderSection folder={child} depth={depth + 1} currentPath={currentPath} />
            </li>
          ) : (
            <li key={child.slug}>
              <Link
                to={`/wiki/${child.slug}`}
                className={`sidebar-leaf${currentPath === `/wiki/${child.slug}` ? ' sidebar-leaf--active' : ''}`}
              >
                {child.title}
              </Link>
            </li>
          ),
        )}
      </ul>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

const SKELETON_WIDTHS = ['70%', '55%', '80%', '60%', '75%', '50%'] as const

function SidebarSkeleton() {
  return (
    <div className="sidebar-skeleton" aria-label="Loading navigation" aria-busy="true">
      {SKELETON_WIDTHS.map((w, i) => (
        <div
          key={i}
          className="sidebar-skeleton__row"
          style={{ width: w }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const { pages, loading } = useWikiStore()
  const { pathname } = useLocation()

  const tree = useMemo(() => buildTree(pages), [pages])

  return (
    <nav className="sidebar" aria-label="Wiki navigation">
      <div className="sidebar__top">
        <Link to="/new" className="sidebar__new-btn">+ New page</Link>
        <Link to="/category/" className="sidebar__all-link">All categories</Link>
      </div>

      {loading && <SidebarSkeleton />}

      {!loading && tree.length === 0 && (
        <p className="sidebar__empty">No pages yet.</p>
      )}

      {!loading && tree.map((folder) => (
        <FolderSection
          key={folder.path || '__root__'}
          folder={folder}
          depth={0}
          currentPath={pathname}
        />
      ))}
    </nav>
  )
}
