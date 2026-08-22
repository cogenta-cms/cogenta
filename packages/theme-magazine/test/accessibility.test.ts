import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../src/render/blocks/embed.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': ENTRIES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(
    renderPage({ title: 'The last hot-metal shop in the county', blocks }, ctx, entries),
  )
}

function block(value: VocabularyBlock): string {
  const node = renderBlock(value, ctx, entries)
  expect(node, `${value._type} must render`).not.toBeNull()
  return node === null ? '' : serialize(node)
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

describe('heading outline', () => {
  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain(
      '<h1 class="cg-page__title">The last hot-metal shop in the county</h1>',
    )
  })

  it('never skips a heading level', () => {
    const levels = headingLevels(FULL_PAGE)
    expect(levels.length).toBeGreaterThan(1)
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] as number
      const current = levels[index] as number
      expect(current, `h${previous} is followed by h${current}`).toBeLessThanOrEqual(previous + 1)
    }
  })

  it('starts rich text headings at h2, never at h1', () => {
    const prose = block(BLOCKS.prose)
    expect(prose).toContain('<h2>')
    expect(prose).not.toContain('<h1')
  })

  it('keeps a titleless block and its items on consecutive levels', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    expect(headingLevels(block(untitled))).toEqual([2, 2])
  })
})

describe('images', () => {
  const images = [...FULL_PAGE.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])

  it('renders at least one image, so the rule below is not vacuous', () => {
    expect(images.length).toBeGreaterThan(0)
  })

  it('never renders an image without an alt attribute', () => {
    for (const tag of images) {
      expect(tag, tag).toMatch(/\salt="/)
    }
  })

  it('names a press logo with the organisation when the media entity has no alt text', () => {
    expect(block(BLOCKS.logos)).toContain('alt="Acme Trade Weekly"')
  })

  it('keeps an empty alt on a decorative avatar rather than inventing one', () => {
    const html = block(BLOCKS.quote)
    expect(html).toContain('class="cg-pullquote__avatar"')
    expect(html).toMatch(/<img[^>]*class="cg-pullquote__avatar"[^>]*alt=""/)
  })
})

describe('zero client JavaScript', () => {
  it('emits no script tag, no inline handler and no javascript: URL', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('renders the contact-sheet carousel as a focusable, labelled scroll region', () => {
    const html = block(BLOCKS.gallery)
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="gallery.carousel"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders the mailbag with details and summary rather than a scripted accordion', () => {
    const html = block(BLOCKS.faq)
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })
})

describe('embed consent', () => {
  it('contacts no third party when consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('youtube-nocookie')
    expect(html).toContain('data-consent="required"')
  })

  it('frames the privacy-preserving host once consent is not required', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
    expect(html).not.toContain('www.youtube.com/embed')
  })

  it('gives every frame an accessible name', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toMatch(/<iframe[^>]*\stitle="/)
  })

  it('falls back to a link for a provider that would need a script', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'mastodon',
          url: 'https://m.example/@a/1',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('cg-sidenote__link')
  })
})
