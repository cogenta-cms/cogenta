/**
 * An in-memory stand-in for the slice of the Redis API the rate limit driver
 * uses: `INCR`, `PEXPIRE`, `DEL`.
 *
 * This is **not** a claim that the driver works against Redis — only the
 * integration test against a real server proves that. What it does prove is
 * that the driver's own logic (windowing, key naming, counting) satisfies
 * the rate limit contract, on every machine, with no service running.
 */
export function createFakeRedis() {
  const counters = new Map<string, { value: number; expiresAt: number | null }>()

  const live = (key: string): { value: number; expiresAt: number | null } | undefined => {
    const entry = counters.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      counters.delete(key)
      return undefined
    }
    return entry
  }

  return {
    connect: async () => undefined,
    quit: async () => undefined,
    ping: async () => 'PONG',

    incr: async (key: string): Promise<number> => {
      const current = live(key)
      const next = (current?.value ?? 0) + 1
      counters.set(key, { value: next, expiresAt: current?.expiresAt ?? null })
      return next
    },

    pExpire: async (key: string, ms: number): Promise<unknown> => {
      const current = counters.get(key)
      if (current === undefined) return false
      current.expiresAt = Date.now() + ms
      return true
    },

    del: async (keys: string[]): Promise<number> => {
      let removed = 0
      for (const key of keys) {
        if (counters.delete(key)) removed += 1
      }
      return removed
    },
  }
}
