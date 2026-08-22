import type { CollectionListBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
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
 * The one block of the twelve that reads data at render time — contract B
 * marks it `runtime: 'server'` for that reason, and this file never performs
 * the read itself: `query` (theme-kit's own `buildCollectionListQuery`, pure
 * data derived from the block's own fields) is what the caller awaits before
 * this function is ever called, so this stays a pure function of the entries
 * it is handed.
 *
 * This is the storefront's product grid — the block every other card style
 * in the theme is built to match: a full-bleed image area at a fixed aspect
 * ratio, the entry's title reading as a product name, its excerpt as a short
 * description, styled identically whatever the underlying collection is
 * actually named.
 */
export { buildCollectionListQuery as query } from '@cogenta/theme-kit'

function renderEntry(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'ce-entry' },
    h(
      'article',
      { class: 'ce-entry__card' },
      date === undefined
        ? null
        : h(
            'time',
            { class: 'ce-entry__badge', datetime: date },
            new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium' }).format(new Date(date)),
          ),
      heading(
        tag,
        { class: 'ce-entry__title' },
        h('a', { class: 'ce-entry__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      excerpt === undefined ? null : h('p', { class: 'ce-entry__excerpt' }, excerpt),
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
