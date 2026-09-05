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
  // `withBlockVariant` (blocks@2.0, RFC 0002) is applied once here, after
  // dispatch, rather than inside each of the seventeen block renderers —
  // `variant` is envelope data every block carries identically, exactly the
  // same reasoning `withBlockKey` in `renderPage` already follows for `_key`.
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
      // is. Returning null rather than throwing is deliberate — a theme has
      // no access to `@cogenta/core`'s error types (contract D refuses the
      // import), and choosing a fallback is the render layer's job, not the
      // theme's.
      const unreachable: never = known
      void unreachable
      return null
    }
  }
}

/**
 * Dispatches the vocabulary's blocks into this theme's own markup and stamps
 * every rendered block with the key contract B minted for it (`withBlockKey`,
 * mandatory — it is what lets the visual page builder, L16, map a clicked
 * element back to the block that produced it, whatever theme is installed).
 *
 * `renderEntryHeader` (`theme@1.4`) draws the eyebrow/title/excerpt/meta/
 * cover furniture for a page backed by a real content entry — the store's
 * own `product` collection routes each item to its own page but declares
 * neither a `blocks` nor a `richText` field, so it reaches here with an
 * empty block list and `page.entry` is the *only* furniture such a page has:
 * a product's photo (`entryImage`'s `photo` convention) and its
 * `description` (`entryExcerpt`'s convention) both surface automatically.
 * It already returns `null` for a page with no `entry` meta *and* for one
 * whose blocks draw their own heading (a `hero`), so the bare
 * `<h1 class="ce-page__title">` fallback below is the right markup in both
 * of those cases and only those — never a double heading, and never a page
 * with none at all.
 *
 * `PageEntryMeta` has no room for a schema-specific field, so a product's
 * own page cannot show its `price`/`inStock`/`category` without a contract D
 * change (out of scope here, and not needed): every one of those already
 * has a real, prominent home on the product grid card
 * (`blocks/collection-list.ts`), which is where a shopper compares them
 * across products anyway — this is the theme's honest limit, not an
 * oversight.
 */
export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement {
  const entryHeader = renderEntryHeader(page, ctx)
  return h(
    'main',
    { class: 'ce-main', id: 'cg-main' },
    entryHeader,
    entryHeader === null && !pageHasOwnHeading(page.blocks)
      ? h('h1', { class: 'ce-page__title' }, page.title)
      : null,
    page.blocks.map((block) =>
      withBlockKey(renderBlock(block, ctx, entries, registry), block._key),
    ),
  )
}
