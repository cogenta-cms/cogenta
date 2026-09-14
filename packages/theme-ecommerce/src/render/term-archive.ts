import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), set in the shop's own
 * register: a breadcrumb in small words, the term as the page title, its
 * sub-terms as a ruled line of links, then the classified entries as ruled
 * rows of titles and summaries, and a pager of two arrow links.
 *
 * `TermArchiveEntry` carries no picture and no price, so an archive cannot be
 * a product grid; it is an index, drawn like one, rather than a grid of empty
 * frames. A shop that wants a photographed category page builds it from a
 * `collectionList`, which does carry both.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) =>
    h(
      'li',
      { class: 'ce-index__item' },
      h(
        'h2',
        { class: 'ce-index__name' },
        entry.href === null
          ? entry.title
          : h('a', { class: 'ce-index__link', href: entry.href }, entry.title),
      ),
      entry.summary === null ? null : h('p', { class: 'ce-index__text' }, entry.summary),
    ),
  )

  return h(
    'main',
    { class: 'cg-main ce-main ce-archive', id: 'cg-main' },
    h(
      'header',
      { class: 'ce-page-head' },
      h(
        'div',
        { class: 'ce-container ce-page-head__inner' },
        input.ancestors.length === 0
          ? null
          : h(
              'nav',
              { class: 'ce-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
              h(
                'ol',
                { class: 'ce-archive__trail' },
                input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              ),
            ),
        h('h1', { class: 'ce-page-head__title' }, input.term.label),
      ),
    ),
    input.children.length === 0
      ? null
      : h(
          'div',
          { class: 'ce-section ce-line' },
          h(
            'div',
            { class: 'ce-container ce-line__inner' },
            h(
              'ul',
              { class: 'ce-line__items', 'aria-label': input.labels.subterms },
              input.children.map((child) =>
                h(
                  'li',
                  { class: 'ce-line__item' },
                  h('a', { class: 'ce-line__text ce-line__link', href: child.href }, child.label),
                ),
              ),
            ),
          ),
        ),
    h(
      'section',
      { class: 'ce-section ce-list', 'data-shape': rows.length === 0 ? 'empty' : 'index' },
      h(
        'div',
        { class: 'ce-container ce-list__inner' },
        rows.length === 0
          ? h('p', { class: 'ce-empty' }, input.labels.empty)
          : h('ul', { class: 'ce-list__items ce-index' }, rows),
        pager(input),
      ),
    ),
  )
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'ce-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          {
            class: 'ce-arrow-link',
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
          { class: 'ce-arrow-link', rel: 'next', href: input.page.nextHref },
          input.labels.next,
        ),
  )
}
