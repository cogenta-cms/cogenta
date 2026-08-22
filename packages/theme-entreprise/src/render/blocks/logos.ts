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
 * A "trusted by" client strip. Contract B says the organisation's name **is**
 * the accessible name of the link, so the logo image carries it as `alt`
 * text when the media entity has none, and no visually hidden duplicate is
 * added: a link whose only content is an image with `alt` text is already
 * named.
 *
 * The restrained, grayscale-leaning treatment (`filter: grayscale()` in the
 * stylesheet) is the "held back until hovered" client-logo language the
 * aesthetic direction calls for — a `filter`, never `grayscale` baked into
 * the media itself, since the underlying asset still arrives as a real
 * `<img>` from `image()`.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const logo = image(ctx, item.media, {
    className: 'cg-clients__logo',
    altFrom: item.name,
    variant: { fit: 'contain' },
  })
  return h(
    'li',
    { class: 'cg-clients__item' },
    item.url === undefined
      ? logo
      : h(
          'a',
          { class: 'cg-clients__link', href: ctx.link(item.url), rel: 'noopener noreferrer' },
          logo,
        ),
  )
}

export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-clients', 'data-block': 'logos' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('logos') ?? 'h2',
          { class: 'cg-clients__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-clients__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
