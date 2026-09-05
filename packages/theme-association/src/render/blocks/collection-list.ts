import type { CollectionListBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
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
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'

/**
 * The only block of the seventeen that reads data at render time — contract
 * B marks it `runtime: 'server'` for that reason. The read is *not* done
 * here: `query` builds the request from the block's own fields, the caller
 * awaits `ctx.content.list(...)` before rendering starts, and this function
 * stays a pure function of the entries handed to it.
 */
export { buildCollectionListQuery as query }

/** A string field, read straight off the raw entry — never invented. */
function stringField(entry: ContentEntry, field: string): string | undefined {
  const value = entry[field]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * "Upcoming events" cards are what this block is built around: a rounded,
 * shadowed card whose left edge carries a big day/month badge, built
 * straight from the entry's own `date` field when it has one — never from
 * `entryDate` (which reads `publishedAt`/`createdAt`, a system field with a
 * different meaning for an event than the date it actually happens on).
 * `location` is read the same direct way, since it too is a schema field no
 * shared helper names.
 *
 * An entry from a collection with neither `date` nor `location` — any other
 * collection a site points a `collectionList` at — falls back to the same
 * title/excerpt/cover row every other theme's list block shows, so this
 * block stays generically usable, not association-only.
 */
function renderEntry(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const rawDate = stringField(entry, 'date')
  const parsed = rawDate === undefined ? null : new Date(rawDate)
  const hasDate = parsed !== null && !Number.isNaN(parsed.getTime())
  const location = stringField(entry, 'location')
  const excerpt = entryExcerpt(entry)
  const cover = entryImage(entry, ctx, { width: 320, height: 320, fit: 'cover' })

  const badge = !hasDate
    ? null
    : h(
        'time',
        { class: 'cg-event-card__date', datetime: rawDate },
        h('span', { class: 'cg-event-card__day' }, String((parsed as Date).getDate())),
        h(
          'span',
          { class: 'cg-event-card__month' },
          new Intl.DateTimeFormat(ctx.locale, { month: 'short' }).format(parsed as Date),
        ),
        h(
          'span',
          { class: 'cg-event-card__time' },
          new Intl.DateTimeFormat(ctx.locale, { hour: 'numeric', minute: '2-digit' }).format(
            parsed as Date,
          ),
        ),
      )

  return h(
    'li',
    { class: 'cg-event-card' },
    badge,
    cover === undefined
      ? null
      : h('div', { class: 'cg-event-card__cover' }, renderImageSource(cover, { loading: 'lazy' })),
    h(
      'div',
      { class: 'cg-event-card__body' },
      location === undefined ? null : h('p', { class: 'cg-event-card__location' }, location),
      heading(
        tag,
        { class: 'cg-event-card__title' },
        h(
          'a',
          { class: 'cg-event-card__link', href: entryHref(entry, ctx) },
          entryTitle(entry, ctx),
        ),
      ),
      excerpt === undefined ? null : h('p', { class: 'cg-event-card__excerpt' }, excerpt),
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
          { class: 'cg-list__items cg-event-cards' },
          entries.map((entry) => renderEntry(entry, ctx, entryTag)),
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
