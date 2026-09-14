import type { CollectionListBlock } from '@cogenta/blocks'
import {
  buildCollectionListQuery,
  type ContentEntry,
  entryDate,
  entryExcerpt,
  entryHref,
  entryImage,
  entryTitle,
  type HtmlElement,
  h,
  nestedHeadingTag,
  type QueryRequest,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { DOC_PAGE_COLLECTION, groupDocPages } from '../doc-index.js'
import { longDate, section, sectionHead } from '../layout.js'

/**
 * A list of entries, read by what they are as much as by the layout chosen.
 *
 * - **Doc pages: the documentation, by section.** The home page's "Browse"
 *   block. One column per section (sections in the order the documentation
 *   reads, pages by their own `order`), the section named in a small heading
 *   over a hairline, its pages as a plain column of links. Up to four columns
 *   on a desk, two on a tablet, one on a phone. The layout an editor picked
 *   is ignored on purpose: a table of contents is not a carousel.
 * - **`list`: an index.** Ruled rows: the title, the summary under it, and a
 *   date on the right when the entry has one, in tabular numerals.
 * - **`grid`**: three columns without cards. A picture, when there is one,
 *   in the hairline frame at 16:10, then the title, the summary and the date.
 * - **`carousel`**: the same items in one row that scrolls sideways.
 *
 * Each picture repeats the link of its title, so it is taken out of the tab
 * order and hidden from assistive technology: one link per entry.
 */

function renderDocIndex(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  tag: string,
): HtmlElement {
  const groups = groupDocPages(entries, ctx)
  return h(
    'div',
    { class: 'cd-browse', 'data-count': String(Math.min(groups.length, 4)) },
    groups.map((group) =>
      h(
        'div',
        { class: 'cd-browse__group' },
        h(tag, { class: 'cd-browse__heading' }, group.section),
        h(
          'ul',
          { class: 'cd-browse__links' },
          group.entries.map((entry) =>
            h(
              'li',
              { class: 'cd-browse__item' },
              h(
                'a',
                { class: 'cd-browse__link', href: entryHref(entry, ctx) },
                entryTitle(entry, ctx),
              ),
            ),
          ),
        ),
      ),
    ),
  )
}

function dateOf(entry: ContentEntry, ctx: RenderContext, className: string): HtmlElement | null {
  const date = entryDate(entry)
  if (date === undefined) return null
  return h('time', { class: className, datetime: date }, longDate(date, ctx.locale))
}

function indexRow(entry: ContentEntry, ctx: RenderContext, tag: string): HtmlElement {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cd-index__item' },
    h(
      'div',
      { class: 'cd-index__words' },
      h(
        tag,
        { class: 'cd-index__title' },
        h('a', { class: 'cd-index__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      excerpt === undefined ? null : h('p', { class: 'cd-index__text' }, excerpt),
    ),
    dateOf(entry, ctx, 'cd-index__date'),
  )
}

function card(entry: ContentEntry, ctx: RenderContext, tag: string): HtmlElement {
  const excerpt = entryExcerpt(entry)
  const source = entryImage(entry, ctx)
  return h(
    'li',
    { class: 'cd-cards__item' },
    source === undefined
      ? null
      : h(
          'a',
          {
            class: 'cd-cards__media cd-frame',
            href: entryHref(entry, ctx),
            tabindex: -1,
            'aria-hidden': 'true',
          },
          renderImageSource(source, {
            className: 'cd-frame__image',
            sizes: '(min-width: 64rem) 24rem, (min-width: 40rem) 50vw, 100vw',
          }),
        ),
    h(
      tag,
      { class: 'cd-cards__title' },
      h('a', { class: 'cd-cards__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    excerpt === undefined ? null : h('p', { class: 'cd-cards__text' }, excerpt),
    dateOf(entry, ctx, 'cd-cards__date'),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const tag = nestedHeadingTag('collectionList', block.title !== undefined)
  const docs = block.collection === DOC_PAGE_COLLECTION
  const shape = entries.length === 0 ? 'empty' : docs ? 'docs' : block.layout

  const body =
    shape === 'empty'
      ? h('p', { class: 'cd-empty' }, ctx.t('collection.empty'))
      : shape === 'docs'
        ? renderDocIndex(entries, ctx, tag)
        : shape === 'list'
          ? h(
              'ul',
              { class: 'cd-index' },
              entries.map((entry) => indexRow(entry, ctx, tag)),
            )
          : h(
              'ul',
              {
                class: 'cd-cards',
                'data-carousel': shape === 'carousel' ? 'true' : 'false',
                ...(shape === 'carousel'
                  ? {
                      role: 'region',
                      'aria-label': block.title ?? ctx.t('collection.carousel'),
                      tabindex: 0,
                    }
                  : {}),
              },
              entries.map((entry) => card(entry, ctx, tag)),
            )

  return section(
    'section',
    'collectionList',
    'cd-list',
    { 'data-layout': block.layout, 'data-shape': shape },
    'div',
    sectionHead('collectionList', block.title),
    body,
  )
}

/** The query this block needs, fetched by the host before any markup is built. */
export function query(block: CollectionListBlock): QueryRequest {
  return buildCollectionListQuery(block)
}
