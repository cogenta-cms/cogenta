import { type BlockRegistry, VOCABULARY_NAMES, type VocabularyBlock } from '@cogenta/blocks'
import {
  type FetchedEntries,
  type HtmlElement,
  h,
  type PageContent,
  pageHasOwnHeading,
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
import { isDocIndexBlock } from './doc-index.js'
import { renderDocPage } from './doc-page.js'
import { longDate } from './layout.js'
import { type HeadingAnchors, headingAnchors } from './rich-text.js'

export type { FetchedEntries, PageContent }

function renderResolved(
  block: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries,
  registry: BlockRegistry | undefined,
  anchors: HeadingAnchors,
): HtmlElement | null {
  // A stored block is not always literally one of the shared vocabulary:
  // resolving here turns an unimplemented theme-private block into its
  // declared fallback instead of a silently blank slot.
  const resolved = resolveBlockForRender(block, VOCABULARY_NAMES, registry)
  if (resolved === null) return null
  const known = resolved as unknown as VocabularyBlock
  // `variant` is envelope data every block carries identically, applied once
  // here rather than by each of the seventeen renderers.
  return withBlockVariant(renderKnownBlock(known, ctx, entries, anchors), known.variant)
}

export function renderBlock(
  block: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement | null {
  return renderResolved(block, ctx, entries, registry, headingAnchors([block]))
}

function renderKnownBlock(
  known: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries,
  anchors: HeadingAnchors,
): HtmlElement | null {
  switch (known._type) {
    case 'hero':
      return renderHero(known, ctx)
    case 'prose':
      return renderProse(known, ctx, anchors)
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
 * The opening of a page outside the documentation that has no hero: its
 * title, its summary, and the date it was published when it has one.
 */
function renderPageHead(page: PageContent, ctx: RenderContext): HtmlElement {
  const published = page.entry?.publishedAt
  return h(
    'header',
    { class: 'cd-page-head' },
    h(
      'div',
      { class: 'cd-container cd-page-head__inner' },
      h('h1', { class: 'cd-page-head__title' }, page.title),
      page.entry?.excerpt === undefined
        ? null
        : h('p', { class: 'cd-page-head__lead' }, page.entry.excerpt),
      published === undefined
        ? null
        : h(
            'p',
            { class: 'cd-page-head__meta' },
            h('time', { datetime: published }, longDate(published, ctx.locale)),
          ),
    ),
  )
}

/**
 * `<main id="cg-main">` is mandatory: it is the skip link's target, written
 * by the host outside any theme's control.
 *
 * A page whose first block is the documentation's own index on `doc_page` is
 * a documentation page (`doc-page.ts`); every other page is laid out on the
 * twelve-column grid. Exactly one `h1` on every page: a hero carries it when
 * there is one, the page head otherwise.
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
  const first = page.blocks[0]
  if (first !== undefined && isDocIndexBlock(first)) {
    return renderDocPage(page, ctx, first, entries, registry, renderResolved)
  }

  const anchors = headingAnchors(page.blocks)
  return h(
    'main',
    { class: 'cg-main cd-main', id: 'cg-main' },
    pageHasOwnHeading(page.blocks) ? null : renderPageHead(page, ctx),
    page.blocks.map((block) =>
      withBlockKey(renderResolved(block, ctx, entries, registry, anchors), block._key),
    ),
  )
}
