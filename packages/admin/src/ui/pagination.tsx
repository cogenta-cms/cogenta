import type { JSX } from 'react'
import { Button } from './button.js'
import { cn } from './cn.js'

/**
 * The admin's pagination — fiche 67 task 1.
 *
 * One component behind two shapes, replacing what had grown into two
 * genuinely different ad hoc patterns: `users.tsx`'s cursor "load more"
 * button (the one other screens copied by hand, `media-client.ts` among
 * them, without ever wiring a control to it) and `redirects.tsx`'s
 * hand-rolled numbered pager (also copied by hand, into the content list and
 * the trash screen). Neither variant fetches, counts, or formats anything —
 * every label and number it shows is a prop, the same discipline every other
 * file in `ui/` already follows: a design-system component does not import
 * `react-i18next`, and does not decide how a caller phrases "part
 * {{count}}" or counts a total.
 *
 * `variant` discriminates the two shapes on purpose, rather than one bag of
 * optional props: a caller cannot supply a `page` without an `onPageChange`,
 * or a `hasMore` without an `onLoadMore` — the two pagination models are
 * structurally different (one knows a running list and whether more exists,
 * the other knows a total and a position within it), and mixing their props
 * would let a caller build a state TypeScript cannot see is nonsensical.
 */

export interface CursorPaginationProps {
  readonly variant: 'cursor'
  /** Whether a further page exists. `false` renders nothing, same as `pageCount <= 1` does for the numbered variant below. */
  readonly hasMore: boolean
  readonly loading: boolean
  onLoadMore(): void
  readonly loadMoreLabel: string
  /** Shown instead of `loadMoreLabel` while `loading` is true. Omit to keep showing `loadMoreLabel` itself, just disabled. */
  readonly loadingLabel?: string
  readonly className?: string
}

export interface PagesPaginationProps {
  readonly variant: 'pages'
  /** Zero-based, matching every numbered-page screen already in this admin (`redirects.tsx`'s 404 log, the content list, the trash screen). */
  readonly page: number
  readonly pageCount: number
  onPageChange(page: number): void
  readonly loading?: boolean
  readonly previousLabel: string
  readonly nextLabel: string
  /** Already formatted by the caller — e.g. "1–25 of 340" — this component counts nothing itself. Omit to show just the two buttons. */
  readonly pageInfo?: string
  readonly className?: string
}

export type PaginationProps = CursorPaginationProps | PagesPaginationProps

export function Pagination(props: PaginationProps): JSX.Element | null {
  return props.variant === 'cursor' ? (
    <CursorPagination {...props} />
  ) : (
    <PagesPagination {...props} />
  )
}

function CursorPagination({
  hasMore,
  loading,
  onLoadMore,
  loadMoreLabel,
  loadingLabel,
  className,
}: Omit<CursorPaginationProps, 'variant'>): JSX.Element | null {
  if (!hasMore) return null
  return (
    <div className={className}>
      <Button variant="secondary" disabled={loading} onClick={onLoadMore}>
        {loading ? (loadingLabel ?? loadMoreLabel) : loadMoreLabel}
      </Button>
    </div>
  )
}

function PagesPagination({
  page,
  pageCount,
  onPageChange,
  loading = false,
  previousLabel,
  nextLabel,
  pageInfo,
  className,
}: Omit<PagesPaginationProps, 'variant'>): JSX.Element | null {
  if (pageCount <= 1) return null
  return (
    <div className={cn('flex items-center gap-3 text-sm', className)}>
      <Button
        variant="secondary"
        size="sm"
        disabled={loading || page === 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
      >
        {previousLabel}
      </Button>
      {pageInfo !== undefined && (
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs tabular-nums text-muted-foreground">
          {pageInfo}
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={loading || page + 1 >= pageCount}
        onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
      >
        {nextLabel}
      </Button>
    </div>
  )
}
