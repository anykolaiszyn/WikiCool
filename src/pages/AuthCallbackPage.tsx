import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken } from '../lib/auth'

/**
 * Landing page for the GitHub OAuth callback.
 *
 * The OAuth Worker redirects here as:
 *   /auth/callback#access_token=<token>
 *   /auth/callback#error=<reason>
 *
 * Tokens arrive in the URL fragment (never sent to the server) so they won't
 * appear in access logs. This component reads the fragment, stores the token,
 * and navigates to the wiki home.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const fragment = window.location.hash.slice(1) // strip leading '#'
    const params = new URLSearchParams(fragment)

    const accessToken = params.get('access_token')
    const error = params.get('error')

    // Clear the fragment so the token doesn't linger in browser history.
    window.history.replaceState(null, '', window.location.pathname)

    if (accessToken) {
      setToken(accessToken)
      navigate('/wiki/index', { replace: true })
    } else {
      // Preserve the error code as a query param so AuthGate can display it.
      const reason = error ?? 'unknown'
      navigate(`/?auth_error=${encodeURIComponent(reason)}`, { replace: true })
    }
  }, [navigate])

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <p className="auth-sub">Completing sign-in…</p>
      </div>
    </div>
  )
}
