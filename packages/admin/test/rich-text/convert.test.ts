import { parseBlockWith, proseBlock, richTextDocumentSchema } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import { portableTextToSlate, slateToPortableText } from '../../src/rich-text/convert.js'
import type { RichTextDocument } from '../../src/rich-text/portable-text.js'
import type { CustomElement } from '../../src/rich-text/slate-types.js'

describe('portableTextToSlate', () => {
  it('falls back to a single empty paragraph for an empty document', () => {
    expect(portableTextToSlate([])).toEqual([{ type: 'paragraph', children: [{ text: '' }] }])
  })

  it('converts a plain paragraph', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'hello', marks: [] }],
        markDefs: [],
      },
    ]
    expect(portableTextToSlate(doc)).toEqual([{ type: 'paragraph', children: [{ text: 'hello' }] }])
  })

  it('converts headings and blockquotes by style', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'h2',
        children: [{ _key: 's1', _type: 'span', text: 'title', marks: [] }],
        markDefs: [],
      },
      {
        _key: 'b2',
        _type: 'block',
        style: 'blockquote',
        children: [{ _key: 's2', _type: 'span', text: 'quote', marks: [] }],
        markDefs: [],
      },
    ]
    const [heading, quote] = portableTextToSlate(doc)
    expect(heading).toEqual({ type: 'h2', children: [{ text: 'title' }] })
    expect(quote).toEqual({ type: 'blockquote', children: [{ text: 'quote' }] })
  })

  it('converts a list item, keeping its listType and level', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 2,
        children: [{ _key: 's1', _type: 'span', text: 'item', marks: [] }],
        markDefs: [],
      },
    ]
    expect(portableTextToSlate(doc)).toEqual([
      { type: 'list-item', listType: 'bullet', level: 2, children: [{ text: 'item' }] },
    ])
  })

  it('converts decorator marks to leaf props', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'bold', marks: ['strong'] }],
        markDefs: [],
      },
    ]
    expect(portableTextToSlate(doc)).toEqual([
      { type: 'paragraph', children: [{ text: 'bold', strong: true }] },
    ])
  })

  it('converts an external link mark into a wrapping inline element', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'click', marks: ['link1'] }],
        markDefs: [{ _key: 'link1', _type: 'link', href: 'https://example.com' }],
      },
    ]
    expect(portableTextToSlate(doc)).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            kind: 'external',
            href: 'https://example.com',
            children: [{ text: 'click' }],
          },
        ],
      },
    ])
  })

  it('converts an internal link mark into an internal-kind inline element', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'entry', marks: ['ref1'] }],
        markDefs: [{ _key: 'ref1', _type: 'internalLink', collection: 'page', id: 'entry-1' }],
      },
    ]
    expect(portableTextToSlate(doc)).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            kind: 'internal',
            collection: 'page',
            entryId: 'entry-1',
            children: [{ text: 'entry' }],
          },
        ],
      },
    ])
  })

  it('converts a media node into a void element', () => {
    const doc: RichTextDocument = [
      { _key: 'm1', _type: 'media', id: 'asset-1', caption: 'a caption' },
    ]
    expect(portableTextToSlate(doc)).toEqual([
      { type: 'media', mediaId: 'asset-1', caption: 'a caption', children: [{ text: '' }] },
    ])
  })

  it('converts a thematic break node into a void `hr` element (fiche 42 task 2)', () => {
    const doc: RichTextDocument = [{ _key: 'h1', _type: 'hr' }]
    expect(portableTextToSlate(doc)).toEqual([{ type: 'hr', children: [{ text: '' }] }])
  })

  it('converts the strikethrough decorator to a leaf prop (fiche 42 task 2)', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'old', marks: ['strikethrough'] }],
        markDefs: [],
      },
    ]
    expect(portableTextToSlate(doc)).toEqual([
      { type: 'paragraph', children: [{ text: 'old', strikethrough: true }] },
    ])
  })

  it('reconstructs a code block (L21 task 5) when every span is marked with `code` alone', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'const x = 1', marks: ['code'] }],
        markDefs: [],
      },
    ]
    expect(portableTextToSlate(doc)).toEqual([
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
    ])
  })

  it('does not read an ordinary paragraph containing an inline-code phrase as a code block', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [
          { _key: 's1', _type: 'span', text: 'run ', marks: [] },
          { _key: 's2', _type: 'span', text: 'npm test', marks: ['code'] },
        ],
        markDefs: [],
      },
    ]
    const [node] = portableTextToSlate(doc)
    expect(node).toMatchObject({ type: 'paragraph' })
  })

  it('does not read a `code`+`strong` span as a code block — the heuristic is `code` alone', () => {
    const doc: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'x', marks: ['code', 'strong'] }],
        markDefs: [],
      },
    ]
    const [node] = portableTextToSlate(doc)
    expect(node).toMatchObject({ type: 'paragraph' })
  })
})

describe('slateToPortableText', () => {
  it('round-trips a paragraph with a decorator and a link through both conversions', () => {
    const original: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [
          { _key: 's1', _type: 'span', text: 'bold ', marks: ['strong'] },
          { _key: 's2', _type: 'span', text: 'link text', marks: ['link1'] },
        ],
        markDefs: [{ _key: 'link1', _type: 'link', href: 'https://example.com' }],
      },
    ]

    const roundTripped = slateToPortableText(portableTextToSlate(original))

    expect(roundTripped).toHaveLength(1)
    const [block] = roundTripped
    if (block === undefined || block._type !== 'block') throw new Error('expected a block node')
    expect(block.style).toBe('normal')
    expect(block.children.map((span) => ({ text: span.text, marks: span.marks }))).toEqual([
      { text: 'bold ', marks: ['strong'] },
      { text: 'link text', marks: [block.markDefs[0]?._key] },
    ])
    expect(block.markDefs).toEqual([
      { _key: block.markDefs[0]?._key, _type: 'link', href: 'https://example.com' },
    ])
  })

  it('round-trips a bullet list item', () => {
    const nodes: CustomElement[] = [
      { type: 'list-item', listType: 'number', level: 3, children: [{ text: 'step' }] },
    ]
    const [block] = slateToPortableText(nodes)
    if (block === undefined || block._type !== 'block') throw new Error('expected a block node')
    expect(block.listItem).toBe('number')
    expect(block.level).toBe(3)
  })

  it('round-trips a media node', () => {
    const nodes: CustomElement[] = [{ type: 'media', mediaId: 'asset-2', children: [{ text: '' }] }]
    const [node] = slateToPortableText(nodes)
    if (node === undefined || node._type !== 'media') throw new Error('expected a media node')
    expect(node.id).toBe('asset-2')
    expect(node.caption).toBeUndefined()
  })

  it('round-trips a thematic break, carrying nothing but a fresh key (fiche 42 task 2)', () => {
    const nodes: CustomElement[] = [{ type: 'hr', children: [{ text: '' }] }]
    const [node] = slateToPortableText(nodes)
    if (node === undefined || node._type !== 'hr') throw new Error('expected an hr node')
    expect(node).toEqual({ _key: node._key, _type: 'hr' })
    expect(portableTextToSlate(slateToPortableText(nodes))).toEqual(nodes)
  })

  it('round-trips the strikethrough decorator (fiche 42 task 2)', () => {
    const nodes: CustomElement[] = [
      { type: 'paragraph', children: [{ text: 'old price', strikethrough: true }] },
    ]
    const [block] = slateToPortableText(nodes)
    if (block === undefined || block._type !== 'block') throw new Error('expected a block node')
    expect(block.children.map((span) => span.marks)).toEqual([['strikethrough']])
    expect(portableTextToSlate(slateToPortableText(nodes))).toEqual(nodes)
  })

  it('degrades a code block to an existing style/mark combination, never a new node (L21 task 5)', () => {
    const nodes: CustomElement[] = [{ type: 'code-block', children: [{ text: 'const x = 1' }] }]
    const [block] = slateToPortableText(nodes)
    if (block === undefined || block._type !== 'block') throw new Error('expected a block node')
    expect(block.style).toBe('normal')
    expect(block.listItem).toBeUndefined()
    expect(block.markDefs).toEqual([])
    expect(block.children).toEqual([
      { _key: block.children[0]?._key, _type: 'span', text: 'const x = 1', marks: ['code'] },
    ])
  })

  it('drops a link nested inside a code block to plain text rather than storing an href nowhere honest to put it', () => {
    const nodes: CustomElement[] = [
      {
        type: 'code-block',
        children: [
          { text: 'see ' },
          {
            type: 'link',
            kind: 'external',
            href: 'https://example.com',
            children: [{ text: 'here' }],
          },
        ],
      },
    ]
    const [block] = slateToPortableText(nodes)
    if (block === undefined || block._type !== 'block') throw new Error('expected a block node')
    expect(block.markDefs).toEqual([])
    expect(block.children.map((span) => span.text).join('')).toBe('see here')
    expect(
      block.children.every((span) => span.marks.length === 1 && span.marks[0] === 'code'),
    ).toBe(true)
  })

  it('round-trips an internal link', () => {
    const nodes: CustomElement[] = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            kind: 'internal',
            collection: 'author',
            entryId: 'a1',
            children: [{ text: 'Jane' }],
          },
        ],
      },
    ]
    const [block] = slateToPortableText(nodes)
    if (block === undefined || block._type !== 'block') throw new Error('expected a block node')
    expect(block.markDefs).toEqual([
      { _key: block.markDefs[0]?._key, _type: 'internalLink', collection: 'author', id: 'a1' },
    ])
  })

  it('round-trips a code block through both conversions unchanged (L21 task 5)', () => {
    const original: CustomElement[] = [
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
      { type: 'code-block', children: [{ text: 'return x + 1' }] },
    ]
    const roundTripped = portableTextToSlate(slateToPortableText(original))
    expect(roundTripped).toEqual(original)
  })
})

/**
 * The test the task asks for by name: proves the block-vocabulary output of
 * this editor — including the two new toolbar entries this lot adds
 * (ordered list already existed; the code block is new) — still validates
 * against the *real*, frozen contracts, not this admin's own idea of them.
 * `richTextDocumentSchema` is a `z.strictObject` union (contract A,
 * `packages/schema/src/rich-text.ts` / its `@cogenta/blocks` mirror): an
 * extra field, a stray `_type`, or literal HTML/CSS anywhere in a span's
 * `text` would fail this the same way a real save would (R3 — a block never
 * stores HTML or CSS).
 */
describe('contract compliance (@cogenta/blocks, the real validators)', () => {
  it('validates a document exercising every block-toolbar entry against the real richText schema', () => {
    const nodes: CustomElement[] = [
      { type: 'h2', children: [{ text: 'Title' }] },
      { type: 'blockquote', children: [{ text: 'A quote' }] },
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'bullet item' }] },
      { type: 'list-item', listType: 'number', level: 1, children: [{ text: 'numbered item' }] },
      // Not `<div class="...">` on purpose: `@cogenta/blocks`'s own
      // `plainTextSchema` (a stricter, temporary duplicate of contract A's
      // real span schema — see that file's own "TEMPORARY HOME" header)
      // refuses text shaped like an HTML tag anywhere in a block, which a
      // real code sample can legitimately contain. Pre-existing, unrelated
      // to this lot, and not this test's concern — `a < b` alone already
      // proves the same point (literal code text, never parsed as markup)
      // without tripping a check this file did not add.
      { type: 'code-block', children: [{ text: 'if (a < b) return a;' }] },
      {
        type: 'paragraph',
        children: [
          { text: 'bold ', strong: true },
          { text: 'italic', em: true },
          { text: ' old price', strikethrough: true },
          {
            type: 'link',
            kind: 'external',
            href: 'https://example.com',
            children: [{ text: 'a link' }],
          },
        ],
      },
      { type: 'hr', children: [{ text: '' }] },
    ]

    const document = slateToPortableText(nodes)
    const result = richTextDocumentSchema.safeParse(document)
    expect(result.success).toBe(true)

    // The `hr` node this test appends validates as the real `@cogenta/blocks`
    // vocabulary, not merely this admin's own idea of it.
    expect(document.some((node) => node._type === 'hr')).toBe(true)

    // The code block's own `<`/`>` characters survive as ordinary text, not
    // parsed as markup — the code-block degradation (`codeBlockSpans`) never
    // routes through any HTML-producing path.
    const codeNode = document.find(
      (node) => node._type === 'block' && node.children.some((span) => span.text.includes('a < b')),
    )
    expect(codeNode).toBeDefined()
  })

  it('validates as a real "prose" block (contract B) end to end, not just as loose richText', () => {
    const nodes: CustomElement[] = [
      { type: 'h2', children: [{ text: 'Title' }] },
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
      { type: 'list-item', listType: 'number', level: 1, children: [{ text: 'step one' }] },
    ]
    const body = slateToPortableText(nodes)

    const placed = parseBlockWith(proseBlock, {
      _key: 'block-1',
      _type: 'prose',
      _version: '1.0.0',
      body,
    })
    expect(placed.body).toEqual(body)
  })
})
