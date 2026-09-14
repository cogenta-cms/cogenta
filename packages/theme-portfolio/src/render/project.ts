import {
  type HtmlElement,
  h,
  type PageContent,
  type PageEntryMeta,
  type PageEntryTerm,
  renderImageSource,
} from '@cogenta/theme-kit'
import { taxonomyLabel, yearLabel, yearOf } from './layout.js'

/**
 * The page of one project, and the plain page title everything else gets.
 *
 * A project page opens the way a studio presents a case study:
 *
 * 1. the title, very large, across the grid;
 * 2. the statement (the entry's excerpt) in the lead size, across eight
 *    columns;
 * 3. the lead visual, the project's own cover, full width at its own shape;
 * 4. the fact sheet: one column per fact, a hairline over the row. The year
 *    comes from the entry's publication date, labelled with the platform's
 *    own word for "year" in the page's language; every other column is one
 *    taxonomy the collection declares (a client, the disciplines, the team),
 *    labelled with the taxonomy's own name and listing its terms, each linked
 *    to its archive.
 *
 * The body that follows is the editor's own blocks. On a project page a
 * `prose` block sets its text in two columns on a wide screen (`work.css`,
 * keyed on the `cg-project` class of `<main>`).
 */

/** What makes a page a project: it has an entry with a cover image and is not a plain page. */
export function isProject(entry: PageEntryMeta | undefined): entry is PageEntryMeta {
  return entry !== undefined && entry.image !== undefined && entry.collection !== 'page'
}

interface Fact {
  readonly key: string
  readonly label: string
  readonly values: readonly HtmlElement[]
}

function termValue(term: PageEntryTerm): HtmlElement {
  return h(
    'li',
    { class: 'cg-facts__value' },
    term.href === null
      ? term.label
      : h('a', { class: 'cg-facts__link', href: term.href }, term.label),
  )
}

function facts(entry: PageEntryMeta, locale: string): readonly Fact[] {
  const out: Fact[] = []
  const iso = entry.publishedAt
  const year = iso === undefined ? undefined : yearOf(iso)
  if (iso !== undefined && year !== undefined) {
    out.push({
      key: 'year',
      label: yearLabel(locale),
      values: [h('li', { class: 'cg-facts__value' }, h('time', { datetime: iso }, year))],
    })
  }
  const groups = new Map<string, PageEntryTerm[]>()
  for (const term of entry.terms ?? []) {
    const group = groups.get(term.taxonomy)
    if (group === undefined) groups.set(term.taxonomy, [term])
    else group.push(term)
  }
  for (const [taxonomy, terms] of groups) {
    out.push({
      key: taxonomy,
      label: taxonomyLabel(taxonomy, locale),
      values: terms.map(termValue),
    })
  }
  return out
}

function renderFacts(entry: PageEntryMeta, locale: string): HtmlElement | null {
  const list = facts(entry, locale)
  if (list.length === 0) return null
  return h(
    'dl',
    { class: 'cg-facts', 'data-count': String(Math.min(list.length, 4)) },
    list.map((fact) =>
      h(
        'div',
        { class: 'cg-facts__item', 'data-fact': fact.key },
        h('dt', { class: 'cg-facts__label' }, fact.label),
        h('dd', { class: 'cg-facts__values' }, h('ul', { class: 'cg-facts__list' }, fact.values)),
      ),
    ),
  )
}

export function renderProjectHeader(
  page: PageContent,
  entry: PageEntryMeta,
  locale: string,
): HtmlElement {
  const image = entry.image
  return h(
    'header',
    { class: 'cg-project-head' },
    h(
      'div',
      { class: 'cg-container cg-project-head__inner' },
      h('h1', { class: 'cg-project-head__title' }, page.title),
      entry.excerpt === undefined
        ? null
        : h('p', { class: 'cg-project-head__statement' }, entry.excerpt),
      image === undefined
        ? null
        : h(
            'figure',
            { class: 'cg-project-head__lead' },
            renderImageSource(image, {
              className: 'cg-project-head__image',
              loading: 'eager',
              sizes: '(min-width: 96rem) 92rem, 100vw',
            }),
          ),
      renderFacts(entry, locale),
    ),
  )
}

/** The title of any other page: set large on the grid, with nothing around it. */
export function renderPageHeader(page: PageContent): HtmlElement {
  return h(
    'header',
    { class: 'cg-page-head' },
    h(
      'div',
      { class: 'cg-container cg-page-head__inner' },
      h('h1', { class: 'cg-page-head__title' }, page.title),
    ),
  )
}
