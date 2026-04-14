/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_OWNER: string
  readonly VITE_GITHUB_REPO: string
  readonly VITE_GITHUB_BRANCH: string
  readonly VITE_CONTENT_PATH: string
  readonly VITE_GITHUB_TOKEN?: string
  /** Base URL of the Cloudflare OAuth Worker, e.g. https://oauth.example.com */
  readonly VITE_OAUTH_BASE?: string
  /**
   * Base URL of the Cloudflare Worker's webhook/SSE endpoint.
   * When set, the app opens an EventSource to ${VITE_WEBHOOK_BASE}/events and
   * calls store.reload() whenever a GitHub push event is received.
   * Defaults to VITE_OAUTH_BASE if they share the same Worker deployment.
   */
  readonly VITE_WEBHOOK_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
