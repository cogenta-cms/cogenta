import type { EmbeddingProvider } from './types.js'

const DEFAULT_DIMENSIONS = 256

function tokenize(text: string): readonly string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/** FNV-1a — deterministic, no dependency, good enough spread for a hashing-trick embedding. */
function hashToken(token: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function embedOne(text: string, dimensions: number): readonly number[] {
  const vector = new Array<number>(dimensions).fill(0)
  for (const token of tokenize(text)) {
    const hash = hashToken(token)
    const index = hash % dimensions
    const sign = hash & 1 ? 1 : -1
    vector[index] = (vector[index] ?? 0) + sign
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return norm === 0 ? vector : vector.map((value) => value / norm)
}

/**
 * The "hashing trick" (scikit-learn's `HashingVectorizer` is the same idea):
 * a bag-of-words vector folded into a fixed size by hashing each token to a
 * dimension and a sign, then L2-normalised for cosine similarity. Local, CPU,
 * zero dependency, no model to download — deliberately not the
 * `multilingual-e5-small` ONNX model the lot names as the eventual default.
 *
 * That adapter is deferred: the natural library for local ONNX text
 * embeddings in Node, `@huggingface/transformers`, declares `sharp` as a
 * hard (non-optional) direct dependency even for text-only use — the exact
 * native-without-WASM-fallback failure R10 exists to prevent, breaking
 * `pnpm install` on ARM/musl/shared hosting regardless of which backend is
 * actually used at runtime. `EmbeddingProvider` is shaped so a real ONNX
 * adapter can replace this one later (task 15/16's RAG index keys on
 * `{provider, model, dimensions}`, not on how a vector was produced) once a
 * `sharp`-free path exists — a follow-up, not this task's call to make.
 */
export function createHashingEmbeddingProvider(options?: {
  readonly dimensions?: number
}): EmbeddingProvider {
  const dimensions = options?.dimensions ?? DEFAULT_DIMENSIONS
  return {
    provider: 'local-hashing',
    model: 'feature-hashing-v1',
    dimensions,
    async embed(texts) {
      return texts.map((text) => embedOne(text, dimensions))
    },
  }
}
