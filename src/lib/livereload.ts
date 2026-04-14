/**
 * useLiveReload — webhook-driven cache refresh
 *
 * Opens an EventSource to `${VITE_WEBHOOK_BASE}/events`. When the Worker
 * broadcasts a "refresh" event (triggered by a GitHub push webhook), this
 * hook debounces the signal and calls `reload()` in the background.
 *
 * Net effect: edits committed to the content repo via CLI, mobile, or
 * Claude Code appear in the wiki within a few seconds without a manual
 * browser refresh.
 *
 * No-op when `VITE_WEBHOOK_BASE` is not set (feature is opt-in).
 *
 * Reconnect strategy
 * ──────────────────
 * EventSource has its own built-in reconnect, but it retries very quickly.
 * We close the EventSource on error and reconnect manually with exponential
 * backoff (1 s → 2 s → 4 s … capped at 30 s) so a transient Worker restart
 * doesn't hammer the endpoint.
 */

import { useEffect, useRef } from 'react'

const WEBHOOK_BASE = import.meta.env.VITE_WEBHOOK_BASE?.trim()

const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000
/**
 * Debounce window before triggering reload.
 * GitHub may send several push events in quick succession (force-push, merge
 * train, etc.). We wait this long after the last event before reloading.
 */
const RELOAD_DEBOUNCE_MS = 3_000

/**
 * Subscribe to the Worker's SSE stream and call `reload()` on "refresh" events.
 *
 * @param reload  The store's `reload` function. Kept current via a ref so
 *                the effect never needs to re-run when the identity changes.
 */
export function useLiveReload(reload: () => Promise<void>): void {
  // Keep the reload reference current without re-running the effect.
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  })

  useEffect(() => {
    if (!WEBHOOK_BASE) return  // feature disabled

    let es: EventSource | null = null
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = INITIAL_BACKOFF_MS
    let destroyed = false

    function connect(): void {
      if (destroyed) return

      es = new EventSource(`${WEBHOOK_BASE}/events`)

      es.addEventListener('open', () => {
        backoff = INITIAL_BACKOFF_MS  // successful connection — reset backoff
      })

      es.addEventListener('refresh', () => {
        // Debounce: coalesce rapid events before triggering a full reload.
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          debounceTimer = null
          void reloadRef.current()
        }, RELOAD_DEBOUNCE_MS)
      })

      es.addEventListener('error', () => {
        // Close this broken connection and schedule a reconnect.
        es?.close()
        es = null
        if (destroyed) return

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
          connect()
        }, backoff)
      })
    }

    connect()

    return () => {
      destroyed = true
      es?.close()
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    }
  }, []) // empty deps: setup once; reload identity tracked via ref
}
