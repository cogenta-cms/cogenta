import type { CollectionListBlock } from '@cogenta/blocks'
import {
  buildCollectionListQuery,
  type ContentEntry,
  entryDate,
  entryExcerpt,
  entryHref,
  entryImage,
  entryTitle,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { dayMonth, section, sectionHead, yearOf } from '../layout.js'
import { renderStory, type Story, storyFromEntry } from '../story.js'

export { buildCollectionListQuery as query }

/**
 * A listing, set in one of four forms chosen from what the editor already
 * decided in contract B (the layout, and whether the list has a title),
 * never from a setting this theme invents — the same discipline
 * `@cogenta/theme-magazine` keeps for its own four forms:
 *
 * - `list` without a title is **the index**: this theme's own signature, a
 *   table of contents grouped by year, unchanged by this pass because
 *   nothing about it was incomplete.
 * - `list` with a title is **a digest**: a short, ungrouped list for a
 *   curated shelf ("Latest", "Reader favourites") rather than a
 *   chronological archive — grouping five recent posts by year would be
 *   furniture with nothing to organise.
 * - `grid` without a title is **the front**: the newest essay set large,
 *   with its picture and its standfirst, and the next few underneath as a
 *   row of smaller cards. This is what an essay collection opens on.
 * - `grid` with a title is **a rail**: the section label on a rule, its
 *   newest essay large beside a column of the others — a shelf that keeps
 *   reading after its first two items.
 * - `carousel` is **a strip**: essays side by side between column rules,
 *   scrolling on a narrow screen.
 *
 * An empty list keeps its head and says so in one line.
 */

/**
 * Only a declared publication date is shown: `entryDate` falls back to
 * `createdAt`, and the instant a record was typed in is not a date a reader
 * is owed.
 */
function publicationDate(entry: ContentEntry): string | undefined {
  return typeof entry.publishedAt === 'string' ? entryDate(entry) : undefined
}

/**
 * The picture link is hidden from assistive technology and from the tab
 * order: it goes where the title goes, and one link per entry is what a
 * keyboard or screen reader user should meet.
 */
function picture(
  entry: ContentEntry,
  ctx: RenderContext,
  url: string,
  className: string,
  sizes: string,
): HtmlElement | null {
  const source = entryImage(entry, ctx)
  if (source === undefined) return null
  return h(
    'a',
    { class: `${className}__media`, href: url, tabindex: '-1', 'aria-hidden': 'true' },
    renderImageSource(source, { className: `${className}__image`, loading: 'lazy', sizes }),
  )
}

function title(
  entry: ContentEntry,
  ctx: RenderContext,
  url: string,
  className: string,
  tag: HeadingTag,
): HtmlElement {
  return heading(
    tag,
    { class: `${className}__title` },
    h('a', { class: `${className}__link`, href: url }, entryTitle(entry, ctx)),
  )
}

/**
 * The index: the margin carries the date, and the year once, on the first
 * entry of each year, so a long archive reads as a table of contents grouped
 * by year without a heading level of its own. The title and standfirst sit
 * on the text line; a picture, when the entry has one, takes the last three
 * columns, and a row without one is a row of text, never a row with a hole
 * in it.
 */
function renderIndexRow(
  entry: ContentEntry,
  previousYear: string | null,
  ctx: RenderContext,
  tag: HeadingTag,
): { readonly node: HtmlElement; readonly year: string | null } {
  const url = entryHref(entry, ctx)
  const iso = publicationDate(entry)
  const year = iso === undefined ? null : yearOf(iso)
  const day = iso === undefined ? null : dayMonth(iso, ctx.locale)
  const excerpt = entryExcerpt(entry)
  const media = picture(entry, ctx, url, 'cg-index', '(min-width: 64rem) 16rem, 30vw')
  const node = h(
    'li',
    { class: 'cg-index__row', 'data-media': media === null ? 'none' : 'present' },
    h(
      'p',
      { class: 'cg-index__margin' },
      year !== null && year !== previousYear ? h('span', { class: 'cg-index__year' }, year) : null,
      iso === undefined || day === null
        ? null
        : h('time', { class: 'cg-index__date', datetime: iso }, day),
    ),
    h(
      'div',
      { class: 'cg-index__body' },
      title(entry, ctx, url, 'cg-index', tag),
      excerpt === undefined ? null : h('p', { class: 'cg-index__excerpt' }, excerpt),
    ),
    media,
  )
  return { node, year: year ?? previousYear }
}

/**
 * The digest: a short, ungrouped list — a compact row of date, title and
 * (on a wide screen) the standfirst, for a curated handful rather than a
 * chronological archive.
 */
function digestRow(story: Story, tag: HeadingTag): HtmlElement {
  return h(
    'li',
    { class: 'cg-digest__row' },
    story.date === undefined
      ? null
      : h(
          'p',
          { class: 'cg-digest__date' },
          h('time', { datetime: story.date.iso }, story.date.label),
        ),
    h(
      'div',
      { class: 'cg-digest__body' },
      heading(
        tag,
        { class: 'cg-digest__title' },
        story.href === null
          ? story.title
          : h('a', { class: 'cg-digest__link', href: story.href }, story.title),
      ),
      story.standfirst === undefined
        ? null
        : h('p', { class: 'cg-digest__excerpt' }, story.standfirst),
    ),
  )
}

const FRONT_SECONDARIES = 3

/** The front: the newest essay large, the next few underneath in a row. */
function frontStories(stories: readonly Story[], tag: HeadingTag): HtmlElement {
  const [lead, ...rest] = stories
  const secondaries = rest.slice(0, FRONT_SECONDARIES)
  return h(
    'div',
    { class: 'cg-front', 'data-secondaries': String(secondaries.length) },
    lead === undefined
      ? null
      : h(
          'div',
          { class: 'cg-front__lead' },
          renderStory(lead, {
            tag,
            variant: 'lead',
            image: true,
            standfirst: true,
            sizes: '(min-width: 64rem) 60rem, 100vw',
            loading: 'eager',
          }),
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
                tag,
                variant: 'secondary',
                image: true,
                standfirst: true,
                sizes: '(min-width: 64rem) 20rem, (min-width: 40rem) 45vw, 100vw',
              }),
            ),
          ),
        ),
  )
}

/**
 * The rail: the newest essay large beside a column of the rest. The column's
 * own items carry no standfirst — a headline and a date, the way a rail of
 * links reads elsewhere on this theme — so a lead with little of its own to
 * show (no picture, a short excerpt) is never dwarfed by a taller column
 * beside it, flex letting the two size to their own content.
 */
function railStories(stories: readonly Story[], tag: HeadingTag): HtmlElement {
  const [lead, ...rest] = stories
  return h(
    'div',
    { class: 'cg-rail', 'data-count': String(stories.length) },
    lead === undefined
      ? null
      : h(
          'div',
          { class: 'cg-rail__lead' },
          renderStory(lead, {
            tag,
            variant: 'lead',
            image: true,
            standfirst: true,
            date: true,
            sizes: '(min-width: 64rem) 34rem, 100vw',
          }),
        ),
    rest.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-rail__list' },
          rest.map((story) =>
            h(
              'li',
              { class: 'cg-rail__item' },
              renderStory(story, { tag, variant: 'brief', date: true }),
            ),
          ),
        ),
  )
}

/** The strip: essays side by side between column rules, scrolling on a narrow screen. */
function stripStories(stories: readonly Story[], tag: HeadingTag): HtmlElement {
  return h(
    'ul',
    { class: 'cg-strip__items' },
    stories.map((story) =>
      h(
        'li',
        { class: 'cg-strip__item' },
        renderStory(story, {
          tag,
          variant: 'strip',
          image: true,
          standfirst: true,
          sizes: '(min-width: 40rem) 20rem, 70vw',
        }),
      ),
    ),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const titled = block.title !== undefined
  const entryTag = nestedHeadingTag('collectionList', titled)
  const form =
    block.layout === 'grid'
      ? titled
        ? 'rail'
        : 'front'
      : block.layout === 'carousel'
        ? 'strip'
        : titled
          ? 'digest'
          : 'index'

  let body: HtmlElement
  if (entries.length === 0) {
    body = h('p', { class: 'cg-collection__empty' }, ctx.t('collection.empty'))
  } else if (form === 'index') {
    let year: string | null = null
    const rows = entries.map((entry) => {
      const row = renderIndexRow(entry, year, ctx, entryTag)
      year = row.year
      return row.node
    })
    body = h('ol', { class: 'cg-index' }, rows)
  } else if (form === 'digest') {
    const stories = entries.map((entry) => storyFromEntry(entry, ctx, 0, 'short'))
    body = h(
      'ol',
      { class: 'cg-digest' },
      stories.map((story) => digestRow(story, entryTag)),
    )
  } else if (form === 'front') {
    const stories = entries.map((entry) => storyFromEntry(entry, ctx, 1200))
    body = frontStories(stories, entryTag)
  } else if (form === 'rail') {
    const stories = entries.map((entry) => storyFromEntry(entry, ctx, 800))
    body = railStories(stories, entryTag)
  } else {
    const stories = entries.map((entry) => storyFromEntry(entry, ctx, 480, 'short'))
    body = h(
      'div',
      {
        class: 'cg-strip',
        role: 'region',
        'aria-label': block.title ?? ctx.t('collection.carousel'),
        tabindex: '0',
        'data-count': String(Math.min(entries.length, 4)),
      },
      stripStories(stories, entryTag),
    )
  }

  return section(
    'section',
    'collectionList',
    'cg-collection',
    { 'data-layout': block.layout, 'data-form': form },
    'div',
    sectionHead('collectionList', block.title),
    body,
  )
}
