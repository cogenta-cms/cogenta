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
  renderImageSource,
} from '@cogenta/theme-kit'

export { buildCollectionListQuery as query }

/**
 * A card for the grid/carousel layouts — a cover (`entryImage`, 16:9),
 * a small date pill standing in for a category eyebrow, the title and an
 * excerpt.
 *
 * A resolved taxonomy label is deliberately not attempted here: a
 * `collectionList`'s entries are the flat `ContentEntry` the query returned
 * — none of the per-page term resolution `renderEntryHeader`/`page.entry`
 * gets is done for a *list* of entries — so the honest "category-style
 * eyebrow" this brief asks for is the date, exactly the "otherwise date"
 * fallback it names, applied unconditionally.
 */
function renderCard(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  const cover = entryImage(entry, ctx, { width: 640, height: 360, fit: 'cover' })
  return h(
    'li',
    { class: 'cg-list__row' },
    h(
      'article',
      { class: 'cg-list__card' },
      cover === undefined
        ? null
        : h(
            'a',
            { class: 'cg-list__cover-link', href: entryHref(entry, ctx), tabindex: -1 },
            renderImageSource(cover, {
              className: 'cg-list__cover',
              sizes: '(min-width: 64rem) 24rem, (min-width: 48rem) 45vw, 100vw',
            }),
          ),
      h(
        'div',
        { class: 'cg-list__body' },
        date === undefined
          ? null
          : h(
              'time',
              { class: 'cg-list__date', datetime: date },
              new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium' }).format(new Date(date)),
            ),
        heading(
          tag,
          { class: 'cg-list__title' },
          h('a', { class: 'cg-list__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
        ),
        excerpt === undefined ? null : h('p', { class: 'cg-list__excerpt' }, excerpt),
      ),
    ),
  )
}

/** An editorial list row for the "list" layout — a small square thumbnail beside the date/title/excerpt, the "From the archive" treatment. */
function renderRow(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  const cover = entryImage(entry, ctx, { width: 160, height: 160, fit: 'cover' })
  return h(
    'li',
    { class: 'cg-list__row' },
    cover === undefined
      ? null
      : h(
          'a',
          { class: 'cg-list__thumb-link', href: entryHref(entry, ctx), tabindex: -1 },
          renderImageSource(cover, { className: 'cg-list__thumb' }),
        ),
    h(
      'div',
      { class: 'cg-list__body' },
      date === undefined
        ? null
        : h(
            'time',
            { class: 'cg-list__date', datetime: date },
            new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium' }).format(new Date(date)),
          ),
      heading(
        tag,
        { class: 'cg-list__title' },
        h('a', { class: 'cg-list__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      excerpt === undefined ? null : h('p', { class: 'cg-list__excerpt' }, excerpt),
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
  const renderItem = block.layout === 'list' ? renderRow : renderCard
  const items =
    entries.length === 0
      ? h('p', { class: 'cg-list__empty' }, ctx.t('collection.empty'))
      : h(
          'ul',
          { class: 'cg-list__items' },
          entries.map((entry) => renderItem(entry, ctx, entryTag)),
        )

  return h(
    'section',
    {
      class: 'cg-block cg-list',
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
