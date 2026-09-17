import type { VocabularyBlock } from '@cogenta/blocks'
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
import { longDate } from './layout.js'

/**
 * The article page, built from `PageContent.entry` (contract D `theme@1.4`)
 * rather than from `renderEntryHeader`'s shared default, because a newspaper
 * sets its furniture in a fixed order: the section as a red kicker, a very
 * large headline, the standfirst in italic, then the byline and the date
 * between hairlines, then the lead photograph.
 *
 * Classification is read by taxonomy name, the one convention this theme
 * adds on top of contract D:
 *
 * - a term of a taxonomy named like a section (`section`, `category`,
 *   `topic`, `department`, `rubric`) is the kicker;
 * - a term of a taxonomy named like a byline (`author`, `authors`, `byline`,
 *   `contributor`, `writer`) is a name in the byline, linked to that
 *   writer's archive;
 * - `entry.author` (the account that wrote the entry, when it has a public
 *   name) is the byline only when no byline term exists;
 * - every other term is listed at the foot of the article.
 *
 * A byline is a list of names and nothing else: "By" and "and" are words in
 * a language, and a theme has no translation for them, so the separators are
 * drawn by the stylesheet.
 */

const SECTION_TAXONOMIES: ReadonlySet<string> = new Set([
  'section',
  'sections',
  'category',
  'categories',
  'topic',
  'topics',
  'department',
  'rubric',
])

const BYLINE_TAXONOMIES: ReadonlySet<string> = new Set([
  'author',
  'authors',
  'byline',
  'contributor',
  'contributors',
  'writer',
  'writers',
])

/** Below this, a reading time tells a reader nothing they can use. */
const MIN_READING_MINUTES_SHOWN = 2

/**
 * A page is set as an article when its entry carries anything an article has
 * (a date, a standfirst, a picture, a classification). A reading time alone
 * does not count: every page with a few paragraphs has one, and an About page
 * set with a byline rule, "2 min read" and a drop cap reads as a news story.
 */
export function isArticle(entry: PageEntryMeta | undefined): entry is PageEntryMeta {
  if (entry === undefined) return false
  return (
    entry.publishedAt !== undefined ||
    entry.excerpt !== undefined ||
    entry.image !== undefined ||
    (entry.terms ?? []).length > 0
  )
}

function termNode(term: PageEntryTerm, className: string): HtmlElement {
  return term.href === null
    ? h('span', { class: className }, term.label)
    : h('a', { class: className, href: term.href }, term.label)
}

export interface ArticleTerms {
  readonly kicker: PageEntryTerm | undefined
  readonly byline: readonly PageEntryTerm[]
  readonly other: readonly PageEntryTerm[]
}

export function articleTerms(entry: PageEntryMeta): ArticleTerms {
  const terms = entry.terms ?? []
  const kicker = terms.find((term) => SECTION_TAXONOMIES.has(term.taxonomy))
  const byline = terms.filter((term) => BYLINE_TAXONOMIES.has(term.taxonomy))
  const other = terms.filter((term) => term !== kicker && !BYLINE_TAXONOMIES.has(term.taxonomy))
  return { kicker, byline, other }
}

/** The article opens its body with a photograph of its own: that figure, captioned, is the lead image. */
export function opensWithFigure(blocks: readonly VocabularyBlock[]): boolean {
  return blocks[0]?._type === 'mediaFigure'
}

function renderByline(entry: PageEntryMeta, terms: ArticleTerms): HtmlElement | null {
  if (terms.byline.length > 0) {
    return h(
      'ul',
      { class: 'cg-byline' },
      terms.byline.map((term) =>
        h('li', { class: 'cg-byline__name' }, termNode(term, 'cg-byline__link')),
      ),
    )
  }
  if (entry.author === undefined) return null
  return h(
    'ul',
    { class: 'cg-byline' },
    h(
      'li',
      { class: 'cg-byline__name' },
      entry.author.href === undefined ? entry.author.name : authorNode(entry.author),
    ),
  )
}

function renderMeta(
  entry: PageEntryMeta,
  terms: ArticleTerms,
  ctx: RenderContext,
): HtmlElement | null {
  const byline = renderByline(entry, terms)
  const date = entry.publishedAt === undefined ? null : longDate(entry.publishedAt, ctx.locale)
  const minutes =
    entry.readingMinutes !== undefined && entry.readingMinutes >= MIN_READING_MINUTES_SHOWN
      ? entry.readingMinutes
      : undefined
  if (byline === null && date === null && minutes === undefined) return null
  return h(
    'div',
    { class: 'cg-article-head__meta' },
    byline,
    date === null && minutes === undefined
      ? null
      : h(
          'p',
          { class: 'cg-article-head__dateline' },
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
        ),
  )
}

export function renderArticleHeader(
  page: PageContent,
  entry: PageEntryMeta,
  ctx: RenderContext,
): HtmlElement {
  const terms = articleTerms(entry)
  const cover =
    entry.image === undefined || opensWithFigure(page.blocks)
      ? null
      : h(
          'figure',
          { class: 'cg-article-head__cover' },
          renderImageSource(entry.image, {
            className: 'cg-article-head__image',
            loading: 'eager',
            sizes: '(min-width: 64rem) 66rem, 100vw',
          }),
        )

  return h(
    'header',
    { class: 'cg-article-head', 'data-cover': cover === null ? 'none' : 'image' },
    h(
      'div',
      { class: 'cg-container cg-article-head__inner' },
      terms.kicker === undefined
        ? null
        : h(
            'p',
            { class: 'cg-article-head__kicker' },
            termNode(terms.kicker, 'cg-article-head__kicker-link'),
          ),
      h('h1', { class: 'cg-article-head__title' }, page.title),
      entry.excerpt === undefined
        ? null
        : h('p', { class: 'cg-article-head__standfirst' }, entry.excerpt),
      renderMeta(entry, terms, ctx),
      cover,
    ),
  )
}

/**
 * The foot of an article: every term that is neither its section nor a name
 * in its byline, each a link to its archive when it has one. `null` when
 * there is none, so an article ends on its last paragraph.
 */
export function renderArticleFooter(entry: PageEntryMeta): HtmlElement | null {
  const { other } = articleTerms(entry)
  if (other.length === 0) return null
  return h(
    'footer',
    { class: 'cg-article-foot' },
    h(
      'div',
      { class: 'cg-container cg-article-foot__inner' },
      h(
        'ul',
        { class: 'cg-article-foot__terms' },
        other.map((term) =>
          h(
            'li',
            { class: 'cg-article-foot__term', 'data-taxonomy': term.taxonomy },
            termNode(term, 'cg-article-foot__link'),
          ),
        ),
      ),
    ),
  )
}

/**
 * The title of a page that is not an article. A page that opens on running
 * text (About, Standards) takes the title over its reading column, the way an
 * article does, without an article's furniture; any other page (a pricing
 * page, a landing page) sets its title as a section title on a heavy rule.
 */
export function renderPageHeader(page: PageContent): HtmlElement {
  const text = page.blocks[0]?._type === 'prose'
  return h(
    'header',
    { class: 'cg-page-head', 'data-layout': text ? 'text' : 'section' },
    h(
      'div',
      { class: 'cg-container cg-page-head__inner' },
      h('h1', { class: 'cg-page-head__title' }, page.title),
    ),
  )
}
