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
 * B marks it `runtime: 'server'` for that reason. The read is *not* done
 * here: `query` builds the request from the block's own fields
 * (`@cogenta/theme-kit`'s `buildCollectionListQuery`, shared across every
 * theme), the caller awaits `ctx.content.list(...)` before rendering
 * starts, and this function stays a pure function of the entries handed to
 * it.
 */
export { buildCollectionListQuery as query }

/**
 * The general-purpose row: a cover image (`entryImage`, contract D
 * `theme@1.4`) when the collection carries one, title, excerpt and date —
 * this is what a non-docs collection placed in this block gets.
 */
function renderRow(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  const image = entryImage(entry, ctx)
  return h(
    'li',
    { class: 'cg-list__row' },
    image === undefined
      ? null
      : h(
          'div',
          { class: 'cg-list__thumb' },
          renderImageSource(image, { loading: 'lazy', className: 'cg-list__thumb-image' }),
        ),
    h(
      'div',
      { class: 'cg-list__body' },
      heading(
        tag,
        { class: 'cg-list__title' },
        h('a', { class: 'cg-list__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      date === undefined
        ? null
        : h(
            'time',
            { class: 'cg-list__date', datetime: date },
            new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'long' }).format(new Date(date)),
          ),
      excerpt === undefined ? null : h('p', { class: 'cg-list__excerpt' }, excerpt),
    ),
  )
}

/**
 * `doc_page`'s own layout: a compact, multi-column index grouped by the
 * entry's own `section` field and ordered by its own `order` field within
 * each group — neither is a valid `collectionList.sort.field` (contract B
 * fixes that union to `id`/`createdAt`/`updatedAt`), so the theme re-groups
 * and re-sorts the already-fetched slice itself rather than asking for a
 * sort the contract does not offer. Sections are ordered alphabetically for
 * a deterministic page; entries within a section fall back to the order
 * they were fetched in when `order` is absent or not a number.
 */
function renderGuidesIndex(entries: readonly ContentEntry[], ctx: RenderContext): HtmlElement {
  const groups = new Map<string, ContentEntry[]>()
  entries.forEach((entry) => {
    const section =
      typeof entry.section === 'string' && entry.section !== ''
        ? entry.section
        : ctx.t('entry.untitled')
    const list = groups.get(section) ?? []
    list.push(entry)
    groups.set(section, list)
  })

  const sortedSections = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))

  return h(
    'div',
    { class: 'cg-guides' },
    sortedSections.map(([section, sectionEntries]) => {
      const ordered = [...sectionEntries].sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
        const orderB = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
        return orderA - orderB
      })
      return h(
        'div',
        { class: 'cg-guides__section' },
        h('h3', { class: 'cg-guides__heading' }, section),
        h(
          'ul',
          { class: 'cg-guides__items' },
          ordered.map((entry) =>
            h(
              'li',
              { class: 'cg-guides__item' },
              h(
                'a',
                { class: 'cg-guides__link', href: entryHref(entry, ctx) },
                entryTitle(entry, ctx),
              ),
            ),
          ),
        ),
      )
    }),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const hasTitle = block.title !== undefined
  const entryTag = nestedHeadingTag('collectionList', hasTitle)
  const isGuidesIndex = block.collection === 'doc_page'

  const body =
    entries.length === 0
      ? h('p', { class: 'cg-list__empty' }, ctx.t('collection.empty'))
      : isGuidesIndex
        ? renderGuidesIndex(entries, ctx)
        : h(
            'ul',
            { class: 'cg-list__items' },
            entries.map((entry) => renderRow(entry, ctx, entryTag)),
          )

  return h(
    'section',
    { class: 'cg-block cg-list', 'data-block': 'collectionList', 'data-layout': block.layout },
    hasTitle
      ? heading(
          blockHeadingTag('collectionList') ?? 'h2',
          { class: 'cg-list__title-heading', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    block.layout === 'carousel' && !isGuidesIndex
      ? h(
          'div',
          {
            class: 'cg-list__viewport',
            role: 'region',
            'aria-label': block.title ?? ctx.t('collection.carousel'),
            tabindex: '0',
          },
          body,
        )
      : body,
  )
}
