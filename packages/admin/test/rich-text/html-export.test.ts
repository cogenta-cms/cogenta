import { describe, expect, it } from 'vitest'
import { htmlToSlate, slateToHtml } from '../../src/rich-text/html-export.js'
import type { CustomElement } from '../../src/rich-text/slate-types.js'

/**
 * The HTML half of the source-view toggle (L21 task 5). `htmlToSlate` is a
 * thin wrapper over `paste-html.ts`'s own `htmlToSlateFragment` (already
 * covered by `paste-html.test.ts` for the clean-paste case) — these tests
 * focus on what `html-export.ts` itself adds: the encoder, and the two
 * import shapes (`<pre><code>`, `<img data-media-id>`) `paste-html.ts` gained
 * specifically so this file's own export round-trips.
 */

describe('slateToHtml', () => {
  it('renders headings, a blockquote and a paragraph', () => {
    const nodes: CustomElement[] = [
      { type: 'h2', children: [{ text: 'Title' }] },
      { type: 'blockquote', children: [{ text: 'A quote' }] },
      { type: 'paragraph', children: [{ text: 'Plain text.' }] },
    ]
    expect(slateToHtml(nodes)).toBe(
      '<h2>Title</h2>\n<blockquote><p>A quote</p></blockquote>\n<p>Plain text.</p>',
    )
  })

  it('nests strong/em/code marks and escapes special characters', () => {
    const nodes: CustomElement[] = [
      {
        type: 'paragraph',
        children: [
          { text: 'a < b && strong', strong: true },
          { text: ' & italic', em: true },
        ],
      },
    ]
    expect(slateToHtml(nodes)).toBe(
      '<p><strong>a &lt; b &amp;&amp; strong</strong><em> &amp; italic</em></p>',
    )
  })

  it('renders the strikethrough mark as `<s>` (fiche 42 task 2)', () => {
    const nodes: CustomElement[] = [
      { type: 'paragraph', children: [{ text: 'old price', strikethrough: true }] },
    ]
    expect(slateToHtml(nodes)).toBe('<p><s>old price</s></p>')
  })

  it('renders a thematic break as a bare `<hr>` (fiche 42 task 2)', () => {
    const nodes: CustomElement[] = [
      { type: 'paragraph', children: [{ text: 'before' }] },
      { type: 'hr', children: [{ text: '' }] },
      { type: 'paragraph', children: [{ text: 'after' }] },
    ]
    expect(slateToHtml(nodes)).toBe('<p>before</p>\n<hr>\n<p>after</p>')
  })

  it('groups consecutive list items into a real nested <ul>/<ol>', () => {
    const nodes: CustomElement[] = [
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'one' }] },
      { type: 'list-item', listType: 'bullet', level: 2, children: [{ text: 'nested' }] },
      { type: 'list-item', listType: 'bullet', level: 1, children: [{ text: 'two' }] },
    ]
    expect(slateToHtml(nodes)).toBe('<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>')
  })

  it('renders an ordered list with <ol>', () => {
    const nodes: CustomElement[] = [
      { type: 'list-item', listType: 'number', level: 1, children: [{ text: 'first' }] },
    ]
    expect(slateToHtml(nodes)).toBe('<ol><li>first</li></ol>')
  })

  it('groups consecutive code-block nodes into one <pre><code>', () => {
    const nodes: CustomElement[] = [
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
      { type: 'code-block', children: [{ text: 'return x < 2' }] },
    ]
    expect(slateToHtml(nodes)).toBe('<pre><code>const x = 1\nreturn x &lt; 2</code></pre>')
  })

  it('renders an internal link as data attributes, never a fabricated href', () => {
    const nodes: CustomElement[] = [
      {
        type: 'paragraph',
        children: [
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
    expect(slateToHtml(nodes)).toBe(
      '<p><a data-collection="page" data-entry-id="entry-1">internal</a></p>',
    )
  })

  it('renders a media node as an <img> carrying its media id, never a resolved URL', () => {
    const nodes: CustomElement[] = [
      { type: 'media', mediaId: 'asset-1', caption: 'A caption', children: [{ text: '' }] },
    ]
    expect(slateToHtml(nodes)).toBe(
      '<img data-media-id="asset-1" alt="A caption" data-caption="A caption">',
    )
  })
})

describe('htmlToSlate', () => {
  it('falls back to a single empty paragraph for unusable input', () => {
    expect(htmlToSlate('')).toEqual([{ type: 'paragraph', children: [{ text: '' }] }])
  })

  it('reads <pre><code> back into one code-block node per line', () => {
    expect(htmlToSlate('<pre><code>const x = 1\nreturn x</code></pre>')).toEqual([
      { type: 'code-block', children: [{ text: 'const x = 1' }] },
      { type: 'code-block', children: [{ text: 'return x' }] },
    ])
  })

  it('reads an <img data-media-id> back into a media void', () => {
    const nodes = htmlToSlate('<img data-media-id="asset-1" data-caption="A caption">')
    expect(nodes).toEqual([
      { type: 'media', mediaId: 'asset-1', caption: 'A caption', children: [{ text: '' }] },
    ])
  })

  it('reads `<s>` back into the strikethrough decorator (fiche 42 task 2)', () => {
    expect(htmlToSlate('<p><s>old price</s></p>')).toEqual([
      { type: 'paragraph', children: [{ text: 'old price', strikethrough: true }] },
    ])
  })

  it('reads a bare `<hr>` back into a thematic break node (fiche 42 task 2)', () => {
    expect(htmlToSlate('<p>before</p><hr><p>after</p>')).toEqual([
      { type: 'paragraph', children: [{ text: 'before' }] },
      { type: 'hr', children: [{ text: '' }] },
      { type: 'paragraph', children: [{ text: 'after' }] },
    ])
  })

  it('drops an ordinary <img> with no known media id — the toolbar insert path is the supported way in', () => {
    expect(htmlToSlate('<p>before</p><img src="https://example.com/x.png"><p>after</p>')).toEqual([
      { type: 'paragraph', children: [{ text: 'before' }] },
      { type: 'paragraph', children: [{ text: 'after' }] },
    ])
  })

  it('reads an internal-link data attribute pair back into an internal link element', () => {
    const nodes = htmlToSlate(
      '<p><a data-collection="page" data-entry-id="entry-1">internal</a></p>',
    )
    expect(nodes).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            kind: 'internal',
            collection: 'page',
            entryId: 'entry-1',
            children: [{ text: 'internal' }],
          },
        ],
      },
    ])
  })
})

describe('round trip', () => {
  it('is byte-stable for a document exercising every supported node and mark', () => {
    const original: CustomElement[] = [
      { type: 'h2', children: [{ text: 'Title' }] },
      {
        type: 'paragraph',
        children: [
          { text: 'bold', strong: true },
          { text: ' plain ' },
          { text: 'code', code: true },
          { text: ' struck', strikethrough: true },
        ],
      },
      { type: 'hr', children: [{ text: '' }] },
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

    const roundTripped = htmlToSlate(slateToHtml(original))
    expect(roundTripped).toEqual(original)
  })
})
