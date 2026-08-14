import { describe, expect, it } from 'vitest'
import { chunkDocument } from '../../../src/rag/chunking/chunk-document.js'
import type { ChunkableDocument } from '../../../src/rag/chunking/types.js'

describe('chunkDocument', () => {
  it('packs consecutive blocks under one heading into a single chunk', () => {
    const document: ChunkableDocument = {
      documentId: 'entry-1',
      title: 'CVE Triage Guide',
      blocks: [
        { id: 'h1', isHeading: true, text: 'Overview' },
        { id: 'p1', text: 'This guide explains how to triage a CVE.' },
        { id: 'p2', text: 'Start by checking the affected package.' },
      ],
    }

    const chunks = chunkDocument(document)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.blockIds).toEqual(['h1', 'p1', 'p2'])
    expect(chunks[0]?.text).toContain('CVE Triage Guide')
    expect(chunks[0]?.text).toContain('Overview')
    expect(chunks[0]?.text).toContain('Start by checking the affected package.')
  })

  it('starts a new chunk at every heading, never folding it into the section above', () => {
    const document: ChunkableDocument = {
      documentId: 'entry-1',
      title: 'Guide',
      blocks: [
        { id: 'h1', isHeading: true, text: 'Section one' },
        { id: 'p1', text: 'First section body.' },
        { id: 'h2', isHeading: true, text: 'Section two' },
        { id: 'p2', text: 'Second section body.' },
      ],
    }

    const chunks = chunkDocument(document)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.blockIds).toEqual(['h1', 'p1'])
    expect(chunks[1]?.blockIds).toEqual(['h2', 'p2'])
  })

  it('splits a section across chunks once it exceeds maxChunkChars, never mid-block', () => {
    const document: ChunkableDocument = {
      documentId: 'entry-1',
      title: 'Guide',
      blocks: [
        { id: 'h1', isHeading: true, text: 'Section' },
        { id: 'p1', text: 'a'.repeat(50) },
        { id: 'p2', text: 'b'.repeat(50) },
      ],
    }

    const chunks = chunkDocument(document, { maxChunkChars: 60 })

    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.blockIds).toEqual(['h1', 'p1'])
    expect(chunks[1]?.blockIds).toEqual(['p2'])
    expect(chunks[0]?.text).toContain('a'.repeat(50))
    expect(chunks[1]?.text).toContain('b'.repeat(50))
  })

  it('skips blank blocks entirely', () => {
    const document: ChunkableDocument = {
      documentId: 'entry-1',
      title: 'Guide',
      blocks: [
        { id: 'p1', text: '   ' },
        { id: 'p2', text: 'real content' },
      ],
    }

    const chunks = chunkDocument(document)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.blockIds).toEqual(['p2'])
  })

  it('returns nothing for a document with no non-blank blocks', () => {
    const document: ChunkableDocument = { documentId: 'entry-1', title: 'Empty', blocks: [] }
    expect(chunkDocument(document)).toEqual([])
  })

  it('derives the chunk id from documentId and the block ids it contains', () => {
    const document: ChunkableDocument = {
      documentId: 'entry-1',
      title: 'Guide',
      blocks: [{ id: 'p1', text: 'content' }],
    }

    const [chunk] = chunkDocument(document)

    expect(chunk?.id).toBe('entry-1:p1')
  })

  it('keeps the same chunk id across re-chunks when the block set is unchanged, even if the text changed', () => {
    const before = chunkDocument({
      documentId: 'entry-1',
      title: 'Guide',
      blocks: [{ id: 'p1', text: 'old text' }],
    })
    const after = chunkDocument({
      documentId: 'entry-1',
      title: 'Guide',
      blocks: [{ id: 'p1', text: 'new text' }],
    })

    expect(after[0]?.id).toBe(before[0]?.id)
    expect(after[0]?.hash).not.toBe(before[0]?.hash)
  })

  it('produces the same hash for the same text, and a different hash for different text', () => {
    const document = (text: string): ChunkableDocument => ({
      documentId: 'entry-1',
      title: 'Guide',
      blocks: [{ id: 'p1', text }],
    })

    const [a] = chunkDocument(document('same'))
    const [b] = chunkDocument(document('same'))
    const [c] = chunkDocument(document('different'))

    expect(a?.hash).toBe(b?.hash)
    expect(a?.hash).not.toBe(c?.hash)
  })
})
