import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFileVectorStore } from '../../../src/rag/vector/file.js'
import { createVectorRegistry } from '../../../src/rag/vector/index.js'
import { createMemoryVectorStore } from '../../../src/rag/vector/memory.js'
import { CONTRACT_DIMENSIONS, record, runVectorStoreContract } from './vector-store.contract.js'

runVectorStoreContract('memory', () => ({
  store: createMemoryVectorStore({ dimensions: CONTRACT_DIMENSIONS }),
}))

runVectorStoreContract('file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-vectors-'))
  return {
    store: await createFileVectorStore({ dimensions: CONTRACT_DIMENSIONS, path: directory }),
    dispose: () => rm(directory, { recursive: true, force: true }),
  }
})

describe('the file vector store', () => {
  it('still holds its records after the process that wrote them is gone', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-vectors-'))
    try {
      const first = await createFileVectorStore({
        dimensions: CONTRACT_DIMENSIONS,
        path: directory,
      })
      await first.upsert([record('a', [1, 0, 0, 0], {}, 'survives a restart')])

      // A whole new store object over the same directory is what a restart is.
      const second = await createFileVectorStore({
        dimensions: CONTRACT_DIMENSIONS,
        path: directory,
      })

      const [match] = await second.search([1, 0, 0, 0], { limit: 1 })
      expect(match?.record.chunk.text).toBe('survives a restart')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('refuses to load an index written under a different embedding model', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-vectors-'))
    try {
      const wide = await createFileVectorStore({ dimensions: 6, path: directory })
      await wide.upsert([{ ...record('a', [1, 0, 0, 0]), vector: [1, 0, 0, 0, 0, 0] }])

      await expect(
        createFileVectorStore({ dimensions: CONTRACT_DIMENSIONS, path: directory }),
      ).rejects.toMatchObject({ code: 'VECTOR_DIMENSION_MISMATCH' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('the vector driver registry', () => {
  it('picks a driver that needs no service when there is no database at all', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cogenta-vectors-'))
    try {
      const registry = createVectorRegistry()
      const selection = await registry.select({ dimensions: CONTRACT_DIMENSIONS, path: directory })

      expect(selection.driver).toBe('file')
      expect(selection.tier).toBe('degraded')
      // pgvector was tried and skipped, and the reason is legible — that is what
      // `cogenta doctor` prints, not a debugging aid.
      expect(selection.skipped.map((skip) => skip.driver)).toContain('pgvector')
      await selection.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('falls back to memory when the filesystem refuses', async () => {
    const registry = createVectorRegistry()
    // A path under a file, not a directory: mkdir cannot succeed there.
    const selection = await registry.select({
      dimensions: CONTRACT_DIMENSIONS,
      path: join(import.meta.filename, 'not-a-directory'),
    })

    expect(selection.driver).toBe('memory')
    await selection.dispose()
  })

  it('names every driver it knows, optimal first, for doctor to report', () => {
    expect(
      createVectorRegistry()
        .list()
        .map((driver) => driver.name),
    ).toEqual(['pgvector', 'file', 'memory'])
  })

  it('refuses a driver the configuration named but that cannot run, rather than silently downgrading', async () => {
    const registry = createVectorRegistry()

    await expect(
      registry.select({ driver: 'pgvector', dimensions: CONTRACT_DIMENSIONS }),
    ).rejects.toMatchObject({ code: 'DRIVER_UNAVAILABLE' })
  })
})
