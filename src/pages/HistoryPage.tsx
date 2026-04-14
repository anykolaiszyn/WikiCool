import { HistoryView, RevisionView } from '../components/HistoryView'

// A git SHA looks like 40 hex chars; short SHAs are at least 7.
const SHA_RE = /^[0-9a-f]{7,40}$/i

interface HistoryPageProps {
  /** Full splat from the /history/* route — may be "<slug>" or "<slug>/<sha>" */
  slug: string
}

/**
 * Decides whether to show the commit timeline or a specific revision.
 *
 * Strategy: split the splat by '/'. If the last segment matches a git SHA
 * pattern, treat everything before it as the slug and the last segment as sha.
 * Otherwise the entire splat is the slug.
 */
export function HistoryPage({ slug: splat }: HistoryPageProps) {
  const parts = splat.split('/')
  const last = parts[parts.length - 1]

  if (parts.length >= 2 && SHA_RE.test(last)) {
    const slug = parts.slice(0, -1).join('/')
    const sha = last
    return <RevisionView slug={slug} sha={sha} />
  }

  return <HistoryView slug={splat} />
}
