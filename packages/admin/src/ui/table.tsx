import type {
  HTMLAttributes,
  JSX,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'
import { cn } from './cn.js'

/**
 * A data table.
 *
 * Real `<table>`/`<thead>`/`<th scope>` elements, never a grid of divs with
 * ARIA bolted on: the semantics a screen reader uses to say "column 3 of 5,
 * Status" come from the element itself, and the admin's whole content-listing
 * surface depends on them.
 *
 * `TableRoot` wraps the table in a horizontally scrollable, focusable box. A
 * table wider than its container must be reachable by keyboard too, which is
 * what `tabIndex={0}` plus the `region` role buys — a scroll container that
 * only a mouse can scroll is a real WCAG failure, not a nicety.
 */

export interface TableRootProps extends HTMLAttributes<HTMLElement> {
  /** Names the scrollable region. Required: an unnamed region is noise in a landmark list. */
  readonly label: string
}

// biome-ignore-start lint/a11y/noNoninteractiveTabindex: a scroll container only a mouse can scroll fails WCAG 2.1.1 — focusability is the documented fix, and the rule's heuristic cannot see that this box scrolls.
export function TableRoot({ className, label, ...props }: TableRootProps): JSX.Element {
  return (
    // A `<section>` with an accessible name already *is* `role="region"`, so
    // the role is implicit rather than spelled out.
    <section
      aria-label={label}
      tabIndex={0}
      className={cn(
        'w-full overflow-x-auto rounded-lg border border-border bg-card shadow-card ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  )
}
// biome-ignore-end lint/a11y/noNoninteractiveTabindex: only `TableRoot` needs it.

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>): JSX.Element {
  return (
    <table
      className={cn('w-full border-collapse font-sans text-sm text-card-foreground', className)}
      {...props}
    />
  )
}

export function TableHead({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <thead className={cn('bg-muted', className)} {...props} />
}

export function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <tbody className={className} {...props} />
}

export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>): JSX.Element {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors duration-150 ease-out last:border-b-0 hover:bg-accent/60',
        className,
      )}
      {...props}
    />
  )
}

export function TableHeader({
  className,
  scope,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <th
      scope={scope ?? 'col'}
      className={cn(
        'px-4 py-2.5 text-left align-middle text-xs leading-5 font-semibold tracking-wide text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return <td className={cn('px-4 py-3 align-middle leading-5', className)} {...props} />
}

export function TableCaption({
  className,
  ...props
}: HTMLAttributes<HTMLTableCaptionElement>): JSX.Element {
  return (
    <caption
      className={cn('px-4 py-2 text-left text-sm leading-5 text-muted-foreground', className)}
      {...props}
    />
  )
}

/** The row a table shows instead of nothing when the query came back empty. */
export function TableEmpty({
  className,
  colSpan,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn('px-4 py-8 text-center text-sm text-muted-foreground', className)}
        {...props}
      />
    </tr>
  )
}
