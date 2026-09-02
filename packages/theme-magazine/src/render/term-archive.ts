import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), as a section front.
 *
 * A magazine's archive is a section page, so it is built from the same
 * `cg-issue__row` rows `collectionList` already sets here — a contents strip,
 * not a card grid — under a section head that names the taxonomy as a kicker
 * and the term as the section title. Reusing the block's classes is what
 * keeps the two looking like the same publication without a second
 * stylesheet.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry, index) =>
    h(
      'li',
      { class: 'cg-issue__row' },
      h(
        'span',
        { class: 'cg-issue__row-number', 'aria-hidden': 'true' },
        String(index + 1).padStart(2, '0'),
      ),
      h(
        'div',
        { class: 'cg-issue__row-body' },
        h(
          'h2',
          { class: 'cg-issue__row-title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'cg-issue__link', href: entry.href }, entry.title),
        ),
        entry.publishedAt === null
          ? null
          : h(
              'time',
              { class: 'cg-issue__row-date', datetime: entry.publishedAt },
              entry.publishedAt.slice(0, 10),
            ),
        entry.summary === null ? null : h('p', { class: 'cg-issue__lead-excerpt' }, entry.summary),
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
    h('p', { class: 'cg-issue__kicker' }, input.taxonomyName),
    h('h1', { class: 'cg-page__title' }, input.term.label),
    input.children.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
          ...input.children.map((c) => h('li', {}, h('a', { href: c.href }, c.label))),
        ),
    rows.length === 0
      ? h('p', { class: 'cg-issue__empty' }, input.labels.empty)
      : h('ul', { class: 'cg-issue__rest' }, ...rows),
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
