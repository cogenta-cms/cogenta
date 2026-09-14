import type { CollectionListBlock } from '@cogenta/blocks'
import {
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
import { dayMonth, longDate, section, sectionHead, yearOf } from '../layout.js'

/**
 * The only block of the seventeen that reads data at render time. The read
 * is not done here: `query` builds the request from the block's own fields,
 * the host fetches before rendering, and this stays a pure function of the
 * entries handed to it.
 */
export { buildCollectionListQuery as query }

/**
 * Only a declared publication date is shown: `entryDate` falls back to
 * `createdAt`, and the instant a record was typed in is not a date a reader
 * is owed.
 */
function publicationDate(entry: ContentEntry): string | undefined {
  return typeof entry.publishedAt === 'string' ? entryDate(entry) : undefined
}

/**
 * The picture link is hidden from assistive technology and from the tab
 * order: it goes where the title goes, and one link per entry is what a
 * keyboard or screen reader user should meet.
 */
function picture(
  entry: ContentEntry,
  ctx: RenderContext,
  url: string,
  className: string,
  sizes: string,
): HtmlElement | null {
  const source = entryImage(entry, ctx)
  if (source === undefined) return null
  return h(
    'a',
    { class: `${className}__media`, href: url, tabindex: '-1', 'aria-hidden': 'true' },
    renderImageSource(source, { className: `${className}__image`, loading: 'lazy', sizes }),
  )
}

function title(
  entry: ContentEntry,
  ctx: RenderContext,
  url: string,
  className: string,
  tag: HeadingTag,
): HtmlElement {
  return heading(
    tag,
    { class: `${className}__title` },
    h('a', { class: `${className}__link`, href: url }, entryTitle(entry, ctx)),
  )
}

/**
 * `list`: the editorial index. The margin carries the date, and the year
 * once, on the first entry of each year, so a long archive reads as a table
 * of contents grouped by year without a heading level of its own. The title
 * and standfirst sit on the text line; a picture, when the entry has one,
 * takes the last three columns, and a row without one is a row of text,
 * never a row with a hole in it.
 */
function renderIndexRow(
  entry: ContentEntry,
  previousYear: string | null,
  ctx: RenderContext,
  tag: HeadingTag,
): { readonly node: HtmlElement; readonly year: string | null } {
  const url = entryHref(entry, ctx)
  const iso = publicationDate(entry)
  const year = iso === undefined ? null : yearOf(iso)
  const day = iso === undefined ? null : dayMonth(iso, ctx.locale)
  const excerpt = entryExcerpt(entry)
  const media = picture(entry, ctx, url, 'cg-index', '(min-width: 64rem) 16rem, 30vw')
  const node = h(
    'li',
    { class: 'cg-index__row', 'data-media': media === null ? 'none' : 'present' },
    h(
      'p',
      { class: 'cg-index__margin' },
      year !== null && year !== previousYear ? h('span', { class: 'cg-index__year' }, year) : null,
      iso === undefined || day === null
        ? null
        : h('time', { class: 'cg-index__date', datetime: iso }, day),
    ),
    h(
      'div',
      { class: 'cg-index__body' },
      title(entry, ctx, url, 'cg-index', tag),
      excerpt === undefined ? null : h('p', { class: 'cg-index__excerpt' }, excerpt),
    ),
    media,
  )
  return { node, year: year ?? previousYear }
}

/**
 * `grid` and `carousel`: a shelf of essays. A picture at 3:2 when there is
 * one, the month and year, the title and the standfirst; an entry without a
 * picture starts at its date under the same hairline, so a shelf that mixes
 * both still aligns on its titles' baselines.
 */
function renderShelfItem(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const url = entryHref(entry, ctx)
  const iso = publicationDate(entry)
  const date = iso === undefined ? null : longDate(iso, ctx.locale)
  const excerpt = entryExcerpt(entry)
  const media = picture(
    entry,
    ctx,
    url,
    'cg-shelf',
    '(min-width: 64rem) 24rem, (min-width: 40rem) 45vw, 100vw',
  )
  return h(
    'li',
    { class: 'cg-shelf__item', 'data-media': media === null ? 'none' : 'present' },
    media,
    iso === undefined || date === null
      ? null
      : h('time', { class: 'cg-shelf__date', datetime: iso }, date),
    title(entry, ctx, url, 'cg-shelf', tag),
    excerpt === undefined ? null : h('p', { class: 'cg-shelf__excerpt' }, excerpt),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const entryTag = nestedHeadingTag('collectionList', block.title !== undefined)

  let items: HtmlElement
  if (entries.length === 0) {
    items = h('p', { class: 'cg-collection__empty' }, ctx.t('collection.empty'))
  } else if (block.layout === 'list') {
    let year: string | null = null
    const rows = entries.map((entry) => {
      const row = renderIndexRow(entry, year, ctx, entryTag)
      year = row.year
      return row.node
    })
    items = h('ol', { class: 'cg-index' }, rows)
  } else {
    items = h(
      'ul',
      { class: 'cg-shelf', 'data-count': String(Math.min(entries.length, 4)) },
      entries.map((entry) => renderShelfItem(entry, ctx, entryTag)),
    )
  }

  return section(
    'section',
    'collectionList',
    'cg-collection',
    { 'data-layout': block.layout },
    'div',
    sectionHead('collectionList', block.title),
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
