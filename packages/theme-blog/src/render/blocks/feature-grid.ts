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
 * "Topics" — a row of icon tiles (`renderIcon`), the closest thing this
 * theme has to a section-front rail. Each icon sits in a small rounded tile
 * with a hairline ring; `renderIcon` returns `null` for a name outside its
 * closed set, in which case the tile is simply omitted rather than left
 * showing an empty ring.
 */
function renderItem(
  item: FeatureItem,
  ctx: RenderContext,
  index: number,
  tag: HeadingTag,
): HtmlElement {
  const icon =
    item.icon === undefined ? null : renderIcon(item.icon, { className: 'cg-topic__icon' })
  const title =
    item.link === undefined
      ? heading(tag, { class: 'cg-topic__title' }, item.title)
      : heading(
          tag,
          { class: 'cg-topic__title' },
          h('a', { class: 'cg-topic__link', href: href(ctx, item.link) }, item.title),
        )
  return h(
    'li',
    { class: 'cg-topic', 'data-index': index },
    icon === null ? null : h('span', { class: 'cg-topic__tile' }, icon),
    title,
    item.text === undefined ? null : h('p', { class: 'cg-topic__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const itemTag = nestedHeadingTag('featureGrid', hasTitle)
  return h(
    'section',
    { class: 'cg-topics', 'data-block': 'featureGrid' },
    hasTitle
      ? heading(
          blockHeadingTag('featureGrid') ?? 'h2',
          { class: 'cg-topics__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'cg-topics__items' },
      block.items.map((item, index) => renderItem(item, ctx, index, itemTag)),
    ),
  )
}
