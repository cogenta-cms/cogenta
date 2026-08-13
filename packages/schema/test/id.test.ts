import { describe, expect, it } from 'vitest'
import { isUuidV7, newId } from '../src/id.js'

/** Full coverage lives in @cogenta/core/test/id.test.ts; this is the re-export smoke test. */
describe('newId, re-exported from @cogenta/core', () => {
  it('produces a valid UUIDv7', () => {
    expect(isUuidV7(newId())).toBe(true)
  })
})
