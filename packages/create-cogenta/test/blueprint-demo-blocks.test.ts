import { parseBlocks } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import { ASSOCIATION_DEMO_PAGES } from '../src/blueprints/association.js'
import { BLOG_DEMO_PAGES } from '../src/blueprints/blog.js'
import { DOCUMENTATION_DEMO_PAGES } from '../src/blueprints/documentation.js'
import { MAGAZINE_DEMO_PAGES } from '../src/blueprints/magazine.js'
import { PORTFOLIO_DEMO_PAGES } from '../src/blueprints/portfolio.js'
import { RESTAURANT_DEMO_PAGES } from '../src/blueprints/restaurant.js'
import { SAAS_DEMO_PAGES } from '../src/blueprints/saas.js'
import { VITRINE_DEMO_PAGES } from '../src/blueprints/vitrine.js'

/**
 * Every demo page a blueprint seeds, validated against the real contract-B
 * registry.
 *
 * Nothing did this before: the demo blocks are written as object literals and
 * only typed as `VocabularyBlock`, which checks the field *names* but not the
 * constraints the contract actually enforces — a `faq` answer that is a string
 * rather than a rich-text document, a `stats` item over its length cap, or two
 * blocks sharing a `_key` all compiled and then failed at install time, on a
 * real user's machine, with the site half-seeded.
 *
 * `parseBlocks` is the same function the admin and the content store use, and
 * it refuses duplicate keys as well as invalid fields.
 */
const BLUEPRINTS = {
  association: ASSOCIATION_DEMO_PAGES,
  blog: BLOG_DEMO_PAGES,
  documentation: DOCUMENTATION_DEMO_PAGES,
  magazine: MAGAZINE_DEMO_PAGES,
  portfolio: PORTFOLIO_DEMO_PAGES,
  restaurant: RESTAURANT_DEMO_PAGES,
  saas: SAAS_DEMO_PAGES,
  vitrine: VITRINE_DEMO_PAGES,
} as const

describe('the demo content every blueprint seeds', () => {
  for (const [name, pages] of Object.entries(BLUEPRINTS)) {
    for (const page of pages) {
      it(`is valid contract-B content: ${name} / ${page.slug}`, () => {
        expect(() => parseBlocks([...page.blocks])).not.toThrow()
      })
    }
  }

  it('shows off more than a heading and a list, on every blueprint', () => {
    // The point of L12 task 6: a scaffolded site has to demonstrate the theme,
    // not just prove the renderer runs. Three block types is the floor — below
    // that a home page is a title and a list, whatever the stylesheet does.
    for (const [name, pages] of Object.entries(BLUEPRINTS)) {
      const types = new Set(pages.flatMap((page) => page.blocks.map((block) => block._type)))
      expect(types.size, `${name} seeds only ${[...types].join(', ')}`).toBeGreaterThanOrEqual(3)
    }
  })
})
