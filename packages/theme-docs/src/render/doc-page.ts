import type { BlockRegistry, CollectionListBlock, VocabularyBlock } from '@cogenta/blocks'
import {
  type ContentEntry,
  entryHref,
  entryTitle,
  type FetchedEntries,
  type HtmlElement,
  h,
  type PageContent,
  pageHasOwnHeading,
  type RenderContext,
  withBlockKey,
} from '@cogenta/theme-kit'
import { type DocGroup, groupDocPages, readingOrder } from './doc-index.js'
import { longDate } from './layout.js'
import { type HeadingAnchor, type HeadingAnchors, headingAnchors } from './rich-text.js'
import { word } from './strings.js'

/**
 * A documentation page: navigation, the reading column, the table of
 * contents.
 *
 * The navigation comes from the page's own first block, a `collectionList` on
 * `doc_page` that the documentation blueprint seeds on every page for this
 * purpose (contract B has no "this block is chrome" flag, and inventing one
 * would be a contract change for one theme's layout). It is rendered as the
 * sidebar and dropped from the stream of content blocks.
 *
 * Three columns on a wide screen: the sidebar held in view as the page
 * scrolls, the article on its measure, and "On this page" built from the
 * article's own `h2`/`h3`. The table of contents has no scroll spy (that
 * would need a script); it is a plain list of links that stays in view. Two
 * columns on a laptop (the table of contents goes), one on a phone, where the
 * navigation folds into a `<details>` disclosure at the top of the article.
 *
 * The sidebar is in two copies: a plain `<nav>` for wide screens, and the
 * same links inside the disclosure for narrow ones. A closed `<details>`
 * hides its content through the browser's own `::details-content` box, which
 * a stylesheet cannot reliably reopen on a wide screen (verified in Chrome in
 * L25), so the desktop column is never a disclosure. Exactly one copy is
 * displayed at any width, so a screen reader is never offered two.
 *
 * Under the article: the date the page last changed, and links to the
 * previous and next pages in the documentation's reading order. No comment
 * form and no "was this helpful" widget: neither could be answered honestly
 * by a static page.
 */

function sidebarLinks(
  groups: readonly DocGroup[],
  ctx: RenderContext,
  current: string,
): readonly HtmlElement[] {
  return groups.map((group) =>
    h(
      'div',
      { class: 'cd-sidenav__group' },
      h('p', { class: 'cd-sidenav__heading' }, group.section),
      h(
        'ul',
        { class: 'cd-sidenav__links' },
        group.entries.map((entry) => {
          const target = entryHref(entry, ctx)
          return h(
            'li',
            { class: 'cd-sidenav__item' },
            h(
              'a',
              {
                class: 'cd-sidenav__link',
                href: target,
                'aria-current': target === current ? 'page' : undefined,
              },
              entryTitle(entry, ctx),
            ),
          )
        }),
      ),
    ),
  )
}

function renderSidebar(
  groups: readonly DocGroup[],
  ctx: RenderContext,
  current: string,
  currentEntry: ContentEntry | undefined,
  title: string,
): readonly HtmlElement[] {
  const label = word(ctx.locale, 'documentation')
  const section = typeof currentEntry?.section === 'string' ? currentEntry.section : undefined
  return [
    h(
      'nav',
      { class: 'cd-sidenav cd-sidenav--wide', 'aria-label': label },
      sidebarLinks(groups, ctx, current),
    ),
    h(
      'details',
      { class: 'cd-sidenav-disclosure' },
      h(
        'summary',
        { class: 'cd-sidenav-disclosure__summary' },
        h('span', { class: 'cd-sidenav-disclosure__label' }, word(ctx.locale, 'menu')),
        h(
          'span',
          { class: 'cd-sidenav-disclosure__where' },
          section === undefined ? title : `${section} / ${title}`,
        ),
      ),
      h(
        'nav',
        { class: 'cd-sidenav cd-sidenav--narrow', 'aria-label': label },
        sidebarLinks(groups, ctx, current),
      ),
    ),
  ]
}

function renderBreadcrumb(
  ctx: RenderContext,
  section: string | undefined,
  title: string,
): HtmlElement {
  return h(
    'nav',
    { class: 'cd-breadcrumb', 'aria-label': word(ctx.locale, 'breadcrumb') },
    h(
      'ol',
      { class: 'cd-breadcrumb__items' },
      h('li', {}, h('a', { href: ctx.link('/') }, word(ctx.locale, 'docsHome'))),
      section === undefined ? null : h('li', {}, section),
      h('li', { 'aria-current': 'page' }, title),
    ),
  )
}

function renderToc(ctx: RenderContext, anchors: HeadingAnchors): HtmlElement | null {
  const list = [...anchors.values()]
  if (list.length < 2) return null
  const items: HtmlElement[] = []
  let children: HeadingAnchor[] = []
  let parent: HeadingAnchor | undefined
  const close = (): void => {
    if (parent === undefined) {
      for (const orphan of children) items.push(tocItem(orphan, []))
    } else {
      items.push(tocItem(parent, children))
    }
    children = []
    parent = undefined
  }
  for (const anchor of list) {
    if (anchor.level === 2) {
      close()
      parent = anchor
    } else {
      children.push(anchor)
    }
  }
  close()
  return h(
    'nav',
    { class: 'cd-toc', 'aria-labelledby': 'cd-toc-label' },
    h('p', { class: 'cd-toc__label', id: 'cd-toc-label' }, word(ctx.locale, 'onThisPage')),
    h('ol', { class: 'cd-toc__items' }, items),
  )
}

function tocItem(anchor: HeadingAnchor, children: readonly HeadingAnchor[]): HtmlElement {
  return h(
    'li',
    { class: 'cd-toc__item', 'data-level': String(anchor.level) },
    h('a', { class: 'cd-toc__link', href: `#${anchor.id}` }, anchor.text),
    children.length === 0
      ? null
      : h(
          'ol',
          { class: 'cd-toc__items' },
          children.map((child) => tocItem(child, [])),
        ),
  )
}

function pagerLink(
  ctx: RenderContext,
  entry: ContentEntry | undefined,
  direction: 'previous' | 'next',
): HtmlElement | null {
  if (entry === undefined) return null
  return h(
    'a',
    {
      class: 'cd-pager__link',
      'data-direction': direction,
      href: entryHref(entry, ctx),
      rel: direction === 'previous' ? 'prev' : 'next',
    },
    h('span', { class: 'cd-pager__label' }, word(ctx.locale, direction)),
    h('span', { class: 'cd-pager__title' }, entryTitle(entry, ctx)),
  )
}

function renderFoot(
  page: PageContent,
  ctx: RenderContext,
  order: readonly ContentEntry[],
  currentIndex: number,
): HtmlElement {
  const updated = page.entry?.updatedAt
  const previous = currentIndex > 0 ? order[currentIndex - 1] : undefined
  const next = currentIndex >= 0 ? order[currentIndex + 1] : undefined
  const pager =
    previous === undefined && next === undefined
      ? null
      : h(
          'nav',
          { class: 'cd-pager', 'aria-label': word(ctx.locale, 'pager') },
          pagerLink(ctx, previous, 'previous'),
          pagerLink(ctx, next, 'next'),
        )
  return h(
    'footer',
    { class: 'cd-doc__foot' },
    updated === undefined
      ? null
      : h(
          'p',
          { class: 'cd-doc__updated' },
          `${word(ctx.locale, 'lastUpdated')} `,
          h('time', { datetime: updated }, longDate(updated, ctx.locale)),
        ),
    pager,
  )
}

export type BlockRenderer = (
  block: VocabularyBlock,
  ctx: RenderContext,
  entries: FetchedEntries,
  registry: BlockRegistry | undefined,
  anchors: HeadingAnchors,
) => HtmlElement | null

export function renderDocPage(
  page: PageContent,
  ctx: RenderContext,
  sidebarBlock: CollectionListBlock,
  entries: FetchedEntries,
  registry: BlockRegistry | undefined,
  renderOne: BlockRenderer,
): HtmlElement {
  const groups = groupDocPages(entries[sidebarBlock._key] ?? [], ctx)
  const order = readingOrder(groups)
  const current = ctx.url.pathname
  const currentIndex = order.findIndex((entry) => entryHref(entry, ctx) === current)
  const currentEntry = currentIndex >= 0 ? order[currentIndex] : undefined
  const section = typeof currentEntry?.section === 'string' ? currentEntry.section : undefined

  const content = page.blocks.slice(1)
  const anchors = headingAnchors(content)
  const ownHeading = pageHasOwnHeading(content)
  const toc = renderToc(ctx, anchors)

  return h(
    'main',
    { class: 'cg-main cd-doc', id: 'cg-main', 'data-toc': toc === null ? 'false' : 'true' },
    h(
      'div',
      { class: 'cd-doc__layout' },
      withBlockKey(
        h(
          'div',
          { class: 'cd-doc__sidebar' },
          renderSidebar(groups, ctx, current, currentEntry, page.title),
        ),
        sidebarBlock._key,
      ),
      h(
        'article',
        { class: 'cd-doc__article' },
        h(
          'header',
          { class: 'cd-doc__head' },
          renderBreadcrumb(ctx, section, page.title),
          ownHeading ? null : h('h1', { class: 'cd-doc__title' }, page.title),
          page.entry?.excerpt === undefined
            ? null
            : h('p', { class: 'cd-doc__lede' }, page.entry.excerpt),
        ),
        h(
          'div',
          { class: 'cd-doc__body' },
          content.map((block) =>
            withBlockKey(renderOne(block, ctx, entries, registry, anchors), block._key),
          ),
        ),
        renderFoot(page, ctx, order, currentIndex),
      ),
      toc === null ? null : h('div', { class: 'cd-doc__toc' }, toc),
    ),
  )
}
