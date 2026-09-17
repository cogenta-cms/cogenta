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
import { dayMonth, entryTopic, longDate } from './layout.js'

/**
 * One essay as a listing sets it: a topic, a title, a standfirst, a date
 * and, where the slot allows, a picture. The home page's opening, a rail, a
 * shelf and a carousel all build their cards from this one unit, so a topic
 * label or a title reads the same wherever a reader meets it — the same
 * discipline `@cogenta/theme-magazine` keeps with its own `Story`, in this
 * theme's own quieter register: a small-caps topic rather than a red kicker,
 * a serif headline rather than a display sans, margin dates rather than a
 * dateline rule.
 *
 * The title is the one link. A picture links to the same place but is taken
 * out of the tab order and hidden from assistive technology, so a keyboard
 * or screen-reader user meets each essay once.
 */

export interface Story {
  readonly href: string | null
  readonly title: string
  readonly topic?: string
  readonly standfirst?: string
  readonly date?: { readonly iso: string; readonly label: string }
  readonly image?: ImageSource
}

export interface StoryOptions {
  readonly tag: HeadingTag
  /** A modifier, `cg-story--<variant>`: `lead`, `secondary`, `brief`, `strip`. */
  readonly variant: string
  readonly image?: boolean
  readonly standfirst?: boolean
  readonly date?: boolean
  readonly sizes?: string
  readonly loading?: 'eager' | 'lazy'
}

/**
 * A `ContentEntry` as a story: every field read through the shared entry
 * helpers, never assumed. `dateFormat` picks the label once, here, rather
 * than in `renderStory`: a lead or a secondary card reads a full date (the
 * same form the essay's own header sets), a brief row in a rail or a digest
 * reads the short margin form this theme already uses everywhere else.
 */
export function storyFromEntry(
  entry: ContentEntry,
  ctx: RenderContext,
  imageWidth: number,
  dateFormat: 'long' | 'short' = 'long',
): Story {
  const iso = entryDate(entry)
  const label =
    iso === undefined
      ? null
      : dateFormat === 'long'
        ? longDate(iso, ctx.locale)
        : dayMonth(iso, ctx.locale)
  const topic = entryTopic(entry)
  const standfirst = entryExcerpt(entry)
  const image = entryImage(entry, ctx, {
    width: imageWidth,
    height: Math.round((imageWidth * 2) / 3),
    fit: 'cover',
  })
  return {
    href: entryHref(entry, ctx),
    title: entryTitle(entry, ctx),
    ...(topic === undefined ? {} : { topic }),
    ...(standfirst === undefined ? {} : { standfirst }),
    ...(iso === undefined || label === null ? {} : { date: { iso, label } }),
    ...(image === undefined || image.kind !== 'image' ? {} : { image }),
  }
}

/** A term archive row as a story. `TermArchiveEntry` carries no picture and no topic, so neither is invented. */
export function storyFromArchive(
  entry: TermArchiveEntry,
  locale: string,
  dateFormat: 'long' | 'short' = 'long',
): Story {
  const label =
    entry.publishedAt === null
      ? null
      : dateFormat === 'long'
        ? longDate(entry.publishedAt, locale)
        : dayMonth(entry.publishedAt, locale)
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

  // No wrapper around the text furniture: on a lead story it is set on the
  // 12-column grid, the same way the essay's own header is, and a wrapper
  // `<div>` would sit between the grid and the elements it has to place.
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
    story.topic === undefined ? null : h('p', { class: 'cg-story__topic' }, story.topic),
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
  )
}
