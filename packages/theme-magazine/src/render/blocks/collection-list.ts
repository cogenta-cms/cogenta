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

export { buildCollectionListQuery as query }

/**
 * A rubric label, read from whichever of the usual "section-like" field
 * names a collection actually declares — the same "never invented, only the
 * usual convention" rule `entryImage`/`entryExcerpt` (`@cogenta/theme-kit`)
 * already follow, extended locally: contract D's `PageEntryMeta` only
 * resolves *taxonomy* classifications into an eyebrow (`renderEntryHeader`),
 * never an arbitrary `select` field, so a magazine whose "section" is a
 * plain field (the `magazine` blueprint's own choice — see `blueprints/
 * magazine.ts`, kept deliberately non-taxonomic so this exact value is
 * readable raw here) can still show it on a card, where the full
 * `ContentEntry` — unlike a rendered page's `PageEntryMeta` — is available.
 */
const SECTION_FIELDS = ['section', 'category', 'topic', 'department'] as const

function entrySection(entry: ContentEntry): string | undefined {
  for (const field of SECTION_FIELDS) {
    const value = entry[field]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

function formatDate(iso: string, ctx: RenderContext, style: 'long' | 'medium'): string {
  try {
    return new Intl.DateTimeFormat(ctx.locale, { dateStyle: style }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * The "une": a large 16:9 cover, the section eyebrow (falling back to the
 * generic "Featured" kicker when the entry carries none), a big headline and
 * the full excerpt — the front-page treatment `layout: 'grid'` gives its
 * first entry, per the L25 pro-pass brief.
 */
function renderLead(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  const section = entrySection(entry)
  const cover = entryImage(entry, ctx, { width: 1200, height: 675, fit: 'cover' })
  return h(
    'article',
    { class: 'cg-issue__lead' },
    cover === undefined
      ? null
      : h(
          'a',
          { class: 'cg-issue__lead-cover-link', href: entryHref(entry, ctx), tabindex: -1 },
          renderImageSource(cover, {
            className: 'cg-issue__lead-cover',
            loading: 'eager',
            sizes: '(min-width: 64rem) 76rem, 100vw',
          }),
        ),
    h('div', { class: 'cg-issue__lead-body' }, [
      h('p', { class: 'cg-issue__kicker' }, section ?? ctx.t('collection.featured')),
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
            formatDate(date, ctx, 'long'),
          ),
    ]),
  )
}

/** A card in the "rest" 3-column grid: cover, section eyebrow, title, date — no excerpt (the lead alone carries one). */
function renderCard(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const section = entrySection(entry)
  const cover = entryImage(entry, ctx, { width: 480, height: 320, fit: 'cover' })
  return h(
    'li',
    { class: 'cg-issue__card-item' },
    h(
      'article',
      { class: 'cg-issue__card' },
      cover === undefined
        ? null
        : h(
            'a',
            { class: 'cg-issue__card-cover-link', href: entryHref(entry, ctx), tabindex: -1 },
            renderImageSource(cover, {
              className: 'cg-issue__card-cover',
              sizes: '(min-width: 64rem) 24rem, (min-width: 48rem) 45vw, 100vw',
            }),
          ),
      section === undefined ? null : h('p', { class: 'cg-issue__card-eyebrow' }, section),
      heading(
        tag,
        { class: 'cg-issue__card-title' },
        h('a', { class: 'cg-issue__link', href: entryHref(entry, ctx) }, entryTitle(entry, ctx)),
      ),
      date === undefined
        ? null
        : h(
            'time',
            { class: 'cg-issue__card-date', datetime: date },
            formatDate(date, ctx, 'medium'),
          ),
    ),
  )
}

/**
 * A rail row for `layout: 'list'` — a small square thumbnail (when the entry
 * has one) beside the title and date, the "rubric rail" treatment; a plain
 * numbered row (this theme's original front-page-index look) when the entry
 * carries no image, so a collection with no cover field still reads as a
 * considered contents strip rather than a broken thumbnail.
 */
function renderRow(
  entry: ContentEntry,
  ctx: RenderContext,
  tag: HeadingTag,
  index: number,
): HtmlElement {
  const date = entryDate(entry)
  const cover = entryImage(entry, ctx, { width: 112, height: 112, fit: 'cover' })
  return h(
    'li',
    { class: 'cg-issue__row' },
    cover === undefined
      ? h(
          'span',
          { class: 'cg-issue__row-number', 'aria-hidden': 'true' },
          String(index).padStart(2, '0'),
        )
      : h(
          'a',
          { class: 'cg-issue__row-thumb-link', href: entryHref(entry, ctx), tabindex: -1 },
          renderImageSource(cover, { className: 'cg-issue__row-thumb' }),
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
            formatDate(date, ctx, 'medium'),
          ),
    ),
  )
}

/** A uniform frame for the horizontal-scroll `carousel` layout — a cover, the section eyebrow, title, date, excerpt. */
function renderFrame(entry: ContentEntry, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const date = entryDate(entry)
  const excerpt = entryExcerpt(entry)
  const section = entrySection(entry)
  const cover = entryImage(entry, ctx, { width: 480, height: 320, fit: 'cover' })
  return h(
    'li',
    { class: 'cg-issue__frame' },
    cover === undefined
      ? null
      : h(
          'a',
          { class: 'cg-issue__frame-cover-link', href: entryHref(entry, ctx), tabindex: -1 },
          renderImageSource(cover, { className: 'cg-issue__frame-cover' }),
        ),
    section === undefined ? null : h('p', { class: 'cg-issue__card-eyebrow' }, section),
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
          formatDate(date, ctx, 'medium'),
        ),
    excerpt === undefined ? null : h('p', { class: 'cg-issue__frame-excerpt' }, excerpt),
  )
}

function renderGrid(entries: readonly ContentEntry[], ctx: RenderContext, tag: HeadingTag) {
  const [first, ...rest] = entries
  if (first === undefined) return null
  return h(
    'div',
    { class: 'cg-issue__spread' },
    renderLead(first, ctx, tag),
    rest.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-issue__cards' },
          rest.map((entry) => renderCard(entry, ctx, tag)),
        ),
  )
}

function renderList(entries: readonly ContentEntry[], ctx: RenderContext, tag: HeadingTag) {
  return h(
    'ul',
    { class: 'cg-issue__rows' },
    entries.map((entry, index) => renderRow(entry, ctx, tag, index + 1)),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const hasTitle = block.title !== undefined
  const entryTag = nestedHeadingTag('collectionList', hasTitle)

  const body =
    entries.length === 0
      ? h('p', { class: 'cg-issue__empty' }, ctx.t('collection.empty'))
      : block.layout === 'grid'
        ? renderGrid(entries, ctx, entryTag)
        : block.layout === 'carousel'
          ? h(
              'div',
              {
                class: 'cg-issue__viewport',
                role: 'region',
                'aria-label': block.title ?? ctx.t('collection.carousel'),
                tabindex: '0',
              },
              h(
                'ul',
                { class: 'cg-issue__frames' },
                entries.map((entry) => renderFrame(entry, ctx, entryTag)),
              ),
            )
          : renderList(entries, ctx, entryTag)

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
    body,
  )
}
