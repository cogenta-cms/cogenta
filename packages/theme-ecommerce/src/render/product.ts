import {
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
  firstText,
  formatPrice,
  ORDER_FIELDS,
  priceOf,
  stockOf,
  textOf,
} from './goods.js'
import { shopString } from './strings.js'

/**
 * The page of one product, and the plain title every other page gets.
 *
 * A product page (an entry whose `theme@1.5` fields carry a numeric `price`)
 * opens on two columns of the grid:
 *
 * - the photograph, large, on the first seven columns at 4:5;
 * - the information, on the last four, held in view while the photograph
 *   scrolls past: the category, the name, the price in tabular figures, the
 *   stock status as a plain line, the short description, the action, the
 *   delivery note, then the details (material, dimensions, origin, care) as a
 *   ruled list.
 *
 * **The action is honest.** This theme draws no cart and no "Add to cart":
 * nothing in contract D or in a content entry can take a payment, and a
 * button that does nothing is worse than none. The entry names where the
 * piece can be ordered (`orderLink`: an email address, a payment link, a
 * marketplace page) and the action says what it does: "Order by email" for
 * an address, "Ask about the next batch" when that address is for a piece
 * that is sold out, "Order this piece" for any other link. An entry with no
 * such field gets no action at all.
 *
 * The body that follows is the entry's own blocks: the story of the piece,
 * and usually a list of more from its category.
 */

type Fields = Readonly<Record<string, PageEntryFieldValue>>

export function isProductPage(entry: PageEntryMeta | undefined): entry is PageEntryMeta {
  return entry !== undefined && priceOf(entry.fields?.price) !== undefined
}

function orderAction(fields: Fields, ctx: RenderContext, soldOut: boolean): HtmlElement | null {
  const target = firstText(fields, ORDER_FIELDS)
  if (target === undefined) return null
  const email = /^mailto:/i.test(target)
  const label =
    textOf(fields.orderLabel) ??
    (email
      ? shopString(ctx.locale, soldOut ? 'askAboutNextBatch' : 'orderByEmail')
      : shopString(ctx.locale, 'order'))
  const url = ctx.link(target)
  const external = /^https?:/i.test(url)
  return h(
    'p',
    { class: 'ce-product__order' },
    h(
      'a',
      {
        class: 'cg-action',
        'data-emphasis': soldOut ? 'secondary' : 'primary',
        href: url,
        rel: external ? 'noopener noreferrer' : undefined,
      },
      label,
    ),
  )
}

function details(fields: Fields, locale: string): HtmlElement | null {
  const rows = DETAIL_FIELDS.flatMap((name) => {
    const value = textOf(fields[name])
    if (value === undefined) return []
    return [
      h(
        'div',
        { class: 'ce-product__fact', 'data-fact': name },
        h('dt', { class: 'ce-product__fact-label' }, shopString(locale, name)),
        h('dd', { class: 'ce-product__fact-value' }, value),
      ),
    ]
  })
  if (rows.length === 0) return null
  return h(
    'div',
    { class: 'ce-product__details' },
    h('h2', { class: 'ce-product__details-title' }, shopString(locale, 'details')),
    h('dl', { class: 'ce-product__facts' }, rows),
  )
}

function terms(entry: PageEntryMeta): HtmlElement | null {
  if (entry.terms === undefined || entry.terms.length === 0) return null
  return h(
    'ul',
    { class: 'ce-product__terms' },
    entry.terms.map((term) =>
      h('li', {}, term.href === null ? term.label : h('a', { href: term.href }, term.label)),
    ),
  )
}

export function renderProductHeader(
  page: PageContent,
  entry: PageEntryMeta,
  ctx: RenderContext,
): HtmlElement {
  const fields: Fields = entry.fields ?? {}
  const price = priceOf(fields.price) as number
  const stock = stockOf(fields.inStock)
  const category = textOf(fields.category)
  const delivery = textOf(fields.delivery)
  const image = entry.image

  return h(
    'article',
    { class: 'ce-product', 'data-stock': stock, 'data-media': String(image !== undefined) },
    h(
      'div',
      { class: 'ce-container ce-product__inner' },
      image === undefined
        ? null
        : h(
            'figure',
            { class: 'ce-product__media' },
            renderImageSource(image, {
              className: 'ce-product__image',
              loading: 'eager',
              sizes: '(min-width: 64rem) 56vw, 100vw',
            }),
          ),
      h(
        'div',
        { class: 'ce-product__info' },
        category === undefined ? null : h('p', { class: 'ce-product__category' }, category),
        h('h1', { class: 'ce-product__title' }, page.title),
        h(
          'p',
          { class: 'ce-product__price' },
          h('span', { class: 'cg-visually-hidden' }, `${shopString(ctx.locale, 'price')} `),
          h(
            'data',
            { value: String(price) },
            formatPrice(price, currencyOf(fields.currency), ctx.locale),
          ),
        ),
        stock === undefined
          ? null
          : h(
              'p',
              { class: 'ce-product__stock', 'data-stock': stock },
              shopString(ctx.locale, stock === 'in' ? 'inStock' : 'soldOut'),
            ),
        entry.excerpt === undefined
          ? null
          : h('p', { class: 'ce-product__summary' }, entry.excerpt),
        orderAction(fields, ctx, stock === 'out'),
        delivery === undefined
          ? null
          : h(
              'p',
              { class: 'ce-product__delivery' },
              h(
                'span',
                { class: 'ce-product__delivery-label' },
                shopString(ctx.locale, 'delivery'),
              ),
              ' ',
              delivery,
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
 * Date, author and reading time, for a dated entry only: a category or an
 * "About" page is not something a shopper reads against the clock.
 */
function pageMeta(entry: PageEntryMeta, ctx: RenderContext): HtmlElement | null {
  if (entry.publishedAt === undefined) return null
  const parts: HtmlElement[] = [
    h('time', { datetime: entry.publishedAt }, formatDate(entry.publishedAt, ctx.locale)),
  ]
  if (entry.author !== undefined) parts.push(h('span', {}, entry.author.name))
  if (entry.readingMinutes !== undefined) {
    parts.push(h('span', {}, ctx.t('entry.readingTime', { minutes: entry.readingMinutes })))
  }
  return h('p', { class: 'ce-page-head__meta' }, parts)
}

/**
 * Any other page: its title large on the grid, the entry's summary beside it
 * at the lead size when it has one. A dated entry (a journal letter) also
 * carries its date, author and reading time in one small line, and its cover
 * under the title. An undated entry with a picture (a category) keeps the
 * picture for the lists that link to it: its own page opens on words and lets
 * the goods below carry the photographs.
 */
export function renderPageHeader(page: PageContent, ctx: RenderContext): HtmlElement {
  const entry = page.entry
  const cover = entry?.publishedAt === undefined ? undefined : entry.image
  return h(
    'header',
    { class: 'ce-page-head', 'data-cover': String(cover !== undefined) },
    h(
      'div',
      { class: 'ce-container ce-page-head__inner' },
      h('h1', { class: 'ce-page-head__title' }, page.title),
      entry?.excerpt === undefined ? null : h('p', { class: 'ce-page-head__lead' }, entry.excerpt),
      entry === undefined ? null : pageMeta(entry, ctx),
      cover === undefined
        ? null
        : h(
            'figure',
            { class: 'ce-page-head__cover' },
            renderImageSource(cover, {
              className: 'ce-page-head__image',
              loading: 'eager',
              sizes: '(min-width: 90rem) 86rem, 100vw',
            }),
          ),
    ),
  )
}
