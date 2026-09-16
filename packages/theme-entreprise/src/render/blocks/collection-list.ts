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
import { arrow, monthYear, ordinal, section } from '../layout.js'

/**
 * The only block of the seventeen that reads data at render time (contract B
 * marks it `runtime: 'server'`). The read is not done here: `query` builds
 * the request from the block's own fields, the caller awaits
 * `ctx.content.list(...)` before rendering starts, and this function stays a
 * pure function of the entries handed to it.
 */
export { buildCollectionListQuery as query }

/**
 * Three designed layouts, one markup per entry:
 *
 * - `list` is the case-study register: alternating rows, the picture on
 *   seven columns and the text on four, swapping sides from one row to the
 *   next. An entry with no picture becomes a typographic row (title left,
 *   summary right) under the same hairline, never a row with a hole in it.
 * - `grid` is an editorial index in three columns: a 3:2 picture, a hairline,
 *   the title in the display serif and its summary. No card border, no lift
 *   on hover.
 * - `carousel` is the grid's item in a scroll-snapping, focusable row.
 *
 * The picture link is hidden from assistive technology and from the tab
 * order: it goes where the title link goes, and one link per entry is what
 * a keyboard or screen reader user should meet.
 */
function renderPicture(entry: ContentEntry, ctx: RenderContext, url: string): HtmlElement | null {
  const picture = entryImage(entry, ctx)
  if (picture === undefined) return null
  return h(
    'a',
    { class: 'cg-entry__media', href: url, tabindex: '-1', 'aria-hidden': 'true' },
    renderImageSource(picture, {
      className: 'cg-entry__image',
      loading: 'lazy',
      sizes: '(min-width: 64rem) 55vw, 100vw',
    }),
  )
}

function renderEntry(
  entry: ContentEntry,
  index: number,
  ctx: RenderContext,
  tag: HeadingTag,
): HtmlElement {
  const url = entryHref(entry, ctx)
  const excerpt = entryExcerpt(entry)
  // Only a declared publication date is shown: `entryDate` falls back to
  // `createdAt`, and the day a record was typed in is not a date a reader of
  // a case study or a practice page is owed.
  const iso = typeof entry.publishedAt === 'string' ? entryDate(entry) : undefined
  const date = iso === undefined ? null : monthYear(iso, ctx.locale)
  const picture = renderPicture(entry, ctx, url)
  return h(
    'li',
    { class: 'cg-entry', 'data-media': picture === null ? 'none' : 'present' },
    picture,
    h(
      'div',
      { class: 'cg-entry__body' },
      h(
        'p',
        { class: 'cg-entry__meta' },
        h('span', { class: 'cg-entry__index', 'aria-hidden': 'true' }, ordinal(index)),
        iso === undefined || date === null
          ? null
          : h('time', { class: 'cg-entry__date', datetime: iso }, date),
      ),
      // The title is the link, and the arrow sits inline after its last word
      // inside the same link: a bare arrow on a line of its own reads as a
      // placeholder, not as a way into the case study.
      heading(
        tag,
        { class: 'cg-entry__title' },
        h(
          'a',
          { class: 'cg-entry__link', href: url },
          h('span', { class: 'cg-entry__link-text' }, entryTitle(entry, ctx)),
          h('span', { class: 'cg-entry__arrow', 'aria-hidden': 'true' }, arrow()),
        ),
      ),
      excerpt === undefined ? null : h('p', { class: 'cg-entry__excerpt' }, excerpt),
      renderKeyFigure(entry),
    ),
  )
}

/**
 * The one number a case study is remembered by, when the entry declares it
 * (`keyFigure`, and `keyFigureLabel` for what it measures): set large under
 * the summary, as a result on a data sheet. An entry without it renders
 * exactly as before.
 */
function renderKeyFigure(entry: ContentEntry): HtmlElement | null {
  const value = entry.keyFigure
  if (typeof value !== 'string' || value.trim() === '') return null
  const label = typeof entry.keyFigureLabel === 'string' ? entry.keyFigureLabel : undefined
  return h(
    'p',
    { class: 'cg-entry__figure' },
    h('span', { class: 'cg-entry__figure-value' }, value),
    label === undefined ? null : h('span', { class: 'cg-entry__figure-label' }, label),
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
          block.layout === 'list' ? 'ol' : 'ul',
          { class: 'cg-collection__items', 'data-count': String(entries.length) },
          entries.map((entry, index) => renderEntry(entry, index, ctx, entryTag)),
        )

  return section(
    'section',
    'collectionList',
    'cg-collection',
    { 'data-layout': block.layout },
    'div',
    hasTitle
      ? h(
          'div',
          { class: 'cg-head' },
          heading(
            blockHeadingTag('collectionList') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title ?? '',
          ),
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
