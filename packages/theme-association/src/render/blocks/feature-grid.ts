import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  type HtmlElement,
  h,
  heading,
  href,
  nestedHeadingTag,
  type RenderContext,
  renderIcon,
} from '@cogenta/theme-kit'
import { arrowWords, section, sectionHead } from '../layout.js'

/**
 * Two readings of the same block, chosen by its content rather than by a
 * setting:
 *
 * - **Ways in**, when an item names an icon this theme can draw: ruled
 *   columns, each with a small line icon in the organisation's green, the
 *   name, its sentence, and the name as an arrow link when it leads somewhere.
 *   Never a tinted tile behind an icon, never a card.
 * - **Steps**, when no item names an icon: an ordered list, each step under a
 *   rule with its number set large in the display face, because a list of
 *   things without pictures on a charity's site is almost always "how it
 *   works": how to sign up, what happens after you give, the first evening.
 */
function hasIcons(block: FeatureGridBlock): boolean {
  return block.items.some((item) => item.icon !== undefined)
}

/**
 * How many columns a wide screen gets: as many as there are items up to
 * four, then three when the count divides by three, so six items make two
 * full rows of three rather than a row of four and a row of two.
 */
export function columnsFor(count: number): number {
  if (count <= 4) return count
  return count % 3 === 0 ? 3 : 4
}

function name(item: FeatureItem, ctx: RenderContext): HtmlElement | string {
  return item.link === undefined
    ? item.title
    : h('a', { class: 'ca-arrow-link', href: href(ctx, item.link) }, arrowWords(item.title))
}

function column(item: FeatureItem, ctx: RenderContext, titled: boolean): HtmlElement {
  const icon =
    item.icon === undefined ? null : renderIcon(item.icon, { className: 'ca-ways__icon', size: 28 })
  return h(
    'li',
    { class: 'ca-ways__item' },
    icon,
    heading(nestedHeadingTag('featureGrid', titled), { class: 'ca-ways__name' }, name(item, ctx)),
    item.text === undefined ? null : h('p', { class: 'ca-ways__text' }, item.text),
  )
}

function step(item: FeatureItem, ctx: RenderContext, titled: boolean, index: number): HtmlElement {
  return h(
    'li',
    { class: 'ca-steps__item' },
    h('span', { class: 'ca-steps__number', 'aria-hidden': 'true' }, String(index + 1)),
    heading(nestedHeadingTag('featureGrid', titled), { class: 'ca-steps__name' }, name(item, ctx)),
    item.text === undefined ? null : h('p', { class: 'ca-steps__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  const count = String(columnsFor(block.items.length))
  if (!hasIcons(block)) {
    return section(
      'section',
      'featureGrid',
      'ca-steps',
      { 'data-titled': String(titled), 'data-count': count },
      'div',
      sectionHead('featureGrid', block.title),
      h(
        'ol',
        { class: 'ca-steps__items' },
        block.items.map((item, index) => step(item, ctx, titled, index)),
      ),
    )
  }
  return section(
    'section',
    'featureGrid',
    'ca-ways',
    { 'data-titled': String(titled), 'data-count': count },
    'div',
    sectionHead('featureGrid', block.title),
    h(
      'ul',
      { class: 'ca-ways__items' },
      block.items.map((item) => column(item, ctx, titled)),
    ),
  )
}
