/**
 * Not re-exported from `@cogenta/agents`' own `vector-rank.ts` — that one
 * operates on `IndexedChunk` (the RAG index's own shape, L4 task 16); the
 * SEO checks below only ever compare two bare vectors, so this is the
 * smaller, undecorated version of the same formula.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
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
