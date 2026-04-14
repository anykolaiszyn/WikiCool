/**
 * PageEditor — split CodeMirror + live preview editor
 *
 * Left: CodeMirror with markdown mode (raw frontmatter + body)
 * Right: live rendered preview using the same PageView pipeline
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useBlocker } from 'react-router-dom'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { useWikiStore } from './WikiStore'
import { PageView } from './PageView'
import { useShortcuts } from '../lib/shortcuts'
import { parsePage } from '../lib/markdown'
import { writePage, readPage, slugToPath } from '../lib/github'
import type { WikiPage } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function is409(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: unknown }).status === 409
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PageEditorProps {
  slug: string
}

type LoadState = 'loading' | 'ready' | 'missing'

export function PageEditor({ slug }: PageEditorProps) {
  const { pages, updatePageInCache } = useWikiStore()
  const navigate = useNavigate()

  // Find page in cache or load ad-hoc.
  const [page, setPage] = useState<WikiPage | null>(
    () => pages.find((p) => p.slug === slug) ?? null,
  )
  const [loadState, setLoadState] = useState<LoadState>(page ? 'ready' : 'loading')

  useEffect(() => {
    const cached = pages.find((p) => p.slug === slug)
    if (cached) {
      setPage(cached)
      setLoadState('ready')
      return
    }
    let cancelled = false
    readPage(slug).then((result) => {
      if (cancelled) return
      if (result === null) {
        setLoadState('missing')
      } else {
        const path = slugToPath(slug)
        setPage(parsePage(slug, path, result.raw, result.sha))
        setLoadState('ready')
      }
    }).catch(() => {
      if (!cancelled) setLoadState('missing')
    })
    return () => { cancelled = true }
  }, [slug, pages])

  // Editor state.
  const original = page?.raw ?? ''
  const [editorValue, setEditorValue] = useState(original)
  const [commitMsg, setCommitMsg] = useState(`Update ${slug}`)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Sync editorValue when the page loads for the first time.
  const initialised = useRef(false)
  useEffect(() => {
    if (page && !initialised.current) {
      setEditorValue(page.raw)
      initialised.current = true
    }
  }, [page])

  const isDirty = editorValue !== original

  // Navigate-away blocker when dirty.
  const blocker = useBlocker(isDirty && !saving)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      const go = window.confirm('You have unsaved changes. Leave without saving?')
      if (go) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker])

  // Warn on tab/browser close when dirty.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  // Live preview page derived from current editor content.
  const previewPage = useMemo<WikiPage | null>(() => {
    try {
      const path = slugToPath(slug)
      return parsePage(slug, path, editorValue)
    } catch {
      return null
    }
  }, [slug, editorValue])

  // Save handler.
  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const newSha = await writePage({
        slug,
        content: editorValue,
        message: commitMsg.trim() || `Update ${slug}`,
        sha: page?.sha,
      })
      const path = slugToPath(slug)
      const updated = parsePage(slug, path, editorValue, newSha)
      updatePageInCache(updated)
      navigate(`/wiki/${slug}`)
    } catch (err) {
      if (is409(err)) {
        setSaveError('This page changed since you opened it. Reload and reapply your changes.')
      } else {
        setSaveError(err instanceof Error ? err.message : 'Save failed.')
      }
      setSaving(false)
    }
  }, [saving, slug, editorValue, commitMsg, page?.sha, updatePageInCache, navigate])

  // mod+s — save. Registered via useShortcuts so it goes through the shared
  // shortcut infrastructure (handles Mac vs non-Mac automatically).
  useShortcuts({ 'mod+s': () => { void handleSave() } })

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loadState === 'loading') {
    return <div className="page-loading page-loading--center">Opening the editor…</div>
  }

  if (loadState === 'missing') {
    return (
      <div className="page-missing">
        <h1>Page not found</h1>
        <p><code>{slug}</code> does not exist. <a href={`/new`}>Create a new page?</a></p>
      </div>
    )
  }

  return (
    <div className="editor">
      {/* Top bar */}
      <div className="editor__bar">
        <div className="editor__bar-left">
          <span className="editor__slug">{slug}</span>
          {isDirty && <span className="editor__dirty" aria-label="Unsaved changes">●</span>}
        </div>
        <div className="editor__bar-center">
          <input
            className="editor__commit-input"
            type="text"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder={`Update ${slug}`}
            aria-label="Commit message"
          />
        </div>
        <div className="editor__bar-right">
          <button
            className="editor__btn editor__btn--cancel"
            type="button"
            onClick={() => navigate(`/wiki/${slug}`)}
          >
            Cancel
          </button>
          <button
            className="editor__btn editor__btn--save"
            type="button"
            disabled={saving}
            onClick={() => { void handleSave() }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="editor__error" role="alert">{saveError}</div>
      )}

      {/* Split panes */}
      <div className="editor__panes">
        <div className="editor__pane editor__pane--code">
          <CodeMirror
            value={editorValue}
            height="100%"
            extensions={[markdown()]}
            onChange={setEditorValue}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
              autocompletion: false,
            }}
          />
        </div>
        <div className="editor__pane editor__pane--preview">
          {previewPage ? (
            <PageView page={previewPage} readOnly />
          ) : (
            <div className="editor__preview-err">Preview unavailable — frontmatter parse error.</div>
          )}
        </div>
      </div>
    </div>
  )
}
