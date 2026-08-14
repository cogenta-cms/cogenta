import { createHash } from 'node:crypto'
import type { Chunk, ChunkableDocument } from './types.js'

const DEFAULT_MAX_CHUNK_CHARS = 2000

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

interface Building {
  blockIds: string[]
  texts: string[]
  chars: number
}

/**
 * "Découpage sémantique par bloc et par titre": a block is the atomic unit
 * (never split mid-block) and a heading block always starts a new chunk
 * (never folded into the section above it) — the two boundaries the lot
 * names. Within those boundaries, consecutive blocks are packed into one
 * chunk up to `maxChunkChars`, so a chunk stays one coherent section rather
 * than one block each, which would starve retrieval of context.
 */
export function chunkDocument(
  document: ChunkableDocument,
  options?: { readonly maxChunkChars?: number },
): readonly Chunk[] {
  const maxChunkChars = options?.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS
  const chunks: Chunk[] = []
  let current: Building | null = null

  function flush(): void {
    if (current === null || current.blockIds.length === 0) return
    // The document title is folded into every chunk's text, not just kept as
    // metadata — retrieval otherwise loses which document/section a chunk
    // belongs to once it is embedded and floating in a vector index.
    const text = [document.title, ...current.texts].join('\n\n')
    chunks.push({
      id: `${document.documentId}:${current.blockIds.join(',')}`,
      documentId: document.documentId,
      blockIds: [...current.blockIds],
      text,
      hash: hashText(text),
    })
    current = null
  }

  for (const block of document.blocks) {
    const blockText = block.text.trim()
    if (blockText === '') continue

    if (block.isHeading === true) flush()
    if (current !== null && current.chars > 0 && current.chars + blockText.length > maxChunkChars) {
      flush()
    }
    current ??= { blockIds: [], texts: [], chars: 0 }
    current.blockIds.push(block.id)
    current.texts.push(blockText)
    current.chars += blockText.length
  }
  flush()

  return chunks
}
