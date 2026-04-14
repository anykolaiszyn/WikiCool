import { Link } from 'react-router-dom'
import type { PageFrontmatter, PageType } from '../types'

// ---------------------------------------------------------------------------
// Field template registry
// ---------------------------------------------------------------------------

interface FieldDef {
  key: string
  label: string
}

const TEMPLATES: Record<PageType, FieldDef[]> = {
  vendor: [
    { key: 'category',       label: 'Category' },
    { key: 'contact',        label: 'Contact' },
    { key: 'rep',            label: 'Rep' },
    { key: 'map_policy',     label: 'MAP Policy' },
    { key: 'moq_usd',        label: 'MOQ (USD)' },
    { key: 'payment_terms',  label: 'Payment Terms' },
    { key: 'lead_time_days', label: 'Lead Time (days)' },
    { key: 'last_contact',   label: 'Last Contact' },
  ],
  sop: [
    { key: 'owner',         label: 'Owner' },
    { key: 'applies_to',    label: 'Applies To' },
    { key: 'status',        label: 'Status' },
    { key: 'last_reviewed', label: 'Last Reviewed' },
    { key: 'version',       label: 'Version' },
  ],
  product: [
    { key: 'sku',               label: 'SKU' },
    { key: 'category',          label: 'Category' },
    { key: 'supplier',          label: 'Supplier' },
    { key: 'case_cost',         label: 'Case Cost' },
    { key: 'landed_cost',       label: 'Landed Cost' },
    { key: 'otp_adjusted_cost', label: 'OTP-Adj. Cost' },
    { key: 'msrp',              label: 'MSRP' },
    { key: 'active',            label: 'Active' },
  ],
  event: [
    { key: 'venue',       label: 'Venue' },
    { key: 'location',    label: 'Location' },
    { key: 'dates',       label: 'Dates' },
    { key: 'permit_type', label: 'Permit Type' },
    { key: 'status',      label: 'Status' },
  ],
  person: [
    { key: 'role',        label: 'Role' },
    { key: 'affiliation', label: 'Affiliation' },
    { key: 'contact',     label: 'Contact' },
    { key: 'first_met',   label: 'First Met' },
  ],
  note: [],
}

// ---------------------------------------------------------------------------
// Value formatter
// ---------------------------------------------------------------------------

/**
 * Render a frontmatter value as a display string.
 * - Arrays → comma-joined
 * - Booleans → "yes" / "no"
 * - Numbers → locale-formatted
 * - null / undefined → em dash
 * - Everything else → string coercion
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number') return value.toLocaleString()
  if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(', ')
  return String(value)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InforboxProps {
  frontmatter: PageFrontmatter
}

/**
 * Renders a structured infobox sidebar for a wiki page.
 * Returns null when the page type has no template or no template fields
 * are present in the frontmatter.
 */
export function Infobox({ frontmatter }: InforboxProps) {
  const type = frontmatter.type
  if (!type) return null

  const template = TEMPLATES[type]
  if (!template || template.length === 0) return null

  // Only render rows for fields that actually appear in the frontmatter.
  const rows = template.filter(({ key }) => frontmatter[key] !== undefined)
  const tags = frontmatter.tags ?? []

  if (rows.length === 0 && tags.length === 0) return null

  const title = frontmatter.title ?? ''
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)

  return (
    <aside className="infobox">
      <div className="infobox__header">
        <span className="infobox__type">{typeLabel}</span>
        {title && <span className="infobox__title">{title}</span>}
      </div>

      {rows.length > 0 && (
        <dl className="infobox__fields">
          {rows.map(({ key, label }) => (
            <div className="infobox__row" key={key}>
              <dt className="infobox__label">{label}</dt>
              <dd className="infobox__value">{formatValue(frontmatter[key])}</dd>
            </div>
          ))}
        </dl>
      )}

      {tags.length > 0 && (
        <div className="infobox__tags">
          {tags.map((tag) => (
            <Link
              key={tag}
              to={`/tag/${encodeURIComponent(tag)}`}
              className="infobox__tag"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}
    </aside>
  )
}
