import {
  authorNode,
  type HtmlElement,
  h,
  type PageContent,
  type PageEntryMeta,
  type PageEntryTerm,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { longDate, withAttributes } from './layout.js'

/**
 * The header and the close of an article, built from `PageContent.entry`
 * (contract D `theme@1.4`) rather than from `renderEntryHeader`'s shared
 * default, because this theme sets the furniture its own way: the topic label
 * in the accent over the headline, the headline in the condensed display
 * face across nine columns, the standfirst under it, a byline row (author,
 * date, reading time) between two rules, and the lead picture across the
 * whole container.
 */

/** Below this, a reading time tells a reader nothing they can use. */
const MIN_READING_MINUTES_SHOWN = 2

/**
 * A page is set as an essay when its entry carries anything an essay has
 * (a date, a standfirst, a cover, a classification or a reading time). A
 * plain page with only an update time keeps the plain title.
 */
export function isArticle(entry: PageEntryMeta | undefined): entry is PageEntryMeta {
  if (entry === undefined) return false
  return (
    entry.publishedAt !== undefined ||
    entry.excerpt !== undefined ||
    entry.image !== undefined ||
    (entry.terms ?? []).length > 0 ||
    (entry.readingMinutes ?? 0) >= MIN_READING_MINUTES_SHOWN
  )
}

function termLink(term: PageEntryTerm, className: string): HtmlElement {
  return term.href === null
    ? h('span', { class: className }, term.label)
    : h('a', { class: className, href: term.href }, term.label)
}

function renderFacts(entry: PageEntryMeta, ctx: RenderContext): HtmlElement | null {
  const date = entry.publishedAt === undefined ? null : longDate(entry.publishedAt, ctx.locale)
  const minutes =
    entry.readingMinutes !== undefined && entry.readingMinutes >= MIN_READING_MINUTES_SHOWN
      ? entry.readingMinutes
      : undefined
  if (date === null && minutes === undefined && entry.author === undefined) return null
  return h(
    'p',
    { class: 'cg-article-head__facts cg-label' },
    entry.author === undefined
      ? null
      : authorNode(entry.author, { class: 'cg-article-head__author' }),
    date === null || entry.publishedAt === undefined
      ? null
      : h('time', { class: 'cg-article-head__date', datetime: entry.publishedAt }, date),
    minutes === undefined
      ? null
      : h(
          'span',
          { class: 'cg-article-head__reading-time' },
          ctx.t('entry.readingTime', { minutes }),
        ),
  )
}

export function renderArticleHeader(
  page: PageContent,
  entry: PageEntryMeta,
  ctx: RenderContext,
): HtmlElement {
  const topic = entry.terms?.[0]
  return h(
    'header',
    { class: 'cg-article-head' },
    h(
      'div',
      { class: 'cg-container cg-article-head__inner' },
      topic === undefined
        ? null
        : h(
            'p',
            { class: 'cg-article-head__topic cg-label' },
            termLink(topic, 'cg-article-head__topic-link'),
          ),
      h('h1', { class: 'cg-article-head__title' }, page.title),
      entry.excerpt === undefined
        ? null
        : h('p', { class: 'cg-article-head__standfirst' }, entry.excerpt),
      renderFacts(entry, ctx),
      entry.image === undefined
        ? null
        : h(
            'figure',
            { class: 'cg-article-head__cover' },
            withAttributes(
              renderImageSource(entry.image, {
                className: 'cg-article-head__image',
                loading: 'eager',
                sizes: '(min-width: 80rem) 76rem, 100vw',
              }),
              { fetchpriority: 'high' },
            ),
          ),
    ),
  )
}

/**
 * The close of an essay: a short rule on the text line, then every term the
 * entry is filed under, each a link to its archive when it has one. `null`
 * when the entry is filed under nothing, so an unclassified page ends on its
 * last paragraph.
 */
export function renderArticleFooter(entry: PageEntryMeta): HtmlElement | null {
  const terms = entry.terms ?? []
  if (terms.length === 0) return null
  return h(
    'div',
    { class: 'cg-article-foot' },
    h(
      'div',
      { class: 'cg-container cg-article-foot__inner' },
      h(
        'ul',
        { class: 'cg-article-foot__terms cg-label' },
        terms.map((term) =>
          h(
            'li',
            { class: 'cg-article-foot__term', 'data-taxonomy': term.taxonomy },
            termLink(term, 'cg-article-foot__link'),
          ),
        ),
      ),
    ),
  )
}

/** The title of a page that is not an essay: set on the text line, at the display size. */
export function renderPageHeader(page: PageContent): HtmlElement {
  return h(
    'header',
    { class: 'cg-page-head' },
    h('div', { class: 'cg-container' }, h('h1', { class: 'cg-page__title' }, page.title)),
  )
}
