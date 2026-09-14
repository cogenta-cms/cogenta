import type { VocabularyBlock } from '@cogenta/blocks'
import type { ImageSource, PageEntryMeta } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { isProject } from '../src/render/project.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, longProse, makeContext } from './fixtures.js'

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
    expect(html).toContain('&amp; a &lt;poster&gt; grid.')
    expect(html).not.toContain('<poster>')
  })

  it('nests a deeper list item inside the preceding item, not beside it', () => {
    expect(render('prose')).toContain(
      '<li>The name<ul><li>and the building behind it</li></ul></li>',
    )
  })

  it('renders an internal link whose target could not be resolved as plain text, never a dead anchor', () => {
    const unresolved = makeContext({
      link: (target) => {
        if (typeof target === 'object' && 'collection' in target && target.id === 'orchestra')
          return '#'
        return ctx.link(target)
      },
    })
    const html = serialize(
      renderBlock(BLOCKS.prose, unresolved, {}) as NonNullable<ReturnType<typeof renderBlock>>,
    )
    expect(html).toContain('<li>The orchestra</li>')
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

  it('doubles the key as an in-page anchor, so a menu can link into the page', () => {
    const html = serialize(renderPage({ title: 'Page', blocks: [BLOCKS.cta] }, ctx, {}))
    expect(html).toContain(`id="${BLOCKS.cta._key}"`)
  })

  it('gives two blocks of the same type two different keys in the markup', () => {
    const second = { ...BLOCKS.cta, _key: 'cta-second' }
    const html = serialize(renderPage({ title: 'Page', blocks: [BLOCKS.cta, second] }, ctx, {}))
    expect(html).toContain('data-block-key="cta-second"')
  })

  it('names the field behind a plain-text element, and only where one element holds the whole value', () => {
    const hero = render('hero')
    expect(hero).toContain('data-field="title"')
    expect(hero).toContain('data-field="subtitle"')
    expect(hero).toContain('data-field="eyebrow"')
    expect(render('prose')).not.toContain('data-field=')
  })

  it('adds no field marker to a block whose text lives in repeated list items', () => {
    expect(render('stats').match(/data-field="/g)).toHaveLength(1)
  })
})

const COVER: ImageSource = {
  kind: 'image',
  src: '/img/cover-2000.avif',
  srcset: '',
  width: 2000,
  height: 1333,
  alt: 'Three concert posters',
  focal: null,
}

const PROJECT: PageEntryMeta = {
  collection: 'project',
  publishedAt: '2025-09-01T09:00:00.000Z',
  excerpt: 'A season identity for a concert hall in Manchester.',
  image: COVER,
  terms: [
    { taxonomy: 'client', label: 'Rookery Hall', href: '/client/rookery-hall' },
    { taxonomy: 'disciplines', label: 'Identity', href: '/disciplines/identity' },
    { taxonomy: 'disciplines', label: 'Print and editorial', href: null },
    { taxonomy: 'team', label: 'Mara Lindgren', href: '/team/mara-lindgren' },
  ],
  readingMinutes: 4,
}

function withoutDate(entry: PageEntryMeta): PageEntryMeta {
  const { publishedAt: _p, ...rest } = entry
  return rest
}

function project(
  blocks: readonly VocabularyBlock[],
  entry: PageEntryMeta = PROJECT,
  locale = 'en',
): string {
  return serialize(
    renderPage({ title: 'The 2025/26 concert season', blocks, entry }, makeContext({ locale }), {}),
  )
}

describe('the project page', () => {
  it('decides what counts as a project from the entry alone: a cover, and not a plain page', () => {
    expect(isProject(undefined)).toBe(false)
    expect(isProject({ collection: 'page', image: COVER })).toBe(false)
    expect(isProject({ collection: 'project' })).toBe(false)
    expect(isProject(PROJECT)).toBe(true)
  })

  it('marks the main element as a project, for the two-column case study', () => {
    expect(project([BLOCKS.prose])).toContain('<main class="cg-main cg-project" id="cg-main">')
  })

  it('sets the title as the one h1, then the statement', () => {
    const html = project([BLOCKS.prose])
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain(
      '<h1 class="cg-project-head__title">The 2025/26 concert season</h1><p class="cg-project-head__statement">A season identity for a concert hall in Manchester.</p>',
    )
  })

  it('shows the cover as the lead visual, loaded eagerly', () => {
    expect(project([BLOCKS.prose])).toMatch(
      /<figure class="cg-project-head__lead"><img class="cg-project-head__image" src="\/img\/cover-2000\.avif"[^>]*loading="eager"/,
    )
  })

  it('sets the fact sheet after the lead visual, the year first, labelled in the page language', () => {
    const html = project([BLOCKS.prose])
    expect(html.indexOf('cg-project-head__lead')).toBeLessThan(html.indexOf('cg-facts'))
    expect(html).toContain(
      '<div class="cg-facts__item" data-fact="year"><dt class="cg-facts__label">Year</dt><dd class="cg-facts__values"><ul class="cg-facts__list"><li class="cg-facts__value"><time datetime="2025-09-01T09:00:00.000Z">2025</time></li></ul></dd></div>',
    )
    expect(project([BLOCKS.prose], PROJECT, 'fr')).toContain(
      '<dt class="cg-facts__label">Année</dt>',
    )
  })

  it('gives every taxonomy one column, labelled with its own name, its terms linked to their archives', () => {
    const html = project([BLOCKS.prose])
    expect(html).toContain('<dl class="cg-facts" data-count="4">')
    expect(html).toContain(
      '<div class="cg-facts__item" data-fact="client"><dt class="cg-facts__label">Client</dt>',
    )
    expect(html).toContain(
      '<li class="cg-facts__value"><a class="cg-facts__link" href="/disciplines/identity">Identity</a></li><li class="cg-facts__value">Print and editorial</li>',
    )
    expect(html).toContain('<dt class="cg-facts__label">Disciplines</dt>')
    expect(html).toContain('<dt class="cg-facts__label">Team</dt>')
  })

  it('writes no word of its own into the fact sheet but the platform’s name for a year', () => {
    const html = project([BLOCKS.prose], withoutDate(PROJECT))
    expect(html).not.toContain('data-fact="year"')
    expect(html).not.toMatch(/>(Services|Credits|Details)</)
  })

  it('renders no fact sheet at all for a project with no date and no terms', () => {
    const { publishedAt: _date, terms: _terms, ...bare } = PROJECT
    expect(project([BLOCKS.prose], bare)).not.toContain('cg-facts')
  })

  it('shows no reading time: a case study is looked at, not timed', () => {
    expect(project([BLOCKS.prose])).not.toContain('reading')
  })

  it('never draws a second h1 when the project also opens with a hero', () => {
    const html = project([BLOCKS.hero])
    expect(html).not.toContain('cg-project-head')
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('sets a long text in two columns and keeps a short one in one', () => {
    const html = project([longProse('b-long', 140), longProse('b-short', 40)])
    expect(html).toMatch(/data-length="long" data-block-key="b-long"/)
    expect(html).toMatch(/data-length="short" data-block-key="b-short"/)
  })

  it('moves an opening subhead into the label column of its text', () => {
    const html = project([longProse('b-long', 140)])
    expect(html).toContain(
      '<div class="cg-prose__label"><h2>The brief</h2></div><div class="cg-prose__body"><p>',
    )
  })
})

describe('the other openings', () => {
  it('sets the title of a plain page large on the grid', () => {
    const html = serialize(renderPage({ title: 'Studio', blocks: [BLOCKS.prose] }, ctx))
    expect(html).toContain(
      '<header class="cg-page-head"><div class="cg-container cg-page-head__inner"><h1 class="cg-page-head__title">Studio</h1></div></header>',
    )
    expect(html).not.toContain('cg-project')
  })

  it('treats an entry of the page collection as a page, even with an image', () => {
    const html = serialize(
      renderPage(
        { title: 'Studio', blocks: [BLOCKS.prose], entry: { collection: 'page', image: COVER } },
        ctx,
      ),
    )
    expect(html).toContain('cg-page-head__title')
    expect(html).not.toContain('cg-project-head')
  })

  it('lets a hero carry the title on a home page', () => {
    const html = serialize(renderPage({ title: 'Home', blocks: [BLOCKS.hero] }, ctx))
    expect(html).not.toContain('cg-page-head')
    expect(html).toContain('<h1 class="cg-statement__title" data-field="title">')
  })

  it('renders without any theme@1.4 field, the bare title of a pre-1.4 host', () => {
    const html = serialize(renderPage({ title: 'Legacy', blocks: [BLOCKS.cta] }, ctx))
    expect(html).toContain('<h1 class="cg-page-head__title">Legacy</h1>')
  })

  it('always renders main with the id the skip link targets', () => {
    expect(serialize(renderPage({ title: 'Empty', blocks: [] }, ctx))).toMatch(
      /^<main class="cg-main" id="cg-main">/,
    )
  })
})
