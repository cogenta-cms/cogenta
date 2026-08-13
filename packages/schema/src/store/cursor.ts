import { CogentaError } from '@cogenta/core'
import type { SortField, SortOrder } from './types.js'

/**
 * Keyset pagination. Never an offset.
 *
 * `offset` counts rows from the start of the result on every request, so an
 * insertion or a deletion anywhere before the window shifts everything after it:
 * a reader paging through a live collection sees an entry twice, or never. The
 * L1 spec calls this out and the acceptance criterion is explicit — "the cursor
 * is stable during concurrent insertions".
 *
 * A cursor is therefore a *position in the ordering*, not a count: the sort
 * value and the id of the last row handed out. The next page asks for rows
 * strictly after that point, which no concurrent write can move.
 */
export interface Cursor {
  readonly field: SortField
  readonly direction: 'asc' | 'desc'
  readonly value: string
  readonly id: string
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor(raw: string, expected: SortOrder): Cursor {
  const invalid = (reason: string): CogentaError =>
    new CogentaError({
      code: 'CONTENT_INVALID',
      message: `This pagination cursor cannot be used: ${reason}.`,
      hint: 'Pass the `nextCursor` of the previous page unchanged, with the same sort.',
    })

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    throw invalid('it is not a cursor this API produced')
  }

  if (typeof parsed !== 'object' || parsed === null) throw invalid('it is not a cursor')
  const candidate = parsed as Partial<Cursor>

  if (typeof candidate.value !== 'string' || typeof candidate.id !== 'string') {
    throw invalid('it is missing its position')
  }

  // A cursor taken under one ordering means nothing under another: the same
  // position would skip rows or repeat them. Refusing is the only safe answer.
  if (candidate.field !== expected.field || candidate.direction !== expected.direction) {
    throw invalid('it was produced with a different sort order')
  }

  return {
    field: candidate.field,
    direction: candidate.direction,
    value: candidate.value,
    id: candidate.id,
  }
}
