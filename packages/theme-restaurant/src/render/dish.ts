import {
  authorNode,
  type HtmlElement,
  h,
  type PageContent,
  type PageEntryFieldValue,
  type PageEntryMeta,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import {
  currencyOf,
  DETAIL_FIELDS,
  formatPrice,
  isVegetarian,
  priceOf,
  sectionOf,
  textOf,
} from './menu.js'
import { menuString } from './strings.js'

/**
 * The page of one dish, and the plain title every other page gets.
 *
 * A dish page (an entry whose `theme@1.5` fields carry a numeric `price`)
 * opens on two columns of the grid, the way a waiter would describe a plate:
 *
 * - the photograph, on the first six columns, cropped to 4:5 like every dish
 *   photograph on the site;
 * - on the last five, the part of the menu it belongs to in small capitals,
 *   the name in the display serif, the short description in italic, the
 *   price in tabular figures on a hairline, and then its details (where it
 *   comes from, what to drink with it, the allergens) as a ruled list.
 *
 * A dish without a photograph keeps the same words on the first seven
 * columns, so a glass of wine does not open on an empty frame.
 *
 * There is nothing to order on this page, and nothing pretends there is: a
 * restaurant takes a table, not a dish, and the way to book lives on the
 * site's own reservations page, linked from the header on every page.
 */

type Fields = Readonly<Record<string, PageEntryFieldValue>>

export function isDishPage(entry: PageEntryMeta | undefined): entry is PageEntryMeta {
  return entry !== undefined && priceOf(entry.fields?.price) !== undefined
}

function details(fields: Fields, locale: string): HtmlElement | null {
  const rows = DETAIL_FIELDS.flatMap((name) => {
    const value = textOf(fields[name])
    if (value === undefined) return []
    return [
      h(
        'div',
        { class: 'cr-dish__fact', 'data-fact': name },
        h('dt', { class: 'cr-dish__fact-label' }, menuString(locale, name)),
        h('dd', { class: 'cr-dish__fact-value' }, value),
      ),
    ]
  })
  if (rows.length === 0) return null
  return h(
    'div',
    { class: 'cr-dish__details' },
    h('h2', { class: 'cg-visually-hidden' }, menuString(locale, 'details')),
    h('dl', { class: 'cr-dish__facts' }, rows),
  )
}

function terms(entry: PageEntryMeta): HtmlElement | null {
  if (entry.terms === undefined || entry.terms.length === 0) return null
  return h(
    'ul',
    { class: 'cr-dish__terms' },
    entry.terms.map((term) =>
      h('li', {}, term.href === null ? term.label : h('a', { href: term.href }, term.label)),
    ),
  )
}

export function renderDishHeader(
  page: PageContent,
  entry: PageEntryMeta,
  ctx: RenderContext,
): HtmlElement {
  const fields: Fields = entry.fields ?? {}
  const price = priceOf(fields.price) as number
  const section = sectionOf(fields)
  const image = entry.image

  return h(
    'article',
    { class: 'cr-dish', 'data-media': String(image !== undefined) },
    h(
      'div',
      { class: 'cr-container cr-dish__inner' },
      image === undefined
        ? null
        : h(
            'figure',
            { class: 'cr-dish__media' },
            renderImageSource(image, {
              className: 'cr-dish__image',
              loading: 'eager',
              sizes: '(min-width: 64rem) 48vw, 100vw',
            }),
          ),
      h(
        'div',
        { class: 'cr-dish__info' },
        section === undefined ? null : h('p', { class: 'cr-dish__section' }, section),
        h('h1', { class: 'cr-dish__title' }, page.title),
        entry.excerpt === undefined ? null : h('p', { class: 'cr-dish__summary' }, entry.excerpt),
        h(
          'p',
          { class: 'cr-dish__price-line' },
          h(
            'span',
            { class: 'cr-dish__price' },
            h('span', { class: 'cg-visually-hidden' }, `${menuString(ctx.locale, 'price')} `),
            h(
              'data',
              { value: String(price) },
              formatPrice(price, currencyOf(fields.currency), ctx.locale),
            ),
          ),
          isVegetarian(fields)
            ? h('span', { class: 'cr-dish__diet' }, menuString(ctx.locale, 'vegetarian'))
            : null,
        ),
        details(fields, ctx.locale),
        terms(entry),
      ),
    ),
  )
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * Date, author and reading time, for a dated entry only: an opening-hours
 * page is not something a guest reads against the clock.
 */
function pageMeta(entry: PageEntryMeta, ctx: RenderContext): HtmlElement | null {
  if (entry.publishedAt === undefined) return null
  const parts: HtmlElement[] = [
    h('time', { datetime: entry.publishedAt }, formatDate(entry.publishedAt, ctx.locale)),
  ]
  if (entry.author !== undefined) parts.push(authorNode(entry.author))
  if (entry.readingMinutes !== undefined) {
    parts.push(h('span', {}, ctx.t('entry.readingTime', { minutes: entry.readingMinutes })))
  }
  return h('p', { class: 'cr-page-head__meta' }, parts)
}

/**
 * Any other page: its title large and light on the grid, the entry's summary
 * under it in the serif italic when it has one. A dated entry (a note from
 * the kitchen) also carries its date, author and reading time in one small
 * line, and its cover photograph under the title. An undated entry with a
 * picture keeps the picture for the lists that link to it: its own page
 * opens on words.
 */
export function renderPageHeader(page: PageContent, ctx: RenderContext): HtmlElement {
  const entry = page.entry
  const cover = entry?.publishedAt === undefined ? undefined : entry.image
  return h(
    'header',
    { class: 'cr-page-head', 'data-cover': String(cover !== undefined) },
    h(
      'div',
      { class: 'cr-container cr-page-head__inner' },
      h('h1', { class: 'cr-page-head__title' }, page.title),
      entry?.excerpt === undefined ? null : h('p', { class: 'cr-page-head__lead' }, entry.excerpt),
      entry === undefined ? null : pageMeta(entry, ctx),
      cover === undefined
        ? null
        : h(
            'figure',
            { class: 'cr-page-head__cover' },
            renderImageSource(cover, {
              className: 'cr-page-head__image',
              loading: 'eager',
              sizes: '(min-width: 90rem) 86rem, 100vw',
            }),
          ),
    ),
  )
}
