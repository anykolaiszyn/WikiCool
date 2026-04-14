/**
 * Auth module — VCC Wiki
 *
 * Token sources (checked in priority order)
 * ──────────────────────────────────────────
 *  1. `VITE_GITHUB_TOKEN` build-time env var — single-user homelab shortcut.
 *     Bake a fine-grained PAT into `.env.local` and the app never shows a
 *     login screen.
 *
 *  2. `localStorage['vcc-wiki:gh-token']` — set at runtime either by pasting
 *     a PAT into the login form or by the OAuth callback handler. Tokens are
 *     stored only in the browser and never sent to any server other than
 *     api.github.com.
 *
 * OAuth flow (when VITE_OAUTH_BASE is set)
 * ─────────────────────────────────────────
 *  loginWithGitHub() redirects the user to the Cloudflare Worker's
 *  /authorize endpoint. The Worker handles the GitHub OAuth round-trip and
 *  redirects back to /auth/callback#access_token=<token>. The
 *  AuthCallbackPage component reads the fragment and calls setToken().
 *
 *  Required env var: VITE_OAUTH_BASE  (e.g. https://oauth.example.com)
 *  Optional env var: VITE_GITHUB_TOKEN (bypasses OAuth entirely)
 */

const STORAGE_KEY = 'vcc-wiki:gh-token'

/** Return the active GitHub token, or null if none is set. */
export function getToken(): string | null {
  const envToken = import.meta.env.VITE_GITHUB_TOKEN
  if (typeof envToken === 'string' && envToken.trim() !== '') {
    return envToken.trim()
  }
  return localStorage.getItem(STORAGE_KEY)
}

/** Persist a token to localStorage for runtime use. */
export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

/** Remove the stored token (does not affect the env var). */
export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Return true if a token is available from any source. */
export function hasToken(): boolean {
  return getToken() !== null
}

/**
 * Initiate a GitHub OAuth login flow via the Cloudflare Worker.
 *
 * Requires `VITE_OAUTH_BASE` to be set (e.g. https://oauth.example.com).
 * The browser is redirected to the Worker's /authorize endpoint, which then
 * handles the GitHub OAuth round-trip and redirects back to /auth/callback
 * with the token in the URL fragment.
 *
 * Falls back to an error if `VITE_OAUTH_BASE` is not configured.
 */
export function loginWithGitHub(): void {
  const oauthBase = import.meta.env.VITE_OAUTH_BASE?.trim()

  if (!oauthBase) {
    throw new Error(
      'VITE_OAUTH_BASE is not set. ' +
      'Either configure the OAuth Worker and set VITE_OAUTH_BASE, ' +
      'or paste a fine-grained PAT via the login prompt.',
    )
  }

  // Hard navigation — the Worker will redirect us back via /auth/callback.
  const authorizeUrl = `${oauthBase}/authorize`
  window.location.href = authorizeUrl
}

/** Return true if the OAuth Worker is configured. */
export function hasOAuthConfigured(): boolean {
  const base = import.meta.env.VITE_OAUTH_BASE?.trim()
  return typeof base === 'string' && base.length > 0
}
