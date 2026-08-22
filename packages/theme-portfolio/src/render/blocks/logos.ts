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
 * Contract B says the organisation's name **is** the accessible name of the
 * link. So the logo image carries it as alt text when the media entity has
 * none, and no visually hidden duplicate is added: a link whose only content
 * is an image with alt text is already named.
 *
 * Rendered as a single-row ledger rather than a grid of tiles — a running
 * mono index beside each mark, in a desaturated register that resolves to
 * full ink only on hover or focus (`blocks.css`), which is the theme's own
 * take on the "selected clients" strip.
 */
function renderItem(item: LogoItem, ctx: RenderContext, index: number): HtmlElement {
  const logo = image(ctx, item.media, {
    className: 'cg-logo__image',
    altFrom: item.name,
    variant: { fit: 'contain' },
  })
  return h(
    'li',
    { class: 'cg-logo' },
    h(
      'span',
      { class: 'cg-logo__index', 'aria-hidden': 'true' },
      String(index + 1).padStart(2, '0'),
    ),
    item.url === undefined
      ? logo
      : h(
          'a',
          { class: 'cg-logo__link', href: ctx.link(item.url), rel: 'noopener noreferrer' },
          logo,
        ),
  )
}

export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-logos', 'data-block': 'logos' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('logos') ?? 'h2',
          { class: 'cg-logos__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-logos__items' },
      block.items.map((item, index) => renderItem(item, ctx, index)),
    ),
  )
}
