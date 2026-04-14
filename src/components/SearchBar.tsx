import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useWikiStore } from './WikiStore'
import { useShortcuts } from '../lib/shortcuts'
import { search } from '../lib/search'
import type { SearchResult } from '../lib/search'

const DEBOUNCE_MS = 120

export function SearchBar() {
  const { searchIndex } = useWikiStore()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [open, setOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // Keyboard shortcut: mod+k focuses input
  // ---------------------------------------------------------------------------
  const focusSearch = useCallback(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useShortcuts({ 'mod+k': focusSearch })

  // ---------------------------------------------------------------------------
  // Click-outside closes dropdown
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // ---------------------------------------------------------------------------
  // Debounced search
  // ---------------------------------------------------------------------------
  const runSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const hits = q.trim() ? search(searchIndex, q, 8) : []
        setResults(hits)
        setActiveIdx(-1)
        setOpen(hits.length > 0)
      }, DEBOUNCE_MS)
    },
    [searchIndex],
  )

  function handleChange(value: string) {
    setQuery(value)
    if (!value.trim()) {
      setResults([])
      setOpen(false)
      setActiveIdx(-1)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    } else {
      runSearch(value)
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard navigation inside the input
  // ---------------------------------------------------------------------------
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setQuery('')
      setResults([])
      setOpen(false)
      setActiveIdx(-1)
      inputRef.current?.blur()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && results[activeIdx]) {
        navigate(`/wiki/${results[activeIdx].slug}`)
        closeDropdown()
      } else if (query.trim()) {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`)
        closeDropdown()
      }
    }
  }

  function closeDropdown() {
    setOpen(false)
    setActiveIdx(-1)
    setQuery('')
    setResults([])
    inputRef.current?.blur()
  }

  function handleResultClick(slug: string) {
    navigate(`/wiki/${slug}`)
    closeDropdown()
  }

  return (
    <div className="search-bar" ref={containerRef}>
      <div className="search-bar__input-wrap">
        <input
          ref={inputRef}
          className="search-bar__input"
          type="search"
          placeholder="Search…"
          aria-label="Search the wiki"
          aria-autocomplete="list"
          aria-controls="search-dropdown"
          aria-activedescendant={activeIdx >= 0 ? `search-result-${activeIdx}` : undefined}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="search-bar__shortcut" aria-hidden="true">⌘K</kbd>
      </div>

      {open && results.length > 0 && (
        <ul
          id="search-dropdown"
          className="search-dropdown"
          role="listbox"
          aria-label="Search results"
        >
          {results.map((result, i) => (
            <li
              key={result.slug}
              id={`search-result-${i}`}
              className={`search-result${i === activeIdx ? ' search-result--active' : ''}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault() // keep input focused until click completes
                handleResultClick(result.slug)
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="search-result__title">{result.title}</span>
              <span className="search-result__snippet">{result.snippet}</span>
              <span className="search-result__slug">{result.slug}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
