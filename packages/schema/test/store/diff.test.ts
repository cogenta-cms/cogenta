import { describe, expect, it } from 'vitest'
import {
  deepEqual,
  diffBlocks,
  diffContent,
  diffValues,
  diffWords,
  enrichWordDiffs,
  extractPlainText,
} from '../../src/store/diff.js'

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

describe('diffWords', () => {
  it('reports a single corrected word, not a rewritten sentence', () => {
    const ops = diffWords('The quick brown fox', 'The quick red fox')

    expect(ops).toEqual([
      { op: 'equal', text: 'The quick ' },
      { op: 'removed', text: 'brown' },
      { op: 'added', text: 'red' },
      { op: 'equal', text: ' fox' },
    ])
  })

  it('reports a pure insertion', () => {
    expect(diffWords('un mot', 'un gros mot')).toEqual([
      { op: 'equal', text: 'un ' },
      { op: 'added', text: 'gros ' },
      { op: 'equal', text: 'mot' },
    ])
  })

  it('reports a pure deletion', () => {
    expect(diffWords('un gros mot', 'un mot')).toEqual([
      { op: 'equal', text: 'un ' },
      { op: 'removed', text: 'gros ' },
      { op: 'equal', text: 'mot' },
    ])
  })

  it('reports a moved word as a removal and an addition, never a silent equal', () => {
    const ops = diffWords('rouge et vert', 'vert et rouge')
    const removed = ops.filter((op) => op.op === 'removed').map((op) => op.text)
    const added = ops.filter((op) => op.op === 'added').map((op) => op.text)

    expect(removed.join('')).toContain('rouge')
    expect(added.join('')).toContain('rouge')
  })

  it('is stable on accented words', () => {
    expect(diffWords('café léger', 'café lourd')).toEqual([
      { op: 'equal', text: 'café ' },
      { op: 'removed', text: 'léger' },
      { op: 'added', text: 'lourd' },
    ])
  })

  it('keeps a character outside the BMP as one token, not a broken surrogate pair', () => {
    // U+1F600 GRINNING FACE — a surrogate pair in UTF-16.
    const ops = diffWords('hello \u{1F600} world', 'hello \u{1F601} world')
    const removed = ops.find((op) => op.op === 'removed')
    const added = ops.find((op) => op.op === 'added')

    expect(removed?.text).toBe('\u{1F600}')
    expect(added?.text).toBe('\u{1F601}')
  })

  it('reconstructs both sides exactly by concatenation, whitespace included', () => {
    const before = '  leading  and   trailing  '
    const after = '  leading  and different   trailing  '
    const ops = diffWords(before, after)

    expect(
      ops
        .filter((op) => op.op !== 'added')
        .map((op) => op.text)
        .join(''),
    ).toBe(before)
    expect(
      ops
        .filter((op) => op.op !== 'removed')
        .map((op) => op.text)
        .join(''),
    ).toBe(after)
  })

  it('reports nothing removed or added for identical text', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ op: 'equal', text: 'same text' }])
  })
})

describe('extractPlainText', () => {
  it('passes a plain string through unchanged', () => {
    expect(extractPlainText('hello')).toBe('hello')
  })

  it('extracts the spans of a rich text document', () => {
    const document = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'Hello ', marks: [] }],
      },
      {
        _key: 'b2',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's2', _type: 'span', text: 'world', marks: [] }],
      },
    ]

    expect(extractPlainText(document)).toBe('Hello \nworld\n')
  })

  it('skips a media node rather than refusing the whole document', () => {
    const document = [
      { _key: 'm1', _type: 'media', id: 'asset-1' },
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'caption', marks: [] }],
      },
    ]

    expect(extractPlainText(document)).toBe('caption\n')
  })

  it('refuses a document with an unrecognised node shape', () => {
    expect(extractPlainText([{ _key: 'x', _type: 'unknown' }])).toBeNull()
  })

  it('refuses a plain object and a number', () => {
    expect(extractPlainText({ a: 1 })).toBeNull()
    expect(extractPlainText(42)).toBeNull()
  })
})

describe('enrichWordDiffs', () => {
  it('attaches a word diff to a changed text field', () => {
    const diff = {
      fields: [
        { field: 'title', change: 'changed' as const, before: 'Old title', after: 'New title' },
      ],
      blocks: [],
      changed: true,
    }

    const enriched = enrichWordDiffs(diff)

    expect(enriched.fields[0]?.words).toEqual([
      { op: 'removed', text: 'Old' },
      { op: 'added', text: 'New' },
      { op: 'equal', text: ' title' },
    ])
    // The original is untouched — enrichment never mutates in place.
    expect(diff.fields[0]).not.toHaveProperty('words')
  })

  it('leaves an added or removed field alone — there is only one side to show', () => {
    const diff = {
      fields: [{ field: 'title', change: 'added' as const, before: null, after: 'New title' }],
      blocks: [],
      changed: true,
    }

    expect(enrichWordDiffs(diff).fields[0]?.words).toBeUndefined()
  })

  it('leaves a non-text field change alone', () => {
    const diff = {
      fields: [{ field: 'rating', change: 'changed' as const, before: 1, after: 5 }],
      blocks: [],
      changed: true,
    }

    expect(enrichWordDiffs(diff).fields[0]?.words).toBeUndefined()
  })

  it('enriches a changed field inside a block as well', () => {
    const diff = {
      fields: [],
      blocks: [
        {
          zone: 'body',
          key: 'k1',
          type: 'prose',
          change: 'changed' as const,
          fromIndex: 0,
          toIndex: 0,
          fields: [{ field: 'text', change: 'changed' as const, before: 'A cat', after: 'A dog' }],
        },
      ],
      changed: true,
    }

    expect(enrichWordDiffs(diff).blocks[0]?.fields[0]?.words).toEqual([
      { op: 'equal', text: 'A ' },
      { op: 'removed', text: 'cat' },
      { op: 'added', text: 'dog' },
    ])
  })

  it('does not enrich a diff that already reports no textual change', () => {
    const diff = {
      fields: [{ field: 'title', change: 'changed' as const, before: 'same', after: 'same' }],
      blocks: [],
      changed: true,
    }

    expect(enrichWordDiffs(diff).fields[0]?.words).toBeUndefined()
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
