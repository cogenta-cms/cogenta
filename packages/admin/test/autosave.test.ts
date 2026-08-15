import { beforeEach, describe, expect, it } from 'vitest'
import type { AutosaveStorage } from '../src/collections/autosave.js'
import {
  autosaveKey,
  clearAutosave,
  isRecoverable,
  readAutosave,
  sameSnapshot,
  writeAutosave,
} from '../src/collections/autosave.js'

function memoryStorage(): AutosaveStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

let storage: ReturnType<typeof memoryStorage>

beforeEach(() => {
  storage = memoryStorage()
})

describe('the autosave key', () => {
  it('separates two languages of the same entry', () => {
    expect(autosaveKey('article', 'entry-1', 'fr')).not.toBe(
      autosaveKey('article', 'entry-1', 'en'),
    )
  })

  it('gives an entry that does not exist yet a key of its own', () => {
    expect(autosaveKey('article', null, 'fr')).toContain('new')
    expect(autosaveKey('article', null, 'fr')).not.toBe(autosaveKey('article', 'entry-1', 'fr'))
  })
})

describe('reading back an autosave', () => {
  it('returns exactly what was written, with the moment it was written', () => {
    const key = autosaveKey('article', 'entry-1', 'fr')
    writeAutosave(
      storage,
      key,
      { values: { title: 'En cours' }, blocks: { zone: [] } },
      new Date('2026-08-15T10:00:00.000Z'),
    )

    expect(readAutosave(storage, key)).toEqual({
      at: '2026-08-15T10:00:00.000Z',
      values: { title: 'En cours' },
      blocks: { zone: [] },
    })
  })

  it('reports nothing when nothing was ever written', () => {
    expect(readAutosave(storage, autosaveKey('article', 'entry-1', 'fr'))).toBeNull()
  })

  it('drops a corrupt record instead of letting the editor fail to open', () => {
    const key = autosaveKey('article', 'entry-1', 'fr')
    storage.setItem(key, 'not json at all')

    expect(readAutosave(storage, key)).toBeNull()
    expect(storage.map.has(key)).toBe(false)
  })

  it('drops a record written by an older format rather than guessing at it', () => {
    const key = autosaveKey('article', 'entry-1', 'fr')
    storage.setItem(key, JSON.stringify({ format: 0, at: 'x', values: {}, blocks: {} }))

    expect(readAutosave(storage, key)).toBeNull()
  })

  it('forgets a record once it is cleared', () => {
    const key = autosaveKey('article', 'entry-1', 'fr')
    writeAutosave(storage, key, { values: { title: 'x' }, blocks: {} })
    clearAutosave(storage, key)

    expect(readAutosave(storage, key)).toBeNull()
  })

  it('never throws when the browser refuses to store anything', () => {
    const refusing: AutosaveStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }

    expect(() => writeAutosave(refusing, 'k', { values: { title: 'x' }, blocks: {} })).not.toThrow()
    expect(() => clearAutosave(refusing, 'k')).not.toThrow()
  })
})

describe('deciding whether a local draft is worth offering back', () => {
  const loaded = { values: { title: 'Enregistré' }, blocks: {} }
  const savedAt = '2026-08-15T10:00:00.000Z'

  it('offers a draft written after the last real save', () => {
    const record = {
      at: '2026-08-15T10:05:00.000Z',
      values: { title: 'En cours' },
      blocks: {},
    }
    expect(isRecoverable(record, loaded, savedAt)).toBe(true)
  })

  it('ignores a draft older than the last real save, which is already in the entry', () => {
    const record = {
      at: '2026-08-15T09:55:00.000Z',
      values: { title: 'Ancien' },
      blocks: {},
    }
    expect(isRecoverable(record, loaded, savedAt)).toBe(false)
  })

  it('ignores a newer draft that says exactly what the server already holds', () => {
    const record = { at: '2026-08-15T10:05:00.000Z', ...loaded }
    expect(isRecoverable(record, loaded, savedAt)).toBe(false)
  })

  it('ignores an unreadable timestamp rather than trusting it', () => {
    const record = { at: 'yesterday', values: { title: 'En cours' }, blocks: {} }
    expect(isRecoverable(record, loaded, savedAt)).toBe(false)
  })

  it('has nothing to offer when nothing was autosaved', () => {
    expect(isRecoverable(null, loaded, savedAt)).toBe(false)
  })
})

describe('comparing two snapshots', () => {
  it('sees a changed block as a change, not only a changed field', () => {
    const left = { values: { title: 'A' }, blocks: { zone: [{ key: 'k', type: 'p', data: {} }] } }
    const right = {
      values: { title: 'A' },
      blocks: { zone: [{ key: 'k', type: 'p', data: { text: 'x' } }] },
    }

    expect(sameSnapshot(left, right)).toBe(false)
    expect(sameSnapshot(left, left)).toBe(true)
  })
})
