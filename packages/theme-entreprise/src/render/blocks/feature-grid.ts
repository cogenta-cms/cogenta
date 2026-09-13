import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  href,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { arrow, ordinal, section } from '../layout.js'

/**
 * A numbered list of capabilities, ruled by hairlines: `01` to `06`, each
 * row a name in the display serif and a short description beside it.
 *
 * This is how a consultancy presents its practices, and deliberately not a
 * grid of identical cards with icon tiles. The block's own title holds the
 * left four columns (and stays in view while the list scrolls past it on a
 * wide screen); the list takes the right eight.
 *
 * `icon` is stored by contract B as a symbol name, and this theme chooses not
 * to draw it: in a numbered, typographic list an icon is decoration, and the
 * ordinal already does the work of marking each row.
 *
 * A row with a link is clickable as a whole, but the link itself stays on the
 * item's title, so its accessible name is the practice's own name
 * (WCAG 2.4.4).
 */
function renderItem(
  item: FeatureItem,
  index: number,
  ctx: RenderContext,
  tag: HeadingTag,
): HtmlElement {
  const title =
    item.link === undefined
      ? heading(tag, { class: 'cg-practice__title' }, item.title)
      : heading(
          tag,
          { class: 'cg-practice__title' },
          h('a', { class: 'cg-practice__link', href: href(ctx, item.link) }, item.title, arrow()),
        )
  return h(
    'li',
    { class: 'cg-practice', 'data-linked': item.link === undefined ? undefined : 'true' },
    h('span', { class: 'cg-practice__index', 'aria-hidden': 'true' }, ordinal(index)),
    title,
    item.text === undefined ? null : h('p', { class: 'cg-practice__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const itemTag = nestedHeadingTag('featureGrid', hasTitle)
  return section(
    'section',
    'featureGrid',
    'cg-practices',
    { 'data-titled': hasTitle ? 'true' : 'false' },
    'div',
    hasTitle
      ? h(
          'div',
          { class: 'cg-head cg-head--aside' },
          heading(
            blockHeadingTag('featureGrid') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title ?? '',
          ),
        )
      : null,
    h(
      'ol',
      { class: 'cg-practices__items' },
      block.items.map((item, index) => renderItem(item, index, ctx, itemTag)),
    ),
  )
}
