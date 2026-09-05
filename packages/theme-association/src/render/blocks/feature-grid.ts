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
 * "What we do" — three (or more) programme cards, each a rounded, softly
 * shadowed tile with its icon in a round chip. The item's title carries the
 * link, so the link's accessible name is the programme's own name (WCAG
 * 2.4.4) — the block has no separate "learn more" field to write.
 *
 * `icon` names a symbol, never markup: it is exposed as a data attribute for
 * the skin and, when the name is one `renderIcon` recognises, a real inline
 * glyph — `aria-hidden`, since the title already names the programme.
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
