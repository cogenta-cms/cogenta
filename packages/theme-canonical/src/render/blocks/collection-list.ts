import type { CollectionListBlock } from '@cogenta/blocks'
import type { ContentEntry, QueryRequest, RenderContext } from '../../theme-contract.js'
import { entryDate, entryExcerpt, entryHref, entryTitle } from '../entry.js'
import { blockHeadingTag, type HeadingTag, heading, nestedHeadingTag } from '../heading.js'
import { type HtmlElement, h } from '../html.js'

/**
 * The only block of the twelve that reads data at render time — contract B
 * marks it `runtime: 'server'` for that reason.
 *
 * The read is *not* done here. `query` builds the request, the `.astro`
 * component awaits `ctx.content.list(...)` in its frontmatter, and this
 * function stays a pure function of the entries it is handed. That keeps the
 * markup snapshot-testable and keeps the theme's single door to data — the
 * read-only content client — in one visible place.
 */
export function query(block: CollectionListBlock): QueryRequest {
  return {
    collection: block.collection,
    ...(block.filter === undefined ? {} : { filter: block.filter }),
    ...(block.sort === undefined ? {} : { sort: block.sort }),
    // Capped by contract B at 100; an absent limit still must not mean "all".
    limit: block.limit ?? 10,
  }
}

function renderEntry(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cg-entry' },
    h(
      'article',
      { class: 'cg-entry__body' },
      heading(
        tag,
        { class: 'cg-entry__title' },
        h('a', { class: 'cg-entry__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      date === undefined
        ? null
        : h(
            'time',
            { class: 'cg-entry__date', datetime: date },
            // Formatted in the rendered locale rather than left as an ISO
            // string: the machine-readable form is already in `datetime`.
            new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'long' }).format(new Date(date)),
          ),
      excerpt === undefined ? null : h('p', { class: 'cg-entry__excerpt' }, excerpt),
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
      ? h('p', { class: 'cg-collection__empty' }, ctx.t('collection.empty'))
      : h(
          'ul',
          { class: 'cg-collection__items' },
          entries.map((entry) => renderEntry(entry, ctx, entryTag)),
        )

  return h(
    'section',
    {
      class: 'cg-block cg-collection',
      'data-block': 'collectionList',
      'data-layout': block.layout,
    },
    hasTitle
      ? heading(
          blockHeadingTag('collectionList') ?? 'h2',
          { class: 'cg-collection__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-collection__viewport',
            role: 'region',
            'aria-label': block.title ?? ctx.t('collection.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
