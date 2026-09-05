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

/**
 * The only block of the seventeen that reads data at render time — contract
 * B marks it `runtime: 'server'` for that reason.
 *
 * The read is *not* done here. `query` builds the request
 * (`@cogenta/theme-kit`'s `buildCollectionListQuery`, shared across every
 * theme since it derives purely from the block's own fields), the caller
 * awaits `ctx.content.list(...)` before rendering starts, and this function
 * stays a pure function of the entries it is handed.
 *
 * `list` keeps this theme's original register — a numbered mono index, the
 * title set at feature-headline scale, the date pushed to the far edge —
 * unchanged since L23. `grid`/`carousel` (`theme@1.4`) retile the same
 * entries into full-bleed project cards instead: a cover (`entryImage`,
 * 4:3), the title in display type, and — read straight off the raw
 * `ContentEntry` this block's entries already are, never invented — the
 * entry's own `role`/`year` fields as a meta line when a collection happens
 * to declare them (the `portfolio` blueprint's `project` does; any other
 * collection simply shows no meta line).
 */
export { buildCollectionListQuery as query }

function rawText(entry: ContentEntry, field: string): string | undefined {
  const value = entry[field]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** `role`/`year`, read straight off the entry — the "raw field" meta line a grid card shows when the collection behind it has them. */
function renderCardMeta(entry: ContentEntry): HtmlElement | null {
  const role = rawText(entry, 'role')
  const year = rawText(entry, 'year')
  if (role === undefined && year === undefined) return null
  return h(
    'p',
    { class: 'cg-collection__meta' },
    role === undefined ? null : h('span', { class: 'cg-collection__meta-role' }, role),
    year === undefined ? null : h('span', { class: 'cg-collection__meta-year' }, year),
  )
}

function renderCard(
  entry: ContentEntry,
  ctx: RenderContext,
  tag: HeadingTag,
  index: number,
): HtmlElement {
  const cover = entryImage(entry, ctx, { width: 900, height: 675, fit: 'cover' })
  return h(
    'li',
    { class: 'cg-entry cg-entry--card' },
    h(
      'article',
      { class: 'cg-entry__body' },
      h(
        'a',
        { class: 'cg-entry__cover-link', href: entryHref(entry, ctx), tabindex: -1 },
        cover === undefined
          ? h('span', { class: 'cg-entry__cover-empty', 'aria-hidden': 'true' })
          : renderImageSource(cover, {
              className: 'cg-entry__cover',
              sizes: '(min-width: 80rem) 50vw, 100vw',
            }),
      ),
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
      renderCardMeta(entry),
    ),
  )
}

function renderRow(
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
  const isTiled = block.layout === 'grid' || block.layout === 'carousel'
  const renderItem = isTiled ? renderCard : renderRow
  const items =
    entries.length === 0
      ? h('p', { class: 'cg-collection__empty' }, ctx.t('collection.empty'))
      : h(
          'ol',
          { class: 'cg-collection__items' },
          entries.map((entry, index) => renderItem(entry, ctx, entryTag, index)),
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
