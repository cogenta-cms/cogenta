import { type BlockRegistry, VOCABULARY_NAMES, type VocabularyBlock } from '@cogenta/blocks'
import {
  type FetchedEntries,
  type HtmlElement,
  h,
  type PageContent,
  pageHasOwnHeading,
  type RenderContext,
  renderEntryHeader,
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

export type { FetchedEntries, PageContent }

export function renderBlock(
  block: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement | null {
  // `block`'s type says `VocabularyBlock`, but the value crossing this
  // boundary from stored content is not always literally one of the shared
  // vocabulary — resolving here is what turns an unimplemented theme-private
  // block into its declared fallback instead of a silently blank slot.
  const resolved = resolveBlockForRender(block, VOCABULARY_NAMES, registry)
  if (resolved === null) return null
  const known = resolved as unknown as VocabularyBlock
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
      // Exhaustive over contract B's vocabulary: `known` is `never` here, so
      // a block this package does not implement stops it compiling until it
      // is.
      const unreachable: never = known
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
 * the rendered iframe back to the block that produced it.
 *
 * A routed collection with no `blocks` field of its own — this theme's
 * `menu_item`, in particular — reaches here with an empty block list, so
 * `page.entry` (contract D `theme@1.4`) is what carries its furniture:
 * `renderEntryHeader` draws the title, excerpt (the dish's own
 * `description`, via `entryExcerpt`'s field-name convention) and cover
 * photo. `PageEntryMeta` has no room for a schema-specific field such as
 * `price`/`category`, so a menu item's own page cannot show them without a
 * contract D change — the theme's real, honest limit; the price and
 * category chip the brief also asks for are exactly what the home page's
 * `collectionList` menu already renders for every dish, and the item page
 * still links back there.
 */
/**
 * A second, theme-local stamp beside `withBlockKey`'s own `data-block-key`:
 * a real `id` attribute, so this theme's single-page navigation (the
 * blueprint's header/footer links into `#home-menu`/`#home-story`/etc.) has
 * something to scroll to. Contract B's `_key` is already guaranteed unique
 * within one page's block list (the reorder/diff identity every block
 * carries), so reusing it as the DOM id can never collide on a page this
 * theme rendered — safe to do generically, for every block, not only the
 * ones a blueprint happens to link to.
 */
function withAnchorId(element: HtmlElement | null, key: string): HtmlElement | null {
  if (element === null) return null
  return { ...element, attrs: { ...element.attrs, id: key } }
}

export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement {
  const heading = pageHasOwnHeading(page.blocks)
    ? null
    : (renderEntryHeader(page, ctx) ?? h('h1', { class: 'cg-page__title' }, page.title))
  return h(
    'main',
    { class: 'cg-main', id: 'cg-main' },
    heading,
    page.blocks.map((block) =>
      withAnchorId(
        withBlockKey(renderBlock(block, ctx, entries, registry), block._key),
        block._key,
      ),
    ),
  )
}
