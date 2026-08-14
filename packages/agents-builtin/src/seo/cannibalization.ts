import { createHashingEmbeddingProvider } from '@cogenta/agents'
import { cosineSimilarity } from './similarity.js'

export interface CannibalizationCandidatePage {
  readonly url: string
  readonly bodyText: string
}

export interface CannibalizationPair {
  readonly urlA: string
  readonly urlB: string
  readonly score: number
}

export interface DetectCannibalizationOptions {
  readonly threshold?: number
}

const DEFAULT_THRESHOLD = 0.85

/**
 * "Détection de cannibalisation entre pages" — two *different* pages whose
 * body text is topically near-identical compete for the same search intent
 * instead of ranking for it together. Same embedding approach as
 * `proposeInternalLinks`, but the signal here is a pair scoring above a high
 * threshold, not a ranked list.
 */
export async function detectCannibalization(
  pages: readonly CannibalizationCandidatePage[],
  options: DetectCannibalizationOptions = {},
): Promise<readonly CannibalizationPair[]> {
  if (pages.length < 2) return []

  const provider = createHashingEmbeddingProvider()
  const vectors = await provider.embed(pages.map((page) => page.bodyText))
  const threshold = options.threshold ?? DEFAULT_THRESHOLD

  const pairs: CannibalizationPair[] = []
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const score = cosineSimilarity(vectors[i] ?? [], vectors[j] ?? [])
      if (score >= threshold) {
        const pageA = pages[i]
        const pageB = pages[j]
        if (pageA !== undefined && pageB !== undefined) {
          pairs.push({ urlA: pageA.url, urlB: pageB.url, score })
        }
      }
    }
  }
  return pairs.sort((a, b) => b.score - a.score)
}
