import {
  type HtmlElement,
  h,
  type PageContent,
  type PageEntryMeta,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { eventTimeOf, factsOf, renderDateBlock, renderFacts } from './details.js'
import { associationString } from './strings.js'

/**
 * The opening of every page that has no hero. Three kinds, and exactly one
 * `h1` in each:
 *
 * - **An event** (its `theme@1.5` fields carry a date): the date block large
 *   on the first three columns, the way a noticeboard poster leads with the
 *   day; the title, the summary and the practical details (when, where, what
 *   it costs, whether to book) on the rest; the photograph under them across
 *   the container.
 * - **An entry with details or a photograph** (a programme, a story): the
 *   title, the summary and the details on the first seven columns; a portrait
 *   photograph beside them on the last four, a landscape one under them.
 * - **Anything else** (about, donate, a privacy notice): the title large on
 *   the grid, and the summary under it when there is one.
 *
 * A host older than `theme@1.5` sends no fields, so its event pages open like
 * any other entry: title, summary and photograph, never a date read from
 * somewhere it was not given. A host older than `theme@1.4` sends no entry at
 * all, and the page opens on its bare title.
 */

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(iso),
    )
  } catch {
    return iso
  }
}

/** Date, author and reading time, for an entry that has a publication date. */
function meta(entry: PageEntryMeta, ctx: RenderContext): HtmlElement | null {
  if (entry.publishedAt === undefined) return null
  return h(
    'p',
    { class: 'ca-page-head__meta' },
    h('time', { datetime: entry.publishedAt }, formatDate(entry.publishedAt, ctx.locale)),
    entry.author === undefined ? null : h('span', {}, entry.author.name),
    entry.readingMinutes === undefined
      ? null
      : h('span', {}, ctx.t('entry.readingTime', { minutes: entry.readingMinutes })),
  )
}

function terms(entry: PageEntryMeta): HtmlElement | null {
  if (entry.terms === undefined || entry.terms.length === 0) return null
  return h(
    'ul',
    { class: 'ca-page-head__terms' },
    entry.terms.map((term) =>
      h('li', {}, term.href === null ? term.label : h('a', { href: term.href }, term.label)),
    ),
  )
}

function details(entry: PageEntryMeta, ctx: RenderContext, className: string): HtmlElement | null {
  const facts = renderFacts(factsOf(entry.fields ?? {}, ctx.locale), 'ca-facts')
  if (facts === null) return null
  return h(
    'div',
    { class: className },
    h('h2', { class: 'cg-visually-hidden' }, associationString(ctx.locale, 'details')),
    facts,
  )
}

function renderEventHead(
  page: PageContent,
  entry: PageEntryMeta,
  ctx: RenderContext,
): HtmlElement | null {
  const time = eventTimeOf(entry.fields)
  if (time === undefined) return null
  return h(
    'header',
    { class: 'ca-event', 'data-cover': String(entry.image !== undefined) },
    h(
      'div',
      { class: 'ca-container ca-event__inner' },
      h(
        'div',
        { class: 'ca-event__date' },
        renderDateBlock(time, ctx.locale, 'ca-when', { year: true }),
      ),
      h(
        'div',
        { class: 'ca-event__heading' },
        terms(entry),
        h('h1', { class: 'ca-event__title' }, page.title),
        entry.excerpt === undefined ? null : h('p', { class: 'ca-event__lead' }, entry.excerpt),
      ),
      details(entry, ctx, 'ca-event__details'),
      entry.image === undefined
        ? null
        : h(
            'figure',
            { class: 'ca-event__cover' },
            renderImageSource(entry.image, {
              className: 'ca-event__image',
              loading: 'eager',
              sizes: '(min-width: 82rem) 78rem, 100vw',
            }),
          ),
    ),
  )
}

function renderEntryHead(
  page: PageContent,
  entry: PageEntryMeta,
  ctx: RenderContext,
): HtmlElement | null {
  const facts = details(entry, ctx, 'ca-entry__details')
  const cover = entry.image
  if (facts === null && cover === undefined) return null
  const orientation =
    cover === undefined ? 'none' : cover.height > cover.width ? 'portrait' : 'landscape'
  return h(
    'header',
    { class: 'ca-entry', 'data-cover': orientation },
    h(
      'div',
      { class: 'ca-container ca-entry__inner' },
      h(
        'div',
        { class: 'ca-entry__heading' },
        terms(entry),
        h('h1', { class: 'ca-entry__title' }, page.title),
        entry.excerpt === undefined ? null : h('p', { class: 'ca-entry__lead' }, entry.excerpt),
        meta(entry, ctx),
        facts,
      ),
      cover === undefined
        ? null
        : h(
            'figure',
            { class: 'ca-entry__cover' },
            renderImageSource(cover, {
              className: 'ca-entry__image',
              loading: 'eager',
              sizes:
                orientation === 'portrait'
                  ? '(min-width: 64rem) 30vw, 100vw'
                  : '(min-width: 82rem) 78rem, 100vw',
            }),
          ),
    ),
  )
}

function renderPlainHead(page: PageContent, ctx: RenderContext): HtmlElement {
  const entry = page.entry
  return h(
    'header',
    { class: 'ca-page-head' },
    h(
      'div',
      { class: 'ca-container ca-page-head__inner' },
      entry === undefined ? null : terms(entry),
      h('h1', { class: 'ca-page-head__title' }, page.title),
      entry?.excerpt === undefined ? null : h('p', { class: 'ca-page-head__lead' }, entry.excerpt),
      entry === undefined ? null : meta(entry, ctx),
    ),
  )
}

export type PageHeadKind = 'event' | 'entry' | 'page'

export function renderPageHead(
  page: PageContent,
  ctx: RenderContext,
): { readonly kind: PageHeadKind; readonly node: HtmlElement } {
  const entry = page.entry
  if (entry !== undefined) {
    const eventHead = renderEventHead(page, entry, ctx)
    if (eventHead !== null) return { kind: 'event', node: eventHead }
    const entryHead = renderEntryHead(page, entry, ctx)
    if (entryHead !== null) return { kind: 'entry', node: entryHead }
  }
  return { kind: 'page', node: renderPlainHead(page, ctx) }
}
