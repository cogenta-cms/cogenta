import { createHashingEmbeddingProvider } from '@cogenta/agents'
import { cosineSimilarity } from './similarity.js'

export interface InternalLinkSourcePage {
  readonly url: string
  readonly bodyText: string
  readonly internalLinks: readonly string[]
}

export interface InternalLinkCandidatePage {
  readonly url: string
  readonly bodyText: string
}

export interface InternalLinkProposal {
  readonly url: string
  readonly score: number
}

export interface ProposeInternalLinksOptions {
  readonly limit?: number
  readonly minScore?: number
}

const DEFAULT_LIMIT = 5
const DEFAULT_MIN_SCORE = 0.05

/**
 * "Propositions de liens internes" — ranks candidate pages by topical
 * similarity to the current page's body text, using the same hashing-trick
 * `EmbeddingProvider` the RAG index already uses (L4 task 14) rather than a
 * bespoke similarity metric. A page already linked from the current one, or
 * the current page itself, is never proposed again.
 */
export async function proposeInternalLinks(
  currentPage: InternalLinkSourcePage,
  candidatePages: readonly InternalLinkCandidatePage[],
  options: ProposeInternalLinksOptions = {},
): Promise<readonly InternalLinkProposal[]> {
  const alreadyLinked = new Set(currentPage.internalLinks)
  const eligible = candidatePages.filter(
    (page) => page.url !== currentPage.url && !alreadyLinked.has(page.url),
  )
  if (eligible.length === 0) return []

  const provider = createHashingEmbeddingProvider()
  const vectors = await provider.embed([
    currentPage.bodyText,
    ...eligible.map((page) => page.bodyText),
  ])
  const currentVector = vectors[0]
  if (currentVector === undefined) return []

  const minScore = options.minScore ?? DEFAULT_MIN_SCORE
  const scored = eligible
    .map((page, index) => ({
      url: page.url,
      score: cosineSimilarity(currentVector, vectors[index + 1] ?? []),
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, options.limit ?? DEFAULT_LIMIT)
}
