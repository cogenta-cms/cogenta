import { describe, expect, it } from 'vitest'
import { textOnlyContent } from '../../src/providers/content-parts.js'

describe('textOnlyContent', () => {
  it('passes a plain string through unchanged', () => {
    expect(textOnlyContent('hello')).toBe('hello')
  })

  it('passes undefined through unchanged', () => {
    expect(textOnlyContent(undefined)).toBeUndefined()
  })

  it('joins the text parts of a content-part array, dropping any image parts', () => {
    expect(
      textOnlyContent([
        { type: 'text', text: 'a' },
        { type: 'image', mediaType: 'image/png', data: 'ignored' },
        { type: 'text', text: 'b' },
      ]),
    ).toBe('ab')
  })

  it('returns an empty string for an image-only content-part array', () => {
    expect(textOnlyContent([{ type: 'image', mediaType: 'image/png', data: 'x' }])).toBe('')
  })
})
