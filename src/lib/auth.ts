/**
 * Auth module — VCC Wiki
 *
 * Current strategy: Personal Access Token (PAT).
 *
 * Tokens are sourced in priority order:
 *   1. `VITE_GITHUB_TOKEN` build-time env var — convenient for single-user
 *      homelab deploys where the token can be baked into a `.env.local` file.
 *   2. `localStorage['vcc-wiki:gh-token']` — set at runtime via the login
 *      prompt. Tokens are stored only in the browser; they are never sent to
 *      any server other than api.github.com.
 *
 * The token must be a fine-grained PAT scoped to the content repo with
 * `Contents: Read+Write` and `Metadata: Read` permissions only.
 * See `docs/WIKI_REPO_SETUP.md` for generation and rotation guidance.
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

/*
 * OAuth upgrade path (future work)
 * ---------------------------------
 * To replace PAT auth with a proper GitHub OAuth flow:
 *
 *  1. Register a GitHub OAuth App at github.com/settings/developers.
 *     Set the callback URL to your deployed app origin + `/auth/callback`.
 *
 *  2. Stand up a lightweight Cloudflare Worker (or similar edge function)
 *     that holds the OAuth `client_secret`. The worker receives the temporary
 *     `code` from GitHub's redirect and exchanges it for an access token via
 *     POST https://github.com/login/oauth/access_token. The secret never
 *     touches the browser.
 *
 *  3. In `loginWithGitHub`:
 *     a. Redirect the user to:
 *        https://github.com/login/oauth/authorize?client_id=<ID>&scope=repo&state=<nonce>
 *     b. On the `/auth/callback` route, extract `code` and `state` from the
 *        URL, verify the nonce, then POST `code` to the Cloudflare Worker.
 *     c. The worker returns `{ access_token }` — call `setToken(access_token)`
 *        and redirect to the wiki home.
 *
 *  Token scopes needed: `repo` (or `contents:write` for fine-grained apps).
 */

/**
 * Initiate a GitHub OAuth login flow.
 * @throws Always — OAuth is not yet implemented. See comment above for the
 *   upgrade path when this stub needs to become real.
 */
export async function loginWithGitHub(): Promise<void> {
  throw new Error(
    'OAuth not implemented. ' +
    'Paste a fine-grained PAT via the login prompt or set VITE_GITHUB_TOKEN in .env.local.',
  )
}
