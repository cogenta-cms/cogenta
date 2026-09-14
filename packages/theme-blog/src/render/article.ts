import {
  type HtmlElement,
  h,
  type PageContent,
  type PageEntryMeta,
  type PageEntryTerm,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { longDate } from './layout.js'

/**
 * The header and the close of an essay, built from `PageContent.entry`
 * (contract D `theme@1.4`) rather than from `renderEntryHeader`'s shared
 * default, because this theme sets the furniture on its grid: the topic,
 * the date and the reading time in the margin beside the title, the title
 * and standfirst on the text line, the cover at 3:2 from the text line to
 * the right edge. On a narrow screen the margin simply comes first.
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

function renderMeta(entry: PageEntryMeta, ctx: RenderContext): HtmlElement | null {
  const topic = entry.terms?.[0]
  const date = entry.publishedAt === undefined ? null : longDate(entry.publishedAt, ctx.locale)
  const minutes =
    entry.readingMinutes !== undefined && entry.readingMinutes >= MIN_READING_MINUTES_SHOWN
      ? entry.readingMinutes
      : undefined
  if (topic === undefined && date === null && minutes === undefined && entry.author === undefined) {
    return null
  }
  return h(
    'div',
    { class: 'cg-article-head__meta' },
    topic === undefined
      ? null
      : h('p', { class: 'cg-article-head__topic' }, termLink(topic, 'cg-article-head__topic-link')),
    h(
      'p',
      { class: 'cg-article-head__facts' },
      date === null || entry.publishedAt === undefined
        ? null
        : h('time', { class: 'cg-article-head__date', datetime: entry.publishedAt }, date),
      entry.author === undefined
        ? null
        : h('span', { class: 'cg-article-head__author' }, entry.author.name),
      minutes === undefined
        ? null
        : h(
            'span',
            { class: 'cg-article-head__reading-time' },
            ctx.t('entry.readingTime', { minutes }),
          ),
    ),
  )
}

export function renderArticleHeader(
  page: PageContent,
  entry: PageEntryMeta,
  ctx: RenderContext,
): HtmlElement {
  return h(
    'header',
    { class: 'cg-article-head' },
    h(
      'div',
      { class: 'cg-container cg-article-head__inner' },
      renderMeta(entry, ctx),
      h('h1', { class: 'cg-article-head__title' }, page.title),
      entry.excerpt === undefined
        ? null
        : h('p', { class: 'cg-article-head__standfirst' }, entry.excerpt),
      entry.image === undefined
        ? null
        : h(
            'figure',
            { class: 'cg-article-head__cover' },
            renderImageSource(entry.image, {
              className: 'cg-article-head__image',
              loading: 'eager',
              sizes: '(min-width: 64rem) 60rem, 100vw',
            }),
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
        { class: 'cg-article-foot__terms' },
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
