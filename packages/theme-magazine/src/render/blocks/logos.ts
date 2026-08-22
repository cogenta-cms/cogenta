import type { LogoItem, LogosBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  image,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * A press strip — "As seen in" — a single row divided by hairline rules
 * rather than a card grid, the way a masthead credits its syndication
 * partners along one line.
 *
 * The organisation's name is contract B's own accessible name for the link:
 * the logo image carries it as `alt` when the media entity has none, so no
 * visually hidden duplicate text is needed — a link whose only content is an
 * image with `alt` text is already named.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const logo = image(ctx, item.media, {
    className: 'cg-press__image',
    altFrom: item.name,
    variant: { fit: 'contain' },
  })
  return h(
    'li',
    { class: 'cg-press__item' },
    item.url === undefined
      ? logo
      : h(
          'a',
          { class: 'cg-press__link', href: ctx.link(item.url), rel: 'noopener noreferrer' },
          logo,
        ),
  )
}

export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-press', 'data-block': 'logos' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('logos') ?? 'h2',
          { class: 'cg-press__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-press__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
