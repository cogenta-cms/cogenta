import { type HtmlElement, h, renderArchiveIntro, type TermArchiveInput } from '@cogenta/theme-kit'
import { dayMonth, yearOf } from './layout.js'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), set as the same index
 * the `collectionList` block's `list` layout draws: the date in the margin,
 * the year once at the head of each year, the title and the summary on the
 * text line. An archive of a topic reads as a chapter of the site's table of
 * contents, never as a second listing style to keep in step.
 *
 * `TermArchiveEntry` carries no picture, so every row is a row of text. The
 * taxonomy's name is the kicker above the term, the breadcrumb and the
 * sub-terms sit in the margin, and an empty topic says so in one line.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  let previousYear: string | null = null
  const rows = input.entries.map((entry) => {
    const year = entry.publishedAt === null ? null : yearOf(entry.publishedAt)
    const day = entry.publishedAt === null ? null : dayMonth(entry.publishedAt, input.locale)
    const showYear = year !== null && year !== previousYear
    previousYear = year ?? previousYear
    return h(
      'li',
      { class: 'cg-index__row', 'data-media': 'none' },
      h(
        'p',
        { class: 'cg-index__margin' },
        showYear ? h('span', { class: 'cg-index__year' }, year) : null,
        entry.publishedAt === null || day === null
          ? null
          : h('time', { class: 'cg-index__date', datetime: entry.publishedAt }, day),
      ),
      h(
        'div',
        { class: 'cg-index__body' },
        h(
          'h2',
          { class: 'cg-index__title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'cg-index__link', href: entry.href }, entry.title),
        ),
        entry.summary === null ? null : h('p', { class: 'cg-index__excerpt' }, entry.summary),
      ),
    )
  })

  return h(
    'main',
    { class: 'cg-main cg-archive', id: 'cg-main' },
    h(
      'header',
      { class: 'cg-archive__head' },
      h(
        'div',
        { class: 'cg-container cg-archive__head-inner' },
        input.ancestors.length === 0
          ? null
          : h(
              'nav',
              { class: 'cg-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
              h(
                'ol',
                {},
                input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              ),
            ),
        h('p', { class: 'cg-archive__kicker' }, input.taxonomyName),
        h('h1', { class: 'cg-archive__title' }, input.term.label),
        renderArchiveIntro(input),
        input.children.length === 0
          ? null
          : h(
              'ul',
              { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
              input.children.map((child) => h('li', {}, h('a', { href: child.href }, child.label))),
            ),
      ),
    ),
    h(
      'section',
      { class: 'cg-section cg-collection', 'data-layout': 'list' },
      h(
        'div',
        { class: 'cg-container cg-collection__inner' },
        rows.length === 0
          ? h('p', { class: 'cg-collection__empty' }, input.labels.empty)
          : h('ol', { class: 'cg-index' }, rows),
        pager(input),
      ),
    ),
  )
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'cg-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          { class: 'cg-archive__pager-link', rel: 'prev', href: input.page.previousHref },
          input.labels.previous,
        ),
    input.page.nextHref === null
      ? null
      : h(
          'a',
          { class: 'cg-archive__pager-link', rel: 'next', href: input.page.nextHref },
          input.labels.next,
        ),
  )
}
