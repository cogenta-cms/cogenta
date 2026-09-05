import type { CollectionListBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  buildCollectionListQuery,
  type ContentEntry,
  entryDate,
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
  renderIcon,
  renderImageSource,
} from '@cogenta/theme-kit'

/**
 * The only block of the seventeen that reads data at render time — contract B
 * marks it `runtime: 'server'` for that reason. The read is *not* done
 * here: `query` builds the request from the block's own fields
 * (`@cogenta/theme-kit`'s `buildCollectionListQuery`, shared across every
 * theme), the caller awaits `ctx.content.list(...)` before rendering
 * starts, and this function stays a pure function of the entries handed to
 * it.
 */
export { buildCollectionListQuery as query }

/**
 * A card, in every layout: a picture slot on top, then title and excerpt.
 *
 * The picture slot prefers a symbol over a photo when the entry has one — a
 * feature entry carries an `icon` field (raw contract-A data a theme is
 * free to read, the same way `entryImage` reads `coverImage`/`cover`/…), and
 * showing that icon is what makes a "Features" list read the same as the
 * `featureGrid` block above it rather than as a second, photo-led block.
 * Anything else — an article, a project — falls back to `entryImage`
 * (aspect-ratio box, `object-fit: cover`, lazy-loaded: never above the
 * fold, since this is always a listed entry, never the hero).
 */
function renderMedia(entry: ContentEntry, ctx: RenderContext): HtmlElement | null {
  const iconName = typeof entry.icon === 'string' ? entry.icon : undefined
  const icon = iconName === undefined ? null : renderIcon(iconName)
  if (icon !== null) {
    return h('span', { class: 'cg-list__icon', 'data-icon': iconName, 'aria-hidden': 'true' }, icon)
  }
  const cover = entryImage(entry, ctx)
  if (cover === undefined) return null
  return h(
    'span',
    { class: 'cg-list__cover' },
    renderImageSource(cover, { className: 'cg-list__cover-image', loading: 'lazy' }),
  )
}

function renderEntry(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cg-list__row' },
    renderMedia(entry, ctx),
    h(
      'div',
      { class: 'cg-list__body' },
      heading(
        tag,
        { class: 'cg-list__title' },
        h('a', { class: 'cg-list__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      excerpt === undefined ? null : h('p', { class: 'cg-list__excerpt' }, excerpt),
      date === undefined
        ? null
        : h(
            'time',
            { class: 'cg-list__date', datetime: date },
            new Intl.DateTimeFormat(ctx.locale, { month: 'short', day: '2-digit' }).format(
              new Date(date),
            ),
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
      ? h('p', { class: 'cg-list__empty' }, ctx.t('collection.empty'))
      : h(
          'ul',
          { class: 'cg-list__items' },
          entries.map((entry) => renderEntry(entry, ctx, entryTag)),
        )

  return h(
    'section',
    {
      class: 'cg-list',
      'data-block': 'collectionList',
      'data-layout': block.layout,
    },
    hasTitle
      ? heading(
          blockHeadingTag('collectionList') ?? 'h2',
          { class: 'cg-list__title-heading', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-list__viewport',
            role: 'region',
            'aria-label': block.title ?? ctx.t('collection.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
