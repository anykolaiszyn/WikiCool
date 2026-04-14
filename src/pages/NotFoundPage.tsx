import { Link } from 'react-router-dom'

/** 404 page. */
export function NotFoundPage() {
  return (
    <div className="placeholder">
      <p>Page not found.</p>
      <Link to="/wiki/index">Return to index</Link>
    </div>
  )
}
