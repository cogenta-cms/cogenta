import type { RichTextDocument } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import type { RenderContext } from '../src/contract.js'
import { serializeAll } from '../src/html.js'
import { renderRichText } from '../src/rich-text.js'

/**
 * A minimal `RenderContext` — `renderRichText` never calls `t`/`content`, and
 * only calls `image` for a `media` node, which none of these documents use.
 */
function makeContext(): RenderContext {
  return {
    site: { name: 'Test site', url: 'https://example.test', locales: ['en'], defaultLocale: 'en' },
    locale: 'en',
    url: new URL('https://example.test/en/page'),
    t: (key) => key,
    image: () => {
      throw new Error('not exercised by this test')
    },
    link: () => '#',
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}

const ctx = makeContext()

/**
 * `renderRichText` is the one place, shared by every theme
 * (`@cogenta/theme-canonical` and the four site themes all import this exact
 * function rather than reimplementing it — see each of their own
 * `blocks/prose.ts`), so proving it here covers all five without repeating
 * the same fixture five times.
 */
describe('renderRichText — fiche 42 task 2 (strikethrough, thematic break)', () => {
  it('renders the strikethrough decorator as a semantic `<s>`, never `<del>`', () => {
    const document: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'no longer true', marks: ['strikethrough'] }],
        markDefs: [],
      },
    ]

    const html = serializeAll(renderRichText(ctx, document))

    expect(html).toBe('<p><s>no longer true</s></p>')
  })

  it('combines strikethrough with another mark, outermost mark first', () => {
    const document: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [
          { _key: 's1', _type: 'span', text: 'old price', marks: ['strikethrough', 'strong'] },
        ],
        markDefs: [],
      },
    ]

    const html = serializeAll(renderRichText(ctx, document))

    expect(html).toBe('<p><s><strong>old price</strong></s></p>')
  })

  it('renders a thematic break as a bare, void `<hr>`', () => {
    const document: RichTextDocument = [{ _key: 'h1', _type: 'hr' }]

    const html = serializeAll(renderRichText(ctx, document))

    expect(html).toBe('<hr class="cg-prose__rule">')
  })

  it('places a thematic break between two paragraphs without merging or dropping either', () => {
    const document: RichTextDocument = [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'before', marks: [] }],
        markDefs: [],
      },
      { _key: 'h1', _type: 'hr' },
      {
        _key: 'b2',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's2', _type: 'span', text: 'after', marks: [] }],
        markDefs: [],
      },
    ]

    const html = serializeAll(renderRichText(ctx, document))

    expect(html).toBe('<p>before</p><hr class="cg-prose__rule"><p>after</p>')
  })

  it('never asks `ctx.image` for a thematic break — it carries no media reference', () => {
    // `makeContext().image` throws if called; a document with only an `hr`
    // node reaching the end of this test without throwing is the proof.
    const document: RichTextDocument = [{ _key: 'h1', _type: 'hr' }]
    expect(() => serializeAll(renderRichText(ctx, document))).not.toThrow()
  })
})
