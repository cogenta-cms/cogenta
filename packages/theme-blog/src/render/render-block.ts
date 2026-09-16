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
import { isArticle, renderArticleFooter, renderArticleHeader, renderPageHeader } from './article.js'
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

export type { FetchedEntries, PageContent }

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
  // `variant` is envelope data every block carries identically, applied
  // once here rather than by each of the seventeen renderers.
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
 * by `@cogenta/cli`'s `theme-render.ts` outside any theme's control.
 *
 * Three openings, and exactly one `h1` in each:
 *
 * - a page whose blocks start with a `hero` lets the hero carry the title;
 * - an entry that carries what an essay has (`isArticle`) gets the essay
 *   header, and after its blocks the list of terms it is filed under;
 * - anything else gets its title set plainly on the text line.
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
  const article = !ownHeading && isArticle(page.entry) ? page.entry : undefined
  const opening = ownHeading
    ? null
    : article === undefined
      ? renderPageHeader(page)
      : renderArticleHeader(page, article, ctx)

  return h(
    'main',
    { class: article === undefined ? 'cg-main' : 'cg-main cg-article', id: 'cg-main' },
    opening,
    page.blocks.map((block) =>
      withBlockKey(renderBlock(block, ctx, entries, registry), block._key),
    ),
    article === undefined ? null : renderArticleFooter(article),
  )
}
