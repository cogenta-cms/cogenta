import type { IndexedChunk, RankedId } from './types.js'

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let magnitudeA = 0
  let magnitudeB = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const valueA = a[i] ?? 0
    const valueB = b[i] ?? 0
    dot += valueA * valueB
    magnitudeA += valueA * valueA
    magnitudeB += valueB * valueB
  }
  if (magnitudeA === 0 || magnitudeB === 0) return 0
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
}

/** The vector half of the hybrid search — cosine similarity against each chunk's stored embedding. */
export function vectorRank(
  chunks: readonly IndexedChunk[],
  queryVector: readonly number[],
): readonly RankedId[] {
  return chunks
    .map((indexed) => ({
      id: indexed.chunk.id,
      score: cosineSimilarity(indexed.vector, queryVector),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
}
