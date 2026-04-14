import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import matter from 'gray-matter'
import { useWikiStore } from './WikiStore'
import { titleToSlug, parsePage } from '../lib/markdown'
import { writePage, slugToPath } from '../lib/github'
import type { PageType } from '../types'

// ---------------------------------------------------------------------------
// Body templates per type
// ---------------------------------------------------------------------------

const BODY_TEMPLATES: Record<PageType | 'default', string> = {
  vendor: `## Overview

## Products & Lines

## History & Background

## Notes
`,
  product: `## Description

## Specifications

## Pricing Notes

## Notes
`,
  sop: `## Purpose

## Scope

## Procedure

### Step 1

### Step 2

## References
`,
  event: `## Details

## Logistics

## Notes
`,
  person: `## Background

## Notes
`,
  note: `## Notes
`,
  default: `## Overview

## Notes
`,
}

function bodyTemplate(type: PageType | ''): string {
  if (!type) return BODY_TEMPLATES.default
  return BODY_TEMPLATES[type] ?? BODY_TEMPLATES.default
}

// ---------------------------------------------------------------------------
// Collections (must stay in sync with content folder conventions)
// ---------------------------------------------------------------------------

const COLLECTIONS = ['vendors', 'products', 'sops', 'events', 'people', 'notes'] as const
type Collection = typeof COLLECTIONS[number]

// Default type per collection — reduces required clicks.
const COLLECTION_DEFAULT_TYPE: Record<Collection, PageType | ''> = {
  vendors:  'vendor',
  products: 'product',
  sops:     'sop',
  events:   'event',
  people:   'person',
  notes:    'note',
}

const PAGE_TYPES: PageType[] = ['vendor', 'sop', 'product', 'event', 'person', 'note']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewPage() {
  const { slugs, updatePageInCache } = useWikiStore()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [collection, setCollection] = useState<Collection>('vendors')
  const [type, setType] = useState<PageType | ''>('vendor')
  const [tagsRaw, setTagsRaw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep type in sync when collection changes, unless the user has overridden it.
  function handleCollectionChange(col: Collection) {
    setCollection(col)
    setType(COLLECTION_DEFAULT_TYPE[col])
  }

  // Derived slug preview.
  const previewSlug = title.trim()
    ? `${collection}/${titleToSlug(title.trim())}`
    : ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) { setError('Title is required.'); return }

    const slug = `${collection}/${titleToSlug(trimmedTitle)}`

    if (slugs.includes(slug)) {
      setError(`A page at "${slug}" already exists. Choose a different title or collection.`)
      return
    }

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const frontmatter: Record<string, unknown> = { title: trimmedTitle }
    if (type) frontmatter.type = type
    if (tags.length > 0) frontmatter.tags = tags

    const content = matter.stringify(bodyTemplate(type), frontmatter)

    setSubmitting(true)
    try {
      const sha = await writePage({ slug, content, message: `Create ${slug}` })
      const path = slugToPath(slug)
      const newPage = parsePage(slug, path, content, sha)
      updatePageInCache(newPage)
      navigate(`/edit/${slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page.')
      setSubmitting(false)
    }
  }

  return (
    <div className="new-page">
      <div className="page-header">
        <h1 className="page-title">New Page</h1>
      </div>

      <form className="new-page__form" onSubmit={(e) => { void handleSubmit(e) }} noValidate>

        {/* Title */}
        <div className="new-page__field">
          <label className="new-page__label" htmlFor="np-title">Title <span aria-hidden="true">*</span></label>
          <input
            id="np-title"
            className="new-page__input"
            type="text"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Padrón 1926"
          />
        </div>

        {/* Collection */}
        <div className="new-page__field">
          <label className="new-page__label" htmlFor="np-collection">Collection</label>
          <select
            id="np-collection"
            className="new-page__select"
            value={collection}
            onChange={(e) => handleCollectionChange(e.target.value as Collection)}
          >
            {COLLECTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div className="new-page__field">
          <label className="new-page__label" htmlFor="np-type">Type</label>
          <select
            id="np-type"
            className="new-page__select"
            value={type}
            onChange={(e) => setType(e.target.value as PageType | '')}
          >
            <option value="">— none —</option>
            {PAGE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div className="new-page__field">
          <label className="new-page__label" htmlFor="np-tags">Tags</label>
          <input
            id="np-tags"
            className="new-page__input"
            type="text"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="comma-separated, e.g. nicaragua, box-pressed"
          />
        </div>

        {/* Slug preview */}
        {previewSlug && (
          <p className="new-page__slug-preview">
            <span className="new-page__slug-label">Slug:</span>{' '}
            <code>{previewSlug}</code>
          </p>
        )}

        {error && (
          <p className="new-page__error" role="alert">{error}</p>
        )}

        <div className="new-page__actions">
          <button
            type="button"
            className="editor__btn editor__btn--cancel"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="editor__btn editor__btn--save"
            disabled={submitting || !title.trim()}
          >
            {submitting ? 'Creating…' : 'Create page'}
          </button>
        </div>
      </form>
    </div>
  )
}
