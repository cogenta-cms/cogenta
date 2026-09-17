import { type HtmlElement, h, renderArchiveIntro, type TermArchiveInput } from '@cogenta/theme-kit'
import { renderStory, storyFromArchive } from './story.js'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), set as the front of a
 * subject: the newest essay large, with its standfirst, and the rest
 * underneath as a row of smaller cards — the same front a `collectionList`
 * block opens the home page with, so a subject page reads as one more
 * chapter of the same publication rather than a plainer fallback.
 *
 * The term is the page's title, set large under the taxonomy's name as a
 * small-caps kicker. `TermArchiveEntry` carries no picture, so the front is
 * set entirely in type here — which is exactly how this theme's own index
 * already reads a row with nothing to show a picture in.
 *
 * Every visible word that is not content comes from `input.labels`, already
 * in the page's language.
 */
const SECONDARIES = 3

export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const stories = input.entries.map((entry) => storyFromArchive(entry, input.locale))
  const [lead, ...rest] = stories
  const secondaries = rest.slice(0, SECONDARIES)

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
                {},
                input.ancestors.map((link) => h('li', {}, h('a', { href: link.href }, link.label))),
              ),
            ),
        h('p', { class: 'cg-archive__kicker' }, input.taxonomyName),
        h('h1', { class: 'cg-archive__title' }, input.term.label),
        renderArchiveIntro(input),
        input.children.length === 0
          ? null
          : h(
              'ul',
              { class: 'cg-archive__children', 'aria-label': input.labels.subterms },
              input.children.map((child) => h('li', {}, h('a', { href: child.href }, child.label))),
            ),
      ),
    ),
    h(
      'section',
      { class: 'cg-section cg-collection', 'data-form': 'front' },
      h(
        'div',
        { class: 'cg-container cg-collection__inner' },
        lead === undefined
          ? h('p', { class: 'cg-collection__empty' }, input.labels.empty)
          : h(
              'div',
              { class: 'cg-front', 'data-secondaries': String(secondaries.length) },
              h(
                'div',
                { class: 'cg-front__lead' },
                renderStory(lead, { tag: 'h2', variant: 'lead', standfirst: true, date: true }),
              ),
              secondaries.length === 0
                ? null
                : h(
                    'ul',
                    { class: 'cg-front__secondaries' },
                    secondaries.map((story) =>
                      h(
                        'li',
                        { class: 'cg-front__item' },
                        renderStory(story, {
                          tag: 'h2',
                          variant: 'secondary',
                          standfirst: true,
                          date: true,
                        }),
                      ),
                    ),
                  ),
            ),
        pager(input),
      ),
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
      : h(
          'a',
          { class: 'cg-archive__pager-link', rel: 'prev', href: input.page.previousHref },
          input.labels.previous,
        ),
    input.page.nextHref === null
      ? null
      : h(
          'a',
          { class: 'cg-archive__pager-link', rel: 'next', href: input.page.nextHref },
          input.labels.next,
        ),
  )
}
