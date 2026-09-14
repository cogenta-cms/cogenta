import {
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
  type ImageSource,
  type RenderContext,
  renderImageSource,
  type TermArchiveEntry,
} from '@cogenta/theme-kit'
import { entryKicker, shortDate } from './layout.js'

/**
 * One story as a listing sets it: a kicker, a headline, a standfirst, a date
 * and, where the slot allows, a photograph. The front page, the rails, the
 * opinion strip, the ranked list and the section front all build their rows
 * from this one unit, so a kicker or a headline reads the same wherever the
 * reader meets it. Which parts show, and at what size, is the slot's choice
 * (`StoryOptions`) and the stylesheet's.
 *
 * The headline is the one link. The photograph links to the same place but
 * is taken out of the tab order and hidden from assistive technology, so a
 * keyboard or screen-reader user meets each story once.
 */

export interface Story {
  readonly href: string | null
  readonly title: string
  readonly kicker?: string
  readonly standfirst?: string
  readonly date?: { readonly iso: string; readonly label: string }
  readonly image?: ImageSource
}

export interface StoryOptions {
  readonly tag: HeadingTag
  /** A modifier, `cg-story--<variant>`: `lead`, `brief`, `secondary`, `rail`, `column`, `ranked`. */
  readonly variant: string
  readonly image?: boolean
  readonly standfirst?: boolean
  readonly date?: boolean
  readonly sizes?: string
  readonly loading?: 'eager' | 'lazy'
  readonly numeral?: string
}

/** A `ContentEntry` as a story: every field read through the shared entry helpers, never assumed. */
export function storyFromEntry(entry: ContentEntry, ctx: RenderContext, imageWidth: number): Story {
  const iso = entryDate(entry)
  const label = iso === undefined ? null : shortDate(iso, ctx.locale)
  const kicker = entryKicker(entry)
  const standfirst = entryExcerpt(entry)
  const image = entryImage(entry, ctx, {
    width: imageWidth,
    height: Math.round((imageWidth * 2) / 3),
    fit: 'cover',
  })
  return {
    href: entryHref(entry, ctx),
    title: entryTitle(entry, ctx),
    ...(kicker === undefined ? {} : { kicker }),
    ...(standfirst === undefined ? {} : { standfirst }),
    ...(iso === undefined || label === null ? {} : { date: { iso, label } }),
    ...(image === undefined || image.kind !== 'image' ? {} : { image }),
  }
}

/** A term archive row as a story. `TermArchiveEntry` carries no picture and no kicker, so neither is invented. */
export function storyFromArchive(entry: TermArchiveEntry, locale: string): Story {
  const label = entry.publishedAt === null ? null : shortDate(entry.publishedAt, locale)
  return {
    href: entry.href,
    title: entry.title,
    ...(entry.summary === null ? {} : { standfirst: entry.summary }),
    ...(entry.publishedAt === null || label === null
      ? {}
      : { date: { iso: entry.publishedAt, label } }),
  }
}

export function renderStory(story: Story, options: StoryOptions): HtmlElement {
  const imageOptions = {
    className: 'cg-story__image',
    ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
    ...(options.loading === undefined ? {} : { loading: options.loading }),
  }
  const showImage = options.image === true && story.image !== undefined
  const titleNode =
    story.href === null
      ? story.title
      : h('a', { class: 'cg-story__link', href: story.href }, story.title)

  return h(
    'article',
    {
      class: `cg-story cg-story--${options.variant}`,
      'data-media': showImage ? 'image' : 'none',
    },
    showImage && story.image !== undefined
      ? story.href === null
        ? h('div', { class: 'cg-story__media' }, renderImageSource(story.image, imageOptions))
        : h(
            'a',
            {
              class: 'cg-story__media',
              href: story.href,
              tabindex: '-1',
              'aria-hidden': 'true',
            },
            renderImageSource(story.image, imageOptions),
          )
      : null,
    h(
      'div',
      { class: 'cg-story__body' },
      options.numeral === undefined
        ? null
        : h('span', { class: 'cg-story__numeral', 'aria-hidden': 'true' }, options.numeral),
      story.kicker === undefined ? null : h('p', { class: 'cg-story__kicker' }, story.kicker),
      heading(options.tag, { class: 'cg-story__title' }, titleNode),
      options.standfirst === true && story.standfirst !== undefined
        ? h('p', { class: 'cg-story__standfirst' }, story.standfirst)
        : null,
      options.date === true && story.date !== undefined
        ? h(
            'p',
            { class: 'cg-story__meta' },
            h('time', { datetime: story.date.iso }, story.date.label),
          )
        : null,
    ),
  )
}
