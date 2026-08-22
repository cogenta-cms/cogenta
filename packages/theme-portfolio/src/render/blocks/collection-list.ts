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
 * marks it `runtime: 'server'` for that reason.
 *
 * The read is *not* done here. `query` builds the request
 * (`@cogenta/theme-kit`'s `buildCollectionListQuery`, shared across every
 * theme since it derives purely from the block's own fields), the caller
 * awaits `ctx.content.list(...)` before rendering starts, and this function
 * stays a pure function of the entries it is handed.
 *
 * Rendered as a numbered index — a running mono ordinal, the title set at
 * feature-headline scale, the date pushed to the far edge — the masthead
 * "in this issue" list rather than a card wall. `data-layout="grid"`/
 * `"carousel"` switch the same markup into a tiled arrangement in
 * `blocks.css`, never a second component.
 */
export { buildCollectionListQuery as query }

function renderEntry(
  entry: ContentEntry,
  ctx: RenderContext,
  tag: HeadingTag,
  index: number,
): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cg-entry' },
    h(
      'article',
      { class: 'cg-entry__body' },
      h(
        'span',
        { class: 'cg-entry__index', 'aria-hidden': 'true' },
        String(index + 1).padStart(2, '0'),
      ),
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
          'ol',
          { class: 'cg-collection__items' },
          entries.map((entry, index) => renderEntry(entry, ctx, entryTag, index)),
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
