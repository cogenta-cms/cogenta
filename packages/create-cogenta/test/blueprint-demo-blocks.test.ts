import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import { ASSOCIATION_DEMO_PAGES } from '../src/blueprints/association.js'
import { BLOG_DEMO_PAGES } from '../src/blueprints/blog.js'
import { DOCUMENTATION_DEMO_PAGES } from '../src/blueprints/documentation.js'
import { MAGAZINE_DEMO_PAGES } from '../src/blueprints/magazine.js'
import { PORTFOLIO_DEMO_PAGES } from '../src/blueprints/portfolio.js'
// `restaurant`'s demo pages are built from `SeedContext.media` too (L25
// Phase 1) — `buildRestaurantDemoPages({})` renders the same pages this
// test checks, minus the (now media-dependent) hero/dish photos, which this
// test does not exercise.
import { buildRestaurantDemoPages } from '../src/blueprints/restaurant.js'
import { SAAS_DEMO_PAGES } from '../src/blueprints/saas.js'
// `store`'s demo pages are now built from `SeedContext.media` (L25 task
// A0b) — `buildStoreDemoPages({})` renders the same pages this test checked
// before, minus the (now media-dependent) hero image, which this test does
// not exercise.
import { buildStoreDemoPages } from '../src/blueprints/store.js'
import { VITRINE_DEMO_PAGES } from '../src/blueprints/vitrine.js'

const RESTAURANT_DEMO_PAGES = buildRestaurantDemoPages({})
const STORE_DEMO_PAGES = buildStoreDemoPages({})

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
/** The shape every blueprint's `*_DEMO_PAGES` shares. `store`'s is now the return of a function (`buildStoreDemoPages`, L25 task A0b) rather than an `as const` literal, so this record is typed explicitly instead of inferred — a mix of literal and widened array types otherwise defeats `Object.entries`' own inference below. */
interface DemoPage {
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

const BLUEPRINTS: Readonly<Record<string, readonly DemoPage[]>> = {
  association: ASSOCIATION_DEMO_PAGES,
  blog: BLOG_DEMO_PAGES,
  documentation: DOCUMENTATION_DEMO_PAGES,
  magazine: MAGAZINE_DEMO_PAGES,
  portfolio: PORTFOLIO_DEMO_PAGES,
  restaurant: RESTAURANT_DEMO_PAGES,
  saas: SAAS_DEMO_PAGES,
  store: STORE_DEMO_PAGES,
  vitrine: VITRINE_DEMO_PAGES,
}

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
