/**
 * An in-memory stand-in for the slice of the Redis API the cache driver uses.
 *
 * This is **not** a claim that the driver works against Redis — only the
 * integration test against a real server proves that. What it does prove is that
 * the driver's own logic (namespacing, tag bookkeeping, expiry, encoding)
 * satisfies the cache contract, on every machine, with no service running.
 */
export function createFakeRedis() {
  const strings = new Map<string, { value: string; expiresAt: number | null }>()
  const sets = new Map<string, Set<string>>()

  const live = (key: string): { value: string; expiresAt: number | null } | undefined => {
    const entry = strings.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      strings.delete(key)
      return undefined
    }
    return entry
  }

  return {
    connect: async () => undefined,
    quit: async () => undefined,
    ping: async () => 'PONG',

    get: async (key: string): Promise<string | null> => live(key)?.value ?? null,

    set: async (key: string, value: string, options?: { PX?: number }): Promise<unknown> => {
      strings.set(key, {
        value,
        expiresAt: options?.PX === undefined ? null : Date.now() + options.PX,
      })
      return 'OK'
    },

    del: async (keys: string[]): Promise<number> => {
      let removed = 0
      for (const key of keys) {
        if (strings.delete(key)) removed += 1
        if (sets.delete(key)) removed += 1
      }
      return removed
    },

    sAdd: async (key: string, members: string[]): Promise<number> => {
      const set = sets.get(key) ?? new Set<string>()
      for (const member of members) set.add(member)
      sets.set(key, set)
      return members.length
    },

    sRem: async (key: string, members: string[]): Promise<number> => {
      const set = sets.get(key)
      if (set === undefined) return 0
      for (const member of members) set.delete(member)
      if (set.size === 0) sets.delete(key)
      return members.length
    },

    sMembers: async (key: string): Promise<string[]> => [...(sets.get(key) ?? [])],

    // Cursor-paged like the real thing, so the driver's loop is exercised rather
    // than short-circuited by a single full page.
    scan: async (
      cursor: string,
      options: { MATCH: string; COUNT: number },
    ): Promise<{ cursor: string; keys: string[] }> => {
      const prefix = options.MATCH.replace(/\*$/, '')
      const all = [...strings.keys(), ...sets.keys()].filter((key) => key.startsWith(prefix))
      const from = Number(cursor)
      const page = all.slice(from, from + options.COUNT)
      const next = from + options.COUNT >= all.length ? '0' : String(from + options.COUNT)
      return { cursor: next, keys: page }
    },
  }
}
