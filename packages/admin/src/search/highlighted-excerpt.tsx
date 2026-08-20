import type { JSX } from 'react'

/**
 * Renders a search excerpt with its matches marked — never by building HTML.
 *
 * `excerpt` is content that reached the server from an entry's own values, so
 * it is treated as data throughout: sliced into plain-text fragments and
 * handed to React as text nodes, the same rule the rest of the admin applies
 * to any string a document contributed (R3/R8). There is no
 * `dangerouslySetInnerHTML` here, and the offsets are trusted only as far as
 * "positions inside this exact string" — an offset outside the string's
 * bounds degrades to no highlight instead of throwing, since a mismatched
 * response should never turn a result list into a crash.
 */
export interface HighlightRange {
  readonly start: number
  readonly end: number
}

export interface HighlightedExcerptProps {
  readonly text: string
  readonly matches: readonly HighlightRange[]
}

export function HighlightedExcerpt({ text, matches }: HighlightedExcerptProps): JSX.Element {
  if (text.length === 0) return <></>

  const ranges = [...matches]
    .filter((range) => range.start >= 0 && range.end > range.start && range.end <= text.length)
    .sort((left, right) => left.start - right.start)

  const parts: JSX.Element[] = []
  let cursor = 0

  ranges.forEach((range, index) => {
    if (range.start < cursor) return // overlapping ranges: keep the first
    if (range.start > cursor)
      parts.push(<span key={`t${index}`}>{text.slice(cursor, range.start)}</span>)
    parts.push(<mark key={`m${index}`}>{text.slice(range.start, range.end)}</mark>)
    cursor = range.end
  })

  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)

  return <>{parts}</>
}
