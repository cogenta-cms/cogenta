import type { CollectionListBlock } from '@cogenta/blocks'
import {
  buildCollectionListQuery,
  type ContentEntry,
  entryExcerpt,
  entryHref,
  entryImage,
  entryTitle,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type QueryRequest,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { currencyOf, formatPrice, priceOf, stockOf } from '../goods.js'
import { section, sectionHead } from '../layout.js'
import { shopString } from '../strings.js'

/**
 * A list of entries, read by what the entries are rather than by a setting:
 *
 * - **Goods.** Every entry has a price: a product grid. The photograph at
 *   4:5 on the stone ground, the name and the price on one line under it in
 *   tabular figures, and "Sold out" as a quiet line of text when the entry
 *   says so. No badge, no button, no card.
 * - **Tiles.** Entries with a picture and no price (the shop's categories, a
 *   journal): square photographs with the name under them, as an arrow link.
 * - **Index.** Anything else: ruled rows of titles and their summaries.
 *
 * Contract B's `layout` then places them: `grid` (four across on a wide
 * screen, two on a phone), `list` (ruled rows, a small photograph at the
 * start of a product's row), or `carousel` (a row that scrolls sideways with
 * native snapping, a focusable and labelled region).
 *
 * The page an entry is shown on is never listed on itself: a "more from this
 * category" list on a product page skips the product above it.
 *
 * Each picture repeats the link of its title, so it is taken out of the tab
 * order and hidden from assistive technology: one link per entry is
 * announced, the title.
 */

type Shape = 'goods' | 'tiles' | 'index'

function shapeOf(entries: readonly ContentEntry[], ctx: RenderContext): Shape {
  if (entries.every((entry) => priceOf(entry.price) !== undefined)) return 'goods'
  if (entries.every((entry) => entryImage(entry, ctx) !== undefined)) return 'tiles'
  return 'index'
}

function mediaLink(
  entry: ContentEntry,
  ctx: RenderContext,
  className: string,
  sizes: string,
): HtmlElement | null {
  const source = entryImage(entry, ctx)
  if (source === undefined) return null
  return h(
    'a',
    {
      class: `${className}__media`,
      href: entryHref(entry, ctx),
      tabindex: '-1',
      'aria-hidden': 'true',
    },
    renderImageSource(source, { className: `${className}__image`, sizes }),
  )
}

function goodsItem(
  entry: ContentEntry,
  ctx: RenderContext,
  tag: HeadingTag,
  layout: CollectionListBlock['layout'],
): HtmlElement {
  const price = priceOf(entry.price) as number
  const stock = stockOf(entry.inStock)
  return h(
    'li',
    { class: 'ce-goods__item', 'data-stock': stock },
    mediaLink(
      entry,
      ctx,
      'ce-goods',
      layout === 'list' ? '6rem' : '(min-width: 64rem) 22vw, (min-width: 40rem) 30vw, 50vw',
    ),
    h(
      'div',
      { class: 'ce-goods__text' },
      heading(
        tag,
        { class: 'ce-goods__name' },
        h('a', { class: 'ce-goods__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      h(
        'p',
        { class: 'ce-goods__price' },
        h(
          'data',
          { value: String(price) },
          formatPrice(price, currencyOf(entry.currency), ctx.locale),
        ),
      ),
      stock === 'out'
        ? h('p', { class: 'ce-goods__stock' }, shopString(ctx.locale, 'soldOut'))
        : null,
    ),
  )
}

function tileItem(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'ce-tiles__item' },
    mediaLink(entry, ctx, 'ce-tiles', '(min-width: 64rem) 22vw, 50vw'),
    heading(
      tag,
      { class: 'ce-tiles__name' },
      h('a', { class: 'ce-arrow-link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    excerpt === undefined ? null : h('p', { class: 'ce-tiles__text' }, excerpt),
  )
}

function indexItem(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'ce-index__item' },
    heading(
      tag,
      { class: 'ce-index__name' },
      h('a', { class: 'ce-index__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    excerpt === undefined ? null : h('p', { class: 'ce-index__text' }, excerpt),
  )
}

/** The entries that are not the page being rendered. */
function othersThanThisPage(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
): readonly ContentEntry[] {
  return entries.filter((entry) => entryHref(entry, ctx) !== ctx.url.pathname)
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  fetched: readonly ContentEntry[],
): HtmlElement {
  const titled = block.title !== undefined
  const shown = othersThanThisPage(fetched, ctx)
  const tag = nestedHeadingTag('collectionList', titled)

  if (shown.length === 0) {
    return section(
      'section',
      'collectionList',
      'ce-list',
      { 'data-layout': block.layout, 'data-shape': 'empty' },
      'div',
      sectionHead('collectionList', block.title),
      h('p', { class: 'ce-empty' }, ctx.t('collection.empty')),
    )
  }

  const shape = shapeOf(shown, ctx)
  const items = shown.map((entry) =>
    shape === 'goods'
      ? goodsItem(entry, ctx, tag, block.layout)
      : shape === 'tiles'
        ? tileItem(entry, ctx, tag)
        : indexItem(entry, ctx, tag),
  )
  const list = h(
    'ul',
    { class: `ce-list__items ce-${shape}`, 'data-count': String(Math.min(shown.length, 4)) },
    items,
  )

  return section(
    'section',
    'collectionList',
    'ce-list',
    { 'data-layout': block.layout, 'data-shape': shape },
    'div',
    sectionHead('collectionList', block.title),
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'ce-list__viewport',
            role: 'region',
            'aria-label': block.title ?? ctx.t('collection.carousel'),
            tabindex: '0',
          },
          list,
        )
      : list,
  )
}

/** The query this block needs, fetched by the host before any markup is built. */
export function query(block: CollectionListBlock): QueryRequest {
  return buildCollectionListQuery(block)
}
