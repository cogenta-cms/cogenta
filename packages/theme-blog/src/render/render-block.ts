import { type BlockRegistry, VOCABULARY_NAMES, type VocabularyBlock } from '@cogenta/blocks'
import {
  type FetchedEntries,
  type HtmlElement,
  h,
  type PageContent,
  type PageEntryMeta,
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
      const unreachable: never = known
      void unreachable
      return null
    }
  }
}

/**
 * A quiet "back to home / more in this topic" strip after a post's own
 * content. Never invented data: the topic link is the first of the entry's
 * own already-resolved taxonomy terms that carries a live archive href — the
 * same terms `renderEntryHeader`'s own eyebrow shows — so a post with no
 * resolvable term prints only the "back to home" link rather than a link to
 * a page that does not exist. Never dynamic: `renderPage` is synchronous, so
 * this is never a "related posts" query.
 */
function renderPostFooter(entry: PageEntryMeta, ctx: RenderContext): HtmlElement {
  const topic = entry.terms?.find((term) => term.href !== null)
  return h(
    'nav',
    { class: 'cg-post-footer', 'aria-label': 'More from this blog' },
    h('a', { class: 'cg-post-footer__link', href: ctx.link('/') }, '← Back to home'),
    topic === undefined
      ? null
      : h(
          'a',
          { class: 'cg-post-footer__link', href: topic.href as string },
          `More in ${topic.label}`,
        ),
  )
}

/**
 * `<main id="cg-main">` is mandatory — the skip-link target written by
 * `@cogenta/cli`'s `theme-render.ts`.
 *
 * A page carrying `entry` (contract D `theme@1.4`) gets `renderEntryHeader`'s
 * furniture — eyebrow terms, title, excerpt, date/author/reading-time meta,
 * cover — instead of the bare `<h1>` every other page falls back to;
 * `renderEntryHeader` itself returns `null` for a `blocks`-only page (e.g.
 * `about`, which carries no `entry`) or one that already draws its own
 * heading, so the bare-title fallback still applies there, exactly as in
 * every other theme.
 */
export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement {
  const ownHeading = pageHasOwnHeading(page.blocks)
  const entryHeader = ownHeading ? null : renderEntryHeader(page, ctx)
  return h(
    'main',
    { class: 'cg-main', id: 'cg-main' },
    ownHeading ? null : (entryHeader ?? h('h1', { class: 'cg-page__title' }, page.title)),
    page.blocks.map((block) =>
      withBlockKey(renderBlock(block, ctx, entries, registry), block._key),
    ),
    !ownHeading && entryHeader !== null && page.entry !== undefined
      ? renderPostFooter(page.entry, ctx)
      : null,
  )
}
