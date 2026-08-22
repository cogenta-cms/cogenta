import type { VocabularyBlock } from '@cogenta/blocks'
import {
  type FetchedEntries,
  type HtmlElement,
  h,
  type PageContent,
  pageHasOwnHeading,
  type RenderContext,
  withBlockKey,
} from '@cogenta/theme-kit'
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
      // thirteenth block stops this package compiling until it is
      // implemented. `null`, not a throw — a theme has no `@cogenta/core`
      // error types to reach for (contract D refuses that import), and a
      // fallback block is the render layer's decision, not the theme's.
      const unreachable: never = block
      void unreachable
      return null
    }
  }
}

/**
 * Wraps every block in `<main id="cg-main">` — the skip link's anchor — and
 * marks each rendered block with its own `_key` (`withBlockKey`, mandatory:
 * it is what lets the L16 page builder map a clicked element on the real
 * rendered page back to the block that produced it). A page whose blocks
 * already carry a heading (a `hero`) gets no second `<h1>`.
 */
export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
): HtmlElement {
  return h(
    'main',
    { class: 'cg-main', id: 'cg-main' },
    pageHasOwnHeading(page.blocks) ? null : h('h1', { class: 'cg-page__title' }, page.title),
    page.blocks.map((block) => withBlockKey(renderBlock(block, ctx, entries), block._key)),
  )
}
