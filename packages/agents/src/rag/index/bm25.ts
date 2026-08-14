import type { IndexedChunk, RankedId } from './types.js'

const K1 = 1.5
const B = 0.75

function tokenize(text: string): readonly string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/** Standard Okapi BM25 over each chunk's text — the keyword half of the hybrid search. */
export function bm25Rank(chunks: readonly IndexedChunk[], queryText: string): readonly RankedId[] {
  const queryTerms = tokenize(queryText)
  if (chunks.length === 0 || queryTerms.length === 0) return []

  const docs = chunks.map((indexed) => ({
    id: indexed.chunk.id,
    terms: tokenize(indexed.chunk.text),
  }))
  const avgLength = docs.reduce((sum, doc) => sum + doc.terms.length, 0) / docs.length

  const docFrequency = new Map<string, number>()
  for (const term of new Set(queryTerms)) {
    docFrequency.set(term, docs.filter((doc) => doc.terms.includes(term)).length)
  }

  const scored = docs.map((doc) => {
    const termCounts = new Map<string, number>()
    for (const term of doc.terms) termCounts.set(term, (termCounts.get(term) ?? 0) + 1)

    let score = 0
    for (const term of queryTerms) {
      const documentFrequency = docFrequency.get(term) ?? 0
      if (documentFrequency === 0) continue
      const idf = Math.log((docs.length - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1)
      const termFrequency = termCounts.get(term) ?? 0
      const denominator =
        termFrequency + K1 * (1 - B + (B * doc.terms.length) / (avgLength === 0 ? 1 : avgLength))
      score += idf * ((termFrequency * (K1 + 1)) / denominator)
    }
    return { id: doc.id, score }
  })

  return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score)
}
