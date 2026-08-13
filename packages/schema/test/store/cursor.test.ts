import { describe, expect, it } from 'vitest'
import { type Cursor, decodeCursor, encodeCursor } from '../../src/store/cursor.js'

const order = { field: 'createdAt', direction: 'desc' } as const
const cursor: Cursor = {
  field: 'createdAt',
  direction: 'desc',
  value: '2026-08-13T09:00:00.000Z',
  id: '01930000-0000-7000-8000-0000000000aa',
}

describe('pagination cursor', () => {
  it('round-trips the position it encodes', () => {
    expect(decodeCursor(encodeCursor(cursor), order)).toEqual(cursor)
  })

  it('carries no offset, so a concurrent insertion cannot shift it', () => {
    const decoded = JSON.parse(Buffer.from(encodeCursor(cursor), 'base64url').toString('utf8'))

    expect(Object.keys(decoded).sort()).toEqual(['direction', 'field', 'id', 'value'])
  })

  it('refuses a cursor produced under another ordering', () => {
    expect(() => decodeCursor(encodeCursor(cursor), { field: 'id', direction: 'desc' })).toThrow(
      /different sort order/,
    )
  })

  it('refuses a cursor produced in the other direction', () => {
    expect(() =>
      decodeCursor(encodeCursor(cursor), { field: 'createdAt', direction: 'asc' }),
    ).toThrow(/different sort order/)
  })

  it('refuses a string that is not a cursor at all', () => {
    expect(() => decodeCursor('not-a-cursor', order)).toThrowError(
      expect.objectContaining({ code: 'CONTENT_INVALID' }),
    )
  })

  it('refuses a cursor that lost its position', () => {
    const truncated = Buffer.from(JSON.stringify({ field: 'createdAt' }), 'utf8').toString(
      'base64url',
    )

    expect(() => decodeCursor(truncated, order)).toThrow(/missing its position/)
  })
})
