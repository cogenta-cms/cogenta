import { type HtmlElement, h, renderArchiveIntro, type TermArchiveInput } from '@cogenta/theme-kit'
import { renderStory, storyFromArchive } from './story.js'

/**
 * The taxonomy-term archive (contract D `theme@1.3`), set as a section front.
 *
 * The term is the page's title, very large on a double rule, under the
 * taxonomy's name as a kicker. Its stories follow the front page's own
 * composition: the newest as the lead across eight columns, the next three
 * as briefs behind a vertical rule, and the rest in a row of three divided by
 * hairlines. `TermArchiveEntry` carries no picture and no kicker, so a
 * section front is set entirely in type, which is how a newspaper's inside
 * section pages read anyway.
 *
 * Every visible word that is not content comes from `input.labels`, already
 * in the page's language.
 */
const BRIEFS = 3

export function renderTermArchive(input: TermArchiveInput): HtmlElement {
  const stories = input.entries.map((entry) => storyFromArchive(entry, input.locale))
  const [lead, ...others] = stories
  const briefs = others.slice(0, BRIEFS)
  const more = others.slice(BRIEFS)

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
      { class: 'cg-section cg-listing', 'data-form': 'archive' },
      h(
        'div',
        { class: 'cg-container cg-listing__inner' },
        lead === undefined
          ? h('p', { class: 'cg-empty' }, input.labels.empty)
          : h(
              'div',
              {
                class: 'cg-front',
                'data-briefs': String(briefs.length),
                'data-more': String(more.length),
              },
              h(
                'div',
                { class: 'cg-front__lead' },
                renderStory(lead, { tag: 'h2', variant: 'lead', standfirst: true, date: true }),
              ),
              briefs.length === 0
                ? null
                : h(
                    'ul',
                    { class: 'cg-front__briefs' },
                    briefs.map((story) =>
                      h(
                        'li',
                        { class: 'cg-front__brief' },
                        renderStory(story, {
                          tag: 'h2',
                          variant: 'brief',
                          standfirst: true,
                          date: true,
                        }),
                      ),
                    ),
                  ),
              more.length === 0
                ? null
                : h(
                    'ul',
                    { class: 'cg-front__more' },
                    more.map((story) =>
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
