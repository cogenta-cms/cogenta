import { type JSX, useEffect, useRef } from 'react'
import { Notice } from '../ui/index.js'

/**
 * A form error shown *inside* the dialog that produced it.
 *
 * A page-level banner is hidden behind the dialog's backdrop, so the person
 * who clicked "Create" saw nothing happen. This sits right above the dialog's
 * buttons, and scrolls itself into view when the dialog's body is taller than
 * the window (the error is raised by the button the person just pressed — it
 * must never be off-screen).
 */
export function DialogError({ message }: { readonly message: string | null }): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (message !== null) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [message])

  if (message === null || message === '') return null
  return (
    <div ref={ref}>
      <Notice tone="danger" live="assertive">
        <p>{message}</p>
      </Notice>
    </div>
  )
}
