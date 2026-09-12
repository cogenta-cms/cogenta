import { describe, expect, it } from 'vitest'

/**
 * Guards the alias that keeps `node:sqlite` out of the admin's test graph.
 *
 * Without it every suite that imports the app — seventy of them — dies at
 * load with "Cannot bundle Node.js built-in", and the failure names no test,
 * so nothing points at the cause. It cost a full afternoon and two wrong
 * fixes to find. This makes the next breakage say so immediately.
 */
describe('the admin has no database', () => {
  it('resolves node:sqlite to the stub, not to the real built-in', async () => {
    const sqlite = await import('node:sqlite')

    // The real module builds a database; the stub refuses and says why.
    expect(() => new sqlite.DatabaseSync(':memory:')).toThrow(/browser application/)
  })
})
