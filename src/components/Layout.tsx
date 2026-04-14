import { useCallback, type ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SearchBar } from './SearchBar'
import { ShortcutsOverlay } from './ShortcutsOverlay'
import { useShortcuts } from '../lib/shortcuts'

interface LayoutProps {
  /** App.tsx passes the <Routes> tree as children; Layout also renders <Outlet>. */
  children?: ReactNode
}

/**
 * App shell: sidebar left, search bar top, main content area right.
 * Registers app-wide keyboard shortcuts.
 */
export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()

  const goHome = useCallback(() => navigate('/wiki/index'), [navigate])

  // App-wide shortcuts (page-specific ones like mod+s are registered
  // by the editor itself; mod+k is handled by SearchBar).
  useShortcuts({
    'g h': goHome,
  })

  return (
    <div className="layout">
      <aside className="layout__sidebar">
        <Sidebar />
      </aside>
      <div className="layout__body">
        <header className="layout__header">
          <SearchBar />
        </header>
        <main className="layout__main">
          {children ?? <Outlet />}
        </main>
      </div>
      <ShortcutsOverlay />
    </div>
  )
}
