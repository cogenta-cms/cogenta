import { describe, expect, it } from 'vitest'
import { isUuidV7, newId, timestampOf } from '../src/id.js'

describe('newId', () => {
  it('mints a UUID whose version nibble says 7', () => {
    const id = newId()

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(isUuidV7(id)).toBe(true)
  })

  it('carries the minute it was minted, so ids sort by creation time', () => {
    const before = Date.now()
    const stamp = timestampOf(newId())

    expect(stamp).toBeGreaterThanOrEqual(before - 1)
    expect(stamp).toBeLessThanOrEqual(Date.now() + 1)
  })

  it('never repeats itself, even minted in a tight loop', () => {
    const ids = Array.from({ length: 10_000 }, () => newId())

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps ids minted in the same millisecond in order — the point of v7', () => {
    const frozen = () => 1_760_000_000_000
    const ids = Array.from({ length: 500 }, () => newId(frozen))

    expect([...ids].sort()).toEqual(ids)
  })

  it('stays ordered when the clock steps backwards', () => {
    const first = newId(() => 1_760_000_000_000)
    const second = newId(() => 1_700_000_000_000)

    expect(second > first).toBe(true)
  })

  it('rejects a v4 UUID, which fragments the index ADR-0015 protects', () => {
    expect(isUuidV7('9dbf6131-e537-45af-8c7c-b9b1ddb2d6d7')).toBe(false)
  })

  it('rejects anything that is not a UUID at all', () => {
    expect(isUuidV7('42')).toBe(false)
  })
})
