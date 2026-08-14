import { describe, expect, it } from 'vitest'
import { planIncrementalIngestion } from '../../../src/rag/chunking/incremental.js'
import type { Chunk } from '../../../src/rag/chunking/types.js'

function chunk(id: string, hash: string): Chunk {
  return { id, documentId: 'entry-1', blockIds: [id], text: id, hash }
}

describe('planIncrementalIngestion', () => {
  it('treats every chunk as needing embedding when there is no previous set', () => {
    const next = [chunk('a', 'h1'), chunk('b', 'h2')]
    const plan = planIncrementalIngestion([], next)

    expect(plan.toEmbed).toEqual(next)
    expect(plan.unchanged).toEqual([])
    expect(plan.toRemove).toEqual([])
  })

  it('skips a chunk whose id and hash are both unchanged', () => {
    const previous = [chunk('a', 'h1')]
    const next = [chunk('a', 'h1')]

    const plan = planIncrementalIngestion(previous, next)

    expect(plan.unchanged).toEqual(next)
    expect(plan.toEmbed).toEqual([])
  })

  it('re-embeds a chunk whose id is unchanged but whose hash changed', () => {
    const previous = [chunk('a', 'h1')]
    const next = [chunk('a', 'h2')]

    const plan = planIncrementalIngestion(previous, next)

    expect(plan.toEmbed).toEqual(next)
    expect(plan.unchanged).toEqual([])
  })

  it('removes a chunk id that no longer appears in the new set', () => {
    const previous = [chunk('a', 'h1'), chunk('gone', 'h2')]
    const next = [chunk('a', 'h1')]

    const plan = planIncrementalIngestion(previous, next)

    expect(plan.toRemove).toEqual(['gone'])
    expect(plan.unchanged).toEqual(next)
  })

  it('handles a mixed batch — unchanged, changed, new and removed all at once', () => {
    const previous = [chunk('unchanged', 'h1'), chunk('changed', 'h2'), chunk('removed', 'h3')]
    const next = [chunk('unchanged', 'h1'), chunk('changed', 'h2-new'), chunk('new', 'h4')]

    const plan = planIncrementalIngestion(previous, next)

    expect(plan.unchanged.map((c) => c.id)).toEqual(['unchanged'])
    expect(plan.toEmbed.map((c) => c.id)).toEqual(['changed', 'new'])
    expect(plan.toRemove).toEqual(['removed'])
  })
})
