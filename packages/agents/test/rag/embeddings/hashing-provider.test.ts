import { describe, expect, it } from 'vitest'
import { createHashingEmbeddingProvider } from '../../../src/rag/embeddings/hashing-provider.js'

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0)
}

describe('createHashingEmbeddingProvider', () => {
  it('reports its own model identity', () => {
    const provider = createHashingEmbeddingProvider()
    expect(provider).toMatchObject({
      provider: 'local-hashing',
      model: 'feature-hashing-v1',
      dimensions: 256,
    })
  })

  it('honours a custom dimension count', async () => {
    const provider = createHashingEmbeddingProvider({ dimensions: 32 })
    const [vector] = await provider.embed(['hello world'])
    expect(provider.dimensions).toBe(32)
    expect(vector).toHaveLength(32)
  })

  it('returns one vector per input text, in order', async () => {
    const provider = createHashingEmbeddingProvider()
    const vectors = await provider.embed(['first text', 'second text', 'third text'])
    expect(vectors).toHaveLength(3)
  })

  it('is deterministic — the same text always embeds to the same vector', async () => {
    const provider = createHashingEmbeddingProvider()
    const [a] = await provider.embed(['Cogenta is an agentic CMS.'])
    const [b] = await provider.embed(['Cogenta is an agentic CMS.'])
    expect(a).toEqual(b)
  })

  it('embeds similar texts closer together than unrelated ones (cosine similarity)', async () => {
    const provider = createHashingEmbeddingProvider()
    const [a, aAgain, unrelated] = await provider.embed([
      'the quick brown fox jumps over the lazy dog',
      'a quick brown fox jumps over a lazy dog',
      'quarterly revenue exceeded analyst expectations',
    ])
    expect(a).toBeDefined()
    expect(aAgain).toBeDefined()
    expect(unrelated).toBeDefined()
    const simSimilar = dot(a as number[], aAgain as number[])
    const simUnrelated = dot(a as number[], unrelated as number[])
    expect(simSimilar).toBeGreaterThan(simUnrelated)
  })

  it('produces a unit-length vector (L2-normalised) for non-empty text', async () => {
    const provider = createHashingEmbeddingProvider()
    const [vector] = await provider.embed(['some text with several distinct tokens'])
    const magnitude = Math.sqrt((vector as number[]).reduce((sum, v) => sum + v * v, 0))
    expect(magnitude).toBeCloseTo(1, 5)
  })

  it('returns an all-zero vector for text with no tokens', async () => {
    const provider = createHashingEmbeddingProvider({ dimensions: 8 })
    const [vector] = await provider.embed(['   '])
    expect(vector).toEqual(new Array(8).fill(0))
  })
})
