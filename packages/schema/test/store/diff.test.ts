import { describe, expect, it } from 'vitest'
import { deepEqual, diffBlocks, diffContent, diffValues } from '../../src/store/diff.js'

describe('content diff', () => {
  describe('values', () => {
    it('reports only the fields that moved', () => {
      const changes = diffValues({ title: 'a', rating: 1 }, { title: 'b', rating: 1 })

      expect(changes).toEqual([{ field: 'title', change: 'changed', before: 'a', after: 'b' }])
    })

    it('tells an added field from a changed one', () => {
      const changes = diffValues({ title: null }, { title: 'a' })

      expect(changes[0]?.change).toBe('added')
    })

    it('tells a removed field from a changed one', () => {
      const changes = diffValues({ title: 'a' }, { title: null })

      expect(changes[0]?.change).toBe('removed')
    })

    it('looks inside a structured document rather than comparing its text', () => {
      const before = { body: [{ _key: 'b1', text: 'un' }] }
      const after = { body: [{ _key: 'b1', text: 'deux' }] }

      expect(diffValues(before, after)).toHaveLength(1)
      expect(diffValues(before, before)).toEqual([])
    })

    it('does not report a change because the driver returned keys in another order', () => {
      expect(diffValues({ meta: { a: 1, b: 2 } }, { meta: { b: 2, a: 1 } })).toEqual([])
    })
  })

  describe('blocks', () => {
    const block = (key: string, text: string) => ({ key, type: 'prose', data: { text } })

    it('follows a block by its key, not by its position', () => {
      const before = [block('k1', 'A'), block('k2', 'B')]
      const after = [block('k2', 'B'), block('k1', 'A')]

      const changes = diffBlocks('zone', before, after)

      expect(changes.map((change) => change.change)).toEqual(['moved', 'moved'])
    })

    it('reports an insertion at the top as one addition, not as everything changing', () => {
      const before = [block('k1', 'A'), block('k2', 'B')]
      const after = [block('k0', 'Z'), block('k1', 'A'), block('k2', 'B')]

      const changes = diffBlocks('zone', before, after)
      const added = changes.filter((change) => change.change === 'added')

      expect(added).toHaveLength(1)
      expect(added[0]?.key).toBe('k0')
      expect(changes.filter((change) => change.change === 'changed')).toEqual([])
    })

    it('says which field of a block changed', () => {
      const changes = diffBlocks('zone', [block('k1', 'A')], [block('k1', 'B')])

      expect(changes[0]?.change).toBe('changed')
      expect(changes[0]?.fields).toEqual([
        { field: 'text', change: 'changed', before: 'A', after: 'B' },
      ])
    })

    it('reports a removal', () => {
      const changes = diffBlocks('zone', [block('k1', 'A')], [])

      expect(changes[0]).toMatchObject({ change: 'removed', fromIndex: 0, toIndex: null })
    })
  })

  it('says nothing changed when nothing did', () => {
    const entry = { values: { title: 'a' }, blocks: { zone: [] } }

    expect(diffContent(entry, entry).changed).toBe(false)
  })
})

describe('deepEqual', () => {
  it('treats two structurally identical documents as equal', () => {
    expect(deepEqual([{ a: [1, 2] }], [{ a: [1, 2] }])).toBe(true)
  })

  it('separates an array from an object with numeric keys', () => {
    expect(deepEqual([1], { 0: 1 })).toBe(false)
  })

  it('separates null from an empty object', () => {
    expect(deepEqual(null, {})).toBe(false)
  })
})
