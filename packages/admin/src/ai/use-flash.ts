import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a confirmation stays on screen before it clears itself. */
const FLASH_MS = 5000

export interface Flash {
  /** The confirmation to show, or `null` when there is none. */
  readonly message: string | null
  /** Shows a confirmation, replacing any earlier one, and clears it after a few seconds. */
  show(message: string): void
  clear(): void
}

/**
 * A short-lived "it worked" message for a screen that writes (a provider
 * saved, a skill created…). Kept in the flow of the page next to the action,
 * like `SavedIndicator`, because this admin has no toast layer — see
 * `ui/notice.tsx` for why.
 */
export function useFlash(): Flash {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    setMessage(null)
  }, [])

  const show = useCallback((next: string) => {
    if (timer.current !== null) clearTimeout(timer.current)
    setMessage(next)
    timer.current = setTimeout(() => setMessage(null), FLASH_MS)
  }, [])

  return { message, show, clear }
}
