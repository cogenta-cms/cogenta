import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`) — a storefront category
 * page.
 *
 * Built from the same `ce-entry` cards `collectionList` already renders here,
 * so a category page looks like the shop's own grid rather than a document
 * list. The sub-terms row reads as the category filter strip a shopper
 * expects at the top of a category page — real links to real sub-categories,
 * never a control that does nothing (the same rule this theme's chrome
 * applies to the cart icon it deliberately does not draw).
 */
export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const cards = input.entries.map((entry) =>
    h(
      'li',
      { class: 'ce-entry' },
      h(
        'article',
        { class: 'ce-entry__card' },
        entry.publishedAt === null
          ? null
          : h(
              'time',
              { class: 'ce-entry__badge', datetime: entry.publishedAt },
              entry.publishedAt.slice(0, 10),
            ),
        h(
          'h2',
          { class: 'ce-entry__title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'ce-entry__link', href: entry.href }, entry.title),
        ),
        entry.summary === null ? null : h('p', { class: 'ce-entry__excerpt' }, entry.summary),
      ),
    ),
  )

  return h(
    'main',
    { class: 'ce-main ce-archive', id: 'cg-main' },
    input.ancestors.length === 0
      ? null
      : h(
          'nav',
          { class: 'ce-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
          h(
            'ol',
            {},
            ...input.ancestors.map((l) => h('li', {}, h('a', { href: l.href }, l.label))),
          ),
        ),
    h('h1', { class: 'ce-collection__title' }, input.term.label),
    input.children.length === 0
      ? null
      : h(
          'ul',
          { class: 'ce-archive__children', 'aria-label': input.labels.subterms },
          ...input.children.map((c) => h('li', {}, h('a', { href: c.href }, c.label))),
        ),
    cards.length === 0
      ? h('p', { class: 'ce-collection__empty' }, input.labels.empty)
      : h('ul', { class: 'ce-collection__items' }, ...cards),
    pager(input),
  )
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'ce-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h('a', { rel: 'prev', href: input.page.previousHref }, input.labels.previous),
    input.page.nextHref === null
      ? null
      : h('a', { rel: 'next', href: input.page.nextHref }, input.labels.next),
  )
}
