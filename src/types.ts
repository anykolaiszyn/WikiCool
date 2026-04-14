/** GitHub repo coordinates and content root for the wiki. */
export interface WikiConfig {
  owner: string
  repo: string
  branch: string
  contentPath: string
}

/** Discriminator for the six wiki collection types. */
export type PageType = 'vendor' | 'sop' | 'product' | 'event' | 'person' | 'note'

/** Typed subset of a page's YAML frontmatter; extra keys are allowed. */
export interface PageFrontmatter {
  title?: string
  type?: PageType
  tags?: string[]
  [key: string]: unknown
}

/** A fully-parsed wiki page ready for rendering. */
export interface WikiPage {
  /** URL-safe identifier derived from the file path (no extension). */
  slug: string
  /** Full path inside the content repo, e.g. `content/vendors/padron.md`. */
  path: string
  /** Parsed frontmatter fields. */
  frontmatter: PageFrontmatter
  /** Markdown body with frontmatter block stripped. */
  body: string
  /** Original file content as returned by the GitHub API. */
  raw: string
  /** Git blob SHA — required for update commits; absent on new files. */
  sha?: string
}

/** Lightweight file listing entry returned by directory tree calls. */
export interface FileEntry {
  path: string
  slug: string
  sha: string
}

/** Metadata for a single Git commit. */
export interface CommitInfo {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

/** Bidirectional wikilink graph keyed by slug. */
export interface BacklinkIndex {
  /** Slugs that link *to* each key slug. */
  incoming: Record<string, string[]>
  /** Slugs that each key slug links *out to*. */
  outgoing: Record<string, string[]>
}
