import { type JSX, type ReactNode, useEffect, useRef } from 'react'

/**
 * The rarely used actions of one widget, behind a single « Plus » button.
 *
 * A native `<details>` rather than a menu library (R9): it is keyboard and
 * screen-reader operable out of the box, and the only thing it lacks — closing
 * when the user clicks elsewhere or presses Escape — is the few lines below.
 * The frequent actions (edit, move up, move down) stay outside it, as buttons.
 */

export interface WidgetActionsMenuProps {
  readonly label: string
  /** The name a screen reader announces: the menu's label alone says nothing of whose it is. */
  readonly ariaLabel: string
  readonly children: ReactNode
}

export function WidgetActionsMenu({
  label,
  ariaLabel,
  children,
}: WidgetActionsMenuProps): JSX.Element {
  const root = useRef<HTMLDetailsElement | null>(null)

  useEffect(() => {
    const close = (event: Event): void => {
      const element = root.current
      if (element === null || !element.open) return
      if (event.type === 'keydown') {
        if ((event as KeyboardEvent).key !== 'Escape') return
        element.open = false
        element.querySelector('summary')?.focus()
        return
      }
      if (!element.contains(event.target as Node)) element.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click bubbles from the menu's own buttons, which a keyboard activates with a click too.
    <details
      ref={root}
      className="relative"
      onClick={(event) => {
        // Choosing an action closes the menu; the summary toggles it by itself.
        const target = event.target as HTMLElement
        if (target.closest('[data-menu-close]') !== null && root.current !== null) {
          root.current.open = false
        }
      }}
    >
      <summary
        aria-label={ariaLabel}
        className="inline-flex h-8 min-w-11 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-card px-3 text-xs font-medium hover:bg-accent [&::-webkit-details-marker]:hidden"
      >
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-52 flex-col gap-1 rounded-lg border border-border bg-card p-2 shadow-raised">
        {children}
      </div>
    </details>
  )
}
