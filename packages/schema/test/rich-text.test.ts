import { describe, expect, it } from 'vitest'
import { RICH_TEXT_STYLES, richTextDocumentSchema } from '../src/rich-text.js'

function block(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _key: 'b1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 's1', _type: 'span', text: 'Hello', marks: [] }],
    markDefs: [],
    ...overrides,
  }
}

describe('rich text — the vocabulary', () => {
  it('offers normal, h2, h3, h4 and blockquote, and no h1', () => {
    expect(RICH_TEXT_STYLES).toEqual(['normal', 'h2', 'h3', 'h4', 'blockquote'])
  })

  it('refuses h1, which belongs to the page title alone', () => {
    expect(richTextDocumentSchema.safeParse([block({ style: 'h1' })]).success).toBe(false)
  })

  it('accepts an empty document', () => {
    expect(richTextDocumentSchema.parse([])).toEqual([])
  })

  it('accepts a nested list item', () => {
    const document = [block({ listItem: 'bullet', level: 2 })]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(true)
  })

  it('refuses a list nesting level below one', () => {
    expect(
      richTextDocumentSchema.safeParse([block({ listItem: 'bullet', level: 0 })]).success,
    ).toBe(false)
  })

  it('defaults the marks of a span to none, so an editor may omit them', () => {
    const parsed = richTextDocumentSchema.parse([
      block({ children: [{ _key: 's1', _type: 'span', text: 'Hello' }] }),
    ])

    expect(parsed[0]).toMatchObject({ _type: 'block' })
  })
})

describe('rich text — marks', () => {
  it('accepts the three decorators without a definition', () => {
    const document = [
      block({
        children: [{ _key: 's1', _type: 'span', text: 'Hi', marks: ['strong', 'em', 'code'] }],
      }),
    ]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(true)
  })

  it('refuses a mark that is neither a decorator nor a definition', () => {
    const document = [
      block({ children: [{ _key: 's1', _type: 'span', text: 'Hi', marks: ['underline'] }] }),
    ]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(false)
  })

  it('accepts an external link declared in markDefs', () => {
    const document = [
      block({
        children: [{ _key: 's1', _type: 'span', text: 'Hi', marks: ['m1'] }],
        markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.com', rel: 'nofollow' }],
      }),
    ]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(true)
  })

  it('references an entity for an internal link, never a URL', () => {
    const document = [
      block({
        children: [{ _key: 's1', _type: 'span', text: 'Hi', marks: ['m1'] }],
        markDefs: [{ _key: 'm1', _type: 'internalLink', collection: 'article', id: 'abc' }],
      }),
    ]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(true)
  })

  it('refuses an internal link given as an href, which renaming the target would break', () => {
    const document = [
      block({ markDefs: [{ _key: 'm1', _type: 'internalLink', href: '/blog/hello' }] }),
    ]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(false)
  })

  it('refuses an unknown kind of mark definition', () => {
    const document = [block({ markDefs: [{ _key: 'm1', _type: 'footnote', text: 'nope' }] })]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(false)
  })
})

describe('rich text — nodes and keys', () => {
  it('accepts a media node inside a document', () => {
    const document = [block(), { _key: 'm1', _type: 'media', id: 'abc', caption: 'A photo' }]

    expect(richTextDocumentSchema.safeParse(document).success).toBe(true)
  })

  it('refuses a node type outside the vocabulary', () => {
    expect(richTextDocumentSchema.safeParse([{ _key: 'x', _type: 'table' }]).success).toBe(false)
  })

  it('refuses HTML in place of a document, per ADR-0013', () => {
    expect(richTextDocumentSchema.safeParse('<p>Hello</p>').success).toBe(false)
  })

  it('refuses a node without a key, which diffs and comments depend on', () => {
    const withoutKey = block()
    delete withoutKey._key

    expect(richTextDocumentSchema.safeParse([withoutKey]).success).toBe(false)
  })

  it('refuses two nodes sharing a key, which would send a comment to the wrong block', () => {
    const document = [block({ _key: 'same' }), block({ _key: 'same' })]

    const result = richTextDocumentSchema.safeParse(document)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('duplicate _key')
  })

  it('refuses an unknown property on a block, which would smuggle in presentation', () => {
    expect(richTextDocumentSchema.safeParse([block({ className: 'lead' })]).success).toBe(false)
  })
})
