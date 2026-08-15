import { useEffect, useRef, useState } from 'react'
import {
  AUTOSAVE_INTERVAL_MS,
  type AutosaveSnapshot,
  type AutosaveStorage,
  browserAutosaveStorage,
  clearAutosave,
  sameSnapshot,
  writeAutosave,
} from './autosave.js'

export interface UseAutosaveOptions {
  /** Off for a read-only viewer, and off until the entry has finished loading. */
  readonly enabled: boolean
  readonly storageKey: string
  /** What the editor currently has on screen. */
  readonly snapshot: AutosaveSnapshot
  /** What the server last confirmed. Nothing is written while the two are equal. */
  readonly baseline: AutosaveSnapshot
  readonly storage?: AutosaveStorage
  readonly intervalMs?: number
}

/**
 * Writes the draft on screen to local storage on a timer, and reports when it
 * last did.
 *
 * On a timer rather than on every change: a `blocks` zone can be a large
 * document, and serialising it on each keystroke is work an editor would feel.
 * A tick that finds nothing new writes nothing, so an idle tab costs a
 * comparison and no storage traffic.
 *
 * The snapshot is read through a ref rather than listed as an effect
 * dependency: making it one would tear down and restart the interval on every
 * keystroke, so the timer would never actually reach the end of its period
 * while someone is typing — which is exactly when it needs to fire.
 */
export function useAutosave(options: UseAutosaveOptions): { readonly savedAt: string | null } {
  const { enabled, storageKey, intervalMs = AUTOSAVE_INTERVAL_MS } = options
  const storage = options.storage ?? browserAutosaveStorage()

  const [savedAt, setSavedAt] = useState<string | null>(null)
  const latest = useRef(options.snapshot)
  const baseline = useRef(options.baseline)
  const written = useRef<AutosaveSnapshot | null>(null)

  latest.current = options.snapshot
  baseline.current = options.baseline

  useEffect(() => {
    if (!enabled || storage === null) return
    written.current = null
    setSavedAt(null)

    const timer = setInterval(() => {
      const snapshot = latest.current
      // Back to what the server has: the safety net has nothing left to hold,
      // and leaving a stale copy behind would offer to "recover" a change the
      // editor has already undone.
      if (sameSnapshot(snapshot, baseline.current)) {
        if (written.current !== null) {
          clearAutosave(storage, storageKey)
          written.current = null
          setSavedAt(null)
        }
        return
      }
      if (written.current !== null && sameSnapshot(snapshot, written.current)) return

      const at = new Date()
      writeAutosave(storage, storageKey, snapshot, at)
      written.current = snapshot
      setSavedAt(at.toISOString())
    }, intervalMs)

    return () => {
      clearInterval(timer)
    }
  }, [enabled, storage, storageKey, intervalMs])

  return { savedAt }
}
