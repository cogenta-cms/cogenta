import type { HTMLAttributes, JSX } from 'react'
import { cn } from './cn.js'

/**
 * A small status chip — a coloured dot plus a label, for the tone words this
 * admin already uses inline (a role, a publication status, a health state).
 * A `<span>`, not a `<button>`: this is a label, never itself interactive —
 * a caller that needs a clickable chip wraps it or reaches for `Button`.
 */

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

const TONE_CLASSES = {
  neutral: 'bg-muted text-muted-foreground [&>[data-dot]]:bg-muted-foreground',
  primary: 'bg-accent text-accent-foreground [&>[data-dot]]:bg-primary',
  success: 'bg-success-surface text-success [&>[data-dot]]:bg-success',
  warning: 'bg-warning-surface text-warning [&>[data-dot]]:bg-warning',
  danger: 'bg-destructive-surface text-destructive [&>[data-dot]]:bg-destructive',
  info: 'bg-info-surface text-info [&>[data-dot]]:bg-info',
} as const

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-sans text-xs font-medium leading-none',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      <span data-dot="" aria-hidden="true" className="size-1.5 shrink-0 rounded-full" />
      {children}
    </span>
  )
}
