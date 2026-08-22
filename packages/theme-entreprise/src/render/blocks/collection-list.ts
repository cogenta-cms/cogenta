import type { CollectionListBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  buildCollectionListQuery,
  type ContentEntry,
  entryDate,
  entryExcerpt,
  entryHref,
  entryTitle,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * The only block of the twelve that reads data at render time — contract B
 * marks it `runtime: 'server'` for that reason. The read is *not* done
 * here: `query` builds the request from the block's own fields
 * (`@cogenta/theme-kit`'s `buildCollectionListQuery`, shared across every
 * theme), the caller awaits `ctx.content.list(...)` before rendering
 * starts, and this function stays a pure function of the entries handed to
 * it.
 */
export { buildCollectionListQuery as query }

/**
 * A "latest insights" ledger row rather than a card-grid entry: a numbered
 * date badge on the left, title and excerpt stacked to its right, with a
 * thin top rule between rows in `list` layout — the reading list of a real
 * newsroom/resources page. `grid` and `carousel` reuse the same row markup
 * inside a differently laid-out container.
 */
function renderEntry(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cg-list__row' },
    date === undefined
      ? null
      : h(
          'time',
          { class: 'cg-list__date', datetime: date },
          new Intl.DateTimeFormat(ctx.locale, { month: 'short', day: '2-digit' }).format(
            new Date(date),
          ),
        ),
    h(
      'div',
      { class: 'cg-list__body' },
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
