import { type HtmlElement, h, renderArchiveIntro, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), set in the dining
 * room's own register: a breadcrumb in small words, the term as the page
 * title in the display serif, its sub-terms as a ruled line of links, then
 * the classified entries as ruled rows of titles and summaries, and a pager
 * of two arrow links.
 *
 * `TermArchiveEntry` carries no picture and no price, so an archive cannot be
 * a menu or a band of plates; it is an index, drawn like one, rather than a
 * menu of dishes with their prices missing. A restaurant that wants a priced
 * section of its menu on a page of its own builds it from a
 * `collectionList`, which carries both.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cr-index__item' },
      h(
        'h2',
        { class: 'cr-index__name' },
        entry.href === null
          ? entry.title
          : h('a', { class: 'cr-index__link', href: entry.href }, entry.title),
      ),
      entry.summary === null ? null : h('p', { class: 'cr-index__text' }, entry.summary),
    ),
  )

  return h(
    'main',
    { class: 'cg-main cr-main cr-archive', id: 'cg-main' },
    h(
      'header',
      { class: 'cr-page-head' },
      h(
        'div',
        { class: 'cr-container cr-page-head__inner' },
        input.ancestors.length === 0
          ? null
          : h(
              'nav',
              { class: 'cr-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
              h(
                'ol',
                { class: 'cr-archive__trail' },
                input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              ),
            ),
        h('h1', { class: 'cr-page-head__title' }, input.term.label),
        renderArchiveIntro(input),
      ),
    ),
    input.children.length === 0
      ? null
      : h(
          'div',
          { class: 'cr-section cr-archive__children' },
          h(
            'div',
            { class: 'cr-container' },
            h(
              'ul',
              { class: 'cr-archive__terms', 'aria-label': input.labels.subterms },
              input.children.map((child) =>
                h('li', { class: 'cr-archive__term' }, h('a', { href: child.href }, child.label)),
              ),
            ),
          ),
        ),
    h(
      'section',
      { class: 'cr-section cr-list', 'data-shape': rows.length === 0 ? 'empty' : 'index' },
      h(
        'div',
        { class: 'cr-container cr-list__inner' },
        rows.length === 0
          ? h('p', { class: 'cr-empty' }, input.labels.empty)
          : h('ul', { class: 'cr-list__items cr-index' }, rows),
        pager(input),
      ),
    ),
  )
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'cr-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          {
            class: 'cr-arrow-link',
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
          { class: 'cr-arrow-link', rel: 'next', href: input.page.nextHref },
          input.labels.next,
        ),
  )
}
