import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), in this theme's own
 * brutalist-editorial voice: the term set as a display heading with the
 * taxonomy name as a kicker above it, and the entries as the same numbered
 * `cg-entry` rows `collectionList` already renders here — an index, not a
 * card grid.
 *
 * Reusing the block's own classes rather than inventing archive-only ones is
 * deliberate: it is what makes an archive of work look like this theme's
 * lists without a second stylesheet to keep in step.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const items = input.entries.map((entry, index) =>
    h(
      'li',
      { class: 'cg-entry' },
      h(
        'div',
        { class: 'cg-entry__body' },
        h(
          'span',
          { class: 'cg-entry__index', 'aria-hidden': 'true' },
          String(index + 1).padStart(2, '0'),
        ),
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
              entry.publishedAt.slice(0, 10),
            ),
        entry.summary === null ? null : h('p', { class: 'cg-entry__excerpt' }, entry.summary),
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
    h('p', { class: 'cg-collection__title' }, input.taxonomyName),
    h('h1', { class: 'cg-page__title' }, input.term.label),
    input.children.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
          ...input.children.map((c) => h('li', {}, h('a', { href: c.href }, c.label))),
        ),
    items.length === 0
      ? h('p', { class: 'cg-collection__empty' }, input.labels.empty)
      : h('ul', { class: 'cg-collection__items' }, ...items),
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
