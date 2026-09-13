import type { LogoItem, LogosBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  image,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A client register: wordmarks in greyscale, each in its own cell of a ruled
 * table, so a dozen marks of different shapes and weights still line up.
 *
 * Contract B says the organisation's name is the accessible name of the
 * link, so the image carries it as `alt` when the media entity has none, and
 * no visually hidden duplicate is added. Greyscale is a `filter` in the
 * stylesheet, never baked into the media: the same asset still renders in
 * colour wherever a site owner uses it elsewhere.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const logo = image(ctx, item.media, {
    className: 'cg-clients__logo',
    altFrom: item.name,
    variant: { fit: 'contain' },
    sizes: '12rem',
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
  return section(
    'section',
    'logos',
    'cg-clients',
    {},
    'div',
    block.title === undefined
      ? null
      : h(
          'div',
          { class: 'cg-head' },
          heading(
            blockHeadingTag('logos') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title,
          ),
        ),
    h(
      'ul',
      { class: 'cg-clients__items', 'data-columns': String(columnsFor(block.items.length)) },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}

/**
 * How many columns the register uses on a wide screen: four when the marks
 * fill whole rows of four, otherwise three, so a register never ends on a
 * row of empty ruled cells when a whole-row layout exists.
 */
function columnsFor(count: number): number {
  if (count <= 3) return Math.max(count, 1)
  return count % 4 === 0 ? 4 : 3
}
