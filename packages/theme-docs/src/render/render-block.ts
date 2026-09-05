import { type BlockRegistry, VOCABULARY_NAMES, type VocabularyBlock } from '@cogenta/blocks'
import {
  type ContentEntry,
  entryHref,
  entryTitle,
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
 * The name every doc page's own blueprint-seeded sidebar `collectionList`
 * targets — checked structurally (first block, this collection) rather than
 * by any flag on the block, because contract B carries no "this is chrome,
 * not content" bit and inventing one would be a contract change for a
 * single theme's layout choice.
 */
const DOC_PAGE_COLLECTION = 'doc_page'

function isDocSidebarBlock(block: VocabularyBlock): boolean {
  return block._type === 'collectionList' && block.collection === DOC_PAGE_COLLECTION
}

/** The sidebar entry whose own link resolves to the page being rendered — the "current page" the brief asks the sidebar to highlight and the breadcrumb to name. */
function findCurrentEntry(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
): ContentEntry | undefined {
  return entries.find((entry) => entryHref(entry, ctx) === ctx.url.pathname)
}

/**
 * The doc-page sidebar — grouped by each entry's own `section` field, in the
 * order the entries were fetched (the blueprint seeds them in `order`
 * within a section already; `collectionList.sort` cannot name `section`/
 * `order`, so an editor who reorders sections relies on the fetch order,
 * exactly like the "All guides" index on the home page does).
 */
function renderSidebarPanel(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  currentHref: string,
): HtmlElement {
  const groups = new Map<string, ContentEntry[]>()
  for (const entry of entries) {
    const section =
      typeof entry.section === 'string' && entry.section !== ''
        ? entry.section
        : ctx.t('entry.untitled')
    const list = groups.get(section) ?? []
    list.push(entry)
    groups.set(section, list)
  }

  return h(
    'nav',
    { class: 'cg-docs__nav-panel', 'aria-label': 'Documentation' },
    [...groups.entries()].map(([section, sectionEntries]) =>
      h(
        'div',
        { class: 'cg-docs__nav-group' },
        h('p', { class: 'cg-docs__nav-heading' }, section),
        h(
          'ul',
          { class: 'cg-docs__nav-items' },
          sectionEntries.map((entry) => {
            const href = entryHref(entry, ctx)
            const isCurrent = href === currentHref
            return h(
              'li',
              {},
              h(
                'a',
                {
                  class: 'cg-docs__nav-link',
                  href,
                  'aria-current': isCurrent ? 'page' : undefined,
                },
                entryTitle(entry, ctx),
              ),
            )
          }),
        ),
      ),
    ),
  )
}

/**
 * The sidebar, in two copies — the same zero-JS technique `chrome.ts` already
 * uses for the header's own mobile menu, and for the same reason: Chrome (and
 * every other engine implementing the current HTML rendering rules) hides a
 * closed `<details>`'s non-summary content through its own internal
 * `::details-content` box, not through the plain CSS `display: none` the spec
 * text describes — so a stylesheet rule that sets `display: block` on that
 * content, however specific, does not reliably bring it back while the
 * element itself stays closed. Verified live: a build with a single
 * `<details>` forced open only above the two-column breakpoint rendered an
 * empty sidebar column at 1280px in a real Chrome tab, despite every
 * computed style reporting `display: block`.
 *
 * The fix is the same one already proven for the header: a plain, always-
 * live `<nav>` for the desktop column (nothing to collapse, so nothing for
 * the browser to hide), and a **separate** `<details>` disclosure — a full
 * second copy of the same panel — for narrow viewports. Exactly one of the
 * two is ever `display: block` at a given viewport width (`base.css`), so a
 * screen reader is never offered two "Documentation" navigations at once,
 * matching the header's own accessibility guarantee.
 */
function renderSidebar(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  currentHref: string,
): HtmlElement {
  return h('div', { class: 'cg-docs__nav-desktop' }, renderSidebarPanel(entries, ctx, currentHref))
}

function renderSidebarMobile(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  currentHref: string,
): HtmlElement {
  return h(
    'details',
    { class: 'cg-docs__nav-mobile' },
    h('summary', { class: 'cg-docs__nav-toggle' }, 'On this site'),
    renderSidebarPanel(entries, ctx, currentHref),
  )
}

function renderBreadcrumb(section: string | undefined, title: string): HtmlElement {
  return h(
    'nav',
    { class: 'cg-docs__breadcrumb', 'aria-label': 'Breadcrumb' },
    h(
      'ol',
      {},
      section === undefined ? null : h('li', {}, section),
      h('li', { 'aria-current': 'page' }, title),
    ),
  )
}

/**
 * A doc page: two columns, CSS-only. The sidebar comes from the page's own
 * *first* block — a `collectionList` on `doc_page` the blueprint seeds on
 * every doc page for exactly this purpose — rendered as navigation rather
 * than as a card list, and dropped from the ordinary block stream so it
 * never also appears as content. The remaining blocks render in the content
 * column, unchanged.
 */
function renderDocPage(
  page: PageContent,
  ctx: RenderContext,
  sidebarBlock: VocabularyBlock,
  entries: FetchedEntries,
  registry: BlockRegistry | undefined,
): HtmlElement {
  const sidebarEntries = entries[sidebarBlock._key] ?? []
  const currentHref = ctx.url.pathname
  const current = findCurrentEntry(sidebarEntries, ctx)
  const section = typeof current?.section === 'string' ? current.section : undefined
  const contentBlocks = page.blocks.slice(1)
  const hasOwnHeading = pageHasOwnHeading(contentBlocks)
  const entryHeader = renderEntryHeader(page, ctx)

  return h(
    'main',
    { class: 'cg-main cg-docs', id: 'cg-main' },
    withBlockKey(
      h(
        'div',
        { class: 'cg-docs__nav' },
        renderSidebar(sidebarEntries, ctx, currentHref),
        renderSidebarMobile(sidebarEntries, ctx, currentHref),
      ),
      sidebarBlock._key,
    ),
    h(
      'div',
      { class: 'cg-docs__content' },
      renderBreadcrumb(section, page.title),
      entryHeader ?? (hasOwnHeading ? null : h('h1', { class: 'cg-docs__title' }, page.title)),
      contentBlocks.map((block) =>
        withBlockKey(renderBlock(block, ctx, entries, registry), block._key),
      ),
    ),
  )
}

/**
 * `<main id="cg-main">` is mandatory: it is the skip-link's target, written
 * once by `@cogenta/cli`'s own render path.
 *
 * `withBlockKey` stamps every rendered block with its contract-B `_key`, on
 * every page including a doc page's content column — the visual page
 * builder maps a clicked element back to the block that produced it, for
 * this theme exactly as for every other one.
 */
export function renderPage(
  page: PageContent,
  ctx: RenderContext,
  entries: FetchedEntries = {},
  registry?: BlockRegistry,
): HtmlElement {
  const first = page.blocks[0]
  if (first !== undefined && isDocSidebarBlock(first)) {
    return renderDocPage(page, ctx, first, entries, registry)
  }

  return h(
    'main',
    { class: 'cg-main', id: 'cg-main' },
    pageHasOwnHeading(page.blocks) ? null : h('h1', { class: 'cg-page__title' }, page.title),
    page.blocks.map((block) =>
      withBlockKey(renderBlock(block, ctx, entries, registry), block._key),
    ),
  )
}
