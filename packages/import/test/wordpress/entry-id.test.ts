import { describe, expect, it } from 'vitest'
import { entryIdFor } from '../../src/wordpress/import.js'

describe('the entry id a WordPress post is written under', () => {
  it('is a UUID a Postgres uuid column accepts, not the bare WordPress number', () => {
    expect(entryIdFor('1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
  })

  it('is the same for the same WordPress id, so an interrupted import resumes', () => {
    expect(entryIdFor('42')).toBe(entryIdFor('42'))
    expect(entryIdFor('42')).not.toBe(entryIdFor('43'))
  })

  it('keeps an id that already is a UUID', () => {
    const id = '0190a3f2-7b1c-7d4e-8f00-123456789abc'
    expect(entryIdFor(id)).toBe(id)
  })
})
