import { type HtmlElement, h, renderArchiveIntro, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), set like the rest of
 * the site's indexes: a breadcrumb in interface text, the term as the page
 * title, its sub-terms as a ruled line of links, then the classified entries
 * as ruled rows with their publication date in Geist Mono in the first three
 * columns (as a changelog prints it), and a pager of two arrow links.
 *
 * `TermArchiveEntry` carries no picture, so an archive is an index, drawn
 * like one, rather than a product tour with its screenshots missing.
 */

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cs-index__item', 'data-dated': entry.publishedAt === null ? 'false' : 'true' },
      entry.publishedAt === null
        ? null
        : h(
            'time',
            { class: 'cs-index__date', datetime: entry.publishedAt },
            formatDate(entry.publishedAt, input.locale),
          ),
      h(
        'div',
        { class: 'cs-index__words' },
        h(
          'h2',
          { class: 'cs-index__title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'cs-index__link', href: entry.href }, entry.title),
        ),
        entry.summary === null ? null : h('p', { class: 'cs-index__text' }, entry.summary),
      ),
    ),
  )

  return h(
    'main',
    { class: 'cg-main cs-main cs-archive', id: 'cg-main' },
    h(
      'header',
      { class: 'cs-page-head', 'data-dated': 'false', 'data-cover': 'false' },
      h(
        'div',
        { class: 'cs-container cs-page-head__inner' },
        input.ancestors.length === 0
          ? null
          : h(
              'nav',
              { class: 'cs-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
              h(
                'ol',
                { class: 'cs-archive__trail' },
                input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              ),
            ),
        h('h1', { class: 'cs-page-head__title' }, input.term.label),
        renderArchiveIntro(input),
      ),
    ),
    input.children.length === 0
      ? null
      : h(
          'div',
          { class: 'cs-section cs-archive__children' },
          h(
            'div',
            { class: 'cs-container' },
            h(
              'ul',
              { class: 'cs-archive__terms', 'aria-label': input.labels.subterms },
              input.children.map((child) =>
                h('li', { class: 'cs-archive__term' }, h('a', { href: child.href }, child.label)),
              ),
            ),
          ),
        ),
    h(
      'section',
      { class: 'cs-section cs-list', 'data-shape': rows.length === 0 ? 'empty' : 'index' },
      h(
        'div',
        { class: 'cs-container cs-list__inner' },
        rows.length === 0
          ? h('p', { class: 'cs-empty' }, input.labels.empty)
          : h('ul', { class: 'cs-index' }, rows),
        pager(input),
      ),
    ),
  )
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'cs-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          {
            class: 'cs-arrow-link',
            'data-direction': 'back',
            rel: 'prev',
            href: input.page.previousHref,
          },
          input.labels.previous,
        ),
    input.page.nextHref === null
      ? null
      : h(
          'a',
          { class: 'cs-arrow-link', rel: 'next', href: input.page.nextHref },
          input.labels.next,
        ),
  )
}
