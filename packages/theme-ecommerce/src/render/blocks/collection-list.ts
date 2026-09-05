import type { CollectionListBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
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
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'

/**
 * The one block of the seventeen that reads data at render time — contract B
 * marks it `runtime: 'server'` for that reason, and this file never performs
 * the read itself: `query` (theme-kit's own `buildCollectionListQuery`, pure
 * data derived from the block's own fields) is what the caller awaits before
 * this function is ever called, so this stays a pure function of the entries
 * it is handed.
 *
 * This is the storefront's product grid — the block every other card style
 * in the theme is built to match: a square image, the entry's title reading
 * as a product name, a formatted price when the collection has one, and two
 * shopping-specific signals (`price`/`inStock`/`category` are raw contract-A
 * data, read by field-name convention the same way `entryImage` already
 * reads `photo`/`cover`/…, never a contract this block requires): an
 * "Out of stock" badge over the image and a category chip above the title.
 * A collection with none of those fields — an article, a project — still
 * renders correctly: no chip, no badge, and the excerpt takes the price
 * slot, so this card is genuinely usable for any collection, not only a
 * `product`-shaped one.
 */
export { buildCollectionListQuery as query } from '@cogenta/theme-kit'

/**
 * `Intl.NumberFormat`, in the page's own locale. EUR is the demo blueprint's
 * own default currency (`create-cogenta`'s `store` blueprint seeds a plain
 * number, not a currency code — contract B's `collectionList` has no field
 * for one, and neither does the `product` collection this ships against) —
 * a real storefront with a different currency edits this one constant, or a
 * future contract-A currency field would replace it outright.
 */
const CURRENCY = 'EUR'

function entryPrice(entry: ContentEntry, ctx: RenderContext): string | undefined {
  const value = entry.price
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  try {
    return new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: CURRENCY }).format(
      value,
    )
  } catch {
    // An `Intl`-unsupported locale tag is not this card's problem to solve —
    // no price is a truer answer than a thrown render.
    return undefined
  }
}

function entryCategory(entry: ContentEntry): string | undefined {
  const value = entry.category
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** `undefined`/anything but the literal `false` reads as "in stock, or stock is not tracked" — never a guess in the other direction. */
function entryOutOfStock(entry: ContentEntry): boolean {
  return entry.inStock === false
}

function renderEntry(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const cover = entryImage(entry, ctx)
  const price = entryPrice(entry, ctx)
  const category = entryCategory(entry)
  const outOfStock = entryOutOfStock(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'ce-entry' },
    h(
      'article',
      { class: 'ce-entry__card' },
      cover === undefined
        ? null
        : h(
            'div',
            { class: 'ce-entry__media' },
            renderImageSource(cover, { className: 'ce-entry__image', loading: 'lazy' }),
            // Hardcoded, not `ctx.t(...)`: the theme translator's key set is
            // a fixed contract-D vocabulary this theme cannot extend on its
            // own, and every blueprint this theme ships against writes its
            // demo copy in English anyway.
            outOfStock ? h('span', { class: 'ce-entry__stock' }, 'Out of stock') : null,
          ),
      h(
        'div',
        { class: 'ce-entry__body' },
        category === undefined ? null : h('span', { class: 'ce-entry__category' }, category),
        heading(
          tag,
          { class: 'ce-entry__title' },
          h('a', { class: 'ce-entry__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
        ),
        price !== undefined
          ? h('p', { class: 'ce-entry__price' }, price)
          : excerpt === undefined
            ? null
            : h('p', { class: 'ce-entry__excerpt' }, excerpt),
      ),
    ),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const hasTitle = block.title !== undefined
  const entryTag = nestedHeadingTag('collectionList', hasTitle)
  const items =
    entries.length === 0
      ? h('p', { class: 'ce-collection__empty' }, ctx.t('collection.empty'))
      : h(
          'ul',
          { class: 'ce-collection__items' },
          entries.map((entry) => renderEntry(entry, ctx, entryTag)),
        )

  return h(
    'section',
    {
      class: 'ce-block ce-collection',
      'data-block': 'collectionList',
      'data-layout': block.layout,
    },
    hasTitle
      ? heading(
          blockHeadingTag('collectionList') ?? 'h2',
          { class: 'ce-collection__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'ce-collection__viewport',
            role: 'region',
            'aria-label': block.title ?? ctx.t('collection.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
