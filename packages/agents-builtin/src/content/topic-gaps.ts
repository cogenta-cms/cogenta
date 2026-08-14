import { createHashingEmbeddingProvider } from '@cogenta/agents'

export interface TopicCandidate {
  readonly topic: string
  readonly description: string
}

export interface ExistingContent {
  readonly title: string
  readonly bodyText: string
}

export interface TopicGapSuggestion {
  readonly topic: string
  readonly description: string
  readonly maxSimilarity: number
}

export interface SuggestTopicGapsOptions {
  readonly maxSuggestions?: number
  readonly similarityThreshold?: number
}

const DEFAULT_MAX_SUGGESTIONS = 5
// The hashing-trick embedding (L4 task 14) has no absolute calibration and,
// on short texts, even fully unrelated sentences share enough incidental
// function words ("a", "using", ...) to sit as high as ~0.3-0.4 cosine
// similarity — not a bug, just the ceiling of a bag-of-words hash on short
// strings. The default sits above that noise floor so only genuinely close
// (near-duplicate or paraphrased) content counts as "already covered";
// unrelated topics that merely share a few function words still surface as
// gaps rather than being silently swallowed by hash noise.
const DEFAULT_SIMILARITY_THRESHOLD = 0.5

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

/**
 * "Suggestions de sujets à partir des lacunes du contenu existant." A
 * candidate topic unlike everything already published (its highest
 * similarity to any existing piece stays under `similarityThreshold`) is a
 * genuine gap; one that closely tracks existing content is filtered out.
 * Reuses `createHashingEmbeddingProvider` (L4 task 14) rather than a
 * bespoke similarity metric — a local cosine helper is used instead of the
 * RAG index's `vectorRank`, which expects a full `IndexedChunk`/`Chunk`
 * wrapper this call has no reason to construct.
 */
export async function suggestTopicGaps(
  candidateTopics: readonly TopicCandidate[],
  existingContent: readonly ExistingContent[],
  options: SuggestTopicGapsOptions = {},
): Promise<readonly TopicGapSuggestion[]> {
  const maxSuggestions = options.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS
  const similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD
  if (candidateTopics.length === 0) return []

  const provider = createHashingEmbeddingProvider()
  const candidateVectors = await provider.embed(
    candidateTopics.map((candidate) => candidate.description),
  )
  const existingVectors =
    existingContent.length === 0
      ? []
      : await provider.embed(existingContent.map((content) => content.bodyText))

  return candidateTopics
    .map((candidate, index) => {
      const vector = candidateVectors[index] ?? []
      const maxSimilarity = existingVectors.reduce(
        (max, existingVector) => Math.max(max, cosineSimilarity(vector, existingVector)),
        0,
      )
      return { topic: candidate.topic, description: candidate.description, maxSimilarity }
    })
    .filter((candidate) => candidate.maxSimilarity < similarityThreshold)
    .sort((a, b) => a.maxSimilarity - b.maxSimilarity)
    .slice(0, maxSuggestions)
}
