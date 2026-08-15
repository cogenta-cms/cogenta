import * as Dialog from '@radix-ui/react-dialog'
import { type JSX, type ReactNode, useEffect, useRef } from 'react'
import { cn } from './cn.js'

/**
 * A modal dialog, on `@radix-ui/react-dialog`.
 *
 * This is the one place in the design system where a dependency does work that
 * would otherwise have to be written here, and it is why it earns its place
 * under R9: a correct modal is a focus trap, a focus restore on close, an
 * `Escape` handler, `aria-modal` plus `aria-labelledby`/`aria-describedby`, an
 * `inert` background, and a scroll lock that does not shift the page. Every one
 * of those is a documented accessibility requirement and every one of them is a
 * classic hand-rolled bug.
 *
 * The title is a required prop rather than an optional slot: Radix warns at
 * runtime about a dialog with no accessible name, and a modal that a screen
 * reader announces as "dialog" and nothing else is not shippable.
 */

export interface ModalProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly children: ReactNode
  /** Actions, laid out along the bottom edge. */
  readonly footer?: ReactNode
  /** Accessible name for the close button — the admin is translated, so it cannot be hard-coded. */
  readonly closeLabel: string
  readonly className?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  className,
}: ModalProps): JSX.Element {
  // Radix restores focus on close to its own `Dialog.Trigger`, and to nothing
  // at all when there is none. This modal is opened by whatever the caller
  // wants (a row action, a menu item, a keyboard shortcut), so there is no
  // trigger to restore to — and "the dialog closed and focus fell back to
  // <body>" strands a keyboard user at the top of the page. Remembering what
  // was focused when it opened, and putting focus back there, is that missing
  // half.
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            openerRef.current?.focus()
          }}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] ' +
              '-translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border ' +
              'border-border bg-card font-sans text-card-foreground shadow-overlay ' +
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="m-0 text-base leading-6 font-semibold">{title}</Dialog.Title>
              {description !== undefined && (
                <Dialog.Description className="m-0 text-sm leading-5 text-muted-foreground">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={closeLabel}
              className="inline-flex size-8 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <CloseIcon />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-2">{children}</div>
          {footer !== undefined && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Inline rather than `lucide-react`. One glyph does not justify an icon package
 * (R9), and the button already carries a real accessible name, so the SVG is
 * `aria-hidden` decoration.
 */
function CloseIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  )
}
