import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`) — a category/tag index,
 * styled as the same card grid `collectionList`'s "grid" layout already
 * uses (`cg-list__row`/`cg-list__items`), on purpose: a category archive of
 * posts must look like this theme's own list of posts, never a second card
 * system to keep in sync. `TermArchiveEntry` carries no image reference
 * (unlike a real `ContentEntry`, which `entryImage` reads), so these cards
 * are the image-less variant — a date rail, title and excerpt only.
 *
 * `count`/`description` are not rendered: `TermArchiveInput` (`@cogenta/theme-kit`)
 * carries neither a total-entry count nor a taxonomy term description today,
 * so inventing either here would be a number or a sentence this theme made
 * up rather than data the host actually resolved.
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const rows = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cg-list__row' },
      h(
        'article',
        { class: 'cg-list__card' },
        entry.publishedAt === null
          ? null
          : h(
              'time',
              { class: 'cg-list__date', datetime: entry.publishedAt },
              entry.publishedAt.slice(0, 10),
            ),
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
    h(
      'header',
      { class: 'cg-archive__header' },
      h('p', { class: 'cg-archive__kicker' }, input.taxonomyName),
      h('h1', { class: 'cg-list__title-heading' }, input.term.label),
    ),
    input.children.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
          ...input.children.map((c) => h('li', {}, h('a', { href: c.href }, c.label))),
        ),
    rows.length === 0
      ? h('p', { class: 'cg-list__empty' }, input.labels.empty)
      : h(
          'div',
          { class: 'cg-list', 'data-layout': 'grid' },
          h('ul', { class: 'cg-list__items' }, ...rows),
        ),
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
