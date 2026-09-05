import { type HtmlElement, h, type TermArchiveInput } from '@cogenta/theme-kit'

/**
 * The taxonomy-term archive (contract D `theme@1.3`) — a card grid, the same
 * register the home page's "Upcoming events" `collectionList` uses: a
 * rounded, shadowed card per entry, with a big day/month badge when the
 * entry carries a publication date, title and summary underneath. There is
 * no `entryImage` here (`TermArchiveEntry` carries no image field), so the
 * card leans on the date badge and warm surface colour for shape instead of
 * a missing photo.
 */
function dateBadge(publishedAt: string | null): HtmlElement | null {
  if (publishedAt === null) return null
  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return null
  return h(
    'time',
    { class: 'cg-archive-card__date', datetime: publishedAt },
    h('span', { class: 'cg-archive-card__day' }, String(date.getUTCDate())),
    h(
      'span',
      { class: 'cg-archive-card__month' },
      new Intl.DateTimeFormat('en', { month: 'short' }).format(date),
    ),
  )
}

export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const cards = input.entries.map((entry) =>
    h(
      'li',
      { class: 'cg-archive-card' },
      dateBadge(entry.publishedAt),
      h(
        'div',
        { class: 'cg-archive-card__body' },
        h(
          'h2',
          { class: 'cg-archive-card__title' },
          entry.href === null
            ? entry.title
            : h('a', { class: 'cg-archive-card__link', href: entry.href }, entry.title),
        ),
        entry.summary === null
          ? null
          : h('p', { class: 'cg-archive-card__excerpt' }, entry.summary),
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
    h('h1', { class: 'cg-archive__title' }, input.term.label),
    input.children.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
          ...input.children.map((child) => h('li', {}, h('a', { href: child.href }, child.label))),
        ),
    cards.length === 0
      ? h('p', { class: 'cg-archive__empty' }, input.labels.empty)
      : h('ul', { class: 'cg-archive__grid' }, ...cards),
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
