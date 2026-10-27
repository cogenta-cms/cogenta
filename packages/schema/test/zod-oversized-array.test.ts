import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// Regression guard for GHSA-mrhx-c7xc-m3w5 (fixed in zod 4.6.6): validating an
// array against `.max(n)` walked every oversized element and accumulated one
// issue per element. The schema package validates untrusted input with zod, so
// the resolved version must keep the bound cheap.
describe('zod oversized array bound', () => {
  it('rejects an array above .max(1) with a small number of issues', () => {
    const result = z.array(z.string()).max(1).safeParse(Array(64).fill(42))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.length).toBeLessThanOrEqual(2)
  })
})
