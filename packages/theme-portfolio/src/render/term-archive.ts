import {
  type HtmlElement,
  h,
  renderArchiveIntro,
  type TermArchiveEntry,
  type TermArchiveInput,
} from '@cogenta/theme-kit'
import { taxonomyLabel, yearOf } from './layout.js'
import { renderIndexRow, type Work } from './work.js'

/**
 * The page of one taxonomy term (contract D `theme@1.3`): every project filed
 * under a discipline, a client or a member of the team.
 *
 * It is set as the studio's index, not as a grid: an archive entry carries no
 * picture (`TermArchiveEntry` has none), and a grid of empty frames is worse
 * than a well-set list. The taxonomy's own name sits above the term in the
 * caption size; the term itself is the page's one `h1`, very large; each
 * project is a ruled row with its title, its statement when it has one, and
 * its year; sub-terms and the pager are
 * underlined words, the pager's arrows drawn by the stylesheet.
 */
function workFromArchive(entry: TermArchiveEntry): Work {
  const year = entry.publishedAt === null ? undefined : yearOf(entry.publishedAt)
  return {
    href: entry.href,
    title: entry.title,
    caption: year === undefined ? {} : { year },
    ...(entry.summary === null ? {} : { summary: entry.summary }),
  }
}

function pager(input: TermArchiveInput): HtmlElement | null {
  if (input.page.previousHref === null && input.page.nextHref === null) return null
  return h(
    'nav',
    { class: 'cg-archive__pager', 'aria-label': input.labels.pagination },
    input.page.previousHref === null
      ? null
      : h(
          'a',
          {
            class: 'cg-arrow-link',
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
          { class: 'cg-arrow-link', rel: 'next', href: input.page.nextHref },
          input.labels.next,
        ),
  )
}

export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  return h(
    'main',
    { class: 'cg-main cg-archive', id: 'cg-main' },
    h(
      'header',
      { class: 'cg-archive__head' },
      h(
        'div',
        { class: 'cg-container cg-archive__head-inner' },
        input.ancestors.length === 0
          ? null
          : h(
              'nav',
              { class: 'cg-archive__breadcrumb', 'aria-label': input.labels.breadcrumb },
              h(
                'ol',
                { class: 'cg-archive__trail' },
                input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              ),
            ),
        h('p', { class: 'cg-archive__kicker' }, taxonomyLabel(input.taxonomyName, input.locale)),
        h('h1', { class: 'cg-archive__title' }, input.term.label),
        renderArchiveIntro(input),
        input.children.length === 0
          ? null
          : h(
              'ul',
              { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
              input.children.map((child) =>
                h('li', {}, h('a', { class: 'cg-arrow-link', href: child.href }, child.label)),
              ),
            ),
      ),
    ),
    h(
      'section',
      { class: 'cg-section cg-collection', 'data-form': 'index' },
      h(
        'div',
        { class: 'cg-container cg-collection__inner' },
        input.entries.length === 0
          ? h('p', { class: 'cg-empty' }, input.labels.empty)
          : h(
              'ol',
              { class: 'cg-index', 'data-count': String(input.entries.length) },
              input.entries.map((entry) => renderIndexRow(workFromArchive(entry), 'h2')),
            ),
        pager(input),
      ),
    ),
  )
}
