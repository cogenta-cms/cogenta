import { type JSX, useEffect, useRef, useState } from 'react'
import { cn } from './cn.js'
import { CheckIcon } from './icons.js'

/**
 * A brief, self-clearing "Saved" confirmation for a screen that writes on
 * every field change (`settings.tsx`, `appearance.tsx`) — deliberately never
 * a toast/popup (`Notice`'s own doc comment explains why this admin has no
 * toast library at all, R9): this renders inline, in the flow of the page,
 * next to whichever "Enregistrer" button or field it confirms.
 *
 * `useSavedIndicator()` owns the 2.5s auto-clear timeout — the exact
 * precedent `settings.tsx` already set for its own `justSaved` flag before
 * this existed — so every call site gets the same timing without
 * reimplementing the `setTimeout`/cleanup dance itself.
 */

const AUTO_CLEAR_MS = 2500

export interface SavedIndicatorController {
  readonly visible: boolean
  /** Shows the indicator, (re)starting the 2.5s auto-clear timer. */
  show(): void
  /** Hides the indicator immediately — a fresh edit invalidating a stale "Saved". */
  hide(): void
}

export function useSavedIndicator(): SavedIndicatorController {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  function show(): void {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    setVisible(true)
    timeoutRef.current = setTimeout(() => setVisible(false), AUTO_CLEAR_MS)
  }

  function hide(): void {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  return { visible, show, hide }
}

export function SavedIndicator({
  visible,
  label,
  className,
}: {
  readonly visible: boolean
  readonly label: string
  readonly className?: string
}): JSX.Element | null {
  if (!visible) return null
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-1.5 text-sm text-success', className)}
    >
      <CheckIcon className="size-4" />
      {label}
    </span>
  )
}
