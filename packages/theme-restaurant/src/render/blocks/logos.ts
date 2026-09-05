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
 * "Featured in" / press mentions, held back to a quiet grayscale until
 * hovered — contract B says the organisation's name **is** the accessible
 * name of the link, so the logo image carries it as `alt` text when the
 * media entity has none, and no visually hidden duplicate is added.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const logo = image(ctx, item.media, {
    className: 'cg-press__logo',
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
    { class: 'cg-press', 'data-block': 'logos' },
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
