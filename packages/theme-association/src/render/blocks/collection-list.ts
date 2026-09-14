import type { CollectionListBlock } from '@cogenta/blocks'
import {
  buildCollectionListQuery,
  type ContentEntry,
  entryExcerpt,
  entryHref,
  entryImage,
  entryTitle,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type QueryRequest,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import {
  type EventTime,
  eventTimeOf,
  factsOf,
  hoursOf,
  placeOf,
  renderDateBlock,
  renderFacts,
  textOf,
} from '../details.js'
import { section, sectionHead } from '../layout.js'

/**
 * A list of entries, read by what the entries are rather than by a setting.
 *
 * - **Events.** Every entry carries a date (`eventTimeOf`), so this is a
 *   calendar, and it reads in date order whatever order the entries arrived
 *   in. `list` sets one event per row under a hairline: the date block (the
 *   month in small capitals, the day large, the weekday) on the first two
 *   columns, the title, the hours and the place, and the entry's summary;
 *   what it costs on the right. `grid` sets the same events three to a row
 *   under a rule; `carousel` in a row that scrolls sideways.
 * - **Programmes and stories with photographs.** Every entry has a picture.
 *   `list` alternates rows of picture and words, the picture a 4:5 crop on
 *   four columns, first on the left, then on the right; the words carry the
 *   entry's schedule in the organisation's green, its title, its summary and
 *   where it happens. `grid` sets the same entries three to a row;
 *   `carousel` in a row that scrolls sideways.
 * - **An index.** Anything else: ruled rows of titles and their summaries.
 *
 * The page an entry is shown on is never listed on itself: "more events" on
 * an event's own page skips the event above it.
 *
 * Each picture repeats the link of its title, so it is taken out of the tab
 * order and hidden from assistive technology: one link per entry is
 * announced, the title.
 */

type Shape = 'events' | 'rows' | 'photos' | 'index'

function shapeOf(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
  layout: CollectionListBlock['layout'],
): Shape {
  if (entries.every((entry) => eventTimeOf(entry) !== undefined)) return 'events'
  if (entries.every((entry) => entryImage(entry, ctx) !== undefined)) {
    return layout === 'list' ? 'rows' : 'photos'
  }
  return 'index'
}

function mediaLink(
  entry: ContentEntry,
  ctx: RenderContext,
  className: string,
  sizes: string,
): HtmlElement | null {
  const source = entryImage(entry, ctx)
  if (source === undefined) return null
  return h(
    'a',
    {
      class: `${className}__media`,
      href: entryHref(entry, ctx),
      tabindex: '-1',
      'aria-hidden': 'true',
    },
    renderImageSource(source, { className: `${className}__image`, sizes }),
  )
}

function titleLink(
  entry: ContentEntry,
  ctx: RenderContext,
  tag: HeadingTag,
  className: string,
): HtmlElement {
  return heading(
    tag,
    { class: `${className}__title` },
    h('a', { class: `${className}__link`, href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
  )
}

function event(
  entry: ContentEntry,
  time: EventTime,
  ctx: RenderContext,
  tag: HeadingTag,
): HtmlElement {
  const hours = hoursOf(time, ctx.locale)
  const place = placeOf(entry)
  const excerpt = entryExcerpt(entry)
  const cost = textOf(entry.cost)
  return h(
    'li',
    { class: 'ca-events__item' },
    renderDateBlock(time, ctx.locale, 'ca-date'),
    h(
      'div',
      { class: 'ca-events__body' },
      titleLink(entry, ctx, tag, 'ca-events'),
      hours === undefined && place === undefined
        ? null
        : h(
            'p',
            { class: 'ca-events__meta' },
            hours === undefined ? null : h('span', { class: 'ca-events__hours' }, hours),
            place === undefined ? null : h('span', { class: 'ca-events__place' }, place),
          ),
      excerpt === undefined ? null : h('p', { class: 'ca-events__text' }, excerpt),
    ),
    cost === undefined ? null : h('p', { class: 'ca-events__cost' }, cost),
  )
}

function row(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  const facts = factsOf(entry, ctx.locale)
  const when = facts.find((fact) => fact.key === 'when')
  const rest = facts.filter((fact) => fact.key === 'where' || fact.key === 'audience')
  return h(
    'li',
    { class: 'ca-rows__item' },
    mediaLink(entry, ctx, 'ca-rows', '(min-width: 64rem) 30vw, 100vw'),
    h(
      'div',
      { class: 'ca-rows__body' },
      when === undefined ? null : h('p', { class: 'ca-kicker ca-rows__when' }, when.value),
      titleLink(entry, ctx, tag, 'ca-rows'),
      excerpt === undefined ? null : h('p', { class: 'ca-rows__text' }, excerpt),
      renderFacts(rest, 'ca-rows__facts'),
    ),
  )
}

function photo(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'ca-photos__item' },
    mediaLink(entry, ctx, 'ca-photos', '(min-width: 64rem) 26vw, 80vw'),
    titleLink(entry, ctx, tag, 'ca-photos'),
    excerpt === undefined ? null : h('p', { class: 'ca-photos__text' }, excerpt),
  )
}

function indexItem(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'ca-index__item' },
    titleLink(entry, ctx, tag, 'ca-index'),
    excerpt === undefined ? null : h('p', { class: 'ca-index__text' }, excerpt),
  )
}

/** The entries that are not the page being rendered. */
function othersThanThisPage(
  entries: readonly ContentEntry[],
  ctx: RenderContext,
): readonly ContentEntry[] {
  return entries.filter((entry) => entryHref(entry, ctx) !== ctx.url.pathname)
}

function scroller(block: CollectionListBlock, ctx: RenderContext, list: HtmlElement): HtmlElement {
  return h(
    'div',
    {
      class: 'ca-list__viewport',
      role: 'region',
      'aria-label': block.title ?? ctx.t('collection.carousel'),
      tabindex: '0',
    },
    list,
  )
}

function body(
  shape: Shape,
  shown: readonly ContentEntry[],
  block: CollectionListBlock,
  ctx: RenderContext,
  tag: HeadingTag,
): HtmlElement {
  switch (shape) {
    case 'events': {
      const dated = shown
        .map((entry) => ({ entry, time: eventTimeOf(entry) as EventTime }))
        .sort((a, b) => a.time.start.date.getTime() - b.time.start.date.getTime())
      const list = h(
        'ul',
        { class: 'ca-list__items ca-events' },
        dated.map(({ entry, time }) => event(entry, time, ctx, tag)),
      )
      return block.layout === 'carousel' ? scroller(block, ctx, list) : list
    }
    case 'rows':
      return h(
        'ul',
        { class: 'ca-list__items ca-rows' },
        shown.map((entry) => row(entry, ctx, tag)),
      )
    case 'photos': {
      const list = h(
        'ul',
        { class: 'ca-list__items ca-photos' },
        shown.map((entry) => photo(entry, ctx, tag)),
      )
      return block.layout === 'carousel' ? scroller(block, ctx, list) : list
    }
    case 'index':
      return h(
        'ul',
        { class: 'ca-list__items ca-index' },
        shown.map((entry) => indexItem(entry, ctx, tag)),
      )
  }
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  fetched: readonly ContentEntry[],
): HtmlElement {
  const titled = block.title !== undefined
  const shown = othersThanThisPage(fetched, ctx)
  const tag = nestedHeadingTag('collectionList', titled)

  if (shown.length === 0) {
    return section(
      'section',
      'collectionList',
      'ca-list',
      { 'data-layout': block.layout, 'data-shape': 'empty' },
      'div',
      sectionHead('collectionList', block.title),
      h('p', { class: 'ca-empty' }, ctx.t('collection.empty')),
    )
  }

  const shape = shapeOf(shown, ctx, block.layout)
  return section(
    'section',
    'collectionList',
    'ca-list',
    { 'data-layout': block.layout, 'data-shape': shape },
    'div',
    sectionHead('collectionList', block.title),
    body(shape, shown, block, ctx, tag),
  )
}

/** The query this block needs, fetched by the host before any markup is built. */
export function query(block: CollectionListBlock): QueryRequest {
  return buildCollectionListQuery(block)
}
