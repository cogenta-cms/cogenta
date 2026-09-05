import type { CollectionListBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  buildCollectionListQuery,
  type ContentEntry,
  entryExcerpt,
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
 * The only block of the seventeen that reads data at render time — contract
 * B marks it `runtime: 'server'` for that reason. The read is *not* done
 * here: `query` builds the request from the block's own fields
 * (`@cogenta/theme-kit`'s `buildCollectionListQuery`, shared across every
 * theme), the caller awaits `ctx.content.list(...)` before rendering starts,
 * and this function stays a pure function of the entries handed to it.
 */
export { buildCollectionListQuery as query }

/**
 * The signature piece of this theme: a `collectionList` on a `menu_item`-shaped
 * collection is rendered as a real, priced menu, not a card grid.
 *
 * Contract B fixes no "menu" block (a menu of dishes is a `collectionList`
 * grouped and formatted by the theme, per `docs/lots/L25-templates-pro.md`
 * "pièges connus" — a new block would need an RFC). Grouping reads the
 * entry's raw `category` field directly: a theme sees a whole entry, not
 * only the fields contract A's system columns declare, and `category` is
 * exactly the field the `restaurant` blueprint's `menu_item` collection
 * names for this. An entry with no `category` (or a collection that never
 * declares one) still renders, in one unlabelled group — grouping is a
 * presentation choice, never a requirement placed back on the schema.
 *
 * `price` is read as a plain number (contract A's `f.number`, not a
 * currency type — commerce's real money lives in contract E, untouched
 * here) and formatted with `Intl.NumberFormat`'s `currency: 'EUR'`: the
 * currency itself is not part of what a theme's `RenderContext` carries, so
 * EUR is this theme's own documented demo default, exactly the way the
 * `store` blueprint's own catalogue prices need no currency conversion
 * either. A site that prices in another currency still gets a sensibly
 * localised number; only the currency symbol would need a real per-site
 * setting this contract does not yet offer.
 */

function priceLabel(entry: ContentEntry, ctx: RenderContext): string | null {
  const raw = entry.price
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  try {
    return new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: 'EUR' }).format(raw)
  } catch {
    // An `Intl` failure (an exotic `ctx.locale`) is still a real number worth
    // showing, just without locale-aware grouping/decimal marks.
    return raw.toFixed(2)
  }
}

function categoryOf(entry: ContentEntry): string {
  const raw = entry.category
  return typeof raw === 'string' && raw.trim() !== '' ? raw : ''
}

/** One level below `tag`, clamped at `h6` — the same rule `nestedHeadingTag` applies, extended one step further for the dish name under its category heading. */
function stepDown(tag: HeadingTag): HeadingTag {
  const level = Math.min(6, Number(tag.slice(1)) + 1)
  return `h${level}` as HeadingTag
}

function renderDish(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  const price = priceLabel(entry, ctx)
  const photo = entryImage(entry, ctx, { width: 120, height: 120, fit: 'cover' })
  return h(
    'li',
    { class: 'cg-menu__dish' },
    photo === undefined
      ? null
      : h(
          'div',
          { class: 'cg-menu__dish-photo' },
          renderImageSource(photo, { sizes: '5rem', className: 'cg-menu__dish-image' }),
        ),
    h(
      'div',
      { class: 'cg-menu__dish-body' },
      h(
        'div',
        { class: 'cg-menu__dish-row' },
        heading(tag, { class: 'cg-menu__dish-name' }, entryTitle(entry, ctx)),
        // Leader and price are one wrapping unit (`cg-menu__dish-tail`): on
        // a narrow screen where the name alone fills the row, the dotted
        // leader must move to the next line together with the price it
        // points to — never left dangling at the end of the name's line
        // with the price it introduces stranded on a line of its own.
        h(
          'span',
          { class: 'cg-menu__dish-tail' },
          h('span', { class: 'cg-menu__dish-leader', 'aria-hidden': 'true' }),
          price === null ? null : h('span', { class: 'cg-menu__dish-price' }, price),
        ),
      ),
      excerpt === undefined ? null : h('p', { class: 'cg-menu__dish-description' }, excerpt),
    ),
  )
}

function renderGroup(
  category: string,
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  groupTag: HeadingTag,
): HtmlElement {
  const dishTag = stepDown(groupTag)
  return h(
    'div',
    { class: 'cg-menu__group' },
    category === '' ? null : heading(groupTag, { class: 'cg-menu__group-title' }, category),
    h(
      'ul',
      { class: 'cg-menu__dishes' },
      entries.map((entry) => renderDish(entry, ctx, dishTag)),
    ),
  )
}

function groupByCategory(entries: readonly ContentEntry[]): readonly [string, ContentEntry[]][] {
  const order: string[] = []
  const groups = new Map<string, ContentEntry[]>()
  for (const entry of entries) {
    const key = categoryOf(entry)
    const bucket = groups.get(key)
    if (bucket === undefined) {
      groups.set(key, [entry])
      order.push(key)
    } else {
      bucket.push(entry)
    }
  }
  return order.map((key) => [key, groups.get(key) as ContentEntry[]])
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const hasTitle = block.title !== undefined
  const groupTag = nestedHeadingTag('collectionList', hasTitle)
  const groups = groupByCategory(entries)
  const body =
    entries.length === 0
      ? h('p', { class: 'cg-menu__empty' }, ctx.t('collection.empty'))
      : h(
          'div',
          { class: 'cg-menu__groups' },
          groups.map(([category, items]) => renderGroup(category, items, ctx, groupTag)),
        )

  return h(
    'section',
    { class: 'cg-menu', 'data-block': 'collectionList', 'data-layout': block.layout },
    hasTitle
      ? heading(
          blockHeadingTag('collectionList') ?? 'h2',
          { class: 'cg-menu__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-menu__viewport',
            role: 'region',
            'aria-label': block.title ?? ctx.t('collection.carousel'),
            tabindex: '0',
          },
          body,
        )
      : body,
  )
}
