import type { HTMLAttributes, JSX } from 'react'
import { cn } from './cn.js'

/**
 * A raised surface with a header, a body and an optional footer.
 *
 * `Card` renders a `<section>`, not a `<div>`: every real use in this admin is
 * a labelled region of a page (a widget, a form panel, a list container), and a
 * section with a heading inside is what makes those land in a screen reader's
 * landmark list instead of disappearing into the page. The heading itself stays
 * the caller's job — only the caller knows whether this is an `<h2>` under a
 * page title or an `<h3>` inside another region.
 */

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * Opts into the hover lift (`shadow-raised`) — for a card that is itself a
   * clickable or actionable surface (a widget picker tile, a linked summary
   * card). Default `false`: a static content panel never lifts on hover.
   */
  readonly interactive?: boolean
}

export function Card({ className, interactive = false, ...props }: CardProps): JSX.Element {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-card ' +
          'transition-all duration-200 ease-out',
        interactive && 'hover:-translate-y-px hover:shadow-raised',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)} {...props} />
}

/**
 * The small rounded "icon well" the direction puts beside a title. A plain
 * `<div>`, not itself `aria-hidden` — the icon it wraps already is (every
 * glyph in `icons.tsx` is), so a caller composes it directly next to
 * `CardTitle` inside `CardHeader`, e.g.
 * `<div className="flex items-center gap-3"><CardIcon><SomeIcon /></CardIcon><CardTitle>…</CardTitle></div>`.
 * `CardHeader` itself stays `flex-col` by default so a title/description pair
 * with no icon keeps stacking the way every existing screen already renders it.
 */
export function CardIcon({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  // A wrapper for whatever heading level the caller puts inside, so the visual
  // weight of a card title is one place and the document outline stays correct.
  return (
    <div
      className={cn(
        'font-sans text-base leading-6 font-semibold text-foreground [&>*]:m-0 [&>*]:text-inherit [&>*]:font-inherit',
        className,
      )}
      {...props}
    />
  )
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): JSX.Element {
  return <p className={cn('m-0 text-sm leading-5 text-muted-foreground', className)} {...props} />
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex flex-col gap-4 px-5 py-4', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-t border-border px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}
