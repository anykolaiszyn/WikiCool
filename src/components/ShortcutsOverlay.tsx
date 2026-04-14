import { useEffect, useState } from 'react'

interface ShortcutRow {
  keys: string[]
  description: string
}

const SHORTCUT_LIST: ShortcutRow[] = [
  { keys: ['⌘K', 'Ctrl+K'],      description: 'Focus search' },
  { keys: ['⌘E', 'Ctrl+E'],      description: 'Edit current page' },
  { keys: ['⌘S', 'Ctrl+S'],      description: 'Save (in editor)' },
  { keys: ['g', 'h'],             description: 'Go home' },
  { keys: ['Esc'],                description: 'Close overlay / clear search' },
  { keys: ['?'],                  description: 'Show this overlay' },
]

/**
 * Keyboard shortcut reference overlay.
 * Toggles on `?` keypress; closes on Escape or outside click.
 */
export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      if (inInput) return

      if (e.key === '?') {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }

      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)

  return (
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events */
    <div
      className="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="shortcuts-card">
        <div className="shortcuts-card__header">
          <h2 className="shortcuts-card__title">Keyboard shortcuts</h2>
          <button
            className="shortcuts-card__close"
            type="button"
            aria-label="Close shortcuts"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        <table className="shortcuts-table">
          <tbody>
            {SHORTCUT_LIST.map((row, i) => {
              // Show Mac variant if on Mac (first item) else Windows variant.
              const keysToShow = row.keys.length === 2 && row.keys[0].includes('⌘')
                ? [isMac ? row.keys[0] : row.keys[1]]
                : row.keys

              return (
                <tr key={i} className="shortcuts-row">
                  <td className="shortcuts-row__keys">
                    {keysToShow.map((k, j) => (
                      <span key={j}>
                        {j > 0 && <span className="shortcuts-row__then">then</span>}
                        <kbd className="shortcuts-kbd">{k}</kbd>
                      </span>
                    ))}
                  </td>
                  <td className="shortcuts-row__desc">{row.description}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <p className="shortcuts-card__hint">Press <kbd className="shortcuts-kbd">?</kbd> to toggle</p>
      </div>
    </div>
  )
}
