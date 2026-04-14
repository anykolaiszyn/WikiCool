import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RateLimitError } from '../lib/github'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level error boundary. Catches render-time errors and shows a recovery
 * card with the error message and a reload button.
 *
 * Must be a class component — React error boundaries require lifecycle methods
 * that are not available in function components.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production you could send this to a logging service.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isRateLimit = error instanceof RateLimitError
    const resetAt = isRateLimit ? (error as RateLimitError).resetAt : null

    return (
      <div className="error-boundary">
        <div className="error-card">
          <h1 className="error-card__title">
            {isRateLimit ? 'API Rate Limit' : 'Something went wrong'}
          </h1>

          {isRateLimit ? (
            <p className="error-card__msg">
              GitHub API rate limit hit.{' '}
              {resetAt
                ? <>Resets at <strong>{resetAt.toLocaleTimeString()}</strong>.</>
                : 'Please wait before retrying.'}
            </p>
          ) : (
            <p className="error-card__msg">{error.message}</p>
          )}

          <button
            className="error-card__btn"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
