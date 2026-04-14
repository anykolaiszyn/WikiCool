import { type FormEvent, type ReactNode, useState } from 'react'
import { clearToken, hasOAuthConfigured, hasToken, loginWithGitHub, setToken } from '../lib/auth'
import { config, ping } from '../lib/github'

interface AuthGateProps {
  children: ReactNode
}

/**
 * Guards the app behind a GitHub PAT login screen.
 *
 * - Token present → render children + unobtrusive sign-out button.
 * - No token → render the auth card with PAT input + help text.
 */
export function AuthGate({ children }: AuthGateProps) {
  // Use a counter so a forced re-render after sign-out collapses back to the
  // login card without unmounting/remounting the whole tree unnecessarily.
  const [authed, setAuthed] = useState(hasToken)

  function handleSignOut() {
    clearToken()
    setAuthed(false)
  }

  if (authed) {
    return (
      <>
        {children}
        <button
          className="signout-btn"
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
        >
          Sign out
        </button>
      </>
    )
  }

  return <LoginCard onSuccess={() => setAuthed(true)} />
}

// ---------------------------------------------------------------------------
// Login card
// ---------------------------------------------------------------------------

function LoginCard({ onSuccess }: { onSuccess: () => void }) {
  const [token, setTokenInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const oauthAvailable = hasOAuthConfigured()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = token.trim()
    if (!trimmed) return

    setChecking(true)
    setErr(null)
    setToken(trimmed)

    const ok = await ping()

    if (!ok) {
      clearToken()
      setErr('Token rejected — check that it has Contents: Read+Write and Metadata: Read on the correct repo.')
      setChecking(false)
      return
    }

    setChecking(false)
    onSuccess()
  }

  function handleOAuth() {
    try {
      loginWithGitHub()
    } catch (err) {
      setErr(err instanceof Error ? err.message : 'OAuth unavailable')
    }
  }

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <h1 className="auth-title">The Archive</h1>
        <p className="auth-sub">{config.owner}/{config.repo}</p>

        {oauthAvailable && (
          <button
            className="auth-btn auth-btn--oauth"
            type="button"
            onClick={handleOAuth}
          >
            Sign in with GitHub
          </button>
        )}

        {oauthAvailable && (
          <p className="auth-divider">
            <span>or paste a token</span>
          </p>
        )}

        <form onSubmit={(e) => { void handleSubmit(e) }}>
          <input
            className="auth-input"
            type="password"
            placeholder="github_pat_…"
            autoComplete="current-password"
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
            disabled={checking}
            aria-label="GitHub personal access token"
          />
          <button
            className="auth-btn"
            type="submit"
            disabled={checking || token.trim() === ''}
          >
            {checking ? 'Verifying…' : 'Enter the Archive'}
          </button>
        </form>

        {err && <p className="auth-err" role="alert">{err}</p>}

        <details className="auth-help">
          <summary>How to generate a token</summary>
          <ol className="auth-prose">
            <li>
              Go to <strong>GitHub → Settings → Developer settings →
              Personal access tokens → Fine-grained tokens</strong>.
            </li>
            <li>Click <strong>Generate new token</strong>.</li>
            <li>
              Set <strong>Resource owner</strong> to your account or org
              (must own <code>{config.repo}</code>).
            </li>
            <li>
              Under <strong>Repository access</strong>, choose
              <em> Only select repositories</em> and pick <code>{config.repo}</code>.
            </li>
            <li>
              Under <strong>Repository permissions</strong> set:
              <ul>
                <li><strong>Contents</strong>: Read and write</li>
                <li><strong>Metadata</strong>: Read-only (required)</li>
                <li>Everything else: No access</li>
              </ul>
            </li>
            <li>
              Set an expiration (90 days recommended). GitHub emails you 7 days
              before it expires — keep that address monitored.
            </li>
            <li>Click <strong>Generate token</strong> and paste it above.</li>
          </ol>
        </details>
      </div>
    </div>
  )
}
