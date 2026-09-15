import type { VocabularyBlock } from '@cogenta/blocks'
import type { PageEntryMeta } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { isArticle } from '../src/render/article.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()

function render(type: keyof typeof BLOCKS): string {
  const node = renderBlock(BLOCKS[type], ctx, { 'b-collection': ENTRIES })
  expect(node, `${type} must render`).not.toBeNull()
  return node === null ? '' : serialize(node)
}

describe('the seventeen vocabulary blocks', () => {
  for (const block of ALL_BLOCKS) {
    it(`renders ${block._type} to stable markup`, () => {
      expect(render(block._type)).toMatchSnapshot()
    })
  }

  it('renders every block of the vocabulary, none returning null', () => {
    for (const block of ALL_BLOCKS) {
      expect(renderBlock(block, ctx, { 'b-collection': ENTRIES })).not.toBeNull()
    }
  })
})

describe('data that reaches the markup', () => {
  it('escapes angle brackets and ampersands coming from a block field', () => {
    const html = render('prose')
    expect(html).toContain('&amp; the &lt;foundry&gt; ledger.')
    expect(html).not.toContain('<foundry>')
  })

  it('nests a deeper list item inside the preceding item, not beside it', () => {
    expect(render('prose')).toContain(
      '<li>The matrices<ul><li>and the moulds that cast them</li></ul></li>',
    )
  })

  it('renders an internal link whose target could not be resolved as plain text, never a dead anchor', () => {
    const unresolved = makeContext({
      link: (target) => {
        if (typeof target === 'object' && 'collection' in target && target.id === 'guild')
          return '#'
        return ctx.link(target)
      },
    })
    const html = serialize(
      renderBlock(BLOCKS.prose, unresolved, { 'b-collection': ENTRIES }) as NonNullable<
        ReturnType<typeof renderBlock>
      >,
    )
    expect(html).toContain('<li>A binder willing to teach</li>')
    expect(html).not.toContain('href="#"')
  })
})

describe('the identity a rendered page carries back to its blocks', () => {
  it('stamps every placed block with the key contract B minted for it', () => {
    const html = serialize(
      renderPage({ title: 'Page', blocks: [BLOCKS.hero, BLOCKS.cta] }, ctx, {}),
    )
    expect(html).toContain(`data-block-key="${BLOCKS.hero._key}"`)
    expect(html).toContain(`data-block-key="${BLOCKS.cta._key}"`)
  })

  it('gives two blocks of the same type two different keys in the markup', () => {
    const second = { ...BLOCKS.cta, _key: 'cta-second' }
    const html = serialize(renderPage({ title: 'Page', blocks: [BLOCKS.cta, second] }, ctx, {}))
    expect(html).toContain('data-block-key="cta-second"')
  })

  it('names the field behind a plain-text element, and only where one element holds the whole value', () => {
    const hero = serialize(renderBlock(BLOCKS.hero, ctx) ?? { kind: 'text', value: '' })
    expect(hero).toContain('data-field="title"')
    expect(hero).toContain('data-field="subtitle"')
    const prose = serialize(renderBlock(BLOCKS.prose, ctx) ?? { kind: 'text', value: '' })
    expect(prose).not.toContain('data-field=')
  })

  it('adds no field marker to a block whose text lives in repeated list items', () => {
    const html = serialize(renderBlock(BLOCKS.stats, ctx) ?? { kind: 'text', value: '' })
    expect(html.match(/data-field="/gu)).toHaveLength(1)
  })
})

const ARTICLE: PageEntryMeta = {
  collection: 'article',
  publishedAt: '2026-09-13T07:00:00.000Z',
  excerpt: 'An 8-3 vote commits the city to a light rail line.',
  image: {
    kind: 'image',
    src: '/img/cover-1200.avif',
    srcset: '',
    width: 1200,
    height: 800,
    alt: 'City Hall',
    focal: null,
  },
  terms: [
    { taxonomy: 'section', label: 'News', href: '/section/news' },
    { taxonomy: 'author', label: 'Ruth Adebayo', href: '/author/ruth-adebayo' },
    { taxonomy: 'author', label: 'Tomas Lindqvist', href: '/author/tomas-lindqvist' },
    { taxonomy: 'tag', label: 'Transit', href: '/tag/transit' },
  ],
}

function article(blocks: readonly VocabularyBlock[], entry: PageEntryMeta = ARTICLE): string {
  return serialize(renderPage({ title: 'Council approves the Harbor Line', blocks, entry }, ctx))
}

describe('the article page', () => {
  it('opens on the section as a red kicker linking to its front', () => {
    expect(article([BLOCKS.prose])).toContain(
      '<p class="cg-article-head__kicker"><a class="cg-article-head__kicker-link" href="/section/news">News</a></p>',
    )
  })

  it('sets the headline as the one h1, then the standfirst', () => {
    const html = article([BLOCKS.prose])
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(
      /<h1 class="cg-article-head__title">Council approves the Harbor Line<\/h1><p class="cg-article-head__standfirst">/,
    )
  })

  it('sets the byline as a list of names, each linked to its archive, with no word of any language', () => {
    const html = article([BLOCKS.prose])
    expect(html).toContain(
      '<ul class="cg-byline"><li class="cg-byline__name"><a class="cg-byline__link" href="/author/ruth-adebayo">Ruth Adebayo</a></li><li class="cg-byline__name"><a class="cg-byline__link" href="/author/tomas-lindqvist">Tomas Lindqvist</a></li></ul>',
    )
    expect(html).not.toMatch(/>By\s/)
  })

  it('dates the article in the page locale, in a time element', () => {
    expect(article([BLOCKS.prose])).toContain(
      '<time class="cg-article-head__date" datetime="2026-09-13T07:00:00.000Z">September 13, 2026</time>',
    )
  })

  it('shows the cover under the byline when the body does not open with a photograph', () => {
    const html = article([BLOCKS.prose])
    expect(html).toContain('data-cover="image"')
    expect(html).toMatch(
      /<figure class="cg-article-head__cover"><img class="cg-article-head__image"[^>]*loading="eager"/,
    )
  })

  it('lets a body that opens with a captioned figure be the lead photograph instead of the cover', () => {
    const html = article([BLOCKS.mediaFigure, BLOCKS.prose])
    expect(html).toContain('data-cover="none"')
    expect(html).not.toContain('cg-article-head__cover')
    expect(html).toContain('cg-figure__credit')
  })

  it('marks only the first prose block as the one a drop cap may open', () => {
    const second = { ...BLOCKS.prose, _key: 'b-prose-2' }
    const html = article([BLOCKS.mediaFigure, BLOCKS.prose, BLOCKS.quote, second])
    expect(html.match(/data-opening="true"/g)).toHaveLength(1)
    expect(html).toMatch(/data-opening="true" data-block-key="b-prose"/)
  })

  it('lists at its foot only the terms that are neither the section nor a byline', () => {
    const html = article([BLOCKS.prose])
    const foot = html.slice(html.indexOf('cg-article-foot'))
    expect(foot).toContain('<a class="cg-article-foot__link" href="/tag/transit">Transit</a>')
    expect(foot).not.toContain('Ruth Adebayo')
    expect(foot).not.toContain('>News<')
  })

  it('renders no foot for an article filed only under a section and its writers', () => {
    const entry = {
      ...ARTICLE,
      terms: (ARTICLE.terms ?? []).filter((term) => term.taxonomy !== 'tag'),
    }
    expect(article([BLOCKS.prose], entry)).not.toContain('cg-article-foot')
  })

  it('falls back to the entry author as the byline when no byline term exists', () => {
    const entry: PageEntryMeta = {
      collection: 'post',
      publishedAt: '2026-09-13T07:00:00.000Z',
      author: { name: 'A. Writer' },
    }
    expect(article([BLOCKS.prose], entry)).toContain('<li class="cg-byline__name">A. Writer</li>')
  })

  it('shows a reading time only when it is long enough to be useful', () => {
    expect(article([BLOCKS.prose], { ...ARTICLE, readingMinutes: 6 })).toContain(
      '<span class="cg-article-head__reading-time">entry.readingTime</span>',
    )
    expect(article([BLOCKS.prose], { ...ARTICLE, readingMinutes: 1 })).not.toContain('reading-time')
  })

  it('never draws a second h1 when the article also opens with a hero', () => {
    const html = article([BLOCKS.hero])
    expect(html).not.toContain('cg-article-head')
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('decides what counts as an article from the entry alone', () => {
    expect(isArticle(undefined)).toBe(false)
    expect(isArticle({ collection: 'page', updatedAt: '2026-01-01T00:00:00.000Z' })).toBe(false)
    expect(isArticle({ collection: 'article', excerpt: 'A standfirst.' })).toBe(true)
    // A long About page has a reading time and is still a page, not a story.
    expect(isArticle({ collection: 'page', readingMinutes: 4 })).toBe(false)
  })
})

describe('the other openings', () => {
  it('sets the title of a page of running text over its reading column', () => {
    const html = serialize(renderPage({ title: 'About', blocks: [BLOCKS.prose] }, ctx))
    expect(html).toContain('<header class="cg-page-head" data-layout="text">')
    expect(html).toContain('<h1 class="cg-page-head__title">About</h1>')
    expect(html).not.toContain('cg-article-head')
  })

  it('sets the title of any other plain page as a section title', () => {
    const html = serialize(renderPage({ title: 'Plans', blocks: [BLOCKS.cta] }, ctx))
    expect(html).toContain('<header class="cg-page-head" data-layout="section">')
  })

  it('opens a page that starts on a listing as a front: the title in the outline, out of sight', () => {
    const html = serialize(
      renderPage({ title: 'Front page', blocks: [BLOCKS.collectionList, BLOCKS.cta] }, ctx, {
        'b-collection': ENTRIES,
      }),
    )
    expect(html).toContain(
      '<main class="cg-main cg-front-page" id="cg-main"><h1 class="cg-visually-hidden">Front page</h1>',
    )
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('renders without any theme@1.4 field, the bare title of a pre-1.4 host', () => {
    const html = serialize(renderPage({ title: 'Legacy', blocks: [BLOCKS.cta] }, ctx))
    expect(html).toContain('<h1 class="cg-page-head__title">Legacy</h1>')
  })
})
