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

export type { FetchedEntries, PageContent }

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
      // implemented. Returning null rather than throwing is deliberate — a
      // theme has no access to `@cogenta/core`'s error types (contract D
      // refuses the import), and choosing a fallback block is the render
      // layer's job, not the theme's.
      const unreachable: never = block
      void unreachable
      return null
    }
  }
}

/**
 * `<main id="cg-main">` is mandatory: it is the skip-link's target, written
 * once by `@cogenta/cli`'s `theme-render.ts` outside any theme's control.
 *
 * `withBlockKey` stamps every rendered block with its contract-B `_key` —
 * required so the visual page builder (L16) can map a clicked element in
 * the rendered iframe back to the block that produced it, for this theme
 * exactly as for every other one.
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
