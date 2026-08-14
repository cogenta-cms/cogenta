import { describe, expect, it } from 'vitest'
import {
  convertContent,
  mediaUrlsOf,
  resolveMediaReferences,
} from '../../src/wordpress/content-convert.js'

describe('convertContent', () => {
  it('merges consecutive Gutenberg paragraphs into prose blocks', () => {
    const content =
      '<!-- wp:paragraph --><p>First.</p><!-- /wp:paragraph -->' +
      '<!-- wp:paragraph --><p>Second, with <strong>bold</strong> text.</p><!-- /wp:paragraph -->'
    const { blocks, notes } = convertContent(content)
    expect(notes).toEqual([])
    expect(blocks.map((b) => b._type)).toEqual(['prose', 'prose'])
    const first = blocks[0]
    if (first?._type !== 'prose') throw new Error('unreachable')
    expect(first.body[0]).toMatchObject({ _type: 'block', style: 'normal' })
  })

  it('converts a classic-editor post with no Gutenberg comments into one prose block', () => {
    // Classic content has no block boundaries at all — everything folds into
    // one prose block, using rich text's own `blockquote` style (contract A
    // already has one) rather than inventing a `quote` vocabulary block for
    // content that was never structured that way to begin with.
    const content =
      '<p>Hello <em>world</em>.</p><h2>A heading</h2><blockquote><p>Wise words.</p></blockquote>'
    const { blocks, notes } = convertContent(content)
    expect(notes).toEqual([])
    expect(blocks).toHaveLength(1)
    const [prose] = blocks
    if (prose?._type !== 'prose') throw new Error('unreachable')
    expect(prose.body.map((node) => (node._type === 'block' ? node.style : node._type))).toEqual([
      'normal',
      'h2',
      'blockquote',
    ])
  })

  it('converts a wp:image block into a mediaFigure block carrying the source URL', () => {
    const content =
      '<!-- wp:image {"id":12} --><figure class="wp-block-image"><img src="http://example.com/cat.jpg" alt="A cat"/><figcaption>A cat</figcaption></figure><!-- /wp:image -->'
    const { blocks, notes } = convertContent(content)
    expect(notes).toEqual([])
    expect(blocks).toHaveLength(1)
    const block = blocks[0]
    if (block?._type !== 'mediaFigure') throw new Error('unreachable')
    expect(block.media).toBe('http://example.com/cat.jpg')
    expect(block.caption).toBe('A cat')
  })

  it('converts a wp:gallery block into a gallery block with multiple items', () => {
    const content =
      '<!-- wp:gallery --><figure class="wp-block-gallery"><img src="http://example.com/a.jpg"/><img src="http://example.com/b.jpg"/></figure><!-- /wp:gallery -->'
    const { blocks } = convertContent(content)
    const block = blocks[0]
    if (block?._type !== 'gallery') throw new Error('unreachable')
    expect(block.items.map((item) => item.media)).toEqual([
      'http://example.com/a.jpg',
      'http://example.com/b.jpg',
    ])
  })

  it('converts a YouTube embed block, detecting the provider from the URL', () => {
    const content =
      '<!-- wp:embed {"url":"https://www.youtube.com/watch?v=abc123","type":"video","providerNameSlug":"youtube"} --><figure class="wp-embed-block"><div class="wp-block-embed__wrapper">https://www.youtube.com/watch?v=abc123</div></figure><!-- /wp:embed -->'
    const { blocks } = convertContent(content)
    const block = blocks[0]
    if (block?._type !== 'embed') throw new Error('unreachable')
    expect(block.provider).toBe('youtube')
    expect(block.consentRequired).toBe(true)
  })

  it('reports an unmappable custom Gutenberg block instead of storing raw HTML', () => {
    const content =
      '<!-- wp:my-plugin/custom-widget --><div class="weird">stuff</div><!-- /wp:my-plugin/custom-widget -->'
    const { blocks, notes } = convertContent(content)
    expect(blocks).toEqual([])
    expect(notes).toHaveLength(1)
    expect(notes[0]?.source).toBe('wp:my-plugin/custom-widget')
  })

  it('collects every media URL a set of blocks references', () => {
    const { blocks } = convertContent(
      '<!-- wp:image --><img src="http://example.com/a.jpg"/><!-- /wp:image -->' +
        '<!-- wp:gallery --><img src="http://example.com/b.jpg"/><img src="http://example.com/a.jpg"/><!-- /wp:gallery -->',
    )
    expect([...mediaUrlsOf(blocks)].sort()).toEqual([
      'http://example.com/a.jpg',
      'http://example.com/b.jpg',
    ])
  })

  it('resolveMediaReferences substitutes real ids and drops blocks whose media never downloaded', () => {
    const { blocks } = convertContent(
      '<!-- wp:image --><img src="http://example.com/ok.jpg"/><!-- /wp:image -->' +
        '<!-- wp:image --><img src="http://example.com/dead.jpg"/><!-- /wp:image -->',
    )
    const notes: { source: string; reason: string }[] = []
    const resolved = resolveMediaReferences(
      blocks,
      new Map([['http://example.com/ok.jpg', 'media-1']]),
      notes,
    )
    expect(resolved).toHaveLength(1)
    const [only] = resolved
    if (only?._type !== 'mediaFigure') throw new Error('unreachable')
    expect(only.media).toBe('media-1')
    expect(notes).toHaveLength(1)
  })
})
