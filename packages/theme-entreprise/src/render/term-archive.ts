import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'
import { monthYear } from './layout.js'

/**
 * The taxonomy-term archive (contract D `theme@1.3`): an index, set the way a
 * firm lists its work by sector.
 *
 * A breadcrumb in small capitals, the term as the page title in the display
 * serif, its sub-terms as a ruled line of links, then one hairline row per
 * entry: the title on the left half of the grid, the summary on the right,
 * the date (when there is one) in the margin. `TermArchiveEntry` carries no
 * picture, so this is a typographic index by design rather than a grid of
 * cards with empty image slots.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) => {
    const date = entry.publishedAt === null ? null : monthYear(entry.publishedAt, input.locale)
    return h(
      'li',
      { class: 'cg-index__row' },
      h(
        'h2',
        { class: 'cg-index__title' },
        entry.href === null
          ? entry.title
          : h('a', { class: 'cg-index__link', href: entry.href }, entry.title),
      ),
      entry.summary === null ? null : h('p', { class: 'cg-index__summary' }, entry.summary),
      entry.publishedAt === null || date === null
        ? null
        : h('time', { class: 'cg-index__date', datetime: entry.publishedAt }, date),
    )
  })

  return h(
    'main',
    { class: 'cg-main cg-archive', id: 'cg-main' },
    h(
      'div',
      { class: 'cg-container cg-archive__inner' },
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
      h('h1', { class: 'cg-archive__title' }, input.term.label),
      input.children.length === 0
        ? null
        : h(
            'ul',
            { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
            ...input.children.map((child) =>
              h('li', {}, h('a', { href: child.href }, child.label)),
            ),
          ),
      rows.length === 0
        ? h('p', { class: 'cg-archive__empty' }, input.labels.empty)
        : h('ol', { class: 'cg-index' }, ...rows),
      pager(input),
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
      : h('a', { rel: 'prev', href: input.page.previousHref }, input.labels.previous),
    input.page.nextHref === null
      ? null
      : h('a', { rel: 'next', href: input.page.nextHref }, input.labels.next),
  )
}
