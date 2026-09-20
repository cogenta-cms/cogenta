import { describe, expect, it } from 'vitest'
import { textOf } from '../src/routes/duplicates.js'

/**
 * What the duplicates screen actually sends for comparison.
 *
 * `assist.find_duplicates` compares the text it is given, and this screen
 * gave it the title alone — two defects compounding. The loop returned at
 * the first field that matched, so `title` always won and `body` was never
 * reached; and `body` is a portable-text document, an array, so the
 * `typeof value === 'string'` test could never have been true for it
 * anyway.
 *
 * Measured against the real screen before this: a word-for-word copy of a
 * 4 742-character essay came back "no near-duplicate found", while the same
 * call carrying the body found it at 0.9984 similarity. A duplicate finder
 * that only reads titles finds duplicate titles.
 */

describe('the text the duplicates screen compares', () => {
  it('carries the body, not only the title', () => {
    const text = textOf({
      title: 'Reading on the 7:52',
      body: [
        {
          _key: 'b1',
          _type: 'block',
          style: 'normal',
          markDefs: [],
          children: [{ _key: 's1', _type: 'span', text: 'The platform was empty.', marks: [] }],
        },
      ],
    })

    expect(text).toContain('Reading on the 7:52')
    expect(text).toContain('The platform was empty.')
  })

  it('tells two entries apart when only their bodies differ', () => {
    const shared = { title: 'Letter', slug: 'letter' }
    const one = textOf({
      ...shared,
      body: [
        {
          _key: 'b1',
          _type: 'block',
          style: 'normal',
          markDefs: [],
          children: [{ _key: 's1', _type: 'span', text: 'A walk along the canal.', marks: [] }],
        },
      ],
    })
    const two = textOf({
      ...shared,
      body: [
        {
          _key: 'b1',
          _type: 'block',
          style: 'normal',
          markDefs: [],
          children: [{ _key: 's1', _type: 'span', text: 'Notes on rye bread.', marks: [] }],
        },
      ],
    })

    expect(one).not.toBe(two)
  })

  it('reads a plain-text body too, not only a rich-text one', () => {
    expect(textOf({ title: 'Note', body: 'Kept short on purpose.' })).toContain(
      'Kept short on purpose.',
    )
  })

  it('walks every span of a multi-paragraph body', () => {
    const text = textOf({
      body: [
        {
          _key: 'b1',
          _type: 'block',
          style: 'normal',
          markDefs: [],
          children: [{ _key: 's1', _type: 'span', text: 'First paragraph.', marks: [] }],
        },
        {
          _key: 'b2',
          _type: 'block',
          style: 'normal',
          markDefs: [],
          children: [{ _key: 's2', _type: 'span', text: 'Second paragraph.', marks: [] }],
        },
      ],
    })

    expect(text).toContain('First paragraph.')
    expect(text).toContain('Second paragraph.')
  })

  it('is empty for an entry with nothing to compare, rather than throwing', () => {
    expect(textOf({})).toBe('')
    expect(textOf({ title: '', body: null })).toBe('')
  })

  it('ignores a field that is neither text nor a rich-text document', () => {
    expect(textOf({ title: 'Kept', cover: { id: 'media-1' }, count: 7 })).toBe('Kept')
  })
})
