import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'
import { arrowWords } from './arrow-link.js'
import { formatEntryDate } from './dates.js'

/**
 * The taxonomy-term archive (contract D `theme@1.3`).
 *
 * A header in the page frame (the breadcrumb, the term as the page's title,
 * the sub-terms), then the classified entries as this theme's index: the
 * same `cg-collection`/`cg-entry` markup a `collectionList` block renders in
 * its `list` layout, so an archive of articles reads exactly like a list of
 * articles anywhere else on the site, from one set of rules.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const items = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cg-entry', 'data-picture': 'false' },
      h(
        'article',
        { class: 'cg-entry__body' },
        h(
          'h2',
          { class: 'cg-entry__title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'cg-entry__link', href: entry.href }, entry.title),
        ),
        entry.publishedAt === null
          ? null
          : h(
              'time',
              { class: 'cg-entry__date', datetime: entry.publishedAt },
              formatEntryDate(entry.publishedAt, input.locale),
            ),
        entry.summary === null ? null : h('p', { class: 'cg-entry__excerpt' }, entry.summary),
      ),
    ),
  )

  return h(
    'main',
    { class: 'cg-main cg-archive', id: 'cg-main' },
    h(
      'div',
      { class: 'cg-archive__head' },
      input.ancestors.length === 0
        ? null
        : h(
            'nav',
            { class: 'cg-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
            h(
              'ol',
              {},
              ...input.ancestors.map((link) =>
                h('li', {}, h('a', { href: link.href }, link.label)),
              ),
            ),
          ),
      h('h1', { class: 'cg-page__title' }, input.term.label),
      input.children.length === 0
        ? null
        : h(
            'ul',
            { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
            ...input.children.map((child) =>
              h('li', {}, h('a', { href: child.href }, child.label)),
            ),
          ),
    ),
    h(
      'section',
      { class: 'cg-collection cg-archive__list', 'data-layout': 'list' },
      items.length === 0
        ? h('p', { class: 'cg-collection__empty' }, input.labels.empty)
        : h('ul', { class: 'cg-collection__items' }, ...items),
      renderPager(input),
    ),
  )
}

/**
 * Previous/next only — never a numbered pager. This renderer is handed the
 * two hrefs the host resolved and no page-number list, so inventing one here
 * would mean guessing URLs the host never said were valid.
 */
function renderPager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'cg-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          { class: 'cg-arrow-link', rel: 'prev', href: input.page.previousHref },
          arrowWords(input.labels.previous, 'back'),
        ),
    input.page.nextHref === null
      ? null
      : h(
          'a',
          { class: 'cg-arrow-link', rel: 'next', href: input.page.nextHref },
          arrowWords(input.labels.next),
        ),
  )
}
