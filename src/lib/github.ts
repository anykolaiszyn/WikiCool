/**
 * GitHub API client — VCC Wiki
 *
 * Single point of contact for all GitHub API calls. Components MUST NOT
 * import Octokit directly; they must go through this module.
 */

import { Octokit } from '@octokit/rest'
import { getToken } from './auth'
import type { WikiConfig, FileEntry, CommitInfo } from '../types'

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

/** Thrown when the GitHub API returns 403 with x-ratelimit-remaining: 0. */
export class RateLimitError extends Error {
  /** The UTC time when the rate limit resets, or null if unknown. */
  readonly resetAt: Date | null

  constructor(resetAt: Date | null) {
    const time = resetAt ? ` Resets at ${resetAt.toLocaleTimeString()}.` : ''
    super(`GitHub API rate limit hit.${time}`)
    this.name = 'RateLimitError'
    this.resetAt = resetAt
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Wiki configuration read from Vite env vars at module load time. */
export const config: WikiConfig = {
  owner: import.meta.env.VITE_GITHUB_OWNER,
  repo: import.meta.env.VITE_GITHUB_REPO,
  branch: import.meta.env.VITE_GITHUB_BRANCH ?? 'main',
  contentPath: import.meta.env.VITE_CONTENT_PATH ?? 'content',
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return an authenticated Octokit instance with rate-limit interceptor. */
function client(): Octokit {
  const token = getToken()
  if (!token) {
    throw new Error('No GitHub token available. Set VITE_GITHUB_TOKEN or log in.')
  }
  const gh = new Octokit({ auth: token })

  // Intercept every response: if status 403 and rate-limit header is 0, throw.
  gh.hook.error('request', (error: unknown) => {
    if (isRateLimited(error)) {
      const resetSec = getResetHeader(error)
      const resetAt = resetSec ? new Date(resetSec * 1000) : null
      throw new RateLimitError(resetAt)
    }
    throw error
  })

  return gh
}

/** True if the error is a 403 with x-ratelimit-remaining: 0. */
function isRateLimited(err: unknown): boolean {
  if (
    typeof err !== 'object' ||
    err === null ||
    !('status' in err) ||
    (err as { status: unknown }).status !== 403
  ) return false

  const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers
  if (!headers) return false
  return headers['x-ratelimit-remaining'] === '0'
}

/** Extract x-ratelimit-reset epoch seconds from an Octokit error, or null. */
function getResetHeader(err: unknown): number | null {
  const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers
  const raw = headers?.['x-ratelimit-reset']
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

/** Decode a base64 string (as returned by the GitHub API) to a UTF-8 string. */
function decodeContent(b64: string): string {
  // GitHub wraps lines at 60 chars — strip newlines before decoding.
  const clean = b64.replace(/\n/g, '')
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Encode a UTF-8 string to base64 for use in GitHub API write calls. */
function encodeContent(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

// ---------------------------------------------------------------------------
// Path ↔ slug conversion
// ---------------------------------------------------------------------------

/**
 * Convert a repo-relative file path to a slug.
 * `content/vendors/padron.md` → `vendors/padron`
 */
export function pathToSlug(path: string): string {
  const prefix = config.contentPath + '/'
  let slug = path.startsWith(prefix) ? path.slice(prefix.length) : path
  if (slug.endsWith('.md')) slug = slug.slice(0, -3)
  return slug
}

/**
 * Convert a slug to a repo-relative file path.
 * `vendors/padron` → `content/vendors/padron.md`
 */
export function slugToPath(slug: string): string {
  return `${config.contentPath}/${slug}.md`
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * List every wiki page in the content repo using a single recursive tree call.
 * Returns only blob entries under `contentPath/` with a `.md` extension.
 */
export async function listAllPages(): Promise<FileEntry[]> {
  const gh = client()

  // Resolve the branch tip SHA.
  const refRes = await gh.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  })
  const treeSha = refRes.data.object.sha

  // Fetch the full recursive tree in one call.
  const treeRes = await gh.git.getTree({
    owner: config.owner,
    repo: config.repo,
    tree_sha: treeSha,
    recursive: 'true',
  })

  const prefix = config.contentPath + '/'
  const entries: FileEntry[] = []

  for (const item of treeRes.data.tree) {
    if (
      item.type === 'blob' &&
      typeof item.path === 'string' &&
      typeof item.sha === 'string' &&
      item.path.startsWith(prefix) &&
      item.path.endsWith('.md')
    ) {
      entries.push({
        path: item.path,
        slug: pathToSlug(item.path),
        sha: item.sha,
      })
    }
  }

  return entries
}

/**
 * Fetch a single wiki page by slug.
 * Returns `null` on 404; rethrows all other errors.
 */
export async function readPage(slug: string): Promise<{ raw: string; sha: string } | null> {
  const gh = client()
  const path = slugToPath(slug)

  try {
    const res = await gh.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.branch,
    })

    // getContent returns an array for directories; we only handle files.
    const data = res.data
    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Expected a file at ${path}, got directory or unexpected type.`)
    }

    return {
      raw: decodeContent(data.content),
      sha: data.sha,
    }
  } catch (err: unknown) {
    if (isOctokitNotFound(err)) return null
    throw err
  }
}

/** Parameters for writing (creating or updating) a wiki page. */
export interface WritePageParams {
  slug: string
  content: string
  message: string
  /** Must be supplied when updating an existing file. */
  sha?: string
}

/**
 * Create or update a wiki page.
 * Returns the new blob SHA produced by the commit.
 */
export async function writePage({ slug, content, message, sha }: WritePageParams): Promise<string> {
  const gh = client()
  const path = slugToPath(slug)

  const res = await gh.repos.createOrUpdateFileContents({
    owner: config.owner,
    repo: config.repo,
    path,
    message,
    content: encodeContent(content),
    branch: config.branch,
    ...(sha ? { sha } : {}),
  })

  const newSha = res.data.content?.sha
  if (!newSha) throw new Error(`writePage: GitHub did not return a blob SHA for ${slug}`)
  return newSha
}

/**
 * Return the commit history for a wiki page (most recent first).
 */
export async function pageHistory(slug: string, limit = 30): Promise<CommitInfo[]> {
  const gh = client()
  const path = slugToPath(slug)

  const res = await gh.repos.listCommits({
    owner: config.owner,
    repo: config.repo,
    sha: config.branch,
    path,
    per_page: limit,
  })

  return res.data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? c.commit.committer?.name ?? 'Unknown',
    date: c.commit.author?.date ?? c.commit.committer?.date ?? '',
    url: c.html_url,
  }))
}

/**
 * Read the raw markdown content of a page at a specific commit SHA.
 * Returns `null` if the file did not exist at that revision.
 */
export async function readPageAtCommit(slug: string, sha: string): Promise<string | null> {
  const gh = client()
  const path = slugToPath(slug)

  try {
    const res = await gh.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: sha,
    })

    const data = res.data
    if (Array.isArray(data) || data.type !== 'file') return null
    return decodeContent(data.content)
  } catch (err: unknown) {
    if (isOctokitNotFound(err)) return null
    throw err
  }
}

/**
 * Test connectivity and token validity.
 * Returns `true` if the configured repo is accessible, `false` otherwise.
 */
export async function ping(): Promise<boolean> {
  try {
    const gh = client()
    await gh.repos.get({ owner: config.owner, repo: config.repo })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isOctokitNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: unknown }).status === 404
  )
}
