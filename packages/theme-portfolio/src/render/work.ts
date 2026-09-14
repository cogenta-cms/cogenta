import {
  type ContentEntry,
  entryHref,
  entryImage,
  entryTitle,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  type ImageSource,
  type RenderContext,
  renderImageSource,
} from '@cogenta/theme-kit'
import { captionUnder, entryCaption, renderCaption, type WorkCaption } from './layout.js'

/**
 * One piece of work as a listing sets it: the image, square-cornered and
 * edge to edge within its columns, then the title and the caption line
 * (client, discipline, year). The grid, the strip and the index all build
 * their rows from this one unit.
 *
 * The title is the one link. The image links to the same page but is taken
 * out of the tab order and hidden from assistive technology, so a keyboard or
 * screen-reader user meets each project once.
 */
export interface Work {
  readonly href: string | null
  readonly title: string
  readonly caption: WorkCaption
  readonly image?: ImageSource
  /** A sentence about the work, when the source carries one and the slot shows it (the archive index). */
  readonly summary?: string
}

/** Covers are drawn at 3:2; a listing never asks for another shape, so no card is cropped differently from its neighbour. */
const COVER_WIDTH = 2000

export function workFromEntry(entry: ContentEntry, ctx: RenderContext): Work {
  const image = entryImage(entry, ctx, {
    width: COVER_WIDTH,
    height: Math.round((COVER_WIDTH * 2) / 3),
    fit: 'cover',
  })
  return {
    href: entryHref(entry, ctx),
    title: entryTitle(entry, ctx),
    caption: entryCaption(entry),
    ...(image === undefined || image.kind !== 'image' ? {} : { image }),
  }
}

export interface WorkCardOptions {
  readonly tag: HeadingTag
  readonly sizes: string
  readonly loading?: 'eager' | 'lazy'
}

function titleOf(work: Work, tag: HeadingTag, className: string): HtmlElement {
  return heading(
    tag,
    { class: className },
    work.href === null
      ? work.title
      : h('a', { class: 'cg-work__link', href: work.href }, work.title),
  )
}

export function renderWorkCard(work: Work, options: WorkCardOptions): HtmlElement {
  const picture =
    work.image === undefined
      ? h('div', { class: 'cg-work__media', 'data-empty': 'true' })
      : h(
          work.href === null ? 'div' : 'a',
          work.href === null
            ? { class: 'cg-work__media' }
            : { class: 'cg-work__media', href: work.href, tabindex: '-1', 'aria-hidden': 'true' },
          renderImageSource(work.image, {
            className: 'cg-work__image',
            sizes: options.sizes,
            loading: options.loading ?? 'lazy',
          }),
        )
  return h(
    'article',
    { class: 'cg-work' },
    picture,
    h(
      'div',
      { class: 'cg-work__text' },
      titleOf(work, options.tag, 'cg-work__title'),
      renderCaption(captionUnder(work.caption, work.title), 'cg-work__caption'),
    ),
  )
}

/**
 * A row of the index: the title, then the client, the discipline and the
 * year in their own columns, a hairline under each. The columns carry no
 * header row: a header is words, and a theme has no translation for them.
 * The client and the discipline share one wrapper, so on a phone they read
 * as one line under the title; on a wide screen the wrapper steps aside
 * (`display: contents`) and each takes its column.
 */
export function renderIndexRow(work: Work, tag: HeadingTag): HtmlElement {
  const { client, discipline, year } = work.caption
  return h(
    'li',
    { class: 'cg-index__row' },
    titleOf(work, tag, 'cg-index__title'),
    work.summary === undefined
      ? h(
          'span',
          { class: 'cg-index__meta' },
          h('span', { class: 'cg-index__cell', 'data-part': 'client' }, client ?? ''),
          h('span', { class: 'cg-index__cell', 'data-part': 'discipline' }, discipline ?? ''),
        )
      : h(
          'span',
          { class: 'cg-index__meta' },
          h('span', { class: 'cg-index__summary' }, work.summary),
        ),
    h('span', { class: 'cg-index__cell', 'data-part': 'year' }, year ?? ''),
  )
}
