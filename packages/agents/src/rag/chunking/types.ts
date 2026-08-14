/**
 * Deliberately not `@cogenta/blocks`' own block union — the same reasoning
 * `ContentServiceLike` (task 5) documents for content tools: a narrow
 * structural shape the real block-flattening step (wherever content is read
 * from, outside this package) can satisfy, instead of a hard dependency.
 */
export interface ChunkableBlock {
  readonly id: string
  /** A heading/title block — always starts a new chunk, never gets folded into the section above it. */
  readonly isHeading?: boolean
  readonly text: string
}

export interface ChunkableDocument {
  readonly documentId: string
  readonly title: string
  readonly blocks: readonly ChunkableBlock[]
}

export interface Chunk {
  /**
   * `${documentId}:${blockIds.join(',')}` — identity comes from which blocks
   * make up the chunk, not from its position or its text. An edit to a
   * block's text keeps the same chunk id (so incremental ingestion sees "same
   * chunk, new hash" rather than a spurious remove+add); a block moving to a
   * different section, or a chunk boundary shifting, is a genuinely different
   * chunk and gets a different id.
   */
  readonly id: string
  readonly documentId: string
  readonly blockIds: readonly string[]
  readonly text: string
  /** SHA-256 of `text` — the only thing incremental ingestion compares to decide what needs re-embedding. */
  readonly hash: string
}
