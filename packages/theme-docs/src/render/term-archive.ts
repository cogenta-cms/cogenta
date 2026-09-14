import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'
import { longDate } from './layout.js'

/**
 * The taxonomy-term archive (contract D `theme@1.3`): a titled index of
 * ruled rows on the reading width. A documentation site's own information
 * architecture is the sidebar (`section` and `order`), not a taxonomy, so
 * this page is the plain, well-set fallback for a term an editor still
 * classifies pages under, not a second navigation competing with it.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cd-index__item' },
      h(
        'div',
        { class: 'cd-index__words' },
        h(
          'h2',
          { class: 'cd-index__title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'cd-index__link', href: entry.href }, entry.title),
        ),
        entry.summary === null ? null : h('p', { class: 'cd-index__text' }, entry.summary),
      ),
      entry.publishedAt === null
        ? null
        : h(
            'time',
            { class: 'cd-index__date', datetime: entry.publishedAt },
            longDate(entry.publishedAt, input.locale),
          ),
    ),
  )

  return h(
    'main',
    { class: 'cg-main cd-archive', id: 'cg-main' },
    h(
      'div',
      { class: 'cd-archive__inner' },
      input.ancestors.length === 0
        ? null
        : h(
            'nav',
            { class: 'cd-breadcrumb', 'aria-label': input.labels.breadcrumb },
            h(
              'ol',
              { class: 'cd-breadcrumb__items' },
              input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              h('li', { 'aria-current': 'page' }, input.term.label),
            ),
          ),
      h('h1', { class: 'cd-archive__title' }, input.term.label),
      input.children.length === 0
        ? null
        : h(
            'ul',
            { class: 'cd-archive__children', 'aria-label': input.labels.subterms },
            input.children.map((child) => h('li', {}, h('a', { href: child.href }, child.label))),
          ),
      rows.length === 0
        ? h('p', { class: 'cd-empty' }, input.labels.empty)
        : h('ul', { class: 'cd-index' }, rows),
      pager(input),
    ),
  )
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'cd-pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          {
            class: 'cd-pager__link',
            'data-direction': 'previous',
            rel: 'prev',
            href: input.page.previousHref,
          },
          h('span', { class: 'cd-pager__title' }, input.labels.previous),
        ),
    input.page.nextHref === null
      ? null
      : h(
          'a',
          {
            class: 'cd-pager__link',
            'data-direction': 'next',
            rel: 'next',
            href: input.page.nextHref,
          },
          h('span', { class: 'cd-pager__title' }, input.labels.next),
        ),
  )
}
