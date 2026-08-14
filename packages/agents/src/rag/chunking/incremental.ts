import type { Chunk } from './types.js'

export interface IngestionPlan {
  /** New chunk ids, and chunks whose text (hence hash) changed since the previous run — these need `EmbeddingProvider.embed()`. */
  readonly toEmbed: readonly Chunk[]
  /** Chunk ids present before but absent now — their vectors should be deleted from the index. */
  readonly toRemove: readonly string[]
  /** Same id, same hash — skipped entirely, "ré-embedding des seuls chunks modifiés". */
  readonly unchanged: readonly Chunk[]
}

/**
 * Compares one document's previous chunk set to its freshly re-chunked
 * current set, by id and hash only — this is the whole incremental
 * ingestion mechanism the lot asks for: "hash par chunk → ré-embedding des
 * seuls chunks modifiés". No I/O here; the caller owns fetching `previous`
 * from wherever the index stores it and calling the embedding provider and
 * the index with the plan's three lists.
 */
export function planIncrementalIngestion(
  previous: readonly Chunk[],
  next: readonly Chunk[],
): IngestionPlan {
  const previousById = new Map(previous.map((chunk) => [chunk.id, chunk]))
  const nextIds = new Set(next.map((chunk) => chunk.id))

  const toEmbed: Chunk[] = []
  const unchanged: Chunk[] = []
  for (const chunk of next) {
    const prior = previousById.get(chunk.id)
    if (prior === undefined || prior.hash !== chunk.hash) toEmbed.push(chunk)
    else unchanged.push(chunk)
  }

  const toRemove = previous.filter((chunk) => !nextIds.has(chunk.id)).map((chunk) => chunk.id)

  return { toEmbed, toRemove, unchanged }
}
