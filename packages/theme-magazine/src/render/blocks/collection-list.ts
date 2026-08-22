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
 * The masthead's front page — this theme's one block that reads data at
 * render time (contract B marks `collectionList` `runtime: 'server'` for
 * exactly that reason). As in the reference theme, the read itself happens
 * before any markup is built: `query` is `@cogenta/theme-kit`'s own
 * `buildCollectionListQuery`, re-exported unchanged, and this function stays
 * a pure function of the entries it is handed.
 *
 * The distinctive part is editorial, not technical: a `list`/`grid` layout
 * gives its first entry a lead-story treatment — the big headline, the full
 * excerpt, the "Featured" kicker — and renders the rest as a compact,
 * numbered index below a hairline rule, the way a front page runs one story
 * large and the day's other headlines in a column beside it. No entry field
 * beyond title/excerpt/date is assumed to exist (contract A does not fix
 * one), so the hierarchy is entirely typographic. `carousel` opts out of the
 * split — a horizontal scroller reads better as one even row of stories.
 */
export { buildCollectionListQuery as query }

function renderLead(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'article',
    { class: 'cg-issue__lead' },
    h('p', { class: 'cg-issue__kicker' }, ctx.t('collection.featured')),
    heading(
      tag,
      { class: 'cg-issue__lead-title' },
      h('a', { class: 'cg-issue__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    excerpt === undefined ? null : h('p', { class: 'cg-issue__lead-excerpt' }, excerpt),
    date === undefined
      ? null
      : h(
          'time',
          { class: 'cg-issue__lead-date', datetime: date },
          new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'long' }).format(new Date(date)),
        ),
  )
}

function renderCompact(
  entry: ContentEntry,
  ctx: RenderContext,
  tag: HeadingTag,
  index: number,
): HtmlElement {
  const date = entryDate(entry)
  return h(
    'li',
    { class: 'cg-issue__row' },
    h(
      'span',
      { class: 'cg-issue__row-number', 'aria-hidden': 'true' },
      String(index).padStart(2, '0'),
    ),
    h(
      'div',
      { class: 'cg-issue__row-body' },
      heading(
        tag,
        { class: 'cg-issue__row-title' },
        h('a', { class: 'cg-issue__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      date === undefined
        ? null
        : h(
            'time',
            { class: 'cg-issue__row-date', datetime: date },
            new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium' }).format(new Date(date)),
          ),
    ),
  )
}

function renderUniform(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  return h(
    'li',
    { class: 'cg-issue__frame' },
    heading(
      tag,
      { class: 'cg-issue__frame-title' },
      h('a', { class: 'cg-issue__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
    ),
    date === undefined
      ? null
      : h(
          'time',
          { class: 'cg-issue__frame-date', datetime: date },
          new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium' }).format(new Date(date)),
        ),
    excerpt === undefined ? null : h('p', { class: 'cg-issue__frame-excerpt' }, excerpt),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const hasTitle = block.title !== undefined
  const entryTag = nestedHeadingTag('collectionList', hasTitle)
  const splitLead = block.layout !== 'carousel'

  const body =
    entries.length === 0
      ? h('p', { class: 'cg-issue__empty' }, ctx.t('collection.empty'))
      : splitLead
        ? h(
            'div',
            { class: 'cg-issue__spread' },
            renderLead(entries[0] as ContentEntry, ctx, entryTag),
            entries.length === 1
              ? null
              : h(
                  'ol',
                  { class: 'cg-issue__rest' },
                  entries
                    .slice(1)
                    .map((entry, index) => renderCompact(entry, ctx, entryTag, index + 2)),
                ),
          )
        : h(
            'ul',
            { class: 'cg-issue__frames' },
            entries.map((entry) => renderUniform(entry, ctx, entryTag)),
          )

  return h(
    'section',
    {
      class: 'cg-block cg-issue',
      'data-block': 'collectionList',
      'data-layout': block.layout,
    },
    hasTitle
      ? heading(
          blockHeadingTag('collectionList') ?? 'h2',
          { class: 'cg-issue__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-issue__viewport',
            role: 'region',
            'aria-label': block.title ?? ctx.t('collection.carousel'),
            tabindex: '0',
          },
          body,
        )
      : body,
  )
}
