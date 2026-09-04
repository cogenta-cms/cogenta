import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { href } from '../actions.js'
import { blockHeadingTag, type HeadingTag, heading, nestedHeadingTag } from '../heading.js'
import { type HtmlElement, h } from '../html.js'
import { renderIcon } from '../icons.js'

/**
 * The item's title is the link, so the link's accessible name is the feature's
 * name. A bare "learn more" repeated six times is the classic failure of
 * WCAG 2.4.4, and the block carries no label field to write one anyway.
 *
 * `icon` names a symbol, never markup: it is exposed as a data attribute for
 * the skin (and, since L25, the page builder — see `data-icon` below) and,
 * when the name is one `renderIcon` (`@cogenta/theme-kit`) recognises, a real
 * inline glyph — `aria-hidden`, since the title already names the feature.
 * An unrecognised name keeps the pre-L25 behaviour: the bare, empty
 * `data-icon` span, styled by `.cg-feature__icon` alone.
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
    { class: 'cg-feature' },
    item.icon === undefined
      ? null
      : h(
          'span',
          { class: 'cg-feature__icon', 'data-icon': item.icon, 'aria-hidden': 'true' },
          renderIcon(item.icon),
        ),
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
