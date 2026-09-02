import { cva, type VariantProps } from 'class-variance-authority'
import type { JSX, ReactNode } from 'react'
import { cn } from './cn.js'
import { AlertIcon, InfoIcon, NoticeDangerIcon, NoticeSuccessIcon } from './icons.js'

/**
 * The admin's notification.
 *
 * Deliberately an in-page banner rather than a toast, and deliberately not
 * `sonner` or `@radix-ui/react-toast`. What this admin actually has to show —
 * a form's outcome, and (L11 task 2) a recommendation that persists until it is
 * acted on or dismissed — is information that must stay on screen and be
 * re-readable. A toast that slides away after four seconds is the wrong shape
 * for both, and buying a dependency to get the wrong shape is worse than not
 * buying it (R9).
 *
 * `live` decides how a screen reader treats it. The default, `polite`, queues
 * the announcement behind whatever the user is doing; `assertive` interrupts
 * and is reserved for something that has already gone wrong. A notice that is
 * already on screen when the page loads passes `off`, since it is part of the
 * page rather than a change to it.
 */

const noticeVariants = cva(
  // A hairline border all round, plus a strong 4px stripe on the leading edge
  // in the tone's own colour — the accent that actually carries the meaning,
  // rather than a uniformly tinted outline.
  'flex gap-3 rounded-lg border border-l-4 px-4 py-3 font-sans text-sm leading-5 shadow-card ' +
    '[animation:cg-admin-notice-in_220ms_ease-out]',
  {
    variants: {
      tone: {
        info: 'border-border border-l-info bg-info-surface text-foreground',
        success: 'border-border border-l-success bg-success-surface text-foreground',
        warning: 'border-border border-l-warning bg-warning-surface text-foreground',
        danger: 'border-border border-l-destructive bg-destructive-surface text-foreground',
      },
    },
    defaultVariants: { tone: 'info' },
  },
)

const ACCENT_BY_TONE = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const

/** One distinct glyph per tone, rather than one shape recoloured four ways. */
const ICON_BY_TONE = {
  info: InfoIcon,
  success: NoticeSuccessIcon,
  warning: AlertIcon,
  danger: NoticeDangerIcon,
} as const

export interface NoticeProps extends VariantProps<typeof noticeVariants> {
  readonly title?: ReactNode
  readonly children: ReactNode
  /** Buttons or links the notice offers — "act on it" as opposed to "dismiss it". */
  readonly actions?: ReactNode
  /** Absent means the notice cannot be dismissed. */
  onDismiss?(): void
  /** Accessible name for the dismiss button — the admin is translated, so it cannot be hard-coded. */
  readonly dismissLabel?: string
  readonly live?: 'polite' | 'assertive' | 'off'
  readonly className?: string
}

export function Notice({
  tone,
  title,
  children,
  actions,
  onDismiss,
  dismissLabel,
  live = 'polite',
  className,
}: NoticeProps): JSX.Element {
  const resolvedTone = tone ?? 'info'
  const accent = ACCENT_BY_TONE[resolvedTone]
  const ToneIcon = ICON_BY_TONE[resolvedTone]
  const liveProps =
    live === 'off'
      ? {}
      : live === 'assertive'
        ? ({ role: 'alert' } as const)
        : ({ role: 'status' } as const)

  return (
    <div className={cn(noticeVariants({ tone }), className)} {...liveProps}>
      <ToneIcon className={cn('mt-0.5 size-4 shrink-0', accent)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {title !== undefined && <p className="m-0 font-semibold">{title}</p>}
        <div className="m-0 [&>p]:m-0">{children}</div>
        {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {onDismiss !== undefined && dismissLabel !== undefined && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="inline-flex size-6 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 20 20"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      )}
    </div>
  )
}
