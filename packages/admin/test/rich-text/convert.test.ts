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
})
