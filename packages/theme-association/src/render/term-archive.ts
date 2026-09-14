import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'
import { arrowWords } from './layout.js'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), in the organisation's
 * own register: a breadcrumb in small words, the term as the page title, its
 * sub-terms as a row of links, then the classified entries as ruled rows of
 * titles, dates and summaries, and a pager of two arrow links.
 *
 * `TermArchiveEntry` carries no picture and no event date, so an archive is
 * an index, drawn like one, rather than a calendar with its days missing. A
 * site that wants a calendar of one kind of event builds it from a
 * `collectionList`, which carries both.
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

export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) =>
    h(
      'li',
      { class: 'ca-index__item' },
      h(
        'h2',
        { class: 'ca-index__title' },
        entry.href === null
          ? entry.title
          : h('a', { class: 'ca-index__link', href: entry.href }, entry.title),
      ),
      entry.publishedAt === null
        ? null
        : h(
            'p',
            { class: 'ca-index__date' },
            h('time', { datetime: entry.publishedAt }, formatDate(entry.publishedAt, input.locale)),
          ),
      entry.summary === null ? null : h('p', { class: 'ca-index__text' }, entry.summary),
    ),
  )

  return h(
    'main',
    { class: 'cg-main ca-main ca-archive', id: 'cg-main' },
    h(
      'header',
      { class: 'ca-page-head' },
      h(
        'div',
        { class: 'ca-container ca-page-head__inner' },
        input.ancestors.length === 0
          ? null
          : h(
              'nav',
              { class: 'ca-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
              h(
                'ol',
                { class: 'ca-archive__trail' },
                input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              ),
            ),
        h('h1', { class: 'ca-page-head__title' }, input.term.label),
      ),
    ),
    input.children.length === 0
      ? null
      : h(
          'div',
          { class: 'ca-section ca-archive__children' },
          h(
            'div',
            { class: 'ca-container' },
            h(
              'ul',
              { class: 'ca-archive__terms', 'aria-label': input.labels.subterms },
              input.children.map((child) =>
                h('li', { class: 'ca-archive__term' }, h('a', { href: child.href }, child.label)),
              ),
            ),
          ),
        ),
    h(
      'section',
      { class: 'ca-section ca-list', 'data-shape': rows.length === 0 ? 'empty' : 'index' },
      h(
        'div',
        { class: 'ca-container ca-list__inner' },
        rows.length === 0
          ? h('p', { class: 'ca-empty' }, input.labels.empty)
          : h('ul', { class: 'ca-list__items ca-index' }, rows),
        pager(input),
      ),
    ),
  )
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'ca-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          {
            class: 'ca-arrow-link',
            'data-direction': 'back',
            rel: 'prev',
            href: input.page.previousHref,
          },
          h('span', { class: 'ca-arrow-link__start' }, input.labels.previous),
        ),
    input.page.nextHref === null
      ? null
      : h(
          'a',
          { class: 'ca-arrow-link', rel: 'next', href: input.page.nextHref },
          arrowWords(input.labels.next),
        ),
  )
}
