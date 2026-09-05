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
  renderIcon,
} from '@cogenta/theme-kit'

/**
 * A row of three centred columns, each topped by a thin circular icon mark —
 * the "how we cook" / "what makes this kitchen" convention, never a boxed
 * feature card.
 */
function renderItem(item: FeatureItem, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const title =
    item.link === undefined
      ? heading(tag, { class: 'cg-craft__title' }, item.title)
      : heading(
          tag,
          { class: 'cg-craft__title' },
          h('a', { class: 'cg-craft__link', href: href(ctx, item.link) }, item.title),
        )
  const icon =
    item.icon === undefined
      ? null
      : (renderIcon(item.icon, { className: 'cg-craft__glyph' }) ??
        h('span', { class: 'cg-craft__mark-fallback', 'data-icon': item.icon }))
  return h(
    'li',
    { class: 'cg-craft__item' },
    icon === null ? null : h('span', { class: 'cg-craft__mark', 'aria-hidden': 'true' }, icon),
    title,
    item.text === undefined ? null : h('p', { class: 'cg-craft__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const itemTag = nestedHeadingTag('featureGrid', hasTitle)
  return h(
    'section',
    { class: 'cg-craft', 'data-block': 'featureGrid' },
    hasTitle
      ? heading(
          blockHeadingTag('featureGrid') ?? 'h2',
          { class: 'cg-craft__title-heading', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'cg-craft__items' },
      block.items.map((item) => renderItem(item, ctx, itemTag)),
    ),
  )
}
