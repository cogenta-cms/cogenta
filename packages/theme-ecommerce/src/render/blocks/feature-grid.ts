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
 * The grid that most directly carries the "product grid" identity: each item
 * is a card of the exact aspect and rhythm a listed product would use, so a
 * site that lists services, features or bundles reads as shoppable without
 * inventing a price the block does not have.
 *
 * The item's title is the whole link, which makes the link's accessible name
 * the feature's own name — a bare "shop now" repeated across a grid is the
 * classic WCAG 2.4.4 failure, and the block carries no separate label field
 * to write one with anyway. `icon` names a symbol, never markup, so it is a
 * data attribute for the skin, marked `aria-hidden`.
 */
function renderItem(item: FeatureItem, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const title =
    item.link === undefined
      ? heading(tag, { class: 'ce-feature__title' }, item.title)
      : heading(
          tag,
          { class: 'ce-feature__title' },
          h('a', { class: 'ce-feature__link', href: href(ctx, item.link) }, item.title),
        )
  return h(
    'li',
    { class: 'ce-feature' },
    h(
      'div',
      { class: 'ce-feature__frame' },
      item.icon === undefined
        ? null
        : h(
            'span',
            { class: 'ce-feature__icon', 'data-icon': item.icon, 'aria-hidden': 'true' },
            renderIcon(item.icon),
          ),
    ),
    h(
      'div',
      { class: 'ce-feature__body' },
      title,
      item.text === undefined ? null : h('p', { class: 'ce-feature__text' }, item.text),
    ),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const itemTag = nestedHeadingTag('featureGrid', hasTitle)
  return h(
    'section',
    { class: 'ce-block ce-features', 'data-block': 'featureGrid' },
    hasTitle
      ? heading(
          blockHeadingTag('featureGrid') ?? 'h2',
          { class: 'ce-features__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'ce-features__items' },
      block.items.map((item) => renderItem(item, ctx, itemTag)),
    ),
  )
}
