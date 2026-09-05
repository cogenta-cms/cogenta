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
 * The item's title is the link, so the link's accessible name is the
 * feature's name — a bare "learn more" repeated across a grid is the
 * classic failure of WCAG 2.4.4, and the block carries no label field to
 * write one anyway.
 *
 * `icon` names a symbol (`renderIcon`, `theme@1.4`) — drawn small and
 * accent-coloured, decorative (`aria-hidden`, the title already carries the
 * accessible name) — sitting *above* the running index numeral this theme
 * has always drawn from a CSS counter, never replacing it: the numeral is
 * this theme's own editorial device, the icon is the shared vocabulary's.
 * An item with no icon, or one whose name this theme does not recognise,
 * keeps exactly the pre-1.4 numeral-only card.
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
  const icon =
    item.icon === undefined ? null : renderIcon(item.icon, { className: 'cg-feature__icon' })
  return h(
    'li',
    { class: 'cg-feature', 'data-icon': item.icon },
    icon,
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
