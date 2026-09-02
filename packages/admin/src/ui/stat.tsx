import type { JSX, ReactNode } from 'react'
import { Card } from './card.js'
import { cn } from './cn.js'

/**
 * A single KPI tile — a label, a big tabular-nums value, and optionally an
 * icon well, a trend chip, and a hint line underneath. Built on `Card` so it
 * shares that component's border/radius/shadow tokens rather than a second,
 * parallel set of surface classes.
 */

export interface StatProps {
  readonly label: ReactNode
  readonly value: ReactNode
  readonly hint?: ReactNode
  readonly icon?: ReactNode
  readonly tone?: 'default' | 'success' | 'warning' | 'danger'
  /** A formatted delta and its direction — this component draws the chip, the caller decides the text (e.g. "+12%"), same discipline as `Pagination`'s `pageInfo`. */
  readonly trend?: {
    readonly value: string
    readonly direction: 'up' | 'down' | 'flat'
  }
  readonly className?: string
}

const ICON_WELL_TONE = {
  default: 'bg-accent text-primary',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-destructive-surface text-destructive',
} as const

const TREND_TONE = {
  up: 'bg-success-surface text-success',
  down: 'bg-destructive-surface text-destructive',
  flat: 'bg-muted text-muted-foreground',
} as const

const TREND_GLYPH = { up: '↑', down: '↓', flat: '→' } as const

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  trend,
  className,
}: StatProps): JSX.Element {
  return (
    <Card className={cn('gap-3 p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {icon !== undefined && (
          <div
            className={cn(
              'inline-flex size-9 shrink-0 items-center justify-center rounded-md',
              ICON_WELL_TONE[tone],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="m-0 text-3xl leading-none font-bold tabular-nums text-foreground">{value}</p>
        {trend !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums',
              TREND_TONE[trend.direction],
            )}
          >
            <span aria-hidden="true">{TREND_GLYPH[trend.direction]}</span>
            {trend.value}
          </span>
        )}
      </div>
      {hint !== undefined && <p className="m-0 text-xs leading-5 text-muted-foreground">{hint}</p>}
    </Card>
  )
}
