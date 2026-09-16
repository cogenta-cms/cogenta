import { type BlockRegistry, VOCABULARY_NAMES, type VocabularyBlock } from '@cogenta/blocks'
import {
  type FetchedEntries,
  type HtmlElement,
  h,
  type PageContent,
  pageHasOwnHeading,
  providedBlockNode,
  type RenderContext,
  resolveBlockForRender,
  withBlockKey,
  withBlockVariant,
} from '@cogenta/theme-kit'
import { renderAccordion } from './blocks/accordion.js'
import { renderCollectionList } from './blocks/collection-list.js'
import { renderCta } from './blocks/cta.js'
import { renderEmbed } from './blocks/embed.js'
import { renderFaq } from './blocks/faq.js'
import { renderFeatureGrid } from './blocks/feature-grid.js'
import { renderGallery } from './blocks/gallery.js'
import { renderHero } from './blocks/hero.js'
import { renderLogoStrip } from './blocks/logo-strip.js'
import { renderLogos } from './blocks/logos.js'
import { renderMediaFigure } from './blocks/media-figure.js'
import { renderPricingTable } from './blocks/pricing-table.js'
import { renderProse } from './blocks/prose.js'
import { renderQuote } from './blocks/quote.js'
import { renderStatCounter } from './blocks/stat-counter.js'
import { renderStats } from './blocks/stats.js'
import { renderTestimonial } from './blocks/testimonial.js'
import { isProductPage, renderPageHeader, renderProductHeader } from './product.js'

export function renderBlock(
  block: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement | null {
  // A block a plugin provides arrives already rendered by the host, in a
  // process of its own (contract D theme@1.7). Nothing else in this theme
  // needs to know such blocks exist.
  const provided = providedBlockNode(block, ctx)
  if (provided !== null) return withBlockVariant(provided, block.variant)
  // A stored block is not always literally one of the shared vocabulary:
  // resolving here turns an unimplemented theme-private block into its
  // declared fallback instead of a silently blank slot.
  const resolved = resolveBlockForRender(block, VOCABULARY_NAMES, registry)
  if (resolved === null) return null
  const known = resolved as unknown as VocabularyBlock
  // `variant` is envelope data every block carries identically, applied once
  // here rather than by each of the seventeen renderers.
  return withBlockVariant(renderKnownBlock(known, ctx, entries), known.variant)
}

function renderKnownBlock(
  known: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries,
): HtmlElement | null {
  switch (known._type) {
    case 'hero':
      return renderHero(known, ctx)
    case 'prose':
      return renderProse(known, ctx)
    case 'mediaFigure':
      return renderMediaFigure(known, ctx)
    case 'featureGrid':
      return renderFeatureGrid(known, ctx)
    case 'cta':
      return renderCta(known, ctx)
    case 'gallery':
      return renderGallery(known, ctx)
    case 'quote':
      return renderQuote(known, ctx)
    case 'faq':
      return renderFaq(known, ctx)
    case 'stats':
      return renderStats(known, ctx)
    case 'logos':
      return renderLogos(known, ctx)
    case 'collectionList':
      return renderCollectionList(known, ctx, entries[known._key] ?? [])
    case 'embed':
      return renderEmbed(known, ctx)
    case 'testimonial':
      return renderTestimonial(known, ctx)
    case 'pricingTable':
      return renderPricingTable(known, ctx)
    case 'accordion':
      return renderAccordion(known, ctx)
    case 'statCounter':
      return renderStatCounter(known, ctx)
    case 'logoStrip':
      return renderLogoStrip(known, ctx)
    default: {
      // Exhaustive over contract B: `known` is `never` here, so a block this
      // package does not implement stops it compiling until it is. `null`
      // rather than a throw: choosing a fallback is the render layer's job.
      const unreachable: never = known
      void unreachable
      return null
    }
  }
}

/**
 * `<main id="cg-main">` is mandatory: it is the skip link's target, written
 * by the host outside any theme's control.
 *
 * Three openings, and exactly one `h1` in each:
 *
 * - a page whose blocks include a `hero` lets the hero carry the title;
 * - a product (`isProductPage`: its `theme@1.5` fields carry a price) gets the
 *   product sheet: photograph, price, stock, the honest action, details;
 * - anything else gets its title set large on the grid.
 *
 * A host older than `theme@1.5` sends no fields, so its product pages open
 * like any other page: title and description, never a price read from
 * somewhere it was not given.
 *
 * `withBlockKey` stamps every rendered block with its contract-B `_key`, so
 * the visual page builder (L16) can map a clicked element back to its block.
 */
export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement {
  const ownHeading = pageHasOwnHeading(page.blocks)
  const product = !ownHeading && isProductPage(page.entry) ? page.entry : undefined
  const opening = ownHeading
    ? null
    : product !== undefined
      ? renderProductHeader(page, product, ctx)
      : renderPageHeader(page, ctx)

  return h(
    'main',
    {
      class: product === undefined ? 'cg-main ce-main' : 'cg-main ce-main ce-main--product',
      id: 'cg-main',
    },
    opening,
    page.blocks.map((block) =>
      withBlockKey(renderBlock(block, ctx, entries, registry), block._key),
    ),
  )
}
