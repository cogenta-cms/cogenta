import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`).
 *
 * Built from this theme's *own* entry-card classes — the same `cg-entry`
 * markup `collectionList` already renders — rather than a new set of
 * archive-only classes: an archive of articles should look like a list of
 * articles on this theme, and reusing the classes is what guarantees that
 * without a second stylesheet to keep in step.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const items = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cg-entry' },
      h(
        'div',
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
            ...input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
          ),
        ),
    h('h1', { class: 'cg-page__title' }, input.term.label),
    input.children.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
          ...input.children.map((child) => h('li', {}, h('a', { href: child.href }, child.label))),
        ),
    items.length === 0
      ? h('p', { class: 'cg-collection__empty' }, input.labels.empty)
      : h('ul', { class: 'cg-collection__items' }, ...items),
    renderPager(input),
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
      : h('a', { rel: 'prev', href: input.page.previousHref }, input.labels.previous),
    input.page.nextHref === null
      ? null
      : h('a', { rel: 'next', href: input.page.nextHref }, input.labels.next),
  )
}
