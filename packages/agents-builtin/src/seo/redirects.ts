export interface Redirect {
  readonly from: string
  readonly to: string
}

const MAX_CHAIN_DEPTH = 10

/**
 * "Suivi des redirections orphelines" — a redirect is orphaned when its
 * target never reaches a live URL, whether directly, through a chain of
 * other redirects, or in a cycle. Following the chain (bounded, so a cycle
 * cannot loop forever) is what makes A→B→C(live) correctly *not* orphaned
 * even though B itself is not a live URL.
 */
export function findOrphanedRedirects(
  redirects: readonly Redirect[],
  liveUrls: readonly string[],
): readonly Redirect[] {
  const live = new Set(liveUrls)
  const targetByFrom = new Map(redirects.map((redirect) => [redirect.from, redirect.to]))

  function resolvesToLive(startTarget: string): boolean {
    const visited = new Set<string>()
    let current = startTarget
    for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
      if (live.has(current)) return true
      if (visited.has(current)) return false
      visited.add(current)
      const next = targetByFrom.get(current)
      if (next === undefined) return false
      current = next
    }
    return false
  }

  return redirects.filter((redirect) => !resolvesToLive(redirect.to))
}
