import type { VocabularyBlock } from '@cogenta/blocks'
import type { ContentEntry, RenderContext } from '../theme-contract.js'
import { renderCollectionList } from './blocks/collection-list.js'
import { renderCta } from './blocks/cta.js'
import { renderEmbed } from './blocks/embed.js'
import { renderFaq } from './blocks/faq.js'
import { renderFeatureGrid } from './blocks/feature-grid.js'
import { renderGallery } from './blocks/gallery.js'
import { renderHero } from './blocks/hero.js'
import { renderLogos } from './blocks/logos.js'
import { renderMediaFigure } from './blocks/media-figure.js'
import { renderProse } from './blocks/prose.js'
import { renderQuote } from './blocks/quote.js'
import { renderStats } from './blocks/stats.js'
import { type HtmlElement, h } from './html.js'

/**
 * Entries already fetched for the `collectionList` blocks on the page, by the
 * block's `_key`. Fetching happens in the Astro frontmatter, once per block,
 * before any markup is built — a renderer that could await would make the
 * number of round trips depend on the markup.
 */
export type FetchedEntries = Readonly<Record<string, readonly ContentEntry[]>>

export function renderBlock(
  block: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries = {},
): HtmlElement | null {
  switch (block._type) {
    case 'hero':
      return renderHero(block, ctx)
    case 'prose':
      return renderProse(block, ctx)
    case 'mediaFigure':
      return renderMediaFigure(block, ctx)
    case 'featureGrid':
      return renderFeatureGrid(block, ctx)
    case 'cta':
      return renderCta(block, ctx)
    case 'gallery':
      return renderGallery(block, ctx)
    case 'quote':
      return renderQuote(block, ctx)
    case 'faq':
      return renderFaq(block, ctx)
    case 'stats':
      return renderStats(block, ctx)
    case 'logos':
      return renderLogos(block, ctx)
    case 'collectionList':
      return renderCollectionList(block, ctx, entries[block._key] ?? [])
    case 'embed':
      return renderEmbed(block, ctx)
    default: {
      // Exhaustive over contract B's twelve: `block` is `never` here, so a
      // thirteenth block stops this package compiling until it is implemented.
      // Returning null rather than throwing is deliberate — a theme has no
      // access to `@cogenta/core`'s error types (contract D refuses the import),
      // and choosing a fallback block is the render layer's job, not the
      // theme's.
      const unreachable: never = block
      void unreachable
      return null
    }
  }
}

export interface PageContent {
  /** The entry's title. Rendered as the `h1` unless a hero already carries one. */
  readonly title: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * A page has exactly one `h1`.
 *
 * A `hero` declares `headingLevel: 'h1'` and renders the title itself, so the
 * layout must not render a second one; without a hero, nothing else on the page
 * would — `prose` starts at `h2` — and the page would have no `h1` at all.
 */
export function pageHasOwnHeading(blocks: readonly VocabularyBlock[]): boolean {
  return blocks.some((block) => block._type === 'hero')
}

export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
): HtmlElement {
  return h(
    'main',
    { class: 'cg-main', id: 'cg-main' },
    pageHasOwnHeading(page.blocks) ? null : h('h1', { class: 'cg-page__title' }, page.title),
    page.blocks.map((block) => renderBlock(block, ctx, entries)),
  )
}
