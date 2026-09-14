import {
  type HtmlElement,
  h,
  type PageContent,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'

/**
 * The opening of a page that has no hero: a feature, a changelog entry, a
 * legal notice.
 *
 * A dated entry prints its date (and its reading time, when the host computed
 * one) in Geist Mono above the title, the way a changelog does; its terms
 * follow as a line of plain links. Then the title at the page-title size on
 * nine columns, the summary on seven at the lead size, the author, and the
 * entry's picture across the container in the hairline frame, since on this
 * kind of site an entry's picture is a screenshot of what it describes.
 *
 * A host older than `theme@1.4` sends no entry, and the page opens on its bare
 * title.
 */

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function renderPageHead(page: PageContent, ctx: RenderContext): HtmlElement {
  const entry = page.entry
  const meta: HtmlElement[] = []
  if (entry?.publishedAt !== undefined) {
    meta.push(h('time', { datetime: entry.publishedAt }, formatDate(entry.publishedAt, ctx.locale)))
    if (entry.readingMinutes !== undefined) {
      meta.push(h('span', {}, ctx.t('entry.readingTime', { minutes: entry.readingMinutes })))
    }
  }
  const terms = entry?.terms ?? []

  return h(
    'header',
    {
      class: 'cs-page-head',
      'data-dated': entry?.publishedAt === undefined ? 'false' : 'true',
      'data-cover': entry?.image === undefined ? 'false' : 'true',
    },
    h(
      'div',
      { class: 'cs-container cs-page-head__inner' },
      meta.length === 0 ? null : h('p', { class: 'cs-page-head__meta' }, meta),
      terms.length === 0
        ? null
        : h(
            'ul',
            { class: 'cs-page-head__terms' },
            terms.map((term) =>
              h(
                'li',
                {},
                term.href === null ? term.label : h('a', { href: term.href }, term.label),
              ),
            ),
          ),
      h('h1', { class: 'cs-page-head__title' }, page.title),
      entry?.excerpt === undefined ? null : h('p', { class: 'cs-page-head__lead' }, entry.excerpt),
      entry?.author === undefined
        ? null
        : h('p', { class: 'cs-page-head__author' }, entry.author.name),
      entry?.image === undefined
        ? null
        : h(
            'figure',
            { class: 'cs-page-head__cover cs-frame' },
            renderImageSource(entry.image, {
              className: 'cs-page-head__image cs-frame__image',
              loading: 'eager',
              sizes: '(min-width: 80rem) 76rem, 100vw',
            }),
          ),
    ),
  )
}
