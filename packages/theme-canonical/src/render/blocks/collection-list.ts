import type { CollectionListBlock } from '@cogenta/blocks'
import { renderImageSource } from '@cogenta/theme-kit'
import type { ContentEntry, ImageSource, RenderContext } from '../../theme-contract.js'
import { formatEntryDate } from '../dates.js'
import { entryDate, entryExcerpt, entryHref, entryImage, entryTitle } from '../entry.js'
import { blockHeadingTag, type HeadingTag, heading, nestedHeadingTag } from '../heading.js'
import { type HtmlElement, h } from '../html.js'

/**
 * The only block of the vocabulary that reads data at render time — contract
 * B marks it `runtime: 'server'` for that reason.
 *
 * The read is *not* done here. `query` builds the request (`@cogenta/theme-kit`'s
 * `buildCollectionListQuery`, shared across every theme since it derives
 * purely from the block's own fields), the caller awaits `ctx.content.list(...)`
 * before rendering starts, and this function stays a pure function of the
 * entries it is handed.
 *
 * Three layouts, three readings of the same entries:
 *
 * - `list` is an index: the date in its own narrow column, then the title and
 *   the summary. No picture: a reader scans an index by date and title.
 * - `grid` sets entries in columns, each opened by its picture
 *   (`entryImage`, `theme@1.4`) — but only when every entry of the list has
 *   one. A row where one entry opens on a photograph and its neighbour on
 *   nothing reads as a missing image, so a list with any entry lacking a
 *   picture is set in type alone, every entry opening on the same rule.
 * - `carousel` is the grid as a horizontal row the reader scrolls, under the
 *   same all-or-none rule for pictures.
 */
export { buildCollectionListQuery as query } from '@cogenta/theme-kit'

function renderEntry(
  entry: ContentEntry,
  ctx: RenderContext,
  tag: HeadingTag,
  picture: ImageSource | undefined,
): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  const href = entryHref(entry, ctx)
  return h(
    'li',
    { class: 'cg-entry', 'data-picture': picture === undefined ? 'false' : 'true' },
    h(
      'article',
      { class: 'cg-entry__body' },
      heading(
        tag,
        { class: 'cg-entry__title' },
        h('a', { class: 'cg-entry__link', href }, entryTitle(entry, ctx)),
      ),
      date === undefined
        ? null
        : h(
            'time',
            { class: 'cg-entry__date', datetime: date },
            // The machine-readable form is already in `datetime`.
            formatEntryDate(date, ctx.locale),
          ),
      excerpt === undefined ? null : h('p', { class: 'cg-entry__excerpt' }, excerpt),
      picture === undefined
        ? null
        : h(
            'a',
            // The picture follows the title's link for a pointer, and is left
            // out of the tab order and of the accessibility tree: the title
            // already is the one named link to this entry.
            { class: 'cg-entry__media', href, tabindex: '-1', 'aria-hidden': 'true' },
            renderImageSource(
              { ...picture, alt: '' },
              {
                className: 'cg-entry__image',
                sizes: '(min-width: 72rem) 23rem, (min-width: 40rem) 50vw, 100vw',
              },
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
  const pictures =
    block.layout === 'list' ? [] : entries.map((entry) => entryImage(entry, ctx, { width: 960 }))
  const everyPicture = pictures.length > 0 && pictures.every((picture) => picture !== undefined)
  const items =
    entries.length === 0
      ? h('p', { class: 'cg-collection__empty' }, ctx.t('collection.empty'))
      : h(
          'ul',
          { class: 'cg-collection__items' },
          entries.map((entry, index) =>
            renderEntry(entry, ctx, entryTag, everyPicture ? pictures[index] : undefined),
          ),
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
    block.layout === 'carousel' && entries.length > 0
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
