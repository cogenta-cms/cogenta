import type { RankedId } from './types.js'

const DEFAULT_K = 60

/**
 * Reciprocal Rank Fusion — merges any number of independently-ranked lists
 * by rank position, not by raw score (BM25 and cosine similarity live on
 * different, incomparable scales, so fusing their scores directly would be
 * meaningless; fusing their ranks is the whole point of RRF).
 */
export function reciprocalRankFusion(
  rankings: readonly (readonly RankedId[])[],
  k = DEFAULT_K,
): readonly RankedId[] {
  const fused = new Map<string, number>()
  for (const ranking of rankings) {
    ranking.forEach((entry, index) => {
      const rank = index + 1
      fused.set(entry.id, (fused.get(entry.id) ?? 0) + 1 / (k + rank))
    })
  }
  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}
