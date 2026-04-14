/**
 * Keyboard shortcut infrastructure — VCC Wiki
 *
 * `useShortcuts(bindings)` registers global keydown listeners for the given
 * binding map. Keys are cleaned up when the component unmounts.
 *
 * Binding string syntax:
 *   "mod+k"   — Cmd on Mac, Ctrl elsewhere, plus a key
 *   "esc"     — bare key (case-insensitive)
 *   "g h"     — two-key sequence (space-separated)
 *
 * `mod` resolves to metaKey on Mac and ctrlKey elsewhere.
 */

import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform)

// ---------------------------------------------------------------------------
// Key name normalisation
// ---------------------------------------------------------------------------

const KEY_ALIASES: Record<string, string> = {
  esc:       'Escape',
  enter:     'Enter',
  backspace: 'Backspace',
  tab:       'Tab',
  space:     ' ',
  up:        'ArrowUp',
  down:      'ArrowDown',
  left:      'ArrowLeft',
  right:     'ArrowRight',
}

function normaliseKey(raw: string): string {
  const lower = raw.toLowerCase()
  return KEY_ALIASES[lower] ?? (raw.length === 1 ? raw.toLowerCase() : raw)
}

// ---------------------------------------------------------------------------
// Binding types
// ---------------------------------------------------------------------------

type ComboBinding = { type: 'combo'; mods: string[]; key: string }
type SequenceBinding = { type: 'sequence'; steps: string[] }
type ParsedBinding = ComboBinding | SequenceBinding

function parseBinding(str: string): ParsedBinding {
  if (str.includes(' ')) {
    return { type: 'sequence', steps: str.split(' ').map(normaliseKey) }
  }
  const parts = str.split('+')
  const rawKey = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase())
  return { type: 'combo', mods, key: normaliseKey(rawKey) }
}

function matchesCombo(e: KeyboardEvent, binding: ComboBinding): boolean {
  // Reject when the wrong modifier state is present.
  const wantsMod = binding.mods.includes('mod')
  const hasMod = IS_MAC ? e.metaKey : e.ctrlKey

  if (wantsMod !== hasMod) return false

  // For bare-key bindings (no mod), reject if any modifier is held
  // so we don't swallow browser shortcuts accidentally.
  if (!wantsMod && (e.ctrlKey || e.metaKey || e.altKey)) return false

  return e.key.toLowerCase() === binding.key.toLowerCase()
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const SEQUENCE_TIMEOUT_MS = 1500

export function useShortcuts(bindings: Record<string, () => void>): void {
  // Keep a stable ref to the latest bindings so the listener closure never
  // needs to be torn down and re-added when bindings change at call-site.
  const bindingsRef = useRef(bindings)
  useEffect(() => { bindingsRef.current = bindings })

  // Pending first key for sequence bindings.
  const pendingRef = useRef<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Pre-parse bindings once per mount (not per keystroke).
    const parsed: Array<[ParsedBinding, string]> = Object.keys(bindingsRef.current).map(
      (key) => [parseBinding(key), key],
    )

    function clearPending() {
      pendingRef.current = null
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Skip when focus is on a text input / editable element.
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      // Allow Escape and mod+ combos even in inputs.
      const isEscape = e.key === 'Escape'
      const hasMod = e.ctrlKey || e.metaKey
      if (inInput && !isEscape && !hasMod) return

      for (const [binding, rawKey] of parsed) {
        if (binding.type === 'combo') {
          if (matchesCombo(e, binding)) {
            e.preventDefault()
            clearPending()
            bindingsRef.current[rawKey]?.()
            return
          }
        } else {
          // Sequence: check if the current key completes a pending sequence.
          const [first, second] = binding.steps
          const k = e.key.toLowerCase()

          if (pendingRef.current === first && k === second) {
            e.preventDefault()
            clearPending()
            bindingsRef.current[rawKey]?.()
            return
          }

          if (k === first) {
            // Start or reset the pending window.
            clearPending()
            pendingRef.current = first
            timeoutRef.current = setTimeout(clearPending, SEQUENCE_TIMEOUT_MS)
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearPending()
    }
  }, []) // empty deps — bindings are read via ref
}
