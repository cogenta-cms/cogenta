import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`) — a resource index.
 *
 * Built from the same `cg-list__row` rows `collectionList` already renders
 * here: a date rail on the left, the title and its summary on the right,
 * which is the shape a B2B insights or resources index takes. Reusing the
 * block's own classes is what keeps an archive looking like the rest of the
 * site without a second stylesheet to maintain.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cg-list__row' },
      entry.publishedAt === null
        ? null
        : h(
            'time',
            { class: 'cg-list__date', datetime: entry.publishedAt },
            entry.publishedAt.slice(0, 10),
          ),
      h(
        'div',
        { class: 'cg-list__body' },
        h(
          'h2',
          { class: 'cg-list__title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'cg-list__link', href: entry.href }, entry.title),
        ),
        entry.summary === null ? null : h('p', { class: 'cg-list__excerpt' }, entry.summary),
      ),
    ),
  )

  return h(
    'main',
    { class: 'cg-main cg-archive', id: 'cg-main' },
    input.ancestors.length === 0
      ? null
      : h(
          'nav',
          { class: 'cg-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
          h(
            'ol',
            {},
            ...input.ancestors.map((l) => h('li', {}, h('a', { href: l.href }, l.label))),
          ),
        ),
    h('h1', { class: 'cg-list__title-heading' }, input.term.label),
    input.children.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
          ...input.children.map((c) => h('li', {}, h('a', { href: c.href }, c.label))),
        ),
    rows.length === 0
      ? h('p', { class: 'cg-list__empty' }, input.labels.empty)
      : h('ul', { class: 'cg-list__items' }, ...rows),
    pager(input),
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
