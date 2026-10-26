import { type JSX, useEffect, useRef } from 'react'
import { Notice } from '../ui/index.js'

/**
 * A form error shown *inside* the dialog that produced it.
 *
 * A page-level banner is hidden behind the dialog's backdrop, so the person
 * who clicked "Create" saw nothing happen. This sits right above the dialog's
 * buttons. When the dialog's body is taller than the window it brings the first
 * flagged field into view (the error is raised by the button the person just
 * pressed — it must never be off-screen), or itself when no field is flagged.
 */
export function DialogError({ message }: { readonly message: string | null }): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (message === null) return
    // A form with flagged fields: bring the first one into view (and focus it)
    // — the banner under it only says "fix the flagged fields".
    const firstInvalid = ref.current
      ?.closest('form')
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (firstInvalid !== null && firstInvalid !== undefined) {
      // Scroll its whole field (label, control, hint and message), not just the control.
      ;(firstInvalid.closest('div') ?? firstInvalid).scrollIntoView?.({ block: 'center' })
      firstInvalid.focus({ preventScroll: true })
      return
    }
    ref.current?.scrollIntoView?.({ block: 'nearest' })
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
