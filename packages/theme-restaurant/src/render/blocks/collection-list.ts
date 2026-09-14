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
import { section, sectionHead } from '../layout.js'
import {
  currencyOf,
  formatPrice,
  groupBySection,
  isVegetarian,
  type MenuSection,
  priceOf,
  sectionOf,
} from '../menu.js'
import { menuString } from '../strings.js'

/**
 * A list of entries, read by what the entries are rather than by a setting.
 *
 * - **A menu.** Every entry has a price, so this is a menu, and it is set like
 *   a printed one: grouped by the section each dish names (in the order the
 *   dishes arrive), each section under its name in small capitals, each dish
 *   on one line (its name in the display serif, a dotted leader, the price in
 *   tabular figures aligned right) with its description under it in muted
 *   text. `grid` sets the sections in two columns on a wide screen, `list` in
 *   one column at a reading measure. `carousel` turns the same dishes into a
 *   band of plates: the photograph at 4:5, the name and the price under it,
 *   in a row that scrolls sideways.
 * - **Photographs.** Entries with a picture and no price (a note from the
 *   kitchen, a private room): 4:5 photographs with the name under them, as an
 *   arrow link, and the summary.
 * - **An index.** Anything else: ruled rows of titles and their summaries.
 *
 * The page an entry is shown on is never listed on itself: a "more starters"
 * list on a dish's own page skips the dish above it.
 *
 * Each picture repeats the link of its name, so it is taken out of the tab
 * order and hidden from assistive technology: one link per entry is
 * announced, the name.
 */

type Shape = 'menu' | 'plates' | 'photos' | 'index'

function shapeOf(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  layout: CollectionListBlock['layout'],
): Shape {
  if (entries.every((entry) => priceOf(entry.price) !== undefined)) {
    return layout === 'carousel' ? 'plates' : 'menu'
  }
  if (entries.every((entry) => entryImage(entry, ctx) !== undefined)) return 'photos'
  return 'index'
}

function price(entry: ContentEntry, ctx: RenderContext, className: string): HtmlElement {
  const amount = priceOf(entry.price) as number
  return h(
    'data',
    { class: className, value: String(amount) },
    formatPrice(amount, currencyOf(entry.currency), ctx.locale),
  )
}

function dish(entry: ContentEntry, ctx: RenderContext): HtmlElement {
  const description = entryExcerpt(entry)
  const vegetarian = isVegetarian(entry)
  return h(
    'li',
    { class: 'cr-menu__item', 'data-vegetarian': vegetarian ? 'true' : undefined },
    h(
      'p',
      { class: 'cr-menu__line' },
      h('a', { class: 'cr-menu__name', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      h('span', { class: 'cr-menu__leader', 'aria-hidden': 'true' }),
      price(entry, ctx, 'cr-menu__price'),
    ),
    description === undefined && !vegetarian
      ? null
      : h(
          'p',
          { class: 'cr-menu__description' },
          description === undefined ? null : h('span', { class: 'cr-menu__text' }, description),
          vegetarian
            ? h('span', { class: 'cr-menu__diet' }, menuString(ctx.locale, 'vegetarian'))
            : null,
        ),
  )
}

function menuSection(
  group: MenuSection<ContentEntry>,
  ctx: RenderContext,
  tag: HeadingTag,
  named: boolean,
): HtmlElement {
  return h(
    'div',
    { class: 'cr-menu__section' },
    group.title === undefined || !named
      ? null
      : heading(tag, { class: 'cr-menu__section-title' }, group.title),
    h(
      'ul',
      { class: 'cr-menu__items' },
      group.items.map((entry) => dish(entry, ctx)),
    ),
  )
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

function plate(entry: ContentEntry, ctx: RenderContext): HtmlElement {
  const group = sectionOf(entry)
  return h(
    'li',
    { class: 'cr-plates__item', 'data-media': String(entryImage(entry, ctx) !== undefined) },
    mediaLink(entry, ctx, 'cr-plates', '(min-width: 64rem) 22vw, 70vw'),
    h(
      'p',
      { class: 'cr-plates__line' },
      h('a', { class: 'cr-plates__name', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      price(entry, ctx, 'cr-plates__price'),
    ),
    group === undefined ? null : h('p', { class: 'cr-plates__section' }, group),
  )
}

function photo(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cr-photos__item' },
    mediaLink(entry, ctx, 'cr-photos', '(min-width: 64rem) 28vw, 100vw'),
    heading(
      tag,
      { class: 'cr-photos__name' },
      h('a', { class: 'cr-arrow-link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    excerpt === undefined ? null : h('p', { class: 'cr-photos__text' }, excerpt),
  )
}

function indexItem(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cr-index__item' },
    heading(
      tag,
      { class: 'cr-index__name' },
      h('a', { class: 'cr-index__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    excerpt === undefined ? null : h('p', { class: 'cr-index__text' }, excerpt),
  )
}

/** The entries that are not the page being rendered. */
function othersThanThisPage(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
): readonly ContentEntry[] {
  return entries.filter((entry) => entryHref(entry, ctx) !== ctx.url.pathname)
}

function body(
  shape: Shape,
  shown: readonly ContentEntry[],
  block: CollectionListBlock,
  ctx: RenderContext,
  tag: HeadingTag,
): HtmlElement {
  switch (shape) {
    case 'menu': {
      const groups = groupBySection(shown)
      // One section under a title of its own ("The other starters") is named
      // by that title already; printing "Starters" under it again says nothing.
      const named = groups.length > 1 || block.title === undefined
      return h(
        'div',
        {
          class: 'cr-list__items cr-menu',
          'data-sections': String(groups.length),
        },
        groups.map((group) => menuSection(group, ctx, tag, named)),
      )
    }
    case 'plates':
      return h(
        'div',
        {
          class: 'cr-list__viewport',
          role: 'region',
          'aria-label': block.title ?? ctx.t('collection.carousel'),
          tabindex: '0',
        },
        h(
          'ul',
          { class: 'cr-list__items cr-plates' },
          shown.map((entry) => plate(entry, ctx)),
        ),
      )
    case 'photos': {
      const list = h(
        'ul',
        {
          class: 'cr-list__items cr-photos',
          'data-count': String(Math.min(shown.length, 3)),
        },
        shown.map((entry) => photo(entry, ctx, tag)),
      )
      return block.layout === 'carousel'
        ? h(
            'div',
            {
              class: 'cr-list__viewport',
              role: 'region',
              'aria-label': block.title ?? ctx.t('collection.carousel'),
              tabindex: '0',
            },
            list,
          )
        : list
    }
    case 'index':
      return h(
        'ul',
        { class: 'cr-list__items cr-index' },
        shown.map((entry) => indexItem(entry, ctx, tag)),
      )
  }
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
      'cr-list',
      { 'data-layout': block.layout, 'data-shape': 'empty' },
      'div',
      sectionHead('collectionList', block.title),
      h('p', { class: 'cr-empty' }, ctx.t('collection.empty')),
    )
  }

  const shape = shapeOf(shown, ctx, block.layout)
  return section(
    'section',
    'collectionList',
    'cr-list',
    { 'data-layout': block.layout, 'data-shape': shape },
    'div',
    sectionHead('collectionList', block.title),
    body(shape, shown, block, ctx, tag),
  )
}

/** The query this block needs, fetched by the host before any markup is built. */
export function query(block: CollectionListBlock): QueryRequest {
  return buildCollectionListQuery(block)
}
