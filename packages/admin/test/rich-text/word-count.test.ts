import { describe, expect, it } from 'vitest'
import type { RichTextDocument } from '../../src/rich-text/portable-text.js'
import { countText } from '../../src/rich-text/word-count.js'

function doc(...paragraphs: string[]): RichTextDocument {
  return paragraphs.map((text, index) => ({
    _key: `b${index}`,
    _type: 'block' as const,
    style: 'normal' as const,
    children: [{ _key: `s${index}`, _type: 'span' as const, text, marks: [] }],
    markDefs: [],
  }))
}

describe('countText', () => {
  it('counts zero words and characters for an empty document', () => {
    expect(countText([])).toEqual({ words: 0, characters: 0 })
  })

  it('counts a single paragraph', () => {
    expect(countText(doc('hello world'))).toEqual({ words: 2, characters: 11 })
  })

  it('sums across paragraphs', () => {
    expect(countText(doc('one two', 'three'))).toEqual({ words: 3, characters: 13 })
  })

  it('ignores a media node — it carries no counted text', () => {
    const document: RichTextDocument = [
      ...doc('caption text'),
      { _key: 'm1', _type: 'media', id: 'asset-1', caption: 'a photo' },
    ]
    // The caption is metadata about the image, not body text — only the
    // paragraph's own words are counted.
    expect(countText(document)).toEqual({ words: 2, characters: 12 })
  })

  it('counts a composed character (an accented letter) once, not per UTF-16 unit', () => {
    expect(countText(doc('café')).characters).toBe(4)
  })
})
