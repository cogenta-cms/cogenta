import type { CollectionListBlock } from '@cogenta/blocks'
import {
  buildCollectionListQuery,
  type ContentEntry,
  entryDate,
  entryExcerpt,
  entryHref,
  entryImage,
  entryTitle,
  type HtmlElement,
  h,
  nestedHeadingTag,
  type QueryRequest,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { word } from '../strings.js'

/**
 * A list of entries, read by what the entries carry as much as by the layout
 * an editor chose.
 *
 * - **`list`, entries with pictures: a product tour.** One row per entry,
 *   the screenshot in its hairline frame on seven columns and the words on
 *   four, alternating sides from one row to the next: the title, the summary
 *   and a "read more" link. This is how a set of features reads on a product
 *   page.
 * - **`list`, anything else: an index.** Ruled rows. A dated entry (a
 *   changelog entry, a post) prints its date in Geist Mono in the first three
 *   columns, as a changelog does; the title and summary follow.
 * - **`grid`**: three columns without cards. A picture, when there is one,
 *   in the hairline frame at 16:10, then the date, the title and the summary.
 * - **`carousel`**: the same items in one row that scrolls sideways.
 *
 * The page an entry is shown on is never listed on itself: a "more updates"
 * list on a changelog entry skips the entry above it.
 *
 * Each picture repeats the link of its title, so it is taken out of the tab
 * order and hidden from assistive technology: one link per entry is
 * announced, the title (and a "read more" link that names it).
 */

type Shape = 'tour' | 'index' | 'grid' | 'carousel'

function shapeOf(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  layout: CollectionListBlock['layout'],
): Shape {
  if (layout === 'grid') return 'grid'
  if (layout === 'carousel') return 'carousel'
  return entries.some((entry) => entryImage(entry, ctx) !== undefined) ? 'tour' : 'index'
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

function dateOf(entry: ContentEntry, ctx: RenderContext, className: string): HtmlElement | null {
  const date = entryDate(entry)
  if (date === undefined) return null
  return h('time', { class: className, datetime: date }, formatDate(date, ctx.locale))
}

function picture(entry: ContentEntry, ctx: RenderContext, className: string, sizes: string) {
  const source = entryImage(entry, ctx)
  if (source === undefined) return null
  return h(
    'a',
    {
      class: `${className} cs-frame`,
      href: entryHref(entry, ctx),
      tabindex: -1,
      'aria-hidden': 'true',
    },
    renderImageSource(source, { className: 'cs-frame__image', sizes }),
  )
}

function readMore(entry: ContentEntry, ctx: RenderContext): HtmlElement {
  return h(
    'a',
    { class: 'cs-arrow-link', href: entryHref(entry, ctx) },
    word(ctx.locale, 'readMore'),
    h(
      'span',
      { class: 'cg-visually-hidden' },
      ` ${word(ctx.locale, 'about')} ${entryTitle(entry, ctx)}`,
    ),
  )
}

function tourRow(entry: ContentEntry, ctx: RenderContext, tag: string, index: number) {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cs-tour__item', 'data-side': index % 2 === 0 ? 'start' : 'end' },
    picture(entry, ctx, 'cs-tour__media', '(min-width: 64rem) 44rem, 100vw'),
    h(
      'div',
      { class: 'cs-tour__words' },
      h(
        tag,
        { class: 'cs-tour__title' },
        h('a', { class: 'cs-tour__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      excerpt === undefined ? null : h('p', { class: 'cs-tour__text' }, excerpt),
      readMore(entry, ctx),
    ),
  )
}

function indexRow(entry: ContentEntry, ctx: RenderContext, tag: string) {
  const excerpt = entryExcerpt(entry)
  const date = dateOf(entry, ctx, 'cs-index__date')
  return h(
    'li',
    { class: 'cs-index__item', 'data-dated': date === null ? 'false' : 'true' },
    date,
    h(
      'div',
      { class: 'cs-index__words' },
      h(
        tag,
        { class: 'cs-index__title' },
        h('a', { class: 'cs-index__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      excerpt === undefined ? null : h('p', { class: 'cs-index__text' }, excerpt),
    ),
  )
}

function gridItem(entry: ContentEntry, ctx: RenderContext, tag: string) {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cs-cards__item' },
    picture(
      entry,
      ctx,
      'cs-cards__media',
      '(min-width: 64rem) 24rem, (min-width: 40rem) 50vw, 100vw',
    ),
    dateOf(entry, ctx, 'cs-cards__date'),
    h(
      tag,
      { class: 'cs-cards__title' },
      h('a', { class: 'cs-cards__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    excerpt === undefined ? null : h('p', { class: 'cs-cards__text' }, excerpt),
  )
}

/** The entries to show: never the one whose page this is. */
function listable(entries: readonly ContentEntry[], ctx: RenderContext): readonly ContentEntry[] {
  return entries.filter((entry) => entryHref(entry, ctx) !== ctx.url.pathname)
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  fetched: readonly ContentEntry[],
): HtmlElement {
  const titled = block.title !== undefined
  const tag = nestedHeadingTag('collectionList', titled)
  const entries = listable(fetched, ctx)

  if (entries.length === 0) {
    return section(
      'section',
      'collectionList',
      'cs-list',
      { 'data-layout': block.layout, 'data-shape': 'empty' },
      'div',
      sectionHead('collectionList', block.title),
      h('p', { class: 'cs-empty' }, ctx.t('collection.empty')),
    )
  }

  const shape = shapeOf(entries, ctx, block.layout)
  const items =
    shape === 'tour'
      ? h(
          'ol',
          { class: 'cs-tour' },
          entries.map((entry, index) => tourRow(entry, ctx, tag, index)),
        )
      : shape === 'index'
        ? h(
            'ul',
            { class: 'cs-index' },
            entries.map((entry) => indexRow(entry, ctx, tag)),
          )
        : h(
            'ul',
            {
              class: 'cs-cards',
              'data-carousel': shape === 'carousel' ? 'true' : 'false',
              ...(shape === 'carousel'
                ? { 'aria-label': block.title ?? ctx.t('collection.carousel'), tabindex: 0 }
                : {}),
            },
            entries.map((entry) => gridItem(entry, ctx, tag)),
          )

  return section(
    'section',
    'collectionList',
    'cs-list',
    { 'data-layout': block.layout, 'data-shape': shape },
    'div',
    sectionHead('collectionList', block.title),
    items,
  )
}

/** The query this block needs, fetched by the host before any markup is built. */
export function query(block: CollectionListBlock): QueryRequest {
  return buildCollectionListQuery(block)
}
