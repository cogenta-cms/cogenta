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

/**
 * The item's title is the link, so the link's accessible name is the
 * feature's name — a bare "learn more" repeated across a grid is the
 * classic failure of WCAG 2.4.4, and the block carries no label field to
 * write one anyway.
 *
 * `icon` names a symbol, never markup: rather than a generic square chip it
 * becomes a large, decorative index numeral drawn from a CSS counter
 * (`aria-hidden`) — the vocabulary already forbids an icon set that ships
 * markup, and an oversized running number reads as confidently editorial
 * without inventing a glyph this theme does not have.
 */
function renderItem(item: FeatureItem, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const title =
    item.link === undefined
      ? heading(tag, { class: 'cg-feature__title' }, item.title)
      : heading(
          tag,
          { class: 'cg-feature__title' },
          h('a', { class: 'cg-feature__link', href: href(ctx, item.link) }, item.title),
        )
  return h(
    'li',
    { class: 'cg-feature', 'data-icon': item.icon },
    h('span', { class: 'cg-feature__index', 'aria-hidden': 'true' }),
    title,
    item.text === undefined ? null : h('p', { class: 'cg-feature__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const itemTag = nestedHeadingTag('featureGrid', hasTitle)
  return h(
    'section',
    { class: 'cg-block cg-features', 'data-block': 'featureGrid' },
    hasTitle
      ? heading(
          blockHeadingTag('featureGrid') ?? 'h2',
          { class: 'cg-features__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'cg-features__items' },
      block.items.map((item) => renderItem(item, ctx, itemTag)),
    ),
  )
}
