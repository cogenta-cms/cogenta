import { describe, expect, it } from 'vitest'
import { markdownToSlate, slateToMarkdown } from '../../src/rich-text/markdown.js'
import type { CustomElement } from '../../src/rich-text/slate-types.js'

/**
 * The Markdown half of the source-view toggle (L21 task 5). Scoped to the
 * closed grammar `markdown.ts`'s own header documents — every assertion here
 * either encodes a real document to text or decodes real text to a document,
 * never both blindly assuming a byte-identical string survives (Markdown has
 * more than one valid spelling of the same document, e.g. `_em_` vs `*em*`).
 */

describe('slateToMarkdown', () => {
  it('encodes headings, a blockquote and a paragraph', () => {
    const nodes: CustomElement[] = [
      { type: 'h2', children: [{ text: 'Title' }] },
      { type: 'blockquote', children: [{ text: 'A quote' }] },
      { type: 'paragraph', children: [{ text: 'Plain text.' }] },
    ]
    expect(slateToMarkdown(nodes)).toBe('## Title\n\n> A quote\n\nPlain text.')
  })

  it('encodes marks, combining bold and italic', () => {
    const nodes: CustomElement[] = [
      {
        type: 'paragraph',
        children: [
          { text: 'bold ', strong: true },
          { text: 'italic ', em: true },
          { text: 'both', strong: true, em: true },
          { text: ' code', code: true },
        ],
      },
    ]
    expect(slateToMarkdown(nodes)).toBe('**bold **_italic __**both**_` code`')
  })

  it('groups consecutive list items of the same run without blank lines between them, indenting by level', () => {
    const nodes: CustomElement[] = [
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'one' }] },
      { type: 'list-item', listType: 'bullet', level: 2, children: [{ text: 'nested' }] },
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'two' }] },
    ]
    expect(slateToMarkdown(nodes)).toBe('- one\n  - nested\n- two')
  })

  it('groups consecutive code-block nodes into a single fenced block', () => {
    const nodes: CustomElement[] = [
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
      { type: 'code-block', children: [{ text: 'return x' }] },
    ]
    expect(slateToMarkdown(nodes)).toBe('```\nconst x = 1\nreturn x\n```')
  })

  it('encodes an external and an internal link through the same syntax, distinguished by a pseudo-scheme', () => {
    const nodes: CustomElement[] = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            kind: 'external',
            href: 'https://example.com',
            children: [{ text: 'external' }],
          },
          { text: ' and ' },
          {
            type: 'link',
            kind: 'internal',
            collection: 'page',
            entryId: 'entry-1',
            children: [{ text: 'internal' }],
          },
        ],
      },
    ]
    expect(slateToMarkdown(nodes)).toBe(
      '[external](https://example.com) and [internal](cogenta-entry:page/entry-1)',
    )
  })

  it('encodes a media node with its own pseudo-scheme, since a media void has no URL to write client-side', () => {
    const nodes: CustomElement[] = [
      { type: 'media', mediaId: 'asset-1', caption: 'A caption', children: [{ text: '' }] },
    ]
    expect(slateToMarkdown(nodes)).toBe('![A caption](cogenta-media:asset-1)')
  })

  it('escapes a paragraph whose text would otherwise read back as a block marker', () => {
    const nodes: CustomElement[] = [{ type: 'paragraph', children: [{ text: '# not a heading' }] }]
    const markdown = slateToMarkdown(nodes)
    expect(markdown).toBe('\\# not a heading')
    expect(markdownToSlate(markdown)).toEqual([
      { type: 'paragraph', children: [{ text: '# not a heading' }] },
    ])
  })
})

describe('markdownToSlate', () => {
  it('falls back to a single empty paragraph for empty input', () => {
    expect(markdownToSlate('')).toEqual([{ type: 'paragraph', children: [{ text: '' }] }])
  })

  it('parses headings by level', () => {
    expect(markdownToSlate('## H2\n\n### H3\n\n#### H4')).toEqual([
      { type: 'h2', children: [{ text: 'H2' }] },
      { type: 'h3', children: [{ text: 'H3' }] },
      { type: 'h4', children: [{ text: 'H4' }] },
    ])
  })

  it('parses a blockquote and a bulleted/numbered list', () => {
    expect(markdownToSlate('> quoted\n\n- a\n- b\n\n1. first\n2. second')).toEqual([
      { type: 'blockquote', children: [{ text: 'quoted' }] },
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'a' }] },
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'b' }] },
      { type: 'list-item', listType: 'number', level: 1, children: [{ text: 'first' }] },
      { type: 'list-item', listType: 'number', level: 1, children: [{ text: 'second' }] },
    ])
  })

  it('parses nested list levels from leading indentation', () => {
    const nodes = markdownToSlate('- one\n  - nested')
    expect(nodes).toEqual([
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'one' }] },
      { type: 'list-item', listType: 'bullet', level: 2, children: [{ text: 'nested' }] },
    ])
  })

  it('parses a fenced code block into one code-block node per line', () => {
    expect(markdownToSlate('```\nconst x = 1\nreturn x\n```')).toEqual([
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
      { type: 'code-block', children: [{ text: 'return x' }] },
    ])
  })

  it('parses combined bold+italic and inline code, including nesting', () => {
    const nodes = markdownToSlate('**_both_** and `code`')
    expect(nodes).toEqual([
      {
        type: 'paragraph',
        children: [
          { text: 'both', strong: true, em: true },
          { text: ' and ' },
          { text: 'code', code: true },
        ],
      },
    ])
  })

  it('parses a link with the internal pseudo-scheme back into an internal link element', () => {
    const nodes = markdownToSlate('[label](cogenta-entry:page/entry-1)')
    expect(nodes).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            kind: 'internal',
            collection: 'page',
            entryId: 'entry-1',
            children: [{ text: 'label' }],
          },
        ],
      },
    ])
  })

  it('parses an image with the media pseudo-scheme back into a media void', () => {
    const nodes = markdownToSlate('![A caption](cogenta-media:asset-1)')
    expect(nodes).toEqual([
      { type: 'media', mediaId: 'asset-1', caption: 'A caption', children: [{ text: '' }] },
    ])
  })

  it('joins consecutive plain lines into one paragraph, the ordinary Markdown paragraph rule', () => {
    expect(markdownToSlate('line one\nline two')).toEqual([
      { type: 'paragraph', children: [{ text: 'line one line two' }] },
    ])
  })

  it('unescapes a backslash-escaped special character', () => {
    expect(markdownToSlate('not \\*bold\\*')).toEqual([
      { type: 'paragraph', children: [{ text: 'not *bold*' }] },
    ])
  })
})

describe('round trip', () => {
  it('is stable for a document exercising every supported node and mark', () => {
    const original: CustomElement[] = [
      { type: 'h2', children: [{ text: 'Title' }] },
      {
        type: 'paragraph',
        children: [
          { text: 'bold ', strong: true },
          { text: 'italic ', em: true },
          { text: 'code', code: true },
        ],
      },
      { type: 'blockquote', children: [{ text: 'a quote' }] },
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'item one' }] },
      { type: 'list-item', listType: 'bullet', level: 2, children: [{ text: 'nested' }] },
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
      { type: 'code-block', children: [{ text: 'return x' }] },
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            kind: 'external',
            href: 'https://example.com',
            children: [{ text: 'a link' }],
          },
        ],
      },
      { type: 'media', mediaId: 'asset-1', caption: 'a caption', children: [{ text: '' }] },
    ]

    const roundTripped = markdownToSlate(slateToMarkdown(original))
    expect(roundTripped).toEqual(original)
  })
})
