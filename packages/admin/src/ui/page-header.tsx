import type { JSX, ReactNode } from 'react'
import { cn } from './cn.js'

/**
 * The admin's page header — one title band, reused at the top of a screen
 * instead of every route hand-rolling its own heading layout.
 *
 * It renders the page's own `<h1>` (a route decides whether that is the
 * document's only `<h1>` — this component does not assume it), an optional
 * uppercase mono eyebrow above it, an optional description below it, and
 * optional actions aligned to the right. A thin accent-to-transparent
 * hairline closes the band, echoing the top bar's own underline in
 * `shell.css` without duplicating it as a second hand-written rule.
 */

export interface PageHeaderProps {
  readonly eyebrow?: ReactNode
  readonly title: ReactNode
  readonly description?: ReactNode
  /** Buttons or links for the page as a whole — laid out to the right on wide viewports, wrapping below the title on narrow ones. */
  readonly actions?: ReactNode
  /** A `CardIcon`-style well, shown beside the title. */
  readonly icon?: ReactNode
  /** Passed through to the `<h1>` so a caller can point e.g. `aria-labelledby` at it. */
  readonly id?: string
  readonly className?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  id,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon !== undefined && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow !== undefined && (
              <p className="m-0 font-mono text-xs font-semibold tracking-wide text-primary uppercase">
                {eyebrow}
              </p>
            )}
            <h1
              id={id}
              className="m-0 text-3xl leading-tight font-bold tracking-tight text-balance"
            >
              {title}
            </h1>
            {description !== undefined && (
              <p className="m-0 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions !== undefined && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="h-px w-full bg-gradient-to-r from-primary/60 to-transparent"
      />
    </div>
  )
}
