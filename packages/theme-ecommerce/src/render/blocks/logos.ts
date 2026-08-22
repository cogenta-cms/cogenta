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
 * The "as seen in" / stockist strip — a horizontal, evenly spaced band with a
 * hairline separator between marks, the shape a press or partner strip takes
 * on a retail site. Contract B says the organisation's name **is** the
 * accessible name of the link, so the logo image carries it as alt text when
 * the media entity itself has none, and no visually hidden duplicate is
 * added.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const logo = image(ctx, item.media, {
    className: 'ce-logo__image',
    altFrom: item.name,
    variant: { fit: 'contain' },
  })
  return h(
    'li',
    { class: 'ce-logo' },
    item.url === undefined
      ? logo
      : h(
          'a',
          { class: 'ce-logo__link', href: ctx.link(item.url), rel: 'noopener noreferrer' },
          logo,
        ),
  )
}

export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'ce-block ce-logos', 'data-block': 'logos' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('logos') ?? 'h2',
          { class: 'ce-logos__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'ce-logos__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
